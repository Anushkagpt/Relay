import { Queue, Worker, type Job } from "bullmq";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { createRedis } from "../lib/redis";
import { broadcast } from "../realtime/broadcast";

export type NotificationJob =
  | { type: "card.assigned"; userId: string; cardId: string; cardTitle: string; boardId: string; actorName: string }
  | { type: "card.commented"; userId: string; cardId: string; cardTitle: string; boardId: string; actorName: string; excerpt: string }
  | { type: "card.due_soon"; userId: string; cardId: string; cardTitle: string; boardId: string; dueDate: string };

const QUEUE_NAME = "notifications";
let queue: Queue<NotificationJob> | null = null;

/** Persists the notification, pushes it to the user's sockets, and "sends" the email. */
export async function processNotification(job: NotificationJob) {
  const { userId, ...data } = job;
  const notification = await prisma.notification.create({
    data: { userId, type: job.type, data },
  });
  broadcast.toUser(userId, "notification:created", notification);
  // Email delivery hook: swap this log for a provider (SES, Resend, etc.).
  logger.info({ userId, type: job.type, cardId: job.cardId }, "notification email queued");
  return notification;
}

export async function enqueueNotification(job: NotificationJob) {
  if (!config.redisUrl) {
    // No Redis (local dev / unit tests): run inline so the feature still works.
    await processNotification(job);
    return;
  }
  queue ??= new Queue<NotificationJob>(QUEUE_NAME, { connection: createRedis() });
  await queue.add(job.type, job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export function startNotificationWorker() {
  if (!config.redisUrl) return null;
  const worker = new Worker<NotificationJob>(
    QUEUE_NAME,
    async (job: Job<NotificationJob>) => {
      await processNotification(job.data);
    },
    { connection: createRedis(), concurrency: 10 },
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "notification job failed"));
  logger.info("Notification worker started");
  return worker;
}
