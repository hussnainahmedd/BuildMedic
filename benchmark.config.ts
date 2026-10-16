import { defineConfig } from "vitest/config";

// Deliberately separate from the fast offline regression command.
export default defineConfig({
  test: {
    include: ["tests/performance/*.perf.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
