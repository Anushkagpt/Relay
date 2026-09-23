import type { Activity, Card } from "./api/types";

/** Neighbour IDs for a card at `index` in `cards` (the list after the move, card included). */
export function neighbours(cards: Pick<Card, "id">[], index: number) {
  return {
    beforeId: index > 0 ? cards[index - 1].id : null,
    afterId: index < cards.length - 1 ? cards[index + 1].id : null,
  };
}

export function describeActivity(a: Activity): string {
  const d = a.data as Record<string, unknown>;
  switch (a.type) {
    case "card.created":
      return `created "${d.title}" in ${d.column}`;
    case "card.moved":
      return `moved a card from ${d.from} to ${d.to}`;
    case "card.updated": {
      const parts: string[] = [];
      if (d.title) parts.push("renamed the card");
      if ("assignee" in d) parts.push(d.assignee ? `assigned ${d.assignee}` : "removed the assignee");
      if ("dueDate" in d) parts.push(d.dueDate ? "set a due date" : "cleared the due date");
      if (d.description) parts.push("edited the description");
      return parts.join(", ") || "updated the card";
    }
    case "card.deleted":
      return `deleted "${d.title}"`;
    case "comment.created":
      return `commented: "${d.excerpt}"`;
    case "column.created":
      return `added column ${d.name}`;
    case "column.deleted":
      return `deleted column ${d.name}`;
    default:
      return a.type;
  }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function dueLabel(iso: string | null, now = new Date()): { text: string; tone: "overdue" | "soon" | "later" } | null {
  if (!iso) return null;
  const due = new Date(iso);
  const diffH = (due.getTime() - now.getTime()) / 36e5;
  const text = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { text, tone: diffH < 0 ? "overdue" : diffH < 48 ? "soon" : "later" };
}

export const canWrite = (role: string) => role !== "VIEWER";
export const canManage = (role: string) => role === "OWNER" || role === "ADMIN";
