// Web implementation of the delivery: a browser download of the generated
// workbook, through the same Blob+anchor mechanism as the backup export's
// web branch (src/utils/download.ts).

import { downloadBytes } from './download';
import type { SaveOutcome, SaveProfitLossWorkbook } from './plSave';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * A started download is a completed export: the browser delivers the file to
 * its download destination under the proposed name, so 'saved' is the honest
 * outcome. No folder picker, no share sheet, no silent save.
 */
export const saveProfitLossWorkbook: SaveProfitLossWorkbook = async (
  bytes,
  fileName,
): Promise<SaveOutcome> => {
  downloadBytes(bytes, XLSX_MIME, fileName);
  return { status: 'saved' };
};
