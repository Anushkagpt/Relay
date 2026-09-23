import http from "node:http";
import { config } from "./config";
import { createApp } from "./app";
import { createSocketServer } from "./realtime/socket";
import { startNotificationWorker } from "./jobs/notifications";
import { scanDueSoon } from "./jobs/dueSoon";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";

const app = createApp();
const server = http.createServer(app);
createSocketServer(server);
const worker = startNotificationWorker();

const dueSoonTimer = setInterval(
  () => void scanDueSoon().catch((err) => logger.error({ err }, "due-soon scan failed")),
  15 * 60 * 1000,
);

server.listen(config.port, () => logger.info(`Relay API listening on :${config.port}`));

async function shutdown() {
  clearInterval(dueSoonTimer);
  await worker?.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
