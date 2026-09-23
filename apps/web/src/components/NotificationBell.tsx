import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Notification } from "../api/types";
import { useSocket } from "../hooks/useSocket";
import { timeAgo } from "../lib";

function text(n: Notification) {
  const d = n.data;
  if (n.type === "card.assigned") return `${d.actorName} assigned you "${d.cardTitle}"`;
  if (n.type === "card.commented") return `${d.actorName} commented on "${d.cardTitle}"`;
  if (n.type === "card.due_soon") return `"${d.cardTitle}" is due soon`;
  return n.type;
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const socket = useSocket();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: Notification[]; unread: number }>("/notifications"),
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!socket) return;
    const onNew = () => void qc.invalidateQueries({ queryKey: ["notifications"] });
    socket.on("notification:created", onNew);
    return () => {
      socket.off("notification:created", onNew);
    };
  }, [socket, qc]);

  const unread = data?.unread ?? 0;
  return (
    <div className="bell">
      <button
        className="btn ghost"
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) readAll.mutate();
        }}
      >
        <BellIcon />{unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          {data?.notifications.length ? (
            data.notifications.map((n) => (
              <Link key={n.id} to={`/b/${n.data.boardId}`} className="dropdown-item" onClick={() => setOpen(false)}>
                <div>{text(n)}</div>
                <div className="muted small">{timeAgo(n.createdAt)}</div>
              </Link>
            ))
          ) : (
            <div className="dropdown-item muted">No notifications yet</div>
          )}
        </div>
      )}
    </div>
  );
}
