import JSZip from 'jszip';

/**
 * Profit & Loss statement engine (tickets/profit-and-loss-xlsx/01).
 *
 * Pure library, no UI and no store access: an aggregation pass turns one
 * calendar year of transactions (amounts already converted into the app's
 * main currency by the caller) plus the category list into a statement model,
 * and a hand-rolled xlsx writer renders that model into a workbook styled
 * like the reference template in tickets/profit-and-loss-xlsx/. The writer
 * builds on jszip, the zip library the backup export already uses.
 */

/**
 * Input row for the aggregation: a prepared read-model row, not a raw
 * TinyBase transaction cell. The caller maps the store's date into epoch
 * milliseconds, converts amount AND toAmount into the app's main currency,
 * and supplies the anomaly flag as computed by the app's read model
 * (src/db/storage.ts), the way the stats surfaces read it.
 */
export interface ProfitLossTransaction {
  type: string; // 'income' | 'expense' | 'transfer'
  categoryId: string | null;
  /** Denormalized category name; fallback when the category row is gone. */
  categoryName?: string | null;
  /** Present on store rows; deliberately ignored (subcategories roll up). */
  subcategoryName?: string | null;
  accountId: string;
  toAccountId?: string | null;
  /** Stored sign convention: income positive, expense and transfer negative. */
  amount: number;
  /**
   * Destination-side amount of a transfer, converted from the destination
   * currency into the app's main currency by the caller, stored negative
   * like amount (src/db/storage.ts). Used for inbound transfers so the
   * destination-side figure is reported.
   */
  toAmount?: number | null;
  /** Epoch milliseconds. */
  date: number;
  /**
   * FX/anomaly marker (record rule 4): flagged rows stay out of totals,
   * matching the stats surfaces, until OQ-1 resolves.
   */
  anomaly?: boolean;
}

export interface ProfitLossCategory {
  id: string;
  name: string;
  type: string; // 'income' | 'expense'
}

export interface ProfitLossRow {
  label: string;
  /** Aggregated amount per month Jan..Dec, always a positive figure. */
  months: number[];
}

export interface ProfitLossSection {
  title: string;
  totalLabel: string;
  rows: ProfitLossRow[];
  /** Column-wise total across rows; the writer emits these as formulas. */
  total: number[];
}

export interface ProfitLossStatement {
  year: number;
  revenue: ProfitLossSection;
  operatingExpenses: ProfitLossSection;
  /** revenue.total - operatingExpenses.total per month; written as formulas. */
  netIncome: number[];
}

export const TRANSFERS_IN_LABEL = 'Transfers in';
export const TRANSFERS_OUT_LABEL = 'Transfers out';
export const UNCATEGORIZED_LABEL = 'Uncategorized';

const MONTH_COUNT = 12;

const zeroMonths = (): number[] => Array.from({ length: MONTH_COUNT }, () => 0);

/**
 * Row ordering must be engine-independent: localeCompare consults the
 * platform collator (Hermes / Node ICU / V8 disagree), and row order decides
 * workbook bytes. Compare lower-cased labels by UTF-16 code units with a
 * tie-break on the raw label, which every JS engine evaluates identically
 * while still reading as alphabetical.
 */
function compareLabels(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}

interface Bucket {
  label: string;
  months: number[];
}

export function aggregateProfitAndLoss(input: {
  transactions: ProfitLossTransaction[];
  categories: ProfitLossCategory[];
  accountIds: string[];
  year: number;
}): ProfitLossStatement {
  const selected = new Set(input.accountIds);
  const categoryById = new Map(input.categories.map((c) => [c.id, c]));
  const revenueBuckets = new Map<string, Bucket>();
  const expenseBuckets = new Map<string, Bucket>();

  const add = (
    buckets: Map<string, Bucket>,
    key: string,
    label: string,
    month: number,
    amount: number,
  ): void => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label, months: zeroMonths() };
      buckets.set(key, bucket);
    }
    bucket.months[month] += amount;
  };

  for (const tx of input.transactions) {
    // FX/anomaly rows stay out of every total until OQ-1 resolves
    // (record rule 4), matching the stats screens.
    if (tx.anomaly) continue;
    const date = new Date(tx.date);
    if (date.getFullYear() !== input.year) continue;
    const month = date.getMonth();

    if (tx.type === 'transfer') {
      const fromSelected = selected.has(tx.accountId);
      const toSelected = selected.has(tx.toAccountId ?? '');
      // Both sides selected: internal movement, not income or expense.
      // Neither side selected: outside the statement entirely.
      if (fromSelected === toSelected) continue;
      if (toSelected) {
        // Inbound: report the destination-side figure the selection received.
        add(
          revenueBuckets,
          'transfers',
          TRANSFERS_IN_LABEL,
          month,
          Math.abs(tx.toAmount ?? tx.amount),
        );
      } else {
        add(expenseBuckets, 'transfers', TRANSFERS_OUT_LABEL, month, Math.abs(tx.amount));
      }
      continue;
    }

    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    if (!selected.has(tx.accountId)) continue;

    const buckets = tx.type === 'income' ? revenueBuckets : expenseBuckets;
    if (!tx.categoryId) {
      add(buckets, 'uncategorized', UNCATEGORIZED_LABEL, month, Math.abs(tx.amount));
      continue;
    }
    const category = categoryById.get(tx.categoryId);
    if (category) {
      // Parent categories only: subcategoryId/subcategoryName stay unexamined,
      // so subcategory activity rolls up into its parent row.
      add(buckets, `cat:${category.id}`, category.name, month, Math.abs(tx.amount));
    } else if (tx.categoryName) {
      // Orphaned category reference: keep the amount under the last known
      // denormalized name (same rule as the subcategory pie slices).
      add(buckets, `orphan:${tx.categoryName}`, tx.categoryName, month, Math.abs(tx.amount));
    } else {
      add(buckets, 'uncategorized', UNCATEGORIZED_LABEL, month, Math.abs(tx.amount));
    }
  }

  const buildSection = (
    title: string,
    totalLabel: string,
    sectionType: 'income' | 'expense',
    buckets: Map<string, Bucket>,
  ): ProfitLossSection => {
    const rows: ProfitLossRow[] = [];
    const emitted = new Set<string>();
    // Every category of the section's type gets a row, zero activity included.
    for (const category of input.categories) {
      if (category.type !== sectionType) continue;
      const bucket = buckets.get(`cat:${category.id}`);
      rows.push({ label: category.name, months: bucket ? [...bucket.months] : zeroMonths() });
      if (bucket) emitted.add(`cat:${category.id}`);
    }
    // Categories referenced by this section's transactions whose own type
    // disagrees (classification follows the transaction type) and orphaned
    // references; they sort in with the named category rows.
    const extras = [...buckets.entries()]
      .filter(([key]) => key !== 'transfers' && key !== 'uncategorized' && !emitted.has(key))
      .map(([, bucket]) => ({ label: bucket.label, months: [...bucket.months] }));
    rows.push(...extras);
    rows.sort((a, b) => compareLabels(a.label, b.label));
    // Fixed rows keep the layout stable: transfers row, then Uncategorized
    // anchored at the end of the section.
    const transfers = buckets.get('transfers');
    rows.push({
      label: sectionType === 'income' ? TRANSFERS_IN_LABEL : TRANSFERS_OUT_LABEL,
      months: transfers ? [...transfers.months] : zeroMonths(),
    });
    const uncategorized = buckets.get('uncategorized');
    rows.push({
      label: UNCATEGORIZED_LABEL,
      months: uncategorized ? [...uncategorized.months] : zeroMonths(),
    });
    const total = zeroMonths();
    for (const row of rows) {
      for (let month = 0; month < MONTH_COUNT; month++) {
        total[month] += row.months[month];
      }
    }
    return { title, totalLabel, rows, total };
  };

  const revenue = buildSection('Revenue', 'Total Revenue', 'income', revenueBuckets);
  const operatingExpenses = buildSection(
    'Operating Expenses',
    'Total Operating Expenses',
    'expense',
    expenseBuckets,
  );
  const netIncome = revenue.total.map((value, month) => value - operatingExpenses.total[month]);
  return { year: input.year, revenue, operatingExpenses, netIncome };
}

// ---------------------------------------------------------------------------
// XLSX writer
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * jszip stamps zip entries with the current time unless a date is pinned
 * (lib/object.js: `o.date = o.date || new Date()`), which would make two
 * builds of the same statement differ byte-for-byte. The workbook must be
 * identical across platforms and runs (ticket 03), so every entry carries
 * this fixed date. The backup export has no byte-equality requirement and
 * stays unpinned.
 */
const ZIP_ENTRY_DATE = new Date(Date.UTC(2000, 0, 1));

/**
 * Every explicit entry carries the pinned date; createFolders: false keeps
 * jszip's implicit directory entries out of the archive, because those are
 * stamped with the current time and would break byte determinism anyway
 * (spreadsheets never need directory entries in an xlsx).
 */
function addZipEntry(zip: JSZip, name: string, content: string): void {
  zip.file(name, content, { date: ZIP_ENTRY_DATE, createFolders: false });
}

/** 1-based spreadsheet column index to letter (A..O here, general to ZZ). */
function columnLetter(index: number): string {
  let letters = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

type CellStyle = 'plain' | 'bold' | 'currency' | 'currencyBold';

const STYLE_IDS: Record<CellStyle, number> = {
  plain: 0,
  bold: 1,
  currency: 2,
  currencyBold: 3,
};

type Cell =
  | { kind: 'text'; text: string; style: CellStyle }
  | { kind: 'number'; value: number; style: CellStyle }
  | { kind: 'formula'; formula: string; style: CellStyle };

interface SheetRow {
  height?: number;
  /** Sparse cells indexed by column-1 (position 0 is column A). */
  cells: (Cell | null)[];
}

const text = (value: string, style: CellStyle): Cell => ({ kind: 'text', text: value, style });
const number = (value: number, style: CellStyle): Cell => ({ kind: 'number', value, style });
const formula = (body: string, style: CellStyle): Cell => ({ kind: 'formula', formula: body, style });

const LABEL_COLUMN = 2; // B, after the template's narrow spacer column A
const MONTH_START_COLUMN = 3; // C..N hold Jan..Dec
const TOTAL_COLUMN = 15; // O
const FIRST_MONTH_LETTER = columnLetter(MONTH_START_COLUMN);
const LAST_MONTH_LETTER = columnLetter(MONTH_START_COLUMN + MONTH_COUNT - 1);

/**
 * Sheet layout, mirroring the reference workbook: tall blank first row,
 * Company:/Date: rows, month header row, then Revenue / Operating Expenses
 * sections separated by blank rows with Net Income last. Every row that has
 * month cells carries a per-row SUM formula in the Total column; section
 * totals are SUM formulas over the section's rows and Net Income subtracts
 * the two section totals. Nothing computed is ever hardcoded.
 */
function buildSheetRows(statement: ProfitLossStatement): SheetRow[] {
  const rows: SheetRow[] = [];

  const makeRow = (entries: [number, Cell][], height?: number): SheetRow => {
    const cells: (Cell | null)[] = [];
    for (const [column, cell] of entries) cells[column - 1] = cell;
    return { height, cells };
  };

  // Row 1: the template's tall blank spacer.
  rows.push(makeRow([], 29.25));
  // Row 2: Company: left blank.
  rows.push(makeRow([[LABEL_COLUMN, text('Company:', 'bold')]]));
  // Row 3: Date: the chosen year.
  rows.push(
    makeRow([[LABEL_COLUMN, text('Date:', 'bold')], [MONTH_START_COLUMN, number(statement.year, 'plain')]]),
  );
  // Row 4: month headers plus Total.
  rows.push(
    makeRow([
      ...MONTH_NAMES.map((name, i) => [MONTH_START_COLUMN + i, text(name, 'bold')] as [number, Cell]),
      [TOTAL_COLUMN, text('Total', 'bold')],
    ]),
  );

  let rowNumber = 5; // sheet row of the next pushed row
  const sectionTotalRows: number[] = [];

  for (const section of [statement.revenue, statement.operatingExpenses]) {
    rows.push(makeRow([[LABEL_COLUMN, text(section.title, 'bold')]]));
    rowNumber++;
    const firstRow = rowNumber;
    for (const row of section.rows) {
      rows.push(
        makeRow([
          [LABEL_COLUMN, text(row.label, 'plain')],
          ...row.months.map(
            (value, i) => [MONTH_START_COLUMN + i, number(value, 'currency')] as [number, Cell],
          ),
          [TOTAL_COLUMN, formula(`SUM(${FIRST_MONTH_LETTER}${rowNumber}:${LAST_MONTH_LETTER}${rowNumber})`, 'currency')],
        ]),
      );
      rowNumber++;
    }
    const lastRow = rowNumber - 1;
    rows.push(
      makeRow([
        [LABEL_COLUMN, text(section.totalLabel, 'bold')],
        ...MONTH_NAMES.map((_, i) => {
          const letter = columnLetter(MONTH_START_COLUMN + i);
          return [
            MONTH_START_COLUMN + i,
            formula(`SUM(${letter}${firstRow}:${letter}${lastRow})`, 'currencyBold'),
          ] as [number, Cell];
        }),
        [TOTAL_COLUMN, formula(`SUM(${FIRST_MONTH_LETTER}${rowNumber}:${LAST_MONTH_LETTER}${rowNumber})`, 'currencyBold')],
      ]),
    );
    sectionTotalRows.push(rowNumber);
    rowNumber++;
    rows.push(makeRow([])); // blank spacer between sections
    rowNumber++;
  }

  // Net Income = Total Revenue minus Total Operating Expenses, per month.
  const [revenueTotalRow, expenseTotalRow] = sectionTotalRows;
  rows.push(
    makeRow([
      [LABEL_COLUMN, text('Net Income', 'bold')],
      ...MONTH_NAMES.map((_, i) => {
        const letter = columnLetter(MONTH_START_COLUMN + i);
        return [
          MONTH_START_COLUMN + i,
          formula(`${letter}${revenueTotalRow}-${letter}${expenseTotalRow}`, 'currencyBold'),
        ] as [number, Cell];
      }),
      [TOTAL_COLUMN, formula(`SUM(${FIRST_MONTH_LETTER}${rowNumber}:${LAST_MONTH_LETTER}${rowNumber})`, 'currencyBold')],
    ]),
  );

  return rows;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function cellXml(cell: Cell, column: number, rowNumber: number, sst: (t: string) => number): string {
  const ref = `${columnLetter(column)}${rowNumber}`;
  const style = STYLE_IDS[cell.style];
  if (cell.kind === 'text') {
    return `<c r="${ref}" s="${style}" t="s"><v>${sst(cell.text)}</v></c>`;
  }
  if (cell.kind === 'number') {
    return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
  }
  // Formulas are stored as formulas: no cached <v>, so Excel and LibreOffice
  // calculate on load (workbook.xml sets fullCalcOnLoad).
  return `<c r="${ref}" s="${style}"><f>${escapeXml(cell.formula)}</f></c>`;
}

function rowXml(row: SheetRow, rowNumber: number, sst: (t: string) => number): string {
  const cells = row.cells
    .map((cell, index) => (cell ? cellXml(cell, index + 1, rowNumber, sst) : ''))
    .join('');
  const height = row.height ? ` ht="${row.height}" customHeight="1"` : '';
  return `<row r="${rowNumber}"${height}>${cells}</row>`;
}

export async function buildProfitLossWorkbook(
  statement: ProfitLossStatement,
  currencySymbol: string,
): Promise<Uint8Array> {
  const rows = buildSheetRows(statement);

  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  let stringRefs = 0;
  const sst = (value: string): number => {
    stringRefs++;
    const existing = stringIndex.get(value);
    if (existing !== undefined) return existing;
    const next = strings.length;
    strings.push(value);
    stringIndex.set(value, next);
    return next;
  };

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${columnLetter(TOTAL_COLUMN)}${rows.length}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultColWidth="12.57421875" defaultRowHeight="15.75" customHeight="1"/>' +
    '<cols><col min="1" max="1" width="6.57421875" customWidth="1"/>' +
    '<col min="2" max="2" width="70.7109375" customWidth="1"/></cols>' +
    '<sheetData>' +
    rows.map((row, index) => rowXml(row, index + 1, sst)).join('') +
    '</sheetData></worksheet>';

  const formatCode = `"${currencySymbol}"#,##0.00`;
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1">' +
    `<numFmt numFmtId="164" formatCode="${escapeXml(formatCode)}"/>` +
    '</numFmts>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Arial"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml('Profit & Loss')}" sheetId="1" r:id="rId1"/></sheets>` +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    '</Relationships>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const sharedStringsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringRefs}" uniqueCount="${strings.length}">` +
    strings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join('') +
    '</sst>';

  const zip = new JSZip();
  addZipEntry(zip, '[Content_Types].xml', contentTypesXml);
  addZipEntry(zip, '_rels/.rels', rootRelsXml);
  addZipEntry(zip, 'xl/workbook.xml', workbookXml);
  addZipEntry(zip, 'xl/_rels/workbook.xml.rels', workbookRelsXml);
  addZipEntry(zip, 'xl/worksheets/sheet1.xml', sheetXml);
  addZipEntry(zip, 'xl/styles.xml', stylesXml);
  addZipEntry(zip, 'xl/sharedStrings.xml', sharedStringsXml);

  // Same compression setup as the backup export (src/utils/backup.ts).
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
