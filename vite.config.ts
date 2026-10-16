import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    // Bound concurrent DOM environments on laptops and clean CI runners.
    maxWorkers: 2,
    setupFiles: "./tests/setup.ts",
  },
});
