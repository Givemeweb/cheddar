import { formatNumber } from './formatNumber';

// Callout rules settled with the owner: a slice earns a label when it holds
// at least 5% of the current pie total, at most the 6 largest slices are
// labeled, and a name renders on about 12 characters (first 9 + "..." when
// longer), mirroring the 35-character description cap in TransactionItem.
export const PIE_CALLOUT_MIN_SHARE = 0.05;
export const PIE_CALLOUT_MAX = 6;
export const PIE_CALLOUT_NAME_CHARS = 12;

export type PieCalloutInput = {
  key: string;
  name: string;
  value: number;
};

export type PieCallout = {
  key: string;
  name: string;
  percent: string;
};

export function truncateCalloutName(name: string): string {
  const chars = Array.from(name);
  return chars.length > PIE_CALLOUT_NAME_CHARS
    ? `${chars.slice(0, PIE_CALLOUT_NAME_CHARS - 3).join('')}...`
    : name;
}

export function selectPieCallouts(data: PieCalloutInput[]): PieCallout[] {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return [];
  return data
    .filter((slice) => slice.value / total >= PIE_CALLOUT_MIN_SHARE)
    .sort((a, b) => b.value - a.value)
    .slice(0, PIE_CALLOUT_MAX)
    .map((slice) => ({
      key: slice.key,
      name: truncateCalloutName(slice.name),
      percent: formatNumber((slice.value / total) * 100, 0),
    }));
}

// Label geometry shared by the placement rule and the dom renderer (px at
// the chart's SVG scale).
export const CALLOUT_FONT_SIZE = 10;
export const CALLOUT_TEXT_GAP = 6;
export const CALLOUT_FLIP_INNER_GAP = 2;
export const CALLOUT_EDGE_PAD = 2;

// Ink for labels flipped onto their own slice: the pastel slice palette is
// theme-invariant, so this dark ink clears 4.5:1 on the ten pastel fills in
// both themes, where dark-mode theme ink was 1.14-2.66:1. On the dark
// violet Transfers slice it is ~3.75:1, a step down from the theme color's
// 4.05:1 there - accepted owner note.
export const CALLOUT_FLIPPED_INK = '#212226';

// note: rough per-code-point advance widths (per 1000 em) for the chart's
// default sans font, not real metrics; if a label ever needs true text
// measurement, swap in canvas measureText in the renderer and keep this as
// the testable fallback.
const NARROW_CHARS = new Set("ijltf.,' :;-()[]!|");
const WIDE_CHARS = new Set('mwMW%');

export function estimateCalloutTextWidth(
  text: string,
  fontSize: number = CALLOUT_FONT_SIZE
): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (NARROW_CHARS.has(char)) units += 280;
    else if (WIDE_CHARS.has(char)) units += 800;
    else if (code >= 0x2e80) units += 1000; // CJK, kana, emoji: ~full-width
    else if (char >= 'A' && char <= 'Z') units += 722;
    else units += 560;
  }
  return (units / 1000) * fontSize;
}

export type CalloutPlacement = {
  anchor: 'start' | 'end';
  textX: number;
  flipped: boolean;
};

// Picks where a callout label sits relative to the slice it belongs to.
// Labels extend outward from the pie, but a 360dp chart leaves only ~31px
// of gutter for a near-horizontal label while a 12-character name is ~52px
// wide. When the outward text would cross the chart edge, the label flips
// to CALLOUT_FLIP_INNER_GAP px inside the slice edge so it sits fully over
// its own slice fill - never over the transparent strip between the slice
// edge and the dot, where the dark card would swallow dark ink. Assumes the
// name is already truncated (<= ~12 code points), which keeps the flipped
// label inside the chart for any width a phone can produce.
export function placeCalloutText(params: {
  dotX: number;
  edgeX: number;
  onRight: boolean;
  chartWidth: number;
  name: string;
  percent: string;
}): CalloutPlacement {
  const { dotX, edgeX, onRight, chartWidth, name, percent } = params;
  const textWidth = Math.max(
    estimateCalloutTextWidth(name),
    estimateCalloutTextWidth(`${percent}%`)
  );
  const textX = onRight ? dotX + CALLOUT_TEXT_GAP : dotX - CALLOUT_TEXT_GAP;
  const crossesEdge = onRight
    ? textX + textWidth > chartWidth - CALLOUT_EDGE_PAD
    : textX - textWidth < CALLOUT_EDGE_PAD;
  if (!crossesEdge) {
    return { anchor: onRight ? 'start' : 'end', textX, flipped: false };
  }
  return {
    anchor: onRight ? 'end' : 'start',
    textX: onRight
      ? edgeX - CALLOUT_FLIP_INNER_GAP
      : edgeX + CALLOUT_FLIP_INNER_GAP,
    flipped: true,
  };
}
