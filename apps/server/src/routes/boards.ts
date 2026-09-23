import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ah } from "../middleware/async";
import { uid } from "../middleware/auth";
import { requireBoard, requireColumn } from "../lib/access";
import { columnPosition, cardPosition } from "../lib/ordering";
import { recordActivity } from "../lib/activity";
import { broadcast } from "../realtime/broadcast";
import { enqueueNotification } from "../jobs/notifications";
import { badRequest } from "../lib/errors";

export const boardsRouter = Router();

const cardInclude = {
  assignee: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} as const;

boardsRouter.get(
  "/boards/:boardId",
  ah(async (req, res) => {
    const { board, role } = await requireBoard(uid(req), req.params.boardId, "workspace:read");
    const [columns, members] = await Promise.all([
      prisma.column.findMany({
        where: { boardId: board.id },
        orderBy: { position: "asc" },
        include: { cards: { orderBy: { position: "asc" }, include: cardInclude } },
      }),
      prisma.membership.findMany({
        where: { workspaceId: board.workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    res.json({
      board: { ...board, role, columns, members: members.map((m) => ({ ...m.user, role: m.role })) },
    });
  }),
);

boardsRouter.patch(
  "/boards/:boardId",
  ah(async (req, res) => {
    const { board } = await requireBoard(uid(req), req.params.boardId, "board:update");
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const updated = await prisma.board.update({ where: { id: board.id }, data: { name } });
    broadcast.toBoard(board.id, "board:updated", updated);
    res.json({ board: updated });
  }),
);

boardsRouter.delete(
  "/boards/:boardId",
  ah(async (req, res) => {
    const { board } = await requireBoard(uid(req), req.params.boardId, "board:delete");
    await prisma.board.delete({ where: { id: board.id } });
    broadcast.toBoard(board.id, "board:deleted", { id: board.id });
    res.status(204).end();
  }),
);

boardsRouter.get(
  "/boards/:boardId/activity",
  ah(async (req, res) => {
    const { board } = await requireBoard(uid(req), req.params.boardId, "workspace:read");
    const activity = await prisma.activity.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { id: true, name: true } } },
    });
    res.json({ activity });
  }),
);

// --- Columns -------------------------------------------------------------

boardsRouter.post(
  "/boards/:boardId/columns",
  ah(async (req, res) => {
    const { board } = await requireBoard(uid(req), req.params.boardId, "card:write");
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    const column = await prisma.column.create({
      data: { boardId: board.id, name, position: await columnPosition(board.id) },
    });
    broadcast.toBoard(board.id, "column:created", column);
    await recordActivity({ boardId: board.id, actorId: uid(req), type: "column.created", data: { name } });
    res.status(201).json({ column: { ...column, cards: [] } });
  }),
);

boardsRouter.patch(
  "/columns/:columnId",
  ah(async (req, res) => {
    const { column, board } = await requireColumn(uid(req), req.params.columnId, "card:write");
    const body = z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        beforeId: z.string().nullish(),
        afterId: z.string().nullish(),
      })
      .parse(req.body);
    const moving = body.beforeId !== undefined || body.afterId !== undefined;
    const updated = await prisma.column.update({
      where: { id: column.id },
      data: {
        name: body.name,
        position: moving ? await columnPosition(board.id, body.beforeId, body.afterId) : undefined,
      },
    });
    broadcast.toBoard(board.id, "column:updated", updated);
    res.json({ column: updated });
  }),
);

boardsRouter.delete(
  "/columns/:columnId",
  ah(async (req, res) => {
    const { column, board } = await requireColumn(uid(req), req.params.columnId, "board:update");
    await prisma.column.delete({ where: { id: column.id } });
    broadcast.toBoard(board.id, "column:deleted", { id: column.id });
    await recordActivity({ boardId: board.id, actorId: uid(req), type: "column.deleted", data: { name: column.name } });
    res.status(204).end();
  }),
);

// --- Card creation lives with columns ------------------------------------

boardsRouter.post(
  "/columns/:columnId/cards",
  ah(async (req, res) => {
    const userId = uid(req);
    const { column, board } = await requireColumn(userId, req.params.columnId, "card:write");
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(10_000).optional(),
        dueDate: z.coerce.date().nullish(),
        assigneeId: z.string().nullish(),
      })
      .parse(req.body);
    if (body.assigneeId) {
      const member = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: body.assigneeId, workspaceId: board.workspaceId } },
      });
      if (!member) throw badRequest("Assignee must be a workspace member");
    }
    const card = await prisma.card.create({
      data: {
        boardId: board.id,
        columnId: column.id,
        title: body.title,
        description: body.description ?? "",
        dueDate: body.dueDate ?? null,
        assigneeId: body.assigneeId ?? null,
        createdById: userId,
        position: await cardPosition(column.id),
      },
      include: cardInclude,
    });
    broadcast.toBoard(board.id, "card:created", card);
    await recordActivity({ boardId: board.id, cardId: card.id, actorId: userId, type: "card.created", data: { title: card.title, column: column.name } });
    if (card.assigneeId && card.assigneeId !== userId) {
      const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await enqueueNotification({ type: "card.assigned", userId: card.assigneeId, cardId: card.id, cardTitle: card.title, boardId: board.id, actorName: actor.name });
    }
    res.status(201).json({ card });
  }),
);
