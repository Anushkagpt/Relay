import { describe, expect, it } from "vitest";
import { dueLabel, neighbours, timeAgo } from "./lib";

describe("neighbours", () => {
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("handles the top, middle and bottom", () => {
    expect(neighbours(cards, 0)).toEqual({ beforeId: null, afterId: "b" });
    expect(neighbours(cards, 1)).toEqual({ beforeId: "a", afterId: "c" });
    expect(neighbours(cards, 2)).toEqual({ beforeId: "b", afterId: null });
  });
});

describe("timeAgo", () => {
  it("formats relative times", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(timeAgo("2026-01-01T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-01-01T11:30:00Z", now)).toBe("30m ago");
    expect(timeAgo("2026-01-01T09:00:00Z", now)).toBe("3h ago");
  });
});

describe("dueLabel", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  it("flags overdue and soon", () => {
    expect(dueLabel("2026-01-09T12:00:00Z", now)?.tone).toBe("overdue");
    expect(dueLabel("2026-01-11T12:00:00Z", now)?.tone).toBe("soon");
    expect(dueLabel("2026-02-01T12:00:00Z", now)?.tone).toBe("later");
    expect(dueLabel(null, now)).toBeNull();
  });
});
