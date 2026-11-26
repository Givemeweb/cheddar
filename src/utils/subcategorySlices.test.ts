import {
  aggregateSubcategorySlices,
  SUBCATEGORY_SLICE_SEPARATOR,
  subcategorySliceKey,
} from './subcategorySlices';

const CATEGORIES = new Map([
  ['cat-food', 'Food'],
  ['cat-fees', 'bank fees'],
  ['cat-fun', 'Fun'],
]);

const tx = (
  categoryId: string,
  amount: number,
  subcategoryName?: string | null
) => ({ categoryId, amount, subcategoryName });

describe('aggregateSubcategorySlices', () => {
  it('groups by the denormalized subcategory name within its category', () => {
    const slices = aggregateSubcategorySlices(
      [tx('cat-food', 10, 'Groceries'), tx('cat-food', 5, 'Groceries'), tx('cat-food', 2, 'Takeaway')],
      CATEGORIES
    );
    expect(slices).toHaveLength(2);
    const groceries = slices.find((s) => s.name === 'Groceries');
    expect(groceries?.total).toBe(15);
    expect(groceries?.categoryId).toBe('cat-food');
  });

  it('rolls transactions without a sub-category into a slice named after the parent', () => {
    const slices = aggregateSubcategorySlices(
      [tx('cat-food', 7, null), tx('cat-food', 3, undefined), tx('cat-food', 1, '  ')],
      CATEGORIES
    );
    expect(slices).toHaveLength(1);
    expect(slices[0].name).toBe('Food');
    expect(slices[0].total).toBe(11);
    expect(slices[0].categoryId).toBe('cat-food');
  });

  it('keeps orphaned subcategory references under their last-known snapshot name', () => {
    // 'Meal delivery' no longer exists in the subcategories store; the
    // transaction's denormalized name is used as-is, no join.
    const slices = aggregateSubcategorySlices(
      [tx('cat-food', 9, 'Meal delivery')],
      CATEGORIES
    );
    expect(slices[0].name).toBe('Meal delivery');
  });

  it('treats duplicate sub names across parents as separate slices', () => {
    const slices = aggregateSubcategorySlices(
      [tx('cat-food', 5, 'Fees'), tx('cat-fees', 4, 'Fees')],
      CATEGORIES
    );
    expect(slices).toHaveLength(2);
    expect(slices.map((s) => s.categoryId)).toEqual(['cat-food', 'cat-fees']);
  });

  it('still totals 100%: slice totals sum to the transaction totals', () => {
    const transactions = [
      tx('cat-food', 10, 'Groceries'),
      tx('cat-food', 4),
      tx('cat-fees', 6, 'Bank'),
      tx('cat-fun', 2, 'Cinema'),
    ];
    const slices = aggregateSubcategorySlices(transactions, CATEGORIES);
    const inputTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
    expect(slices.reduce((sum, s) => sum + s.total, 0)).toBe(inputTotal);
  });

  it('sorts slices by total descending', () => {
    const slices = aggregateSubcategorySlices(
      [tx('cat-food', 2, 'A'), tx('cat-food', 8, 'B'), tx('cat-fees', 5)],
      CATEGORIES
    );
    expect(slices.map((s) => s.name)).toEqual(['B', 'bank fees', 'A']);
  });

  it('skips transactions whose parent category is unknown', () => {
    const slices = aggregateSubcategorySlices(
      [tx('cat-deleted', 9, 'Ghost'), tx('cat-food', 3, 'Groceries')],
      CATEGORIES
    );
    expect(slices).toHaveLength(1);
    expect(slices[0].name).toBe('Groceries');
  });

  it('returns nothing for empty input', () => {
    expect(aggregateSubcategorySlices([], CATEGORIES)).toEqual([]);
  });
});

describe('subcategorySliceKey', () => {
  it('separates category and sub so like-named subs never collide', () => {
    const a = subcategorySliceKey('cat-a', 'Fees');
    const b = subcategorySliceKey('cat-b', 'Fees');
    expect(a).not.toBe(b);
    expect(a).toContain(SUBCATEGORY_SLICE_SEPARATOR);
  });

  it('uses an empty sub segment for the parent rollup', () => {
    expect(subcategorySliceKey('cat-a', null)).toBe(`cat-a${SUBCATEGORY_SLICE_SEPARATOR}`);
  });
});
