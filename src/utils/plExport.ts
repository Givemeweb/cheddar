import { getCategories, getTransactions, type Transaction } from '../db/storage';
import { convertToMainCurrencyBatch, getCurrencySymbol, getMainCurrencyCode } from '../db/currency';
import { getLatestRates } from '../services/exchangeRates';
import {
  aggregateProfitAndLoss,
  buildProfitLossWorkbook,
  type ProfitLossStatement,
  type ProfitLossTransaction,
} from './profitAndLoss';

/**
 * Profit & Loss export flow (tickets/profit-and-loss-xlsx/02).
 *
 * Bridges the store's read model (src/db/storage.ts) and the ticket-01
 * engine: it pulls the chosen year's transactions, converts the mixed
 * -currency figures into the main currency with the existing batch converter
 * (one rates lookup), runs the aggregation and renders the workbook bytes.
 * Pure mapping helpers are split out so the wiring is testable without the
 * store.
 */

/**
 * The read-model fields the export consumes. Amounts keep the stored sign
 * convention (income positive, expense and transfer negative); the engine
 * takes absolute values.
 */
export type ProfitLossSourceRow = Pick<
  Transaction,
  | 'type'
  | 'categoryId'
  | 'categoryName'
  | 'subcategoryName'
  | 'accountId'
  | 'toAccountId'
  | 'amount'
  | 'currency'
  | 'toCurrency'
  | 'toAmount'
  | 'date'
  | 'anomaly'
>;

/**
 * Rows for the statement year with flagged (anomaly) rows removed, exactly
 * the way the stats screens exclude them before any totals are computed.
 * The engine would skip flagged rows itself; filtering first also keeps
 * their conversions out of the batch.
 */
export function profitLossRowsForYear(
  transactions: ProfitLossSourceRow[],
  year: number,
): ProfitLossSourceRow[] {
  return transactions.filter(
    (tx) => !tx.anomaly && tx.date.getFullYear() === year,
  );
}

/**
 * The (amount, currency) pairs that need converting into the main currency,
 * in a stable order that toProfitLossTransactions() consumes back. Besides
 * every row's own amount, an inbound transfer also contributes its
 * destination-side figure: the stored toAmount with its toCurrency, falling
 * back to the row's own amount/currency for legacy rows without one - the
 * same rule the stats screens apply to inbound transfer totals.
 */
export function collectProfitLossConversions(
  rows: ProfitLossSourceRow[],
): { amount: number; currency: string }[] {
  const items: { amount: number; currency: string }[] = [];
  for (const tx of rows) {
    items.push({ amount: tx.amount, currency: tx.currency });
    if (tx.type === 'transfer') {
      const hasConverted = typeof tx.toAmount === 'number';
      items.push({
        amount: hasConverted ? (tx.toAmount as number) : tx.amount,
        currency: hasConverted ? tx.toCurrency || tx.currency : tx.currency,
      });
    }
  }
  return items;
}

/**
 * Build the engine's input rows from the filtered source rows plus the
 * conversion results of collectProfitLossConversions() (same list, same
 * order). Dates go in as epoch milliseconds; the anomaly flag passes
 * through so the engine keeps its own guard.
 */
export function toProfitLossTransactions(
  rows: ProfitLossSourceRow[],
  converted: number[],
): ProfitLossTransaction[] {
  let index = 0;
  return rows.map((tx) => {
    const amount = converted[index++];
    let toAmount: number | null = null;
    if (tx.type === 'transfer') {
      toAmount = converted[index++];
    }
    return {
      type: tx.type,
      categoryId: tx.categoryId,
      categoryName: tx.categoryName,
      subcategoryName: tx.subcategoryName,
      accountId: tx.accountId,
      toAccountId: tx.toAccountId,
      amount,
      toAmount,
      date: tx.date.getTime(),
      anomaly: tx.anomaly,
    };
  });
}

export interface ProfitLossExportResult {
  bytes: Uint8Array;
  statement: ProfitLossStatement;
  currencyCode: string;
}

/**
 * Rates are unavailable (offline, nothing cached) but the export contains
 * foreign-currency amounts: writing the file would stamp foreign figures
 * with the main-currency symbol, so the export refuses instead.
 */
export class ProfitLossRatesUnavailableError extends Error {
  constructor() {
    super('Exchange rates unavailable for mixed-currency conversion');
    this.name = 'ProfitLossRatesUnavailableError';
  }
}

/**
 * The currencies the SELECTED statement actually converts: income and
 * expense rows of selected accounts, plus the used side of one-sided
 * transfers only (outbound reads the source amount, inbound the destination
 * -side toAmount). Both-selected transfers are internal movement and
 * neither-selected ones are outside the statement, so neither needs
 * anything - unselected accounts' figures and unused transfer legs must
 * never drive the rates requirement.
 */
export function collectProfitLossRequiredCurrencies(
  rows: ProfitLossSourceRow[],
  accountIds: string[],
): string[] {
  const selected = new Set(accountIds);
  const currencies = new Set<string>();
  for (const tx of rows) {
    if (tx.type === 'transfer') {
      const fromSelected = selected.has(tx.accountId);
      const toSelected = selected.has(tx.toAccountId ?? '');
      if (fromSelected === toSelected) continue;
      if (toSelected) {
        // Inbound: the destination-side figure is what gets reported.
        const hasConverted = typeof tx.toAmount === 'number';
        currencies.add(hasConverted ? tx.toCurrency || tx.currency : tx.currency);
      } else {
        currencies.add(tx.currency);
      }
      continue;
    }
    if (selected.has(tx.accountId)) {
      currencies.add(tx.currency);
    }
  }
  return [...currencies];
}

/**
 * A used foreign currency converts faithfully only when the rates cache can
 * serve both legs of the base-pivot conversion (a missing or zero entry
 * makes convertWithRates silently return the amount unchanged, which would
 * write a foreign figure under the main-currency symbol). Same-currency
 * figures never convert, so they are always fine.
 */
function ratesServeCurrency(
  currency: string,
  currencyCode: string,
  rates: { base: string; rates: Record<string, number> } | null,
): boolean {
  if (currency === currencyCode) return true;
  if (!rates) return false;
  const entryOk = (code: string) => code === rates.base || Boolean(rates.rates[code]);
  return entryOk(currency) && entryOk(currencyCode);
}

/**
 * One export run: statement + workbook bytes for the selected accounts and
 * year. Statement is returned so callers (and device verification) can
 * reconcile the file against the app's own totals.
 */
export async function exportProfitLossWorkbook(input: {
  year: number;
  accountIds: string[];
}): Promise<ProfitLossExportResult> {
  const [allTransactions, categories, currencyCode, rates] = await Promise.all([
    getTransactions(),
    getCategories(),
    getMainCurrencyCode(),
    getLatestRates(),
  ]);

  const yearRows = profitLossRowsForYear(allTransactions, input.year);
  const items = collectProfitLossConversions(yearRows);

  // The rates lookup happens exactly once and the result is handed to the
  // batch converter (a null passed into it would make it re-fetch). Only the
  // figures that reach the statement drive the requirement: without usable
  // rates a mixed-currency export refuses rather than producing a
  // mislabeled file, while an all-main-currency selection never needs them.
  const requiredCurrencies = collectProfitLossRequiredCurrencies(
    yearRows,
    input.accountIds,
  );
  if (requiredCurrencies.some((currency) => !ratesServeCurrency(currency, currencyCode, rates))) {
    throw new ProfitLossRatesUnavailableError();
  }
  const converted = rates
    ? await convertToMainCurrencyBatch(items, currencyCode, rates)
    : items.map((item) => item.amount);

  const statement = aggregateProfitAndLoss({
    transactions: toProfitLossTransactions(yearRows, converted),
    categories,
    accountIds: input.accountIds,
    year: input.year,
  });

  const bytes = await buildProfitLossWorkbook(
    statement,
    getCurrencySymbol(currencyCode),
  );
  return { bytes, statement, currencyCode };
}
