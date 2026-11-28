// plSave - Platform-specific delivery for the Profit & Loss workbook.
// Metro resolves plSave.native.ts on iOS/Android and plSave.web.ts on web.
// The web download path is ticket 03 (tickets/profit-and-loss-xlsx).

/**
 * 'saved': the file was written into a user-chosen folder (Android SAF) or
 * handed to the browser's download mechanism (web). 'offered': the workbook
 * was generated and offered through the share sheet (iOS); whether it is
 * kept is up to the share sheet, so no saved file is claimed. 'cancelled':
 * the user dismissed the Android folder picker, an abort rather than a
 * failure.
 */
export type SaveOutcome =
  | { status: 'saved' }
  | { status: 'offered' }
  | { status: 'cancelled' };

export type SaveProfitLossWorkbook = (
  bytes: Uint8Array,
  fileName: string,
) => Promise<SaveOutcome>;
