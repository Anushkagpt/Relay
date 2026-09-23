import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { workspacesRouter } from "./routes/workspaces";
import { boardsRouter } from "./routes/boards";
import { cardsRouter } from "./routes/cards";
import { notificationsRouter } from "./routes/notifications";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/workspaces", requireAuth, workspacesRouter);
  app.use("/api/cards", requireAuth, cardsRouter);
  app.use("/api/notifications", requireAuth, notificationsRouter);
  app.use("/api", requireAuth, boardsRouter);

  app.use(errorHandler);
  return app;
}
