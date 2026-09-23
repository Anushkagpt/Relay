import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";

export interface AccessPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtlSeconds });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret);
  if (typeof decoded === "string" || typeof decoded.sub !== "string") throw new Error("Invalid token");
  return { sub: decoded.sub, email: String(decoded.email) };
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export function createRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  return { token, hash: hashToken(token), expiresAt };
}

export function hashToken(token: string): string {
  return crypto.createHmac("sha256", config.jwt.refreshSecret).update(token).digest("hex");
}
