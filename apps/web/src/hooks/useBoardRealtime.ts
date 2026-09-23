import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "./useSocket";

export interface PresenceUser {
  id: string;
  name: string;
}

const BOARD_EVENTS = [
  "card:created",
  "card:updated",
  "card:moved",
  "card:deleted",
  "column:created",
  "column:updated",
  "column:deleted",
  "board:updated",
];

/**
 * Joins the board's Socket.IO room and keeps TanStack Query caches fresh.
 * Server events carry the changed entity; we invalidate rather than patch so
 * the cache always matches the server's ordering.
 */
export function useBoardRealtime(boardId: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit("board:join", boardId);
    join();
    socket.on("connect", join);

    const refreshBoard = () => {
      void queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    };
    BOARD_EVENTS.forEach((e) => socket.on(e, refreshBoard));
    const onActivity = (a: { cardId?: string | null }) => {
      void queryClient.invalidateQueries({ queryKey: ["activity", boardId] });
      if (a.cardId) void queryClient.invalidateQueries({ queryKey: ["card", a.cardId] });
    };
    const onComment = (c: { cardId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["card", c.cardId] });
      refreshBoard();
    };
    const onPresence = (p: { boardId: string; users: PresenceUser[] }) => {
      if (p.boardId === boardId) setOnline(p.users);
    };
    socket.on("activity:created", onActivity);
    socket.on("comment:created", onComment);
    socket.on("presence", onPresence);

    return () => {
      socket.emit("board:leave", boardId);
      socket.off("connect", join);
      BOARD_EVENTS.forEach((e) => socket.off(e, refreshBoard));
      socket.off("activity:created", onActivity);
      socket.off("comment:created", onComment);
      socket.off("presence", onPresence);
    };
  }, [socket, boardId, queryClient]);

  return { online };
}
