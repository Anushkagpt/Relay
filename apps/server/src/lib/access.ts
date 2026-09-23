import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { forbidden, notFound } from "./errors";
import { can, type Action } from "./permissions";

/**
 * Tenant isolation lives here: every route resolves the workspace that owns
 * the resource, then checks the caller's membership role in that workspace.
 * Non-members get 404 so resource IDs from other tenants are not revealed.
 */
export async function requireWorkspaceRole(userId: string, workspaceId: string, action: Action): Promise<Role> {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) throw notFound("Workspace not found");
  if (!can(membership.role, action)) throw forbidden(`Your role (${membership.role}) cannot do ${action}`);
  return membership.role;
}

export async function requireBoard(userId: string, boardId: string, action: Action) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw notFound("Board not found");
  const role = await requireWorkspaceRole(userId, board.workspaceId, action);
  return { board, role };
}

export async function requireColumn(userId: string, columnId: string, action: Action) {
  const column = await prisma.column.findUnique({ where: { id: columnId }, include: { board: true } });
  if (!column) throw notFound("Column not found");
  const role = await requireWorkspaceRole(userId, column.board.workspaceId, action);
  return { column, board: column.board, role };
}

export async function requireCard(userId: string, cardId: string, action: Action) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { board: true } });
  if (!card) throw notFound("Card not found");
  const role = await requireWorkspaceRole(userId, card.board.workspaceId, action);
  return { card, board: card.board, role };
}
