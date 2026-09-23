import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ah } from "../middleware/async";
import { uid } from "../middleware/auth";
import { requireCard } from "../lib/access";
import { cardPosition } from "../lib/ordering";
import { recordActivity } from "../lib/activity";
import { broadcast } from "../realtime/broadcast";
import { enqueueNotification } from "../jobs/notifications";
import { badRequest } from "../lib/errors";

export const cardsRouter = Router();

const cardInclude = {
  assignee: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} as const;

cardsRouter.get(
  "/:cardId",
  ah(async (req, res) => {
    const { card } = await requireCard(uid(req), req.params.cardId, "workspace:read");
    const [comments, activity] = await Promise.all([
      prisma.comment.findMany({
        where: { cardId: card.id },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      }),
      prisma.activity.findMany({
        where: { cardId: card.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { id: true, name: true } } },
      }),
    ]);
    const full = await prisma.card.findUniqueOrThrow({ where: { id: card.id }, include: cardInclude });
    res.json({ card: { ...full, comments, activity } });
  }),
);

cardsRouter.patch(
  "/:cardId",
  ah(async (req, res) => {
    const userId = uid(req);
    const { card, board } = await requireCard(userId, req.params.cardId, "card:write");
    const body = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
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

    const updated = await prisma.card.update({
      where: { id: card.id },
      data: {
        title: body.title,
        description: body.description,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate,
        assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId,
      },
      include: cardInclude,
    });
    broadcast.toBoard(board.id, "card:updated", updated);

    const changes: Record<string, unknown> = {};
    if (body.title !== undefined && body.title !== card.title) changes.title = { from: card.title, to: body.title };
    if (body.assigneeId !== undefined && body.assigneeId !== card.assigneeId) changes.assignee = updated.assignee?.name ?? null;
    if (body.dueDate !== undefined && body.dueDate?.getTime() !== card.dueDate?.getTime()) changes.dueDate = body.dueDate ?? null;
    if (body.description !== undefined && body.description !== card.description) changes.description = true;
    if (Object.keys(changes).length) {
      await recordActivity({ boardId: board.id, cardId: card.id, actorId: userId, type: "card.updated", data: changes as never });
    }

    if (body.assigneeId && body.assigneeId !== card.assigneeId && body.assigneeId !== userId) {
      const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await enqueueNotification({ type: "card.assigned", userId: body.assigneeId, cardId: card.id, cardTitle: updated.title, boardId: board.id, actorName: actor.name });
    }
    res.json({ card: updated });
  }),
);

cardsRouter.post(
  "/:cardId/move",
  ah(async (req, res) => {
    const userId = uid(req);
    const { card, board } = await requireCard(userId, req.params.cardId, "card:write");
    const body = z
      .object({ columnId: z.string(), beforeId: z.string().nullish(), afterId: z.string().nullish() })
      .parse(req.body);
    const target = await prisma.column.findUnique({ where: { id: body.columnId } });
    if (!target || target.boardId !== board.id) throw badRequest("Target column is not on this board");
    const position = await cardPosition(target.id, body.beforeId, body.afterId, card.id);
    const updated = await prisma.card.update({
      where: { id: card.id },
      data: { columnId: target.id, position },
      include: cardInclude,
    });
    broadcast.toBoard(board.id, "card:moved", updated);
    if (card.columnId !== target.id) {
      const from = await prisma.column.findUnique({ where: { id: card.columnId } });
      await recordActivity({ boardId: board.id, cardId: card.id, actorId: userId, type: "card.moved", data: { from: from?.name ?? null, to: target.name } });
    }
    res.json({ card: updated });
  }),
);

cardsRouter.delete(
  "/:cardId",
  ah(async (req, res) => {
    const userId = uid(req);
    const { card, board } = await requireCard(userId, req.params.cardId, "card:write");
    await prisma.card.delete({ where: { id: card.id } });
    broadcast.toBoard(board.id, "card:deleted", { id: card.id, columnId: card.columnId });
    await recordActivity({ boardId: board.id, actorId: userId, type: "card.deleted", data: { title: card.title } });
    res.status(204).end();
  }),
);

cardsRouter.post(
  "/:cardId/comments",
  ah(async (req, res) => {
    const userId = uid(req);
    const { card, board } = await requireCard(userId, req.params.cardId, "comment:write");
    const { body } = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
    const comment = await prisma.comment.create({
      data: { cardId: card.id, authorId: userId, body },
      include: { author: { select: { id: true, name: true } } },
    });
    broadcast.toBoard(board.id, "comment:created", { ...comment, boardId: board.id });
    await recordActivity({ boardId: board.id, cardId: card.id, actorId: userId, type: "comment.created", data: { excerpt: body.slice(0, 80) } });

    // Notify the assignee and the card creator (not the commenter).
    const recipients = new Set([card.assigneeId, card.createdById].filter((id): id is string => !!id && id !== userId));
    for (const recipient of recipients) {
      await enqueueNotification({
        type: "card.commented",
        userId: recipient,
        cardId: card.id,
        cardTitle: card.title,
        boardId: board.id,
        actorName: comment.author.name,
        excerpt: body.slice(0, 140),
      });
    }
    res.status(201).json({ comment });
  }),
);
