import { defineConfig } from "vitest/config";
import { loadEnv } from "vite"; // loadEnv comes from vite, not vitest
// Reads web/.env.test (test project credentials). Never point these tests at production data.
export default defineConfig({
  test: { environment: "node", env: loadEnv("test", process.cwd(), ""), include: ["tests/**/*.test.ts"],
    testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
});