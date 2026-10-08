import { defineConfig } from "vitest/config";
process.env.CLOUDINARY_CLOUD_NAME ||= "ci-dummy";
process.env.CLOUDINARY_API_KEY ||= "000000000000000";
process.env.CLOUDINARY_API_SECRET ||= "ci-dummy-secret";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    maxForks: 1,
    minForks: 1,
  },
}); 