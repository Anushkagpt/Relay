import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ah } from "../middleware/async";
import { uid } from "../middleware/auth";
import { requireWorkspaceRole } from "../lib/access";
import { canAssignRole } from "../lib/permissions";
import { badRequest, forbidden, notFound, conflict } from "../lib/errors";

export const workspacesRouter = Router();

const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

workspacesRouter.get(
  "/",
  ah(async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: uid(req) },
      include: { workspace: { include: { _count: { select: { boards: true, memberships: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      workspaces: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        role: m.role,
        boardCount: m.workspace._count.boards,
        memberCount: m.workspace._count.memberships,
      })),
    });
  }),
);

workspacesRouter.post(
  "/",
  ah(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const workspace = await prisma.workspace.create({
      data: { name, memberships: { create: { userId: uid(req), role: "OWNER" } } },
    });
    res.status(201).json({ workspace: { ...workspace, role: "OWNER" } });
  }),
);

workspacesRouter.get(
  "/:workspaceId",
  ah(async (req, res) => {
    const role = await requireWorkspaceRole(uid(req), req.params.workspaceId, "workspace:read");
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: req.params.workspaceId },
      include: {
        boards: { orderBy: { createdAt: "asc" } },
        memberships: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        role,
        boards: workspace.boards,
        members: workspace.memberships.map((m) => ({ ...m.user, role: m.role })),
      },
    });
  }),
);

workspacesRouter.patch(
  "/:workspaceId",
  ah(async (req, res) => {
    await requireWorkspaceRole(uid(req), req.params.workspaceId, "workspace:update");
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const workspace = await prisma.workspace.update({ where: { id: req.params.workspaceId }, data: { name } });
    res.json({ workspace });
  }),
);

workspacesRouter.delete(
  "/:workspaceId",
  ah(async (req, res) => {
    await requireWorkspaceRole(uid(req), req.params.workspaceId, "workspace:delete");
    await prisma.workspace.delete({ where: { id: req.params.workspaceId } });
    res.status(204).end();
  }),
);

workspacesRouter.post(
  "/:workspaceId/boards",
  ah(async (req, res) => {
    await requireWorkspaceRole(uid(req), req.params.workspaceId, "board:create");
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const board = await prisma.board.create({
      data: {
        name,
        workspaceId: req.params.workspaceId,
        columns: {
          create: [
            { name: "To do", position: 1024 },
            { name: "In progress", position: 2048 },
            { name: "Done", position: 3072 },
          ],
        },
      },
    });
    res.status(201).json({ board });
  }),
);

// --- Members -------------------------------------------------------------

workspacesRouter.post(
  "/:workspaceId/members",
  ah(async (req, res) => {
    const { workspaceId } = req.params;
    const actorRole = await requireWorkspaceRole(uid(req), workspaceId, "member:manage");
    const body = z.object({ email: z.string().email().toLowerCase(), role: roleSchema.default("MEMBER") }).parse(req.body);
    if (!canAssignRole(actorRole, body.role)) throw forbidden(`${actorRole} cannot grant ${body.role}`);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw notFound("No Relay account with that email. Ask them to sign up first.");
    const existing = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId } } });
    if (existing) throw conflict("Already a member");
    await prisma.membership.create({ data: { userId: user.id, workspaceId, role: body.role } });
    res.status(201).json({ member: { id: user.id, name: user.name, email: user.email, role: body.role } });
  }),
);

workspacesRouter.patch(
  "/:workspaceId/members/:userId",
  ah(async (req, res) => {
    const { workspaceId, userId } = req.params;
    const actorRole = await requireWorkspaceRole(uid(req), workspaceId, "member:manage");
    const { role } = z.object({ role: roleSchema }).parse(req.body);
    const target = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
    if (!target) throw notFound("Member not found");
    if (!canAssignRole(actorRole, target.role) || !canAssignRole(actorRole, role)) {
      throw forbidden(`${actorRole} cannot change this member to ${role}`);
    }
    if (target.role === "OWNER" && role !== "OWNER") {
      const owners = await prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
      if (owners <= 1) throw badRequest("A workspace needs at least one owner");
    }
    await prisma.membership.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { role } });
    res.json({ ok: true });
  }),
);

workspacesRouter.delete(
  "/:workspaceId/members/:userId",
  ah(async (req, res) => {
    const { workspaceId, userId } = req.params;
    const self = userId === uid(req);
    const actorRole = await requireWorkspaceRole(uid(req), workspaceId, self ? "workspace:read" : "member:manage");
    const target = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
    if (!target) throw notFound("Member not found");
    if (!self && !canAssignRole(actorRole, target.role)) throw forbidden();
    if (target.role === "OWNER") {
      const owners = await prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
      if (owners <= 1) throw badRequest("A workspace needs at least one owner");
    }
    await prisma.membership.delete({ where: { userId_workspaceId: { userId, workspaceId } } });
    res.status(204).end();
  }),
);
