// Web implementation lands with the web download path (ticket 03,
// tickets/profit-and-loss-xlsx); the settings row stays disabled on web
// until then, so this only guards against an accidental call.

import type { SaveProfitLossWorkbook } from './plSave';

export const saveProfitLossWorkbook: SaveProfitLossWorkbook = async (
  _bytes,
  _fileName,
) => {
  throw new Error('Profit & Loss export is not available on web yet');
};
