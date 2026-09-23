import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // API tests run notification jobs inline; the BullMQ path is covered by e2e.
    env: { REDIS_URL: "" },
  },
});
