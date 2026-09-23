import type { Role } from "@prisma/client";

export type Action =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "member:manage"
  | "board:create"
  | "board:update"
  | "board:delete"
  | "card:write"
  | "comment:write";

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

const MIN_ROLE: Record<Action, Role> = {
  "workspace:read": "VIEWER",
  "card:write": "MEMBER",
  "comment:write": "MEMBER",
  "board:create": "MEMBER",
  "board:update": "ADMIN",
  "board:delete": "ADMIN",
  "member:manage": "ADMIN",
  "workspace:update": "ADMIN",
  "workspace:delete": "OWNER",
};

export function can(role: Role, action: Action): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[action]];
}

/**
 * Admins can manage members below them; only owners can grant or remove OWNER/ADMIN.
 */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return ROLE_RANK[target] < ROLE_RANK.ADMIN;
  return false;
}
