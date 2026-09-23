import IORedis from "ioredis";
import { config } from "../config";

export function createRedis(): IORedis {
  if (!config.redisUrl) throw new Error("REDIS_URL is not set");
  // BullMQ requires maxRetriesPerRequest: null on its connections.
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
}
