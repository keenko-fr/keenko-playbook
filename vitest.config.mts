import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/migrations/managed-dependencies-1-0-4.spec.ts",
      "src/migrations/backend-convention-1-0-5.spec.ts",
      "src/generators/preset/preset.spec.ts",
      "src/generators/sync/sync.spec.ts",
      "src/infra/deps-update.spec.ts",
      "tests/module-boundaries.spec.ts",
      "tests/wait-for-published.spec.ts",
    ],
    testTimeout: 60_000,
  },
});
