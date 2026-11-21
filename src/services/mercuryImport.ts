/**
 * Linking one Mercury account to a local account and importing its recent
 * history (docs/mercury-sandbox-reconnaissance.md is the contract).
 *
 * The linked local account is managed: its balance is set from Mercury's
 * `currentBalance`, its currency is the constant USD, and imported rows never
 * touch balances (src/db/storage.ts skips managed accounts and linked rows).
 * Amounts are stored verbatim in major units, never converted. Rows carrying
 * an FX signal (currencyExchangeInfo or a non-USD merchant.currency) are
 * anomalies until OQ-1 resolves: they are imported verbatim, flagged on their
 * link row, and must stay out of any total until then.
 */
import {
  fetchMercuryTransactions,
  type MercuryApiAccount,
  type MercuryApiTransaction,
} from './mercuryApi';
import {
  addAccount,
  addCategory,
  addTransaction,
  deleteTransaction,
  getAccountById,
  getCategories,
  updateAccountBalance,
  type Category,
} from '../db/storage';
import { LimitReachedError } from '../db/premium';
import {
  deleteMercuryTransactionLink,
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
  putMercuryLinkedAccount,
  putMercuryTransactionLink,
  MERCURY_ACCOUNT_CURRENCY,
  type MercuryLinkedAccount,
} from '../db/mercury';

/** Backfill window for a newly linked account, in days. */
export const MERCURY_BACKFILL_DAYS = 90;

/** Transfer kinds whose rows never become local transactions. */
export const MERCURY_EXCLUDED_KINDS = ['internalTransfer', 'treasuryTransfer'];

/** Tagged categories created for rows without a matching category. */
export const MERCURY_INCOME_CATEGORY_NAME = 'Mercury income';
export const MERCURY_EXPENSE_CATEGORY_NAME = 'Mercury uncategorized';

/** Icon for the locally created linked account. */
export const MERCURY_LINKED_ACCOUNT_ICON = 'landmark';

const GO_ZERO_TIME = '0001-01-01T00:00:00Z';

export interface MercuryImportSummary {
  imported: number;
  skipped: number;
  anomalyRows: number;
}

/**
 * Sign is flow direction (record F3): money leaving is negative (expense),
 * money entering is positive (income).
 */
export function deriveMercuryTransactionType(amount: number): 'income' | 'expense' {
  return amount < 0 ? 'expense' : 'income';
}

/**
 * Parse a Mercury timestamp into epoch ms. Null, the Go zero-time sentinel
 * (record F4) and unparseable strings all read as "absent" so they can fall
 * through to the next candidate instead of producing a year-1 date.
 */
export function parseMercuryTimestamp(value: string | null | undefined): number | null {
  if (!value || value === GO_ZERO_TIME) return null;
  // Mercury sends ISO 8601 with variable-length fractional seconds (the
  // record shows 5- and 6-digit forms), while the spec fixes exactly three,
  // so normalize the fraction before the standard parser sees it.
  const normalized = value.replace(
    /\.(\d{1,9})/,
    (_match, digits: string) => `.${digits.slice(0, 3).padEnd(3, '0')}`,
  );
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : time;
}

/** The transaction date is postedAt, falling back to createdAt. */
export function deriveMercuryTransactionDate(
  tx: Pick<MercuryApiTransaction, 'postedAt' | 'createdAt'>,
): number {
  // note: createdAt is a required field and was present on every row ever
  // observed, so the final fallback is unreachable unless Mercury breaks its
  // schema; 0 sorts the row last instead of crashing the list.
  return parseMercuryTimestamp(tx.postedAt)
    ?? parseMercuryTimestamp(tx.createdAt)
    ?? 0;
}

const NOTE_PART_SEPARATOR = ' · ';

/**
 * Counterparty name, then bank description, then Mercury's note. Nothing is
 * appended for FX rows (the anomaly flag replaces that, record rule 4). An
 * empty result is stored as null. No truncation: notes are stored verbatim,
 * like notes entered by hand.
 */
export function composeMercuryNote(
  tx: Pick<MercuryApiTransaction, 'counterpartyName' | 'bankDescription' | 'note'>,
): string | null {
  const parts = [
    tx.counterpartyName,
    tx.bankDescription,
    tx.note,
  ].filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(NOTE_PART_SEPARATOR) : null;
}

/**
 * Non-null currencyExchangeInfo, or a merchant.currency other than USD, marks
 * an anomaly row (record rule 4). The stored amount never changes either way.
 */
export function isMercuryAnomalyRow(
  tx: Pick<MercuryApiTransaction, 'currencyExchangeInfo' | 'merchant'>,
): boolean {
  if (tx.currencyExchangeInfo != null) return true;
  const currency = tx.merchant?.currency;
  return typeof currency === 'string' && currency !== '' && currency !== 'USD';
}

/**
 * Only settled rows outside the internal/treasury transfer kinds become
 * local transactions, and only on the account being imported. Rows without a
 * numeric amount are skipped too: a fabricated 0 would corrupt the ledger.
 */
export function isEligibleMercuryTransaction(
  tx: MercuryApiTransaction,
  mercuryAccountId: string,
): boolean {
  if (!tx.id || typeof tx.amount !== 'number') return false;
  if (tx.status !== 'sent') return false;
  if (tx.kind !== null && MERCURY_EXCLUDED_KINDS.includes(tx.kind)) return false;
  if (tx.accountId !== null && tx.accountId !== mercuryAccountId) return false;
  return true;
}

/** The category name Mercury reports: a custom category first, then its enum. */
function mercuryCategoryName(tx: MercuryApiTransaction): string | null {
  const custom = tx.categoryData?.name;
  if (typeof custom === 'string' && custom.trim() !== '') return custom.trim();
  return tx.mercuryCategory;
}

const categoryName = (name: string) => name.trim().toLowerCase();

/**
 * Category matching for one import run: same-type categories match
 * case-insensitively by name; anything unmatched lands in one of the two
 * tagged categories. Results are cached so repeated names hit the database
 * once, and created categories are remembered so one run cannot create a
 * duplicate of its own tagged category.
 */
function createMercuryCategoryResolver() {
  let categories: Category[] | null = null;
  const cache = new Map<string, Category | null>();
  const key = (type: string, name: string) => `${type}:${categoryName(name)}`;

  const findSameType = (type: string, name: string) =>
    (categories ?? []).find(
      (category) => category.type === type && categoryName(category.name) === categoryName(name),
    );

  return async function resolveCategory(
    tx: MercuryApiTransaction,
    type: 'income' | 'expense',
  ): Promise<Category | null> {
    categories ??= await getCategories();

    const candidate = mercuryCategoryName(tx);
    const fallbackName = type === 'income'
      ? MERCURY_INCOME_CATEGORY_NAME
      : MERCURY_EXPENSE_CATEGORY_NAME;

    if (candidate) {
      const match = findSameType(type, candidate);
      if (match) {
        cache.set(key(type, candidate), match);
        return match;
      }
      if (cache.has(key(type, candidate))) {
        return cache.get(key(type, candidate)) ?? null;
      }
    }

    const fallbackKey = key(type, fallbackName);
    if (cache.has(fallbackKey)) {
      // A cached null means category creation hit the free cap: every
      // remaining unmatched row stays uncategorized instead of retrying.
      const cachedFallback = cache.get(fallbackKey);
      if (cachedFallback && candidate) cache.set(key(type, candidate), cachedFallback);
      return cachedFallback ?? null;
    }

    const fallback = findSameType(type, fallbackName)
      ?? await createMercuryFallbackCategory(fallbackName, type, categories);
    if (candidate) cache.set(key(type, candidate), fallback);
    cache.set(fallbackKey, fallback);
    return fallback;
  };
}

async function createMercuryFallbackCategory(
  name: string,
  type: 'income' | 'expense',
  categories: Category[],
): Promise<Category | null> {
  try {
    const created = await addCategory({
      name,
      // Free users are capped by assertCanCreate; the mapping flow is
      // premium-gated, so this only bites when the cached entitlement has
      // not been written yet. The row stays uncategorized rather than
      // failing the whole import.
      icon: type === 'income' ? 'briefcase' : 'wallet',
      type,
    });
    categories.push(created);
    return created;
  } catch (error) {
    if (error instanceof LimitReachedError) return null;
    throw error;
  }
}

function formatMercuryBackfillStart(now: Date): string {
  const start = new Date(now.getTime() - MERCURY_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

/**
 * Merge-and-write one linked-account row. putMercuryLinkedAccount replaces
 * the whole row, so every write starts from the row currently on disk.
 */
async function writeMercuryLinkedAccount(
  mercuryAccountId: string,
  changes: Partial<Omit<MercuryLinkedAccount, 'id'>>,
): Promise<void> {
  const current = getMercuryLinkedAccounts().find((account) => account.id === mercuryAccountId);
  const base: MercuryLinkedAccount = current ?? {
    id: mercuryAccountId,
    localAccountId: '',
    enabled: true,
    currency: MERCURY_ACCOUNT_CURRENCY,
    mixedCurrency: false,
    cursorWindowDays: MERCURY_BACKFILL_DAYS,
    lastSyncedAt: null,
    stale: false,
    lastError: null,
  };
  await putMercuryLinkedAccount({ ...base, ...changes });
}

async function importMercuryAccountTransactions(
  token: string,
  mercuryAccount: { id: string },
  localAccountId: string,
): Promise<MercuryImportSummary> {
  const localAccount = await getAccountById(localAccountId);
  if (!localAccount) {
    throw new Error('The linked local account no longer exists.');
  }

  // Transaction links are the dedupe map: a Mercury id already linked is
  // never imported twice, even across runs.
  const alreadyLinked = new Set(
    getMercuryTransactionLinks().map((link) => link.id),
  );
  const resolveCategory = createMercuryCategoryResolver();
  const summary: MercuryImportSummary = { imported: 0, skipped: 0, anomalyRows: 0 };

  // The explicit start is what keeps the window from silently shrinking to
  // the endpoint's 30-day default (record F6).
  const rows = await fetchMercuryTransactions(token, mercuryAccount.id, {
    start: formatMercuryBackfillStart(new Date()),
  });

  for (const tx of rows) {
    if (!isEligibleMercuryTransaction(tx, mercuryAccount.id)) continue;
    if (alreadyLinked.has(tx.id)) {
      summary.skipped += 1;
      continue;
    }

    const amount = tx.amount!;
    const type = deriveMercuryTransactionType(amount);
    const anomaly = isMercuryAnomalyRow(tx);
    const category = await resolveCategory(tx, type);

    const local = await addTransaction({
      type,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categoryIcon: category?.icon ?? null,
      categoryType: category?.type ?? null,
      accountId: localAccountId,
      accountName: localAccount.name,
      note: composeMercuryNote(tx),
      // Subcategory, description and image path are left empty; the amount
      // is Mercury's signed value verbatim, never converted.
      amount,
      currency: MERCURY_ACCOUNT_CURRENCY,
      date: new Date(deriveMercuryTransactionDate(tx)),
    });

    try {
      await putMercuryTransactionLink({
        id: tx.id,
        localTransactionId: local.id,
        mercuryAccountId: mercuryAccount.id,
        anomaly,
      });
    } catch (error) {
      // The local row must not survive without its link: dedupe is keyed by
      // the link table, so an orphan would import twice on retry. Roll the
      // partially written link row back too, then surface the failure.
      await deleteMercuryTransactionLink(tx.id).catch((rollbackError) => {
        console.warn('[mercury] Could not roll back the link row', rollbackError);
      });
      await deleteTransaction(local.id);
      throw error;
    }
    alreadyLinked.add(tx.id);
    summary.imported += 1;
    if (anomaly) summary.anomalyRows += 1;
  }

  return summary;
}

/**
 * Link one Mercury account one-to-one and run its backfill. Safe to call
 * again for the same Mercury account: the local account is reused, the
 * balance is re-mirrored from currentBalance, and existing transaction
 * links keep the import from duplicating rows.
 */
export async function linkMercuryAccount(
  token: string,
  mercuryAccount: MercuryApiAccount,
): Promise<MercuryImportSummary> {
  const existing = getMercuryLinkedAccounts().find((account) => account.id === mercuryAccount.id);
  let localAccountId = existing?.localAccountId ?? '';

  if (!localAccountId || !(await getAccountById(localAccountId))) {
    const created = await addAccount({
      name: mercuryAccount.name || 'Mercury account',
      icon: MERCURY_LINKED_ACCOUNT_ICON,
      currency: MERCURY_ACCOUNT_CURRENCY,
      // The balance mirrors Mercury at link time; imported rows do not
      // move it afterwards (storage skips managed accounts). A missing
      // currentBalance cannot be mirrored: the account starts unmirrored
      // at 0 and the mapping screen renders it as unknown.
      balance: mercuryAccount.currentBalance ?? 0,
      source: 'mercury',
    });
    localAccountId = created.id;
  } else if (mercuryAccount.currentBalance !== null) {
    // Skip the mirror when Mercury reported no balance: writing a 0 here
    // would be indistinguishable from a real zero.
    await updateAccountBalance(localAccountId, mercuryAccount.currentBalance);
  }

  await writeMercuryLinkedAccount(mercuryAccount.id, {
    localAccountId,
    enabled: true,
    currency: MERCURY_ACCOUNT_CURRENCY,
    cursorWindowDays: MERCURY_BACKFILL_DAYS,
    lastError: null,
  });

  try {
    const summary = await importMercuryAccountTransactions(token, mercuryAccount, localAccountId);

    // The account-level mixed-currency cell is the repurposed FX/anomaly
    // flag, derived from the link table's lifetime rows for this account:
    // skipped rows from earlier runs and restored links count too.
    const mixedCurrency = getMercuryTransactionLinks().some(
      (link) => link.mercuryAccountId === mercuryAccount.id && link.anomaly,
    );
    await writeMercuryLinkedAccount(mercuryAccount.id, {
      mixedCurrency,
      lastSyncedAt: Date.now(),
      stale: false,
      lastError: null,
    });
    return summary;
  } catch (error) {
    // The link survives a failed import so the mapping screen can offer a
    // retry; the error is recorded on the linked-account row.
    // note: the retry affordance for a stale/lastError state is ticket 06's
    // refresh flow; this write only records the state.
    const message = error instanceof Error ? error.message : 'Import failed.';
    await writeMercuryLinkedAccount(mercuryAccount.id, {
      stale: true,
      lastError: message,
    }).catch((persistError) => {
      console.warn('[mercury] Could not record the failed import', persistError);
    });
    throw error;
  }
}
