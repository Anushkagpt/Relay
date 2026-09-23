import { prisma } from "./prisma";
import { badRequest } from "./errors";
import { needsRebalance, positionBetween, rebalance } from "./position";

/**
 * Resolves a new card position from neighbour IDs in the target column.
 * If the neighbours are too close to split, the column is re-spaced first.
 */
export async function cardPosition(columnId: string, beforeId?: string | null, afterId?: string | null, movingId?: string) {
  const load = async (id?: string | null) => {
    if (!id) return null;
    const card = await prisma.card.findUnique({ where: { id }, select: { columnId: true, position: true } });
    if (!card || card.columnId !== columnId) throw badRequest("Neighbour card is not in the target column");
    return card.position;
  };

  if (!beforeId && !afterId) {
    const last = await prisma.card.findFirst({
      where: { columnId, NOT: movingId ? { id: movingId } : undefined },
      orderBy: { position: "desc" },
    });
    return positionBetween(last?.position ?? null, null);
  }

  let before = await load(beforeId);
  let after = await load(afterId);
  if (before !== null && after !== null && needsRebalance(before, after)) {
    const cards = await prisma.card.findMany({ where: { columnId }, orderBy: { position: "asc" }, select: { id: true } });
    const positions = rebalance(cards.length);
    await prisma.$transaction(cards.map((c, i) => prisma.card.update({ where: { id: c.id }, data: { position: positions[i] } })));
    before = await load(beforeId);
    after = await load(afterId);
  }
  return positionBetween(before, after);
}

export async function columnPosition(boardId: string, beforeId?: string | null, afterId?: string | null) {
  const load = async (id?: string | null) => {
    if (!id) return null;
    const col = await prisma.column.findUnique({ where: { id }, select: { boardId: true, position: true } });
    if (!col || col.boardId !== boardId) throw badRequest("Neighbour column is not on this board");
    return col.position;
  };
  if (!beforeId && !afterId) {
    const last = await prisma.column.findFirst({ where: { boardId }, orderBy: { position: "desc" } });
    return positionBetween(last?.position ?? null, null);
  }
  return positionBetween(await load(beforeId), await load(afterId));
}
