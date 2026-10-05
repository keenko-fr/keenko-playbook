import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/generators/preset/preset.spec.ts",
      "src/generators/sync/sync.spec.ts",
      "src/infra/deps-update.spec.ts",
      "src/migrations/backend-vitest-exclusions-1-0-2.spec.ts",
      "tests/module-boundaries.spec.ts",
      "tests/wait-for-published.spec.ts",
      "src/migrations/effect-testing-baseline-1-0-2.spec.ts",
      "src/migrations/compatibility-baseline-1-0-2.spec.ts",
    ],
    testTimeout: 60_000,
  },
});
