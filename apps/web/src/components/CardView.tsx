import type { Card } from "../api/types";
import { dueLabel } from "../lib";
import { Avatar } from "./Avatar";

export function CardView({ card, dragging = false }: { card: Card; dragging?: boolean }) {
  const due = dueLabel(card.dueDate);
  const comments = card._count?.comments ?? 0;
  return (
    <article className={`card${dragging ? " dragging" : ""}`}>
      <div className="card-title">{card.title}</div>
      {(due || comments > 0 || card.assignee) && (
        <div className="card-meta">
          {due && <span className={`due ${due.tone}`}>{due.text}</span>}
          {comments > 0 && <span className="muted small">{comments} {comments === 1 ? "comment" : "comments"}</span>}
          <span className="spacer" />
          {card.assignee && <Avatar name={card.assignee.name} size={22} />}
        </div>
      )}
    </article>
  );
}
