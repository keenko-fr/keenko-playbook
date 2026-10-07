/* oxlint-disable effect/noAsyncFunction -- This native Bun fixture invokes Nx's promise-returning migration planner. */
import { describe, expect, test } from "bun:test";

import { readJsonFile } from "@nx/devkit";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

describe("supported stable N-1 migration planning", () => {
  for (const target of ["1.0.3-rc.0", "1.0.3"])
    test(`native Nx updates 1.0.2 to ${target} without a persisted-state migration`, async () => {
      const config = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
      const migrator = new Migrator({
        fetch: async (name, version) => {
          expect(name).toBe("keenko");
          return { ...config, version };
        },
        from: {},
        getInstalledPackageVersion: () => "1.0.2",
        interactive: false,
        packageJson: {
          dependencies: { "consumer-owned": "^7.0.0", effect: "consumer-customized" },
          devDependencies: { keenko: "1.0.2", oxlint: "consumer-customized" },
          name: "consumer",
          version: "0.0.0",
        },
        to: {},
      });
      const plan = await migrator.migrate("keenko", target);
      // No blanket dependency repair runs in a sync-only release. A future
      // persisted-state transformation must supply its own native migration proof.
      expect(plan.packageUpdates).toEqual({ keenko: { addToPackageJson: false, version: target } });
      expect(plan.migrations).toEqual([]);
    });
});
