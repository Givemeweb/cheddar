/**
 * Incremental sync for linked Mercury accounts (ticket 06).
 *
 * Triggers (app open, home pull-to-refresh) call syncMercuryAccounts and are
 * silent no-ops whenever a precondition is missing: not premium, no active
 * connection, no enabled linked account, no stored token, debounce not
 * elapsed, backoff not elapsed, or a link/sync batch already running. The
 * user-intent path (pull-to-refresh, the mapping screen's retry) passes
 * `force`, which bypasses the debounce and the backoff but keeps every other
 * guard.
 *
 * Per account the run walks the window [lastSyncedAt, now] (or the configured
 * backfill window on a first sync) in pages of 500, imports the rows the
 * links do not already cover, and then deletes local rows whose Mercury
 * transaction vanished from that fully fetched window. A failure anywhere
 * leaves the cursor (lastSyncedAt) and every imported row untouched.
 *
 * docs/mercury-sandbox-reconnaissance.md is the contract: explicit start
 * always (the endpoint's default window is 30 days), stop on raw page length
 * (never on `total`), transfers excluded, 401/403 re-auth, 429/5xx backoff
 * honoring Retry-After, and the request id logged with every failure.
 */
import {
  fetchMercuryAccounts,
  fetchMercuryTransactions,
  MercuryApiError,
} from './mercuryApi';
import {
  formatMercuryBackfillStart,
  importFetchedMercuryTransactions,
  releaseMercuryBatch,
  tryClaimMercuryBatch,
  writeMercuryLinkedAccount,
} from './mercuryImport';
import { getStoredMercuryToken } from './mercuryConnect';
import { getCachedPremium } from '../db/premium';
import {
  clearMercuryBackoff,
  getMercuryBackoff,
  getMercuryConnection,
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
  getSyncDebounceTimestamp,
  markConnectionNeedsReauthentication,
  setMercuryBackoff,
  setSyncDebounceTimestamp,
  MERCURY_TRANSACTION_LINKS_TABLE,
  type MercuryLinkedAccount,
  type MercuryTransactionLink,
} from '../db/mercury';
import { getStore, saveStore } from '../db/tinybase';
import {
  getAccountById,
  getTransactions,
  updateAccountBalance,
} from '../db/storage';

/** Minimum interval between automatic sync attempts; persisted (mercurySyncState). */
export const MERCURY_SYNC_DEBOUNCE_MS = 5 * 60 * 1000;

// The record's defensive backoff design (OQ-2: no 429 was ever observed):
// exponential starting at 1s, capped at 60s, with full jitter.
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

export interface MercurySyncFailure {
  mercuryAccountId: string;
  error: unknown;
}

export interface MercurySyncOutcome {
  /**
   * False when the call was a silent no-op: a gate failed, the debounce or
   * backoff had not elapsed, or the single-flight slot was held.
   */
  ran: boolean;
  /** True when a link or sync batch already held the single-flight slot. */
  busy: boolean;
  /** Mercury account ids whose sync completed. */
  succeeded: string[];
  failed: MercurySyncFailure[];
}

const isReauthError = (error: unknown): boolean =>
  error instanceof MercuryApiError && error.kind === 'invalidCredentials';

/** 429 and 5xx are the retryable statuses the record calls out (OQ-2). */
const isRetryableError = (error: unknown): boolean =>
  error instanceof MercuryApiError
  && error.status !== null
  && (error.status === 429 || error.status >= 500);

function nextBackoffDelayMs(consecutiveFailures: number, retryAfter: number | null): number {
  // A Retry-After header wins when one is present; otherwise full jitter
  // under the exponential cap (1s base, doubling, 60s ceiling).
  if (retryAfter !== null) return Math.max(retryAfter, 1) * 1000;
  const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1));
  return Math.random() * cap;
}

/**
 * The window this account's sync fetches, plus its start in epoch ms for the
 * deletion pass and whether that pass may run.
 *
 * With a stored cursor the window is the exact [lastSyncedAt, now]. The
 * read-only sandbox probe (2026-11-21) showed the endpoint accepts ISO 8601
 * `start` values and binds them inclusively at the given instant, and that
 * the filter compares Mercury's createdAt (a row with createdAt
 * 21:20:25.884Z and postedAt 21:20:30.375Z is returned for start=createdAt
 * but excluded for start=createdAt+2s and even for start=postedAt-1ms). The
 * cursor is floored to the whole second to match the probe-verified request
 * format, costing at most one second of window width. Because the server
 * filters on createdAt while the local row date is postedAt ?? createdAt,
 * the deletion pass must judge by the link's stored Mercury createdAt — the
 * local date alone would falsely delete rows imported on an earlier fetch
 * whose postedAt falls inside this window but whose createdAt does not (see
 * deleteVanishedMercuryRows). Date-only starts remain
 * only for first syncs (the configured backfill window); they run no deletion
 * pass, so absence there proves nothing — a partial import left behind by a
 * failed first sync is cleaned by the user-facing unlink, not by the sync.
 */
function syncWindowStart(
  now: number,
  linked: Pick<MercuryLinkedAccount, 'lastSyncedAt' | 'cursorWindowDays'>,
): { start: string; startMs: number; exactCursor: boolean } {
  if (linked.lastSyncedAt === null) {
    const start = formatMercuryBackfillStart(new Date(now), linked.cursorWindowDays);
    return { start, startMs: Date.parse(`${start}T00:00:00Z`), exactCursor: false };
  }
  const startMs = Math.floor(linked.lastSyncedAt / 1000) * 1000;
  // slice(0, 19) drops the millisecond part: the probe-verified request
  // format carried no fractional seconds (2026-11-20T21:19:00Z).
  return { start: `${new Date(startMs).toISOString().slice(0, 19)}Z`, startMs, exactCursor: true };
}

/**
 * Deletes the local transaction row and then its link row, and publishes both
 * with one save.
 *
 * No write order is truly atomic: TinyBase's SQLite persister wraps a save in
 * BEGIN/END without ROLLBACK, swallows statement errors, and may interleave
 * table writes, so a save interrupted partway can leave exactly its first
 * change behind. The order is chosen for that case. Deleting the row first
 * means an interrupted save leaves a link whose local row is gone — the
 * tombstone state the deletion pass already spares, and which can never
 * re-import. (Deleting the link first would leave an unlinked live row,
 * which the next sync re-imports as a permanent duplicate.) On a failed save
 * both rows are restored in memory — the link first, then the row, so an
 * interrupted rollback save also leaves at worst the tombstone — and one more
 * save is attempted; the account is marked failed either way, so the pass
 * retries. Residual window: a failed save can leave an arbitrary subset of
 * its statements on disk; the in-memory store is always consistent, and the
 * tombstone is the least-bad interrupted state. The balance is never
 * touched: link-holding rows are imported rows, which by construction never
 * participate in balance math (import, move, and delete all skip them).
 */
async function deleteImportedRowAndLink(link: MercuryTransactionLink): Promise<void> {
  const store = getStore();
  const localRow = store.getRow('transactions', link.localTransactionId);
  const linkRow = store.getRow(MERCURY_TRANSACTION_LINKS_TABLE, link.id);
  store.delRow('transactions', link.localTransactionId);
  store.delRow(MERCURY_TRANSACTION_LINKS_TABLE, link.id);
  try {
    await saveStore();
  } catch (error) {
    if (Object.keys(linkRow).length > 0) {
      store.setRow(MERCURY_TRANSACTION_LINKS_TABLE, link.id, linkRow);
    }
    if (Object.keys(localRow).length > 0) {
      store.setRow('transactions', link.localTransactionId, localRow);
    }
    try {
      await saveStore();
    } catch (rollbackError) {
      console.warn('[mercury] Could not roll back the failed deletion', rollbackError);
    }
    throw error;
  }
}

/**
 * Deletion pass for one account.
 *
 * The fetch filters server-side on createdAt — the API documents `start` as
 * "Earliest createdAt date to filter for", and the read-only probe
 * (2026-11-21) confirmed it: a row with createdAt 21:20:25.884Z and postedAt
 * 21:20:30.375Z is returned for start=createdAt but excluded for
 * start=createdAt+2s and even for start=postedAt-1ms. The boundary therefore
 * compares the same field: a linked row is deletable only when its link
 * carries Mercury's createdAt (mercuryCreatedAtMs) at or after the exact
 * window start. A link without the cell — backfill imports and legacy links
 * from tickets 04/05, and rows restored from older backups — is spared:
 * absence from a window that cannot contain it proves nothing, and per the
 * ticket "rows outside the window are untouched". Deletion detection
 * consequently covers only rows whose Mercury createdAt falls inside a
 * fetched window; the local row date (postedAt ?? createdAt) must never be
 * used here, because a row with createdAt before the cursor but postedAt
 * after it is imported with a later local date and then omitted by every
 * later fetch — comparing the local date would falsely delete it.
 */
async function deleteVanishedMercuryRows(
  mercuryAccountId: string,
  fetchedIds: Set<string>,
  windowStartMs: number,
): Promise<void> {
  const links = getMercuryTransactionLinks().filter(
    (link) => link.mercuryAccountId === mercuryAccountId,
  );
  if (links.length === 0) return;
  // One read-model pass to tell live rows from manual-delete tombstones; a
  // Map keeps the match linear.
  const localDates = new Map(
    (await getTransactions()).map((tx) => [tx.id, tx.date.getTime()]),
  );

  for (const link of links) {
    // A link without its local row is a manual-delete tombstone (ticket 04):
    // the link survives the user's delete so the row is never re-imported.
    const localDate = localDates.get(link.localTransactionId);
    if (localDate === undefined) continue;
    // The boundary is Mercury's createdAt, the field the server filters on.
    // A link without the cell (or with a pre-cursor createdAt) is spared:
    // conservative, never destructive.
    if (link.mercuryCreatedAtMs === null || link.mercuryCreatedAtMs < windowStartMs) continue;
    if (fetchedIds.has(link.id)) continue;
    await deleteImportedRowAndLink(link);
  }
}

async function syncOneMercuryAccount(
  token: string,
  linked: MercuryLinkedAccount,
  now: number,
  balances: Map<string, number | null>,
): Promise<void> {
  let localAccountId: string | null = null;
  try {
    const localAccount = await getAccountById(linked.localAccountId);
    if (!localAccount) {
      throw new Error('The linked local account no longer exists.');
    }
    localAccountId = localAccount.id;

    const { start, startMs, exactCursor } = syncWindowStart(now, linked);
    // A fetch that ends in MercuryIncompleteWindowError (the server ignored
    // the pagination offset and repeated a page) throws out of here: the rows
    // collected are a prefix, so neither the deletion pass nor the cursor may
    // run against it. The account records the error and keeps every row.
    const rows = await fetchMercuryTransactions(token, linked.id, { start });
    await importFetchedMercuryTransactions(linked.id, localAccount, rows);
    // The deletion pass runs only against an exact cursor window
    // ([lastSyncedAt, now]): date-only backfill windows have an unobserved
    // binding point (F7), so absence there proves nothing and nothing may be
    // deleted on their strength.
    if (exactCursor) {
      await deleteVanishedMercuryRows(linked.id, new Set(rows.map((row) => row.id)), startMs);
    }

    // Same lifetime flag derivation as the backfill: links added (or removed
    // by the deletion pass) since the last run decide it.
    const mixedCurrency = getMercuryTransactionLinks().some(
      (link) => link.mercuryAccountId === linked.id && link.anomaly,
    );
    await writeMercuryLinkedAccount(linked.id, {
      mixedCurrency,
      // The cursor advances to the run's start, never past the fetch: rows
      // Mercury creates mid-run carry later dates and stay inside the next
      // window.
      lastSyncedAt: now,
      stale: false,
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.';
    await writeMercuryLinkedAccount(linked.id, { stale: true, lastError: message }).catch(
      (persistError) => {
        console.warn('[mercury] Could not record the failed sync', persistError);
      },
    );
    throw error;
  } finally {
    // The mirror refreshes from the balance captured at the start of this
    // account's sync, success or failure, and stays inclusive of anomaly
    // rows. No captured balance (accounts fetch failed, or Mercury reported
    // none) writes nothing rather than a fabricated 0.
    const balance = balances.get(linked.id);
    if (localAccountId !== null && typeof balance === 'number') {
      await updateAccountBalance(localAccountId, balance).catch((error) => {
        console.warn('[mercury] Could not refresh the mirrored balance', error);
      });
    }
  }
}

function logFailedRequestId(error: unknown): void {
  const requestId = error instanceof MercuryApiError ? error.requestId : null;
  if (requestId) {
    console.warn(`[mercury] Failed Mercury request id: ${requestId}`);
  }
}

/**
 * Sync enabled linked accounts once. Never surfaces anything to the UI on
 * its own: triggers decide what (if anything) to show from the outcome.
 *
 * With `mercuryAccountId` the run covers only that one account (the manage
 * screen's per-account retry, ticket 07). It is user intent, so callers pass
 * `force` as well, and the connection-level debounce and backoff stay
 * untouched either way: a retry must report its own result without shifting
 * the automatic cycle the other accounts ride on.
 */
export async function syncMercuryAccounts(
  { force = false, mercuryAccountId }: { force?: boolean; mercuryAccountId?: string } = {},
): Promise<MercurySyncOutcome> {
  const idle: MercurySyncOutcome = { ran: false, busy: false, succeeded: [], failed: [] };

  // Silent no-op gates, in the ticket's order: premium, healthy connection,
  // enabled accounts, stored token.
  if (!(await getCachedPremium())) return idle;
  const connection = getMercuryConnection();
  if (!connection || connection.tokenStatus !== 'active') return idle;
  const allLinked = getMercuryLinkedAccounts();
  const linked = (
    mercuryAccountId !== undefined
      ? allLinked.filter((account) => account.id === mercuryAccountId && account.enabled)
      : allLinked.filter((account) => account.enabled)
  );
  if (linked.length === 0) return idle;
  const token = await getStoredMercuryToken();
  if (!token) return idle;

  const now = Date.now();
  if (!force) {
    const lastAttemptAt = getSyncDebounceTimestamp();
    if (lastAttemptAt !== null && now - lastAttemptAt < MERCURY_SYNC_DEBOUNCE_MS) return idle;
    const { nextEligibleAt } = getMercuryBackoff();
    if (nextEligibleAt !== null && now < nextEligibleAt) return idle;
  }

  if (!tryClaimMercuryBatch()) return { ...idle, busy: true };

  try {
    // The balances come from one accounts-list read before any account syncs;
    // each account's finally re-mirrors exactly this captured value.
    let balances = new Map<string, number | null>();
    let prefetchError: unknown = null;
    try {
      balances = new Map(
        (await fetchMercuryAccounts(token)).map((account) => [account.id, account.currentBalance]),
      );
    } catch (error) {
      prefetchError = error;
      logFailedRequestId(error);
    }

    const outcome: MercurySyncOutcome = { ran: true, busy: false, succeeded: [], failed: [] };
    let needsReauth = false;
    let sawRetryable = false;

    const recordFailure = async (account: MercuryLinkedAccount, error: unknown) => {
      outcome.failed.push({ mercuryAccountId: account.id, error });
      if (isReauthError(error)) needsReauth = true;
      if (isRetryableError(error)) sawRetryable = true;
      logFailedRequestId(error);
      if (prefetchError === null) {
        // The account's own sync already recorded its failure; this write is
        // only for pre-fetch failures, where no per-account code ran.
        return;
      }
      const message = error instanceof Error ? error.message : 'Sync failed.';
      await writeMercuryLinkedAccount(account.id, { stale: true, lastError: message }).catch(
        (persistError) => {
          console.warn('[mercury] Could not record the failed sync', persistError);
        },
      );
    };

    for (const account of linked) {
      if (prefetchError !== null) {
        // One shared failure (accounts list): reported per account, and the
        // classification below still applies to it.
        await recordFailure(account, prefetchError);
        if (isReauthError(prefetchError)) break;
        continue;
      }
      try {
        await syncOneMercuryAccount(token, account, now, balances);
        outcome.succeeded.push(account.id);
      } catch (error) {
        await recordFailure(account, error);
        if (isReauthError(error)) {
          // The token is rejected: the remaining accounts would fail
          // identically, so stop the run here.
          break;
        }
      }
    }

    if (needsReauth) {
      // 401/403 flip the connection: every later automatic trigger no-ops on
      // the tokenStatus gate until the user reconnects.
      await markConnectionNeedsReauthentication();
    }

    // Connection-level debounce and backoff apply to whole-connection runs
    // only. A single-account retry is user intent with its own result: it
    // must neither delay the other accounts' automatic cycle (debounce) nor
    // block it (backoff) because one account was rate-limited.
    const wholeConnection = mercuryAccountId === undefined;
    if (wholeConnection && outcome.succeeded.length > 0) {
      // Interpretation (adjudicated): the debounce and the backoff are
      // connection-level, and the two rules compose as follows. The debounce
      // is consumed by any run with at least one successful account; the
      // backoff counter tracks only runs where NOTHING succeeded and
      // something hit 429/5xx. A mixed run (one success, one 429) therefore
      // consumes the debounce and resets the backoff — the API demonstrably
      // served the token — while the rate-limited account keeps its rows, its
      // cursor, and its recorded error for the retry affordance.
      await setSyncDebounceTimestamp(now);
      await clearMercuryBackoff();
    } else if (wholeConnection && sawRetryable) {
      const { consecutiveFailures } = getMercuryBackoff();
      const consecutive = consecutiveFailures + 1;
      const retryAfter = outcome.failed.reduce<number | null>(
        (latest, failure) => {
          const candidate = failure.error instanceof MercuryApiError ? failure.error.retryAfter : null;
          if (candidate === null) return latest;
          return latest === null ? candidate : Math.max(latest, candidate);
        },
        null,
      );
      const delay = nextBackoffDelayMs(consecutive, retryAfter);
      await setMercuryBackoff(Date.now() + delay, consecutive);
    }
    // Any other all-failed run (network, timeout) writes nothing: the
    // debounce stays unconsumed and any existing backoff stands.

    return outcome;
  } finally {
    releaseMercuryBatch();
  }
}
