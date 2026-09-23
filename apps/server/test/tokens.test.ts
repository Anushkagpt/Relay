import { describe, expect, it } from "vitest";
import { createRefreshToken, hashToken, signAccessToken, verifyAccessToken } from "../src/lib/tokens";

describe("tokens", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken({ sub: "user_1", email: "a@b.dev" });
    expect(verifyAccessToken(token)).toEqual({ sub: "user_1", email: "a@b.dev" });
  });
  it("rejects a tampered access token", () => {
    const token = signAccessToken({ sub: "user_1", email: "a@b.dev" });
    expect(() => verifyAccessToken(token.slice(0, -2) + "xx")).toThrow();
  });
  it("stores only a hash of the refresh token", () => {
    const { token, hash } = createRefreshToken();
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
  });
});
