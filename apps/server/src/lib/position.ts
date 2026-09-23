/**
 * Fractional ordering for columns and cards.
 * Moving an item only rewrites that item's position: the new value sits
 * halfway between its neighbours, so no sibling rows are touched.
 */
export const POSITION_GAP = 1024;

export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  const hasBefore = typeof before === "number";
  const hasAfter = typeof after === "number";
  if (!hasBefore && !hasAfter) return POSITION_GAP;
  if (!hasBefore) return (after as number) / 2;
  if (!hasAfter) return (before as number) + POSITION_GAP;
  if ((before as number) >= (after as number)) {
    throw new Error("positionBetween: 'before' must be smaller than 'after'");
  }
  return ((before as number) + (after as number)) / 2;
}

/** True when neighbours are so close that floating point can no longer split them. */
export function needsRebalance(before: number, after: number): boolean {
  return after - before < 1e-6;
}

/** Evenly re-spaced positions for a list of n items. */
export function rebalance(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_GAP);
}
