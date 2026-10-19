import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/generators/preset/preset.spec.ts",
      "src/generators/sync/sync.spec.ts",
      "src/infra/deps-update.spec.ts",
      "tests/module-boundaries.spec.ts",
      "tests/wait-for-published.spec.ts",
    ],
    testTimeout: 60_000,
  },
});
