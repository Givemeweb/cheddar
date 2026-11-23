/**
 * Unlink (disconnect) flow for the Mercury connection (ticket 07).
 *
 * Unlinking always disconnects the whole connection: the connection row, the
 * linked-account rows, the transaction links, the cursors, and the sync
 * state go away, and the stored token is deleted before anything else —
 * with a read-back verification, so a best-effort SecureStore failure aborts
 * the unlink while the connection still exists instead of stranding a live
 * bearer token (ticket 03 carry-forward). The user picks the row policy
 * first, and it is applied to every linked account:
 *
 * - `keep`: every link row is removed (manual-delete tombstones included)
 *   and each formerly linked account loses its managed marker, so it becomes
 *   an ordinary editable account. Its transactions and its mirrored balance
 *   are left exactly as they are.
 * - `delete`: every imported transaction on a linked account is deleted and
 *   the linked account is deleted wholesale. No balance moves anywhere: the
 *   imported rows never participated in balance math (src/db/storage.ts
 *   skips managed accounts and linked rows), and the account itself is
 *   removed rather than emptied, so its mirrored balance goes with it.
 *
 * The single-flight slot is shared with link batches and syncs (ticket 06):
 * an unlink running under a live sync would delete the rows that sync is
 * working on, so a busy slot declines the unlink instead.
 */
import { getStore, isDatabaseReady } from '../db/tinybase';
import {
  clearMercuryConnectionData,
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
} from '../db/mercury';
import { deleteStoredMercuryToken, getStoredMercuryToken } from './mercuryConnect';
import {
  MercuryBatchBusyError,
  releaseMercuryBatch,
  tryClaimMercuryBatch,
} from './mercuryImport';

/** What happens to the imported rows when the connection is unlinked. */
export type MercuryUnlinkRowPolicy = 'keep' | 'delete';

/**
 * Disconnects Mercury and applies the chosen row policy to every linked
 * account. Throws MercuryBatchBusyError when a link/sync batch holds the
 * single-flight slot; nothing is touched in that case.
 */
export async function unlinkMercury(policy: MercuryUnlinkRowPolicy): Promise<void> {
  if (!isDatabaseReady()) {
    throw new Error('Cannot unlink while the local database is not ready.');
  }
  if (!tryClaimMercuryBatch()) throw new MercuryBatchBusyError();
  try {
    // The token goes first, unconditionally: every later step must not be
    // able to leave a live token behind a half-torn-down connection. But the
    // removal itself is best-effort (deleteStoredMercuryToken swallows
    // SecureStore errors and always resolves), so read the slot back before
    // touching anything: a token that survived must abort the whole unlink
    // while the connection still exists, leaving the user a plain retry
    // instead of a keychain orphan with no path back.
    await deleteStoredMercuryToken();
    if ((await getStoredMercuryToken()) !== null) {
      throw new Error(
        'The stored token could not be deleted. Mercury stays connected; try unlinking again.',
      );
    }

    const store = getStore();
    const linked = getMercuryLinkedAccounts();
    const links = getMercuryTransactionLinks();

    if (policy === 'delete') {
      for (const account of linked) {
        // Every transaction the links cover goes, wherever the user's edits
        // have since moved it (a moved row stays link-covered, so deleting
        // it still touches no balance). Tombstoned links have no local row
        // and their delRow is a no-op.
        for (const link of links) {
          if (link.mercuryAccountId !== account.id) continue;
          store.delRow('transactions', link.localTransactionId);
        }
        // Delete every other transaction living on the linked account too,
        // then the account itself. Direct store writes: these rows never
        // touched balances and the account disappears wholesale, so there is
        // no balance math to run or skip.
        const rows = Object.entries(store.getTable('transactions') ?? {});
        for (const [txId, row] of rows) {
          if ((row.accountId as string | undefined) === account.localAccountId) {
            store.delRow('transactions', txId);
          }
        }
        // Internal path: the public deleteAccount refuses managed accounts,
        // and unlink is the one flow allowed past that guard.
        store.delRow('accounts', account.localAccountId);
      }
    } else {
      for (const account of linked) {
        // The managed marker is what keeps the account read-only and its
        // rows balance-isolated; clearing it returns the account to ordinary
        // manual behavior. The balance cell is left untouched.
        if (store.getCell('accounts', account.localAccountId, 'name') !== undefined) {
          store.setCell('accounts', account.localAccountId, 'source', 'manual');
        }
      }
    }

    // Both policies clear the link table: under `keep` so nothing is ever
    // re-imported or treated as imported again, under `delete` because the
    // rows (and their tombstones) are gone with the accounts.
    await clearMercuryConnectionData();
  } finally {
    releaseMercuryBatch();
  }
}
