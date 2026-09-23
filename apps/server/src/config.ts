function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProd,
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  // Redis is optional in dev/test: without it, Socket.IO uses the in-memory
  // adapter and notification jobs run inline instead of through BullMQ.
  redisUrl: process.env.REDIS_URL || undefined,
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", isProd ? undefined : "dev-access-secret"),
    refreshSecret: required("JWT_REFRESH_SECRET", isProd ? undefined : "dev-refresh-secret"),
    accessTtlSeconds: 15 * 60,
    refreshTtlDays: 30,
  },
};
