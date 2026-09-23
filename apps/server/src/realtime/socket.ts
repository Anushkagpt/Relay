import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { config } from "../config";
import { verifyAccessToken } from "../lib/tokens";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { createRedis } from "../lib/redis";
import { broadcast, boardRoom, userRoom } from "./broadcast";

interface SocketData {
  userId: string;
  name: string;
}

async function presence(io: Server, boardId: string) {
  const sockets = await io.in(boardRoom(boardId)).fetchSockets();
  const users = new Map<string, { id: string; name: string }>();
  for (const s of sockets) {
    const data = s.data as SocketData;
    users.set(data.userId, { id: data.userId, name: data.name });
  }
  io.to(boardRoom(boardId)).emit("presence", { boardId, users: [...users.values()] });
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  if (config.redisUrl) {
    const pub = createRedis();
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info("Socket.IO using Redis adapter");
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("unauthorized"));
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return next(new Error("unauthorized"));
      socket.data = { userId: user.id, name: user.name } satisfies SocketData;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    socket.join(userRoom(data.userId));

    socket.on("board:join", async (boardId: string, ack?: (res: { ok: boolean }) => void) => {
      const board = await prisma.board.findUnique({ where: { id: boardId } });
      const member = board
        ? await prisma.membership.findUnique({
            where: { userId_workspaceId: { userId: data.userId, workspaceId: board.workspaceId } },
          })
        : null;
      if (!board || !member) return ack?.({ ok: false });
      await socket.join(boardRoom(boardId));
      ack?.({ ok: true });
      await presence(io, boardId);
    });

    socket.on("board:leave", async (boardId: string) => {
      await socket.leave(boardRoom(boardId));
      await presence(io, boardId);
    });

    socket.on("disconnecting", () => {
      const boards = [...socket.rooms].filter((r) => r.startsWith("board:"));
      // Rooms are emptied after this handler, so recompute presence on the next tick.
      setImmediate(() => boards.forEach((room) => void presence(io, room.slice("board:".length))));
    });
  });

  broadcast.attach(io);
  return io;
}
