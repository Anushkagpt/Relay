import { prisma } from "../lib/prisma";
import { enqueueNotification } from "./notifications";

/**
 * Finds cards due in the next 24h that have an assignee and have not been
 * reminded yet, and enqueues one reminder per card.
 */
export async function scanDueSoon(now = new Date()) {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const cards = await prisma.card.findMany({
    where: { dueDate: { gte: now, lte: horizon }, assigneeId: { not: null } },
    select: { id: true, title: true, boardId: true, dueDate: true, assigneeId: true },
  });
  let queued = 0;
  for (const card of cards) {
    const already = await prisma.notification.findFirst({
      where: { userId: card.assigneeId!, type: "card.due_soon", data: { path: ["cardId"], equals: card.id } },
    });
    if (already) continue;
    await enqueueNotification({
      type: "card.due_soon",
      userId: card.assigneeId!,
      cardId: card.id,
      cardTitle: card.title,
      boardId: card.boardId,
      dueDate: card.dueDate!.toISOString(),
    });
    queued++;
  }
  return queued;
}
