import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ah } from "../middleware/async";
import { requireAuth, uid } from "../middleware/auth";
import { conflict, unauthorized } from "../lib/errors";
import { createRefreshToken, hashToken, signAccessToken } from "../lib/tokens";
import { config } from "../config";

export const authRouter = Router();

const REFRESH_COOKIE = "relay_rt";

const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
});
const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) });

const publicUser = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

async function issueSession(res: Response, user: { id: string; email: string; name: string }) {
  const refresh = createRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refresh.hash, expiresAt: refresh.expiresAt },
  });
  res.cookie(REFRESH_COOKIE, refresh.token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/api/auth",
    expires: refresh.expiresAt,
  });
  return { accessToken: signAccessToken({ sub: user.id, email: user.email }), user: publicUser(user) };
}

authRouter.post(
  "/register",
  ah(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict("An account with this email already exists");
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
    });
    res.status(201).json(await issueSession(res, user));
  }),
);

authRouter.post(
  "/login",
  ah(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw unauthorized("Invalid email or password");
    }
    res.json(await issueSession(res, user));
  }),
);

/**
 * Refresh-token rotation: each refresh revokes the presented token and issues
 * a new one. Reusing a revoked token revokes every session for that user,
 * which limits the damage of a stolen token.
 */
authRouter.post(
  "/refresh",
  ah(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw unauthorized("No refresh token");
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!stored) throw unauthorized("Invalid refresh token");
    if (stored.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw unauthorized("Refresh token reuse detected");
    }
    if (stored.expiresAt < new Date()) throw unauthorized("Refresh token expired");
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    res.json(await issueSession(res, stored.user));
  }),
);

authRouter.post(
  "/logout",
  ah(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: uid(req) } });
    res.json({ user: publicUser(user) });
  }),
);
