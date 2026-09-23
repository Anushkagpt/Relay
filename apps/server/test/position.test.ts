import { describe, expect, it } from "vitest";
import { POSITION_GAP, needsRebalance, positionBetween, rebalance } from "../src/lib/position";

describe("positionBetween", () => {
  it("starts an empty list at the gap", () => {
    expect(positionBetween(null, null)).toBe(POSITION_GAP);
  });
  it("appends after the last item", () => {
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_GAP);
  });
  it("prepends before the first item", () => {
    expect(positionBetween(null, 1024)).toBe(512);
  });
  it("splits two neighbours", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });
  it("rejects inverted neighbours", () => {
    expect(() => positionBetween(2048, 1024)).toThrow();
  });
  it("keeps order across many inserts at the same spot", () => {
    let before = 1024;
    const after = 2048;
    for (let i = 0; i < 20; i++) {
      const next = positionBetween(before, after);
      expect(next).toBeGreaterThan(before);
      expect(next).toBeLessThan(after);
      before = next;
    }
  });
});

describe("rebalance", () => {
  it("re-spaces evenly", () => {
    expect(rebalance(3)).toEqual([1024, 2048, 3072]);
  });
  it("detects exhausted gaps", () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
    expect(needsRebalance(1, 2)).toBe(false);
  });
});
