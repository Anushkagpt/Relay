import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ah } from "../middleware/async";
import { uid } from "../middleware/auth";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  ah(async (req, res) => {
    const userId = uid(req);
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    res.json({ notifications, unread });
  }),
);

notificationsRouter.post(
  "/read-all",
  ah(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: uid(req), readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);
