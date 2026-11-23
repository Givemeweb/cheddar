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

/** Default backfill window for a newly linked account, in days. */
export const MERCURY_BACKFILL_DAYS = 90;

/** Backfill windows the mapping screen offers; null means all history. */
export const MERCURY_BACKFILL_WINDOW_CHOICES: (number | null)[] = [30, 90, 365, null];

/**
 * Start date used for the "all history" window. The per-account endpoint
 * defaults to a 30-day window and silently drops boundary rows (record F6),
 * so every window choice passes an explicit start; 1990-01-01 is far enough
 * back to be unbounded in practice for a bank that opened years earlier, and
 * the endpoint accepts it (docs/mercury-sandbox-reconnaissance.md).
 */
const MERCURY_ALL_HISTORY_START = '1990-01-01';

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

const DESCRIPTION_PART_SEPARATOR = ' · ';

/**
 * Bank description, then Mercury's note, stored in the local description
 * field. The counterparty name is not part of it, and nothing is appended
 * for FX rows (the anomaly flag replaces that, record rule 4). An empty
 * result is stored as null. No truncation: descriptions are stored
 * verbatim, like notes entered by hand.
 */
export function composeMercuryDescription(
  tx: Pick<MercuryApiTransaction, 'bankDescription' | 'note'>,
): string | null {
  const parts = [
    tx.bankDescription,
    tx.note,
  ].filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(DESCRIPTION_PART_SEPARATOR) : null;
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

/**
 * The category candidate is the counterparty name. Mercury's own category
 * fields (categoryData, mercuryCategory) are ignored entirely (docs section 7,
 * ticket mercury-categories/02): the same counterparty on an income and an
 * expense row yields two categories with the same name, one per type.
 */
function mercuryCounterpartyName(tx: MercuryApiTransaction): string | null {
  const name = tx.counterpartyName;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

const categoryName = (name: string) => name.trim().toLowerCase();

/**
 * Category matching for one import run: same-type categories match
 * case-insensitively by name, and an existing same-name category is adopted
 * whatever created it (defaults, the user, an earlier import). A counterparty
 * with no same-type match lazily creates its own category; only rows without
 * a counterparty land in one of the two tagged categories. Results are cached
 * so repeated names hit the database once, and a creation rejected by the
 * free cap is remembered as null under its key so that name is never
 * retried within the run: those rows stay uncategorized rather than failing
 * the import.
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

    const counterparty = mercuryCounterpartyName(tx);
    const fallbackName = type === 'income'
      ? MERCURY_INCOME_CATEGORY_NAME
      : MERCURY_EXPENSE_CATEGORY_NAME;

    if (counterparty) {
      const match = findSameType(type, counterparty);
      if (match) {
        cache.set(key(type, counterparty), match);
        return match;
      }
      if (cache.has(key(type, counterparty))) {
        return cache.get(key(type, counterparty)) ?? null;
      }
      const created = await createMercuryCategory(counterparty, type, categories);
      cache.set(key(type, counterparty), created);
      return created;
    }

    const fallbackKey = key(type, fallbackName);
    if (cache.has(fallbackKey)) {
      // A cached null means category creation hit the free cap: every
      // remaining counterparty-less row stays uncategorized instead of
      // retrying.
      return cache.get(fallbackKey) ?? null;
    }
    const fallback = findSameType(type, fallbackName)
      ?? await createMercuryCategory(fallbackName, type, categories);
    cache.set(fallbackKey, fallback);
    return fallback;
  };
}

/**
 * Lazily create one category: a counterparty-named one, or one of the two
 * tagged fallbacks. Free users are capped by assertCanCreate; the mapping
 * flow is premium-gated, so this only bites when the cached entitlement has
 * not been written yet. The row stays uncategorized rather than failing the
 * whole import.
 */
async function createMercuryCategory(
  name: string,
  type: 'income' | 'expense',
  categories: Category[],
): Promise<Category | null> {
  try {
    const created = await addCategory({
      name,
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

export function formatMercuryBackfillStart(now: Date, windowDays: number | null): string {
  if (windowDays === null) return MERCURY_ALL_HISTORY_START;
  const start = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

/**
 * Merge-and-write one linked-account row. putMercuryLinkedAccount replaces
 * the whole row, so every write starts from the row currently on disk.
 */
export async function writeMercuryLinkedAccount(
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
  cursorWindowDays: number | null,
): Promise<MercuryImportSummary> {
  const localAccount = await getAccountById(localAccountId);
  if (!localAccount) {
    throw new Error('The linked local account no longer exists.');
  }

  // The explicit start is what keeps the window from silently shrinking to
  // the endpoint's 30-day default (record F6).
  const rows = await fetchMercuryTransactions(token, mercuryAccount.id, {
    start: formatMercuryBackfillStart(new Date(), cursorWindowDays),
  });

  return importFetchedMercuryTransactions(mercuryAccount.id, localAccount, rows);
}

/**
 * Import already-fetched rows into one local account: eligibility filter,
 * dedupe against the transaction links (a Mercury id already linked is never
 * imported twice, even across runs), verbatim mapping, and the rollback that
 * keeps a local row from surviving without its link. Shared by the backfill
 * (ticket 04) and the incremental sync (ticket 06).
 */
export async function importFetchedMercuryTransactions(
  mercuryAccountId: string,
  localAccount: { id: string; name: string },
  rows: MercuryApiTransaction[],
): Promise<MercuryImportSummary> {
  const localAccountId = localAccount.id;
  const alreadyLinked = new Set(
    getMercuryTransactionLinks().map((link) => link.id),
  );
  const resolveCategory = createMercuryCategoryResolver();
  const summary: MercuryImportSummary = { imported: 0, skipped: 0, anomalyRows: 0 };

  for (const tx of rows) {
    if (!isEligibleMercuryTransaction(tx, mercuryAccountId)) continue;
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
      // The note stays empty; the description carries the bank description
      // and Mercury's note. Subcategory and image path are left empty; the
      // amount is Mercury's signed value verbatim, never converted.
      note: null,
      description: composeMercuryDescription(tx),
      amount,
      currency: MERCURY_ACCOUNT_CURRENCY,
      date: new Date(deriveMercuryTransactionDate(tx)),
    });

    try {
      await putMercuryTransactionLink({
        id: tx.id,
        localTransactionId: local.id,
        mercuryAccountId,
        anomaly,
        // Mercury's own createdAt goes on the link in epoch ms (null when
        // absent, unparseable, or the Go zero-time sentinel): the endpoint's
        // `start` filter compares createdAt, so the sync's deletion pass must
        // judge by the same field. The local row date is postedAt ?? createdAt
        // and can sit after the cursor while createdAt sits before it.
        mercuryCreatedAtMs: parseMercuryTimestamp(tx.createdAt),
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

/** Options for linking one account; only the backfill window is choosable. */
export interface MercuryLinkOptions {
  /** Backfill window in days; null means all history. Defaults to 90 days. */
  cursorWindowDays?: number | null;
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
  { cursorWindowDays = MERCURY_BACKFILL_DAYS }: MercuryLinkOptions = {},
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
    cursorWindowDays,
    lastError: null,
  });

  try {
    const summary = await importMercuryAccountTransactions(
      token,
      mercuryAccount,
      localAccountId,
      cursorWindowDays,
    );

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

/** What happened to one account of a batch confirm. */
export interface MercuryLinkOutcome {
  mercuryAccountId: string;
  ok: boolean;
  summary: MercuryImportSummary | null;
  /** The raw failure; the screen maps it to a message. Null when ok. */
  error: unknown;
}

/**
 * Sentinel carried by a batch declined by the single-flight guard below:
 * the connection already has a link/sync batch running, so this call did
 * nothing. The screen shows it as an ordinary "already running" state, not
 * an error. Prefigures ticket 06's planned single-flight-per-account guard.
 */
export class MercuryBatchBusyError extends Error {
  constructor() {
    super('A Mercury link or sync batch is already running.');
    this.name = 'MercuryBatchBusyError';
  }
}

// One connection per install (MERCURY_CONNECTION_ROW_ID), so one module flag
// is the whole single-flight seam. Held across the entire batch: two
// overlapping batches reaching the same Mercury account would both read "not
// linked yet", both create a local account, and both insert the same
// transaction before either link row lands. The incremental sync (ticket 06)
// claims the same slot, so a link batch and a sync can never overlap either.
let batchInFlight = false;

/** Claims the single-flight slot; false when a batch or sync already holds it. */
export function tryClaimMercuryBatch(): boolean {
  if (batchInFlight) return false;
  batchInFlight = true;
  return true;
}

export function releaseMercuryBatch(): void {
  batchInFlight = false;
}

/**
 * Link every selected account, one at a time. Sequential on purpose
 * (ticket 05): the store writes stay ordered and the request stream stays
 * predictable for rate limits, so no Promise.all here. One account failing
 * (network, 401, anything) must not stop the others, so failures are
 * collected per account instead of thrown; the failed account keeps its
 * imported rows and its lastSyncedAt (linkMercuryAccount advances that only
 * after a successful fetch+persist). Its pre-fetch write does record the
 * chosen window and clear lastError, but the window is configuration, not a
 * sync position, so rewriting it is not advancing a cursor.
 *
 * Single-flight: a call arriving while another batch is still running
 * resolves immediately with per-account busy outcomes instead of starting a
 * second pass over the same store.
 */
export async function linkMercuryAccounts(
  token: string,
  mercuryAccounts: MercuryApiAccount[],
  cursorWindowDays: number | null = MERCURY_BACKFILL_DAYS,
): Promise<MercuryLinkOutcome[]> {
  if (!tryClaimMercuryBatch()) {
    const busy = new MercuryBatchBusyError();
    return mercuryAccounts.map((mercuryAccount) => ({
      mercuryAccountId: mercuryAccount.id,
      ok: false,
      summary: null,
      error: busy,
    }));
  }
  try {
    const outcomes: MercuryLinkOutcome[] = [];
    for (const mercuryAccount of mercuryAccounts) {
      try {
        const summary = await linkMercuryAccount(token, mercuryAccount, { cursorWindowDays });
        outcomes.push({ mercuryAccountId: mercuryAccount.id, ok: true, summary, error: null });
      } catch (error) {
        outcomes.push({ mercuryAccountId: mercuryAccount.id, ok: false, summary: null, error });
      }
    }
    return outcomes;
  } finally {
    releaseMercuryBatch();
  }
}
