import JSZip from 'jszip';
import {
  aggregateProfitAndLoss,
  buildProfitLossWorkbook,
  ProfitLossCategory,
  ProfitLossStatement,
  ProfitLossTransaction,
  TRANSFERS_IN_LABEL,
  TRANSFERS_OUT_LABEL,
  UNCATEGORIZED_LABEL,
} from './profitAndLoss';

const CATEGORIES: ProfitLossCategory[] = [
  { id: 'cat-consulting', name: 'Consulting', type: 'income' },
  { id: 'cat-donations', name: 'Donations', type: 'income' },
  { id: 'cat-sales', name: 'Sales', type: 'income' }, // zero activity
  { id: 'cat-rent', name: 'Rent', type: 'expense' },
  { id: 'cat-software', name: 'Software', type: 'expense' },
  { id: 'cat-marketing', name: 'Marketing', type: 'expense' }, // zero activity
  { id: 'cat-cross', name: 'Cross', type: 'income' }, // used by an expense-typed tx
];

const tx = (overrides: Partial<ProfitLossTransaction>): ProfitLossTransaction => ({
  type: 'expense',
  categoryId: null,
  accountId: 'acc-1',
  amount: -10,
  date: new Date(2026, 0, 15).getTime(),
  ...overrides,
});

/** Fixture covering every aggregation rule; expected values documented inline. */
const TRANSACTIONS: ProfitLossTransaction[] = [
  // Income into the selected account.
  tx({ type: 'income', categoryId: 'cat-consulting', amount: 1000, date: new Date(2026, 2, 10).getTime() }),
  tx({ type: 'income', categoryId: 'cat-consulting', amount: 500, date: new Date(2026, 2, 20).getTime() }),
  tx({ type: 'income', categoryId: 'cat-donations', amount: 200, date: new Date(2026, 0, 5).getTime() }),
  // Expenses aggregate as positive costs even though they are stored negative.
  tx({ type: 'expense', categoryId: 'cat-rent', amount: -300, date: new Date(2026, 0, 1).getTime() }),
  tx({ type: 'expense', categoryId: 'cat-software', amount: -50, date: new Date(2026, 5, 2).getTime() }),
  tx({ type: 'expense', categoryId: 'cat-software', amount: -25, date: new Date(2026, 6, 9).getTime() }),
  // Subcategory activity rolls up into the parent category row.
  tx({
    type: 'expense',
    categoryId: 'cat-rent',
    subcategoryName: 'Garage',
    amount: -100,
    date: new Date(2026, 3, 14).getTime(),
  }),
  // Classification follows the transaction type, not the category's type.
  tx({ type: 'expense', categoryId: 'cat-cross', amount: -40, date: new Date(2026, 1, 3).getTime() }),
  // Uncategorized rows, one per section.
  tx({ type: 'income', categoryId: null, amount: 75, date: new Date(2026, 3, 8).getTime() }),
  tx({ type: 'expense', categoryId: null, amount: -15, date: new Date(2026, 7, 21).getTime() }),
  // Transfers: both sides selected -> skipped.
  tx({ type: 'transfer', accountId: 'acc-1', toAccountId: 'acc-2', amount: -100, date: new Date(2026, 4, 1).getTime() }),
  // One-sided into the selection -> Transfers in (revenue). Cross-currency
  // transfers report the destination-side toAmount, stored negative.
  tx({ type: 'transfer', accountId: 'acc-3', toAccountId: 'acc-1', amount: -100, date: new Date(2026, 5, 15).getTime() }),
  tx({ type: 'transfer', accountId: 'acc-3', toAccountId: 'acc-1', amount: -100, toAmount: -175, date: new Date(2026, 11, 5).getTime() }),
  // One-sided out of the selection -> Transfers out (expenses). The outbound
  // branch must ignore the destination-side toAmount (-90 here): Sep stays 60.
  tx({ type: 'transfer', accountId: 'acc-1', toAccountId: 'acc-out', amount: -60, toAmount: -90, date: new Date(2026, 8, 30).getTime() }),
  // Neither side selected -> skipped.
  tx({ type: 'transfer', accountId: 'acc-3', toAccountId: 'acc-out', amount: -70, date: new Date(2026, 9, 1).getTime() }),
  // Unselected account -> excluded.
  tx({ type: 'income', categoryId: 'cat-consulting', amount: 888, accountId: 'acc-3', date: new Date(2026, 1, 9).getTime() }),
  // Wrong year -> excluded.
  tx({ type: 'income', categoryId: 'cat-consulting', amount: 999, date: new Date(2025, 11, 31, 23, 59, 59).getTime() }),
  tx({ type: 'income', categoryId: 'cat-consulting', amount: 999, date: new Date(2027, 0, 1).getTime() }),
  // Orphaned category reference keeps its denormalized name; without a name
  // it falls into Uncategorized.
  tx({ type: 'income', categoryId: 'cat-gone', categoryName: 'Legacy Income', amount: 30, date: new Date(2026, 9, 12).getTime() }),
  tx({ type: 'expense', categoryId: 'cat-gone2', categoryName: null, amount: -10, date: new Date(2026, 10, 2).getTime() }),
];

/** Expected section row orders; only labels are asserted. */
const EXPECTED_REVENUE_ROWS: string[] = [
  'Consulting',
  'Cross',
  'Donations',
  'Legacy Income',
  'Sales',
  TRANSFERS_IN_LABEL,
  UNCATEGORIZED_LABEL,
];

const EXPECTED_EXPENSE_ROWS: string[] = [
  'Cross',
  'Marketing',
  'Rent',
  'Software',
  TRANSFERS_OUT_LABEL,
  UNCATEGORIZED_LABEL,
];

const aggregateFixture = (): ProfitLossStatement =>
  aggregateProfitAndLoss({
    transactions: TRANSACTIONS,
    categories: CATEGORIES,
    accountIds: ['acc-1', 'acc-2'],
    year: 2026,
  });

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

describe('aggregateProfitAndLoss', () => {
  it('filters to the selected accounts and the chosen calendar year', () => {
    const statement = aggregateFixture();
    // The 888 acc-3 income and the two 999 amounts (2025/2027) are out of scope.
    expect(sum(statement.revenue.total)).toBe(2080);
    expect(sum(statement.operatingExpenses.total)).toBe(600);
    expect(statement.revenue.total[1]).toBe(0); // February: only the excluded 888
  });

  it('buckets by device-local calendar month with year boundaries respected', () => {
    const statement = aggregateProfitAndLoss({
      transactions: [
        tx({ type: 'income', categoryId: 'cat-donations', amount: 1, date: new Date(2026, 0, 1, 0, 0, 0).getTime() }),
        tx({ type: 'income', categoryId: 'cat-donations', amount: 2, date: new Date(2026, 11, 31, 23, 59, 59).getTime() }),
      ],
      categories: CATEGORIES,
      accountIds: ['acc-1'],
      year: 2026,
    });
    expect(statement.revenue.rows.find((r) => r.label === 'Donations')?.months).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
    ]);
  });

  it('classifies by transaction type with expenses as positive costs', () => {
    const statement = aggregateFixture();
    const rent = statement.operatingExpenses.rows.find((r) => r.label === 'Rent');
    expect(rent?.months[0]).toBe(300); // stored as -300
    const donations = statement.revenue.rows.find((r) => r.label === 'Donations');
    expect(donations?.months[0]).toBe(200);
  });

  it('skips transfers when both sides are among the selected accounts', () => {
    const statement = aggregateFixture();
    // The acc-1 -> acc-2 transfer must not appear anywhere.
    expect(statement.revenue.rows.find((r) => r.label === TRANSFERS_IN_LABEL)?.months[4]).toBe(0);
    expect(statement.operatingExpenses.rows.find((r) => r.label === TRANSFERS_OUT_LABEL)?.months[4]).toBe(0);
  });

  it('maps one-sided transfers into Transfers in / Transfers out rows', () => {
    const statement = aggregateFixture();
    expect(statement.revenue.rows.find((r) => r.label === TRANSFERS_IN_LABEL)?.months[5]).toBe(100);
    expect(statement.operatingExpenses.rows.find((r) => r.label === TRANSFERS_OUT_LABEL)?.months[8]).toBe(60);
  });

  it('uses the destination-side amount for inbound cross-currency transfers', () => {
    const statement = aggregateFixture();
    // amount -100 left the outside account, toAmount -175 arrived in the
    // selection: the statement reports what the selection received.
    expect(statement.revenue.rows.find((r) => r.label === TRANSFERS_IN_LABEL)?.months[11]).toBe(175);
    // Without a toAmount the source-side amount stands (June transfer).
    expect(statement.revenue.rows.find((r) => r.label === TRANSFERS_IN_LABEL)?.months[5]).toBe(100);
  });

  it('excludes anomaly-flagged rows from every total', () => {
    const statement = aggregateProfitAndLoss({
      transactions: [
        tx({ type: 'income', categoryId: 'cat-donations', amount: 100 }),
        tx({ type: 'income', categoryId: 'cat-donations', amount: 999, anomaly: true }),
        tx({ type: 'expense', categoryId: 'cat-rent', amount: -50, anomaly: true }),
        tx({ type: 'transfer', accountId: 'acc-3', toAccountId: 'acc-1', amount: -80, anomaly: true }),
      ],
      categories: CATEGORIES,
      accountIds: ['acc-1'],
      year: 2026,
    });
    expect(statement.revenue.rows.find((r) => r.label === 'Donations')?.months[0]).toBe(100);
    expect(statement.operatingExpenses.rows.find((r) => r.label === 'Rent')?.months[0]).toBe(0);
    expect(statement.revenue.rows.find((r) => r.label === TRANSFERS_IN_LABEL)?.months[0]).toBe(0);
  });

  it('ignores transfers with neither side selected', () => {
    const statement = aggregateFixture();
    // The acc-3 -> acc-out transfer (70) must not appear in either section;
    // Transfers in holds only the two selected-side inbound transfers.
    expect(sum(statement.revenue.rows.find((r) => r.label === TRANSFERS_IN_LABEL)?.months ?? [])).toBe(275);
    expect(sum(statement.operatingExpenses.rows.find((r) => r.label === TRANSFERS_OUT_LABEL)?.months ?? [])).toBe(60);
  });

  it('lands no-category transactions in an Uncategorized row at the end of their section', () => {
    const statement = aggregateFixture();
    expect(statement.revenue.rows.at(-1)?.label).toBe(UNCATEGORIZED_LABEL);
    expect(statement.revenue.rows.at(-1)?.months[3]).toBe(75);
    expect(statement.operatingExpenses.rows.at(-1)?.label).toBe(UNCATEGORIZED_LABEL);
    expect(statement.operatingExpenses.rows.at(-1)?.months[7]).toBe(15);
  });

  it('rolls subcategories up into their parent category row', () => {
    const statement = aggregateFixture();
    // Rent: 300 in Jan + 100 subcategory amount in Apr; no separate Garage row.
    const rent = statement.operatingExpenses.rows.find((r) => r.label === 'Rent');
    expect(rent?.months).toEqual([300, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(statement.operatingExpenses.rows.some((r) => r.label === 'Garage')).toBe(false);
  });

  it('keeps zero-activity category rows at 0.00', () => {
    const statement = aggregateFixture();
    expect(statement.revenue.rows.find((r) => r.label === 'Sales')?.months).toEqual(new Array(12).fill(0));
    expect(statement.operatingExpenses.rows.find((r) => r.label === 'Marketing')?.months).toEqual(
      new Array(12).fill(0),
    );
  });

  it('sorts category rows alphabetically with Transfers before a final Uncategorized', () => {
    const statement = aggregateFixture();
    expect(statement.revenue.rows.map((r) => r.label)).toEqual(EXPECTED_REVENUE_ROWS);
    expect(statement.operatingExpenses.rows.map((r) => r.label)).toEqual(EXPECTED_EXPENSE_ROWS);
  });

  it('sorts rows engine-independently: case-insensitive, accent-sensitive code units', () => {
    // localeCompare would order these differently per engine collation
    // (Hermes / Node ICU / V8 disagree), and row order decides workbook
    // bytes; the comparator is lower-cased UTF-16 code units with a raw
    // tie-break, so the order is identical everywhere (ticket 03). The
    // fixture deliberately includes cases that DISTINGUISH the comparator
    // from en-US localeCompare: en collation sorts 'Äpfel' before 'Zebra'
    // (diacritic folds to the base letter) and 'apple' before 'Apple'
    // (lowercase tertiary-first), while code units put z U+007A before
    // ä U+00E4 and the raw tie-break puts 'Apple' (0x41) before 'apple'
    // (0x61) - so this test fails if localeCompare ever returns.
    const names = ['Transfer', 'Café', 'bank fees', 'cafe', 'Äpfel', 'Zebra', 'apple', 'Apple'];
    const statement = aggregateProfitAndLoss({
      transactions: names.map((name, i) =>
        tx({ type: 'income', categoryId: `cat-x${i}`, amount: 1, date: new Date(2026, 0, 1).getTime() }),
      ),
      categories: names.map((name, i) => ({ id: `cat-x${i}`, name, type: 'income' as const })),
      accountIds: ['acc-1'],
      year: 2026,
    });
    // 'cafe' precedes 'Café' (e U+0065 < é U+00E9); 'Apple' and 'apple' sit
    // adjacent via the raw tie-break.
    expect(statement.revenue.rows.map((row) => row.label)).toEqual([
      'Apple',
      'apple',
      'bank fees',
      'cafe',
      'Café',
      'Transfer',
      'Zebra',
      'Äpfel',
      TRANSFERS_IN_LABEL,
      UNCATEGORIZED_LABEL,
    ]);
  });

  it('keeps the Transfers and Uncategorized rows present even without activity', () => {
    const statement = aggregateProfitAndLoss({
      transactions: [],
      categories: CATEGORIES,
      accountIds: ['acc-1'],
      year: 2026,
    });
    expect(statement.revenue.rows.map((r) => r.label)).toEqual([
      'Consulting',
      'Cross',
      'Donations',
      'Sales',
      TRANSFERS_IN_LABEL,
      UNCATEGORIZED_LABEL,
    ]);
    expect(statement.operatingExpenses.rows.map((r) => r.label)).toEqual([
      'Marketing',
      'Rent',
      'Software',
      TRANSFERS_OUT_LABEL,
      UNCATEGORIZED_LABEL,
    ]);
    expect(statement.revenue.total).toEqual(new Array(12).fill(0));
    expect(statement.netIncome).toEqual(new Array(12).fill(0));
  });

  it('falls back to the denormalized name for orphaned categories and to Uncategorized without one', () => {
    const statement = aggregateFixture();
    expect(statement.revenue.rows.find((r) => r.label === 'Legacy Income')?.months[9]).toBe(30);
    // cat-gone2 has no denormalized name: its amount joins Uncategorized.
    expect(statement.operatingExpenses.rows.at(-1)?.months[10]).toBe(10);
  });

  it('classifies by transaction type even when the category type disagrees', () => {
    const statement = aggregateFixture();
    // cat-cross is an income category but the transaction is an expense.
    expect(statement.operatingExpenses.rows.find((r) => r.label === 'Cross')?.months[1]).toBe(40);
    expect(statement.revenue.rows.find((r) => r.label === 'Cross')?.months).toEqual(new Array(12).fill(0));
  });

  it('reconciles section totals and net income with the input data', () => {
    const statement = aggregateFixture();
    expect(statement.revenue.total).toEqual([200, 0, 1500, 75, 0, 100, 0, 0, 0, 30, 0, 175]);
    expect(statement.operatingExpenses.total).toEqual([300, 40, 0, 100, 0, 50, 25, 15, 60, 0, 10, 0]);
    expect(statement.netIncome).toEqual([
      -100, -40, 1500, -25, 0, 50, -25, -15, -60, 30, -10, 175,
    ]);
  });

  it('aggregates several selected accounts into one statement', () => {
    const statement = aggregateProfitAndLoss({
      transactions: [
        tx({ type: 'income', categoryId: 'cat-donations', amount: 100, accountId: 'acc-1' }),
        tx({ type: 'income', categoryId: 'cat-donations', amount: 23, accountId: 'acc-2' }),
      ],
      categories: CATEGORIES,
      accountIds: ['acc-1', 'acc-2'],
      year: 2026,
    });
    expect(statement.revenue.rows.find((r) => r.label === 'Donations')?.months[0]).toBe(123);
  });
});

// ---------------------------------------------------------------------------
// Writer structure tests
// ---------------------------------------------------------------------------

interface ParsedCell {
  style?: string;
  text?: string;
  value?: number;
  formula?: string;
  /** Raw shared-string index for t="s" cells, before SST resolution. */
  sharedRef?: number;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function columnToIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index;
}

function indexToColumn(index: number): string {
  let letters = '';
  let value = index;
  while (value > 0) {
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

interface ParsedWorkbook {
  parts: Record<string, string>;
  shared: string[];
  cells: Map<string, ParsedCell>;
  cellValue: (ref: string) => number;
  rowOfLabel: (label: string, fromRow?: number, toRow?: number) => number;
}

async function parseWorkbook(bytes: Uint8Array): Promise<ParsedWorkbook> {
  const zip = await JSZip.loadAsync(bytes);
  const parts: Record<string, string> = {};
  for (const name of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/worksheets/sheet1.xml',
    'xl/styles.xml',
    'xl/sharedStrings.xml',
  ]) {
    const file = zip.file(name);
    if (file) parts[name] = await file.async('string');
  }
  const shared = [...parts['xl/sharedStrings.xml'].matchAll(/<si><t>([\s\S]*?)<\/t><\/si>/g)].map((m) =>
    decodeXmlEntities(m[1]),
  );
  const cells = new Map<string, ParsedCell>();
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(parts['xl/worksheets/sheet1.xml'])) !== null) {
    const ref = `${match[1]}${match[2]}`;
    const attrs = match[3];
    const inner = match[4];
    const cell: ParsedCell = {};
    const style = attrs.match(/ s="(\d+)"/);
    if (style) cell.style = style[1];
    const type = attrs.match(/ t="(\w+)"/);
    const value = inner.match(/<v>([\s\S]*?)<\/v>/);
    const formulaMatch = inner.match(/<f>([\s\S]*?)<\/f>/);
    if (formulaMatch) cell.formula = decodeXmlEntities(formulaMatch[1]);
    if (value) {
      if (type?.[1] === 's') {
        cell.sharedRef = parseInt(value[1], 10);
        cell.text = shared[cell.sharedRef];
      } else {
        cell.value = parseFloat(value[1]);
      }
    }
    cells.set(ref, cell);
  }

  const cellValue = (ref: string): number => {
    const cell = cells.get(ref);
    if (!cell) return 0;
    if (cell.formula) {
      const range = cell.formula.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
      if (range) {
        let total = 0;
        for (let r = parseInt(range[2], 10); r <= parseInt(range[4], 10); r++) {
          for (let c = columnToIndex(range[1]); c <= columnToIndex(range[3]); c++) {
            total += cellValue(`${indexToColumn(c)}${r}`);
          }
        }
        return total;
      }
      const difference = cell.formula.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/);
      if (difference) {
        return (
          cellValue(`${difference[1]}${difference[2]}`) - cellValue(`${difference[3]}${difference[4]}`)
        );
      }
      throw new Error(`Unhandled formula: ${cell.formula}`);
    }
    return cell.value ?? 0;
  };

  const rowOfLabel = (label: string, fromRow = 1, toRow = Infinity): number => {
    for (const [ref, cell] of cells) {
      const row = parseInt(ref.slice(1), 10);
      if (ref.startsWith('B') && row >= fromRow && row <= toRow && cell.text === label) return row;
    }
    throw new Error(`No row labelled ${label} in rows ${fromRow}..${toRow}`);
  };

  return { parts, shared, cells, cellValue, rowOfLabel };
}

describe('buildProfitLossWorkbook', () => {
  let statement: ProfitLossStatement;
  let workbook: ParsedWorkbook;

  beforeAll(async () => {
    statement = aggregateFixture();
    workbook = await parseWorkbook(await buildProfitLossWorkbook(statement, '$'));
  });

  it('contains the required minimal xlsx parts', () => {
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/styles.xml',
      'xl/sharedStrings.xml',
    ]) {
      expect(workbook.parts[name]).toBeDefined();
    }
  });

  it('registers the sharedStrings part in the package relationships', () => {
    // An unregistered part is dropped or errors on load: the rels entry and
    // the content-type override must both exist (the reference workbook has both).
    const rels = workbook.parts['xl/_rels/workbook.xml.rels'];
    expect(rels).toContain('Id="rId3"');
    expect(rels).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"');
    expect(rels).toContain('Target="sharedStrings.xml"');
    expect(workbook.parts['[Content_Types].xml']).toContain(
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    );
  });

  it('resolves every shared-string cell reference into the SST', () => {
    const sharedCells = [...workbook.cells.values()].filter((cell) => cell.sharedRef !== undefined);
    expect(sharedCells.length).toBeGreaterThan(0);
    for (const cell of sharedCells) {
      expect(typeof workbook.shared[cell.sharedRef as number]).toBe('string');
      expect(cell.text).toBeDefined();
    }
  });

  it('has exactly one sheet named Profit & Loss', () => {
    expect(workbook.parts['xl/workbook.xml']).toContain('<sheet name="Profit &amp; Loss"');
    expect(workbook.parts['xl/workbook.xml'].match(/<sheet /g)).toHaveLength(1);
  });

  it('writes Company blank, Date as the year, and month headers plus Total', () => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    monthNames.forEach((name, i) => {
      expect(workbook.cells.get(`${indexToColumn(3 + i)}4`)?.text).toBe(name);
    });
    expect(workbook.cells.get('O4')?.text).toBe('Total');
    expect(workbook.cells.get('B2')?.text).toBe('Company:');
    expect(workbook.cells.get('C2')).toBeUndefined(); // company value left blank
    expect(workbook.cells.get('B3')?.text).toBe('Date:');
    expect(workbook.cells.get('C3')?.value).toBe(2026);
  });

  it('stores every data-row Total as a SUM formula with no cached value', () => {
    const revenueHeader = workbook.rowOfLabel('Revenue');
    const expenseHeader = workbook.rowOfLabel('Operating Expenses');
    const spans: ['revenue' | 'operatingExpenses', number, number][] = [
      ['revenue', revenueHeader, workbook.rowOfLabel('Total Revenue')],
      ['operatingExpenses', expenseHeader, workbook.rowOfLabel('Total Operating Expenses')],
    ];
    for (const [sectionKey, headerRow, totalRow] of spans) {
      for (const row of statement[sectionKey].rows) {
        const rowNumber = workbook.rowOfLabel(row.label, headerRow, totalRow);
        const cell = workbook.cells.get(`O${rowNumber}`);
        expect(cell?.formula).toBe(`SUM(C${rowNumber}:N${rowNumber})`);
        expect(cell?.value).toBeUndefined();
      }
    }
  });

  it('stores section totals as live SUM formulas over the section rows', () => {
    for (const section of [statement.revenue, statement.operatingExpenses]) {
      const totalRow = workbook.rowOfLabel(section.totalLabel);
      const firstDataRow = totalRow - section.rows.length;
      for (let m = 0; m < 12; m++) {
        const column = indexToColumn(3 + m);
        const cell = workbook.cells.get(`${column}${totalRow}`);
        expect(cell?.formula).toBe(`SUM(${column}${firstDataRow}:${column}${totalRow - 1})`);
        expect(cell?.value).toBeUndefined();
      }
      // The Total column cell of the total row is itself a per-row SUM.
      const totalCell = workbook.cells.get(`O${totalRow}`);
      expect(totalCell?.formula).toBe(`SUM(C${totalRow}:N${totalRow})`);
    }
  });

  it('writes Net Income as subtraction formulas, all live', () => {
    const revenueRow = workbook.rowOfLabel('Total Revenue');
    const expenseRow = workbook.rowOfLabel('Total Operating Expenses');
    const netRow = workbook.rowOfLabel('Net Income');
    for (let m = 0; m < 12; m++) {
      const column = indexToColumn(3 + m);
      const cell = workbook.cells.get(`${column}${netRow}`);
      expect(cell?.formula).toBe(`${column}${revenueRow}-${column}${expenseRow}`);
      expect(cell?.value).toBeUndefined();
    }
    expect(workbook.cells.get(`O${netRow}`)?.formula).toBe(`SUM(C${netRow}:N${netRow})`);
  });

  it('evaluates the stored formulas back to the model totals', () => {
    const revenueRow = workbook.rowOfLabel('Total Revenue');
    const expenseRow = workbook.rowOfLabel('Total Operating Expenses');
    const netRow = workbook.rowOfLabel('Net Income');
    for (let m = 0; m < 12; m++) {
      const column = indexToColumn(3 + m);
      expect(workbook.cellValue(`${column}${revenueRow}`)).toBeCloseTo(statement.revenue.total[m], 8);
      expect(workbook.cellValue(`${column}${expenseRow}`)).toBeCloseTo(statement.operatingExpenses.total[m], 8);
      expect(workbook.cellValue(`${column}${netRow}`)).toBeCloseTo(statement.netIncome[m], 8);
    }
    expect(workbook.cellValue(`O${revenueRow}`)).toBeCloseTo(sum(statement.revenue.total), 8);
    expect(workbook.cellValue(`O${expenseRow}`)).toBeCloseTo(sum(statement.operatingExpenses.total), 8);
    expect(workbook.cellValue(`O${netRow}`)).toBeCloseTo(sum(statement.netIncome), 8);
  });

  it('matches the reference look: Arial 11, bold sections and totals, currency format', () => {
    const styles = workbook.parts['xl/styles.xml'];
    expect(styles).toContain('<name val="Arial"/>');
    expect(styles).toContain('<sz val="11"/>');
    expect(styles).toContain('<b/>');
    // Two-decimal currency format carrying the app's symbol.
    expect(styles).toContain('&quot;$&quot;#,##0.00');
    // Data label plain (s=0), data amounts currency (s=2), totals bold (s=1/s=3).
    const consultingRow = workbook.rowOfLabel('Consulting');
    expect(workbook.cells.get(`B${consultingRow}`)?.style).toBe('0');
    expect(workbook.cells.get(`C${consultingRow}`)?.style).toBe('2');
    const revenueTotalRow = workbook.rowOfLabel('Total Revenue');
    expect(workbook.cells.get(`B${revenueTotalRow}`)?.style).toBe('1');
    expect(workbook.cells.get(`C${revenueTotalRow}`)?.style).toBe('3');
    // No borders, fills beyond the standard pair, or merged cells.
    expect(styles).toContain('<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>');
    expect(styles).toContain('<fills count="2">');
    expect(workbook.parts['xl/worksheets/sheet1.xml']).not.toContain('<mergeCell');
  });

  it('lays out Revenue, Operating Expenses, and Net Income sections in order', () => {
    const revenueHeader = workbook.rowOfLabel('Revenue');
    const revenueTotal = workbook.rowOfLabel('Total Revenue');
    const expenseHeader = workbook.rowOfLabel('Operating Expenses');
    const expenseTotal = workbook.rowOfLabel('Total Operating Expenses');
    const netIncome = workbook.rowOfLabel('Net Income');
    expect(revenueHeader).toBeLessThan(revenueTotal);
    expect(revenueTotal).toBeLessThan(expenseHeader);
    expect(expenseHeader).toBeLessThan(expenseTotal);
    expect(expenseTotal).toBeLessThan(netIncome);
    // Blank spacer rows between the sections.
    expect(workbook.cells.get(`B${revenueTotal + 1}`)).toBeUndefined();
    expect(workbook.cells.get(`B${expenseTotal + 1}`)).toBeUndefined();
  });

  it('always writes the Transfers and Uncategorized rows', () => {
    expect(workbook.rowOfLabel(TRANSFERS_IN_LABEL)).toBeGreaterThan(0);
    expect(workbook.rowOfLabel(TRANSFERS_OUT_LABEL)).toBeGreaterThan(0);
    expect(workbook.rowOfLabel(UNCATEGORIZED_LABEL)).toBeGreaterThan(0);
  });

  it('substitutes the passed currency symbol into the number format', async () => {
    const euroWorkbook = await parseWorkbook(
      await buildProfitLossWorkbook(
        aggregateProfitAndLoss({ transactions: [], categories: [], accountIds: [], year: 2026 }),
        '€',
      ),
    );
    expect(euroWorkbook.parts['xl/styles.xml']).toContain('&quot;€&quot;#,##0.00');
  });

  it('stamps every zip entry with the pinned date instead of the current time', async () => {
    // jszip defaults entry dates to the current time (lib/object.js), which
    // would make two builds differ byte-for-byte; the writer pins one fixed
    // UTC instant and keeps the implicit directory entries (which jszip
    // stamps with the clock) out of the archive entirely.
    const zip = await JSZip.loadAsync(await buildProfitLossWorkbook(aggregateFixture(), '$'));
    const entries = Object.values(zip.files);
    expect(entries.some((file) => file.dir)).toBe(false);
    // Exactly the seven package parts, nothing implicit.
    expect(Object.keys(zip.files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/sharedStrings.xml',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    for (const entry of entries) {
      expect(entry.date.getUTCFullYear()).toBe(2000);
      expect(entry.date.getUTCMonth()).toBe(0);
      expect(entry.date.getUTCDate()).toBe(1);
      expect(entry.date.getUTCHours()).toBe(0);
      expect(entry.date.getUTCMinutes()).toBe(0);
      expect(entry.date.getUTCSeconds()).toBe(0);
    }
  });

  it('produces byte-for-byte identical output for the same model across runs regardless of the clock', async () => {
    // Two builds at clearly different system times must produce identical
    // bytes; this is what makes the native and web deliveries (ticket 03)
    // comparable. Cross-platform byte equality additionally assumes the
    // same timezone (the aggregation buckets by device-local date) and the
    // same rates inputs (conversion is the caller's job, so a test hands in
    // an already-converted model).
    jest.useFakeTimers({
      // jszip's generateAsync pumps its stream through real timers; only the
      // CLOCK must be faked here, so the timer APIs themselves stay live.
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate'],
    });
    try {
      jest.setSystemTime(new Date('2020-06-01T10:00:00Z'));
      const first = await buildProfitLossWorkbook(aggregateFixture(), '$');
      jest.setSystemTime(new Date('2030-01-01T23:59:59Z'));
      const second = await buildProfitLossWorkbook(aggregateFixture(), '$');
      expect(second.length).toBe(first.length);
      for (let i = 0; i < first.length; i++) {
        expect(second[i]).toBe(first[i]);
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
