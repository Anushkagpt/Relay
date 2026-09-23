import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { broadcast } from "../realtime/broadcast";

export async function recordActivity(input: {
  boardId: string;
  actorId: string;
  type: string;
  cardId?: string | null;
  data?: Prisma.InputJsonValue;
}) {
  const activity = await prisma.activity.create({
    data: {
      boardId: input.boardId,
      actorId: input.actorId,
      cardId: input.cardId ?? null,
      type: input.type,
      data: input.data ?? {},
    },
    include: { actor: { select: { id: true, name: true } } },
  });
  broadcast.toBoard(input.boardId, "activity:created", activity);
  return activity;
}
