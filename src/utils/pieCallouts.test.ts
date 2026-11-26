import {
  CALLOUT_FLIPPED_INK,
  placeCalloutText,
  selectPieCallouts,
  truncateCalloutName,
  estimateCalloutTextWidth,
} from './pieCallouts';
import { formatNumber } from './formatNumber';

const slice = (key: string, value: number, name = key) => ({ key, name, value });

describe('truncateCalloutName', () => {
  it('keeps names of about 12 characters intact', () => {
    expect(truncateCalloutName('Groceries')).toBe('Groceries');
    expect(truncateCalloutName('123456789012')).toBe('123456789012');
  });

  it('truncates longer names with an ellipsis', () => {
    expect(truncateCalloutName('Dining out and takeaway')).toBe(
      'Dining ou...'
    );
  });

  it('truncates multi-byte names code-point-safely', () => {
    // 13 emoji (surrogate pairs); no broken halves may leak into the label.
    const emojiName = '🎮'.repeat(13);
    const truncated = truncateCalloutName(emojiName);
    expect(Array.from(truncated)).toHaveLength(12);
    expect(truncated.endsWith('...')).toBe(true);
    expect(truncated).toBe(`${'🎮'.repeat(9)}...`);
  });
});

describe('selectPieCallouts', () => {
  it('labels slices holding 5% or more of the current total', () => {
    const callouts = selectPieCallouts([slice('a', 5), slice('b', 95)]);
    expect(callouts.map((c) => c.key)).toEqual(['b', 'a']);
  });

  it('skips slices below 5% and shows a callout-free pie otherwise', () => {
    expect(selectPieCallouts([slice('a', 4), slice('b', 96)]).map((c) => c.key)).toEqual(['b']);
    // 1/21 each: nothing reaches 5%, so nothing is labeled.
    const tiny = Array.from({ length: 21 }, (_unused, i) => slice(`s${i}`, 1));
    expect(selectPieCallouts(tiny)).toEqual([]);
  });

  it('labels at most the 6 largest qualifying slices', () => {
    const data = Array.from({ length: 10 }, (_unused, i) => slice(`s${i}`, 10 - i));
    const callouts = selectPieCallouts(data);
    expect(callouts.map((c) => c.key)).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
      's5',
    ]);
  });

  it('formats the percent with the same 0-decimal rounding as the legend badges', () => {
    const callouts = selectPieCallouts([slice('a', 23.5), slice('b', 76.5)]);
    const a = callouts.find((c) => c.key === 'a');
    expect(a?.percent).toBe(formatNumber(23.5, 0));
    expect(a?.percent).toBe('24');
  });

  it('treats the synthetic Transfers slice like any other slice', () => {
    const callouts = selectPieCallouts([
      slice('cat-1', 70),
      slice('transfer-expense', 30, 'Transfers out'),
    ]);
    const transfer = callouts.find((c) => c.key === 'transfer-expense');
    expect(transfer?.name).toBe(truncateCalloutName('Transfers out'));
    expect(transfer?.name).toBe('Transfers...');
    expect(transfer?.percent).toBe('30');
  });

  it('returns nothing for an empty or zero-total pie', () => {
    expect(selectPieCallouts([])).toEqual([]);
    expect(selectPieCallouts([slice('a', 0)])).toEqual([]);
  });
});

describe('estimateCalloutTextWidth', () => {
  it('approximates the rendered width of a truncated 12-character name', () => {
    // Helvetica advances: ~52 units per char average; close to the real ~53.6px.
    expect(estimateCalloutTextWidth('Dining ou...')).toBeCloseTo(52, 0);
  });

  it('treats CJK and emoji code points as full-width', () => {
    expect(estimateCalloutTextWidth('記録')).toBe(20);
    expect(estimateCalloutTextWidth('🎮...')).toBeCloseTo(18.4, 5);
  });

  it('pins the flipped-label ink to the palette-readable dark ink', () => {
    // The slice palette is pastel in both themes; #212226 is the app's
    // standard ink and clears 4.5:1 on the ten pastel fills, where dark-mode
    // theme ink was 1.14-2.66:1. On the dark violet Transfers slice it reads
    // ~3.75:1, a slight step down from the theme color's 4.05:1 there -
    // accepted owner note, do not change the color.
    expect(CALLOUT_FLIPPED_INK).toBe('#212226');
  });
});

describe('placeCalloutText', () => {
  // 360dp phone: chart width = 360 - 32 (screen px-4) - 32 (card p-4);
  // cx = 148, slice edge at cx +/- 98.4 (height-bound radius), dot 12px
  // further out.
  const CX = 148;
  const EDGE = 98.4;
  const narrow = { chartWidth: 296, percent: '23' };
  const rightEdge = { dotX: CX + EDGE + 12, edgeX: CX + EDGE }; // 3 o'clock
  const leftEdge = { dotX: CX - EDGE - 12, edgeX: CX - EDGE }; // 9 o'clock

  it('keeps short labels outward on both sides', () => {
    expect(
      placeCalloutText({ ...narrow, ...rightEdge, onRight: true, name: 'Rent' })
    ).toEqual({ anchor: 'start', textX: 264.4, flipped: false });
    const left = placeCalloutText({
      ...narrow,
      ...leftEdge,
      onRight: false,
      name: 'Rent',
    });
    expect(left.anchor).toBe('end');
    expect(left.textX).toBeCloseTo(31.6, 5);
    expect(left.flipped).toBe(false);
  });

  it('flips a long near-horizontal label onto its slice, anchored inside the edge', () => {
    const right = placeCalloutText({
      ...narrow,
      ...rightEdge,
      onRight: true,
      name: 'Dining ou...',
    });
    expect(right.flipped).toBe(true);
    expect(right.anchor).toBe('end');
    // Anchored 2px inside the slice edge: fully over the slice fill, never
    // over the transparent strip between the edge and the dot (dark card
    // in dark mode).
    expect(right.textX).toBeCloseTo(CX + EDGE - 2, 5);
    expect(right.textX).toBeLessThanOrEqual(rightEdge.edgeX);
    const left = placeCalloutText({
      ...narrow,
      ...leftEdge,
      onRight: false,
      name: 'Dining ou...',
    });
    expect(left.flipped).toBe(true);
    expect(left.anchor).toBe('start');
    expect(left.textX).toBeCloseTo(CX - EDGE + 2, 5);
    expect(left.textX).toBeGreaterThanOrEqual(leftEdge.edgeX);
  });

  it('lets the wider line drive the flip, so a tiny name can still flip', () => {
    // name 'A' fits outward, but '100%' (~25px) starting 6px past a
    // 3-o'clock dot would cross the edge.
    const placement = placeCalloutText({
      ...narrow,
      dotX: 270,
      edgeX: 258,
      onRight: true,
      name: 'A',
      percent: '100',
    });
    expect(placement.flipped).toBe(true);
    expect(placement.anchor).toBe('end');
  });

  it('never flips on a wide chart', () => {
    const placement = placeCalloutText({
      chartWidth: 600,
      percent: '23',
      dotX: 400,
      edgeX: 388,
      onRight: true,
      name: 'Dining ou...',
    });
    expect(placement).toEqual({ anchor: 'start', textX: 406, flipped: false });
  });

  it('keeps flipped labels over the slice and inside the chart on both edges', () => {
    // Deliberately pessimistic REAL width of a 12-char truncated name at
    // 10px (reviewer measured ~53px in Arial/Roboto); independent of the
    // estimator so these invariants cannot pass on an underestimate.
    const REAL_MAX_NAME_WIDTH = 60;
    // The text band spans ~11px either side of the mid-angle ray, so the
    // disc's horizontal chord there is ~97px half-width: text beyond that
    // hangs off the slice.
    const DISC_HALF_CHORD = 97;
    for (const side of [
      { ...rightEdge, onRight: true },
      { ...leftEdge, onRight: false },
    ]) {
      const placement = placeCalloutText({
        ...narrow,
        ...side,
        name: 'Dining ou...',
      });
      expect(placement.flipped).toBe(true);
      if (placement.anchor === 'end') {
        // Outboard end at or inside the slice edge: no strip overhang.
        expect(placement.textX).toBeLessThanOrEqual(side.edgeX);
        expect(placement.textX - REAL_MAX_NAME_WIDTH).toBeGreaterThanOrEqual(
          CX - DISC_HALF_CHORD
        );
        expect(placement.textX - REAL_MAX_NAME_WIDTH).toBeGreaterThanOrEqual(0);
      } else {
        expect(placement.textX).toBeGreaterThanOrEqual(side.edgeX);
        expect(placement.textX + REAL_MAX_NAME_WIDTH).toBeLessThanOrEqual(
          CX + DISC_HALF_CHORD
        );
        expect(placement.textX + REAL_MAX_NAME_WIDTH).toBeLessThanOrEqual(296);
      }
    }
  });
});
