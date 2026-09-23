import type { Server } from "socket.io";

let io: Server | null = null;

export const boardRoom = (boardId: string) => `board:${boardId}`;
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Thin wrapper so route handlers can emit without importing the server.
 * With the Redis adapter attached, emits reach clients on every API instance.
 */
export const broadcast = {
  attach(server: Server) {
    io = server;
  },
  toBoard(boardId: string, event: string, payload: unknown) {
    io?.to(boardRoom(boardId)).emit(event, payload);
  },
  toUser(userId: string, event: string, payload: unknown) {
    io?.to(userRoom(userId)).emit(event, payload);
  },
};
