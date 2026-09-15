import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    testTimeout: 20000,
    hookTimeout: 30000,
    pool: "forks",
    maxForks: 1,
    minForks: 1,
  },
});