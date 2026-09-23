import { describe, expect, it } from "vitest";
import { can, canAssignRole } from "../src/lib/permissions";

describe("can", () => {
  it("lets viewers read but not write", () => {
    expect(can("VIEWER", "workspace:read")).toBe(true);
    expect(can("VIEWER", "card:write")).toBe(false);
    expect(can("VIEWER", "comment:write")).toBe(false);
  });
  it("lets members edit cards but not manage people", () => {
    expect(can("MEMBER", "card:write")).toBe(true);
    expect(can("MEMBER", "member:manage")).toBe(false);
    expect(can("MEMBER", "board:delete")).toBe(false);
  });
  it("lets admins manage but not delete the workspace", () => {
    expect(can("ADMIN", "member:manage")).toBe(true);
    expect(can("ADMIN", "workspace:delete")).toBe(false);
  });
  it("lets owners do everything", () => {
    expect(can("OWNER", "workspace:delete")).toBe(true);
  });
});

describe("canAssignRole", () => {
  it("only owners grant admin or owner", () => {
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "MEMBER")).toBe(true);
    expect(canAssignRole("MEMBER", "VIEWER")).toBe(false);
  });
});
