import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/tokens";
import { unauthorized } from "../lib/errors";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());
  try {
    req.userId = verifyAccessToken(header.slice(7)).sub;
    next();
  } catch {
    next(unauthorized("Access token expired or invalid"));
  }
}

export function uid(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
