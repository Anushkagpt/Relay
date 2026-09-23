import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json } from "../api/client";
import type { Board, CardDetail } from "../api/types";
import { canWrite, describeActivity, timeAgo } from "../lib";
import { Avatar } from "./Avatar";

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function CardModal({ cardId, board, onClose }: { cardId: string; board: Board; onClose: () => void }) {
  const qc = useQueryClient();
  const writable = canWrite(board.role);
  const { data } = useQuery({ queryKey: ["card", cardId], queryFn: () => api<{ card: CardDetail }>(`/cards/${cardId}`) });
  const card = data?.card;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description);
    }
  }, [card]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["card", cardId] });
    void qc.invalidateQueries({ queryKey: ["board", board.id] });
  };
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api(`/cards/${cardId}`, { method: "PATCH", body: json(patch) }),
    onSuccess: refresh,
  });
  const addComment = useMutation({
    mutationFn: (body: string) => api(`/cards/${cardId}/comments`, { method: "POST", body: json({ body }) }),
    onSuccess: () => {
      setComment("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/cards/${cardId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["board", board.id] });
      onClose();
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Card details" onClick={(e) => e.stopPropagation()}>
        {!card ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <input
              className="modal-title"
              value={title}
              disabled={!writable}
              aria-label="Card title"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== card.title && update.mutate({ title })}
            />
            <div className="modal-grid">
              <div>
                <label>
                  Description
                  <textarea
                    rows={5}
                    value={description}
                    disabled={!writable}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => description !== card.description && update.mutate({ description })}
                    placeholder="Add more detail…"
                  />
                </label>

                <h4>Comments</h4>
                <ul className="comments">
                  {card.comments.map((c) => (
                    <li key={c.id}>
                      <Avatar name={c.author.name} size={22} />
                      <div>
                        <strong>{c.author.name}</strong> <span className="muted small">{timeAgo(c.createdAt)}</span>
                        <p>{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {writable && (
                  <form
                    className="inline-form"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (comment.trim()) addComment.mutate(comment.trim());
                    }}
                  >
                    <input placeholder="Write a comment…" aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                    <button className="btn">Comment</button>
                  </form>
                )}
              </div>

              <div className="modal-side">
                <label>
                  Assignee
                  <select
                    value={card.assigneeId ?? ""}
                    disabled={!writable}
                    onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {board.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={toDateInput(card.dueDate)}
                    disabled={!writable}
                    onChange={(e) => update.mutate({ dueDate: e.target.value ? new Date(`${e.target.value}T17:00:00`).toISOString() : null })}
                  />
                </label>
                <h4>Activity</h4>
                <ul className="mini-activity">
                  {card.activity.map((a) => (
                    <li key={a.id}>
                      <strong>{a.actor.name}</strong> {describeActivity(a)}
                      <div className="muted small">{timeAgo(a.createdAt)}</div>
                    </li>
                  ))}
                </ul>
                {writable && (
                  <button className="btn danger" onClick={() => confirm("Delete this card?") && remove.mutate()}>
                    Delete card
                  </button>
                )}
              </div>
            </div>
            <button className="modal-close btn ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}
