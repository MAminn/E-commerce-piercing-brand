import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "#root": path.resolve(__dirname),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", "build", "dist", "shared/database/migrations"],
    // *.integration.test.ts files share one real Postgres database (see
    // docs/MARKETING_SUITE_PLAN.md "Running the DB integration tests").
    // Vitest parallelizes across test FILES by default, so with more than
    // one integration file that means two files' beforeEach cleanups and
    // inserts race against the same tables. Unit tests (mocked/no DB) are
    // unaffected by this and don't need it — only disable file parallelism
    // when TEST_DATABASE_URL is actually set, so the normal fast run stays
    // parallel.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
