// Pure sub-category aggregation for the stats screen's sub-categories mode:
// slices are sub-categories grouped by the transaction's denormalized
// subcategoryName within its category. No join against a subcategories store:
// the denormalized name IS the snapshot, so orphaned references keep their
// last-known name. Transactions without a sub-category roll into a slice
// named after their parent category, so the slices still total 100% of the
// filtered money. Amounts arrive already converted and absolute.

export type SubcategorySliceInput = {
  categoryId: string;
  subcategoryName?: string | null;
  /** Absolute amount in the main currency (caller converts + abs). */
  amount: number;
};

export type SubcategorySlice = {
  /** Unique slice key: category id + sub name (empty for the parent rollup). */
  key: string;
  /** Parent category id: the navigation target for legend rows. */
  categoryId: string;
  /** Sub-category name, or the parent category name for the no-sub rollup. */
  name: string;
  total: number;
};

export const SUBCATEGORY_SLICE_SEPARATOR = '\u001F';

export function subcategorySliceKey(
  categoryId: string,
  subcategoryName: string | null | undefined
): string {
  return `${categoryId}${SUBCATEGORY_SLICE_SEPARATOR}${subcategoryName ?? ''}`;
}

export function aggregateSubcategorySlices(
  transactions: SubcategorySliceInput[],
  categoryNameById: ReadonlyMap<string, string>
): SubcategorySlice[] {
  const totals = new Map<string, number>();
  const names = new Map<string, string>();
  for (const tx of transactions) {
    const parentName = categoryNameById.get(tx.categoryId);
    // Unknown parent (deleted category): no name to roll up under, skip -
    // same rule as the category aggregation.
    if (!parentName) continue;
    // Blank sub-category names mean "no sub": roll into the parent slice.
    const sub = tx.subcategoryName?.trim() || null;
    const key = subcategorySliceKey(tx.categoryId, sub);
    names.set(key, sub ?? parentName);
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }
  return Array.from(totals.entries())
    .map(([key, total]) => ({
      key,
      categoryId: key.slice(0, key.indexOf(SUBCATEGORY_SLICE_SEPARATOR)),
      name: names.get(key) ?? '',
      total,
    }))
    // Descending, stable for equal totals (keeps first-seen order).
    .sort((a, b) => b.total - a.total);
}
