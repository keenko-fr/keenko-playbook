/* oxlint-disable effect/noAsyncFunction -- This native Bun fixture invokes Nx's promise-returning migration planner. */
import { describe, expect, test } from "bun:test";

import { readJsonFile } from "@nx/devkit";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

describe("supported stable N-1 migration planning", () => {
  for (const target of ["1.0.4-rc.0", "1.0.4"])
    test(`native Nx updates 1.0.3 to ${target} with managed-slot convergence`, async () => {
      const config = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
      const migrator = new Migrator({
        fetch: async (name, version) => {
          expect(name).toBe("keenko");
          return { ...config, version };
        },
        from: {},
        getInstalledPackageVersion: () => "1.0.3",
        interactive: false,
        packageJson: {
          dependencies: { "consumer-owned": "^7.0.0", effect: "consumer-customized" },
          devDependencies: { keenko: "1.0.3", oxlint: "consumer-customized" },
          name: "consumer",
          version: "0.0.0",
        },
        to: {},
      });
      const plan = await migrator.migrate("keenko", target);
      // Native package updates leave nested manifests to the selected Keenko factory.
      expect(plan.packageUpdates).toEqual({ keenko: { addToPackageJson: false, version: target } });
      expect(plan.migrations.map(({ name, package: owner, version }) => ({ name, owner, version }))).toEqual([
        { name: "1.0.4-managed-dependencies", owner: "keenko", version: "1.0.4-rc.0" },
      ]);
    });
});
