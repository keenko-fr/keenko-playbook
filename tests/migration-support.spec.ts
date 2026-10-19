/* oxlint-disable effect/noAsyncFunction -- This native Bun fixture invokes Nx's promise-returning planner. */
import { describe, expect, test } from "bun:test";

import { readJsonFile } from "@nx/devkit";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

const target = "1.0.7-rc.1";
const config = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");

describe("current supported native migration selection", () => {
  for (const source of ["1.0.6", "1.0.7-rc.0"])
    for (const version of [target, "1.0.7"])
      test(`${source} selects the dependency migration for ${version}`, async () => {
        const migrator = new Migrator({
          fetch: async () => ({ ...config, version }),
          from: {},
          getInstalledPackageVersion: () => source,
          interactive: false,
          packageJson: {
            version: "0.0.0",
            name: "consumer",
            devDependencies: { keenko: source },
            dependencies: { "consumer-owned": "^7.0.0" },
          },
          to: {},
        });
        const plan = await migrator.migrate("keenko", version);
        expect(
          plan.migrations.map(({ name, package: owner, version: migrationVersion }) => ({ name, owner, version: migrationVersion }))
        ).toEqual([{ name: "1.0.7-managed-dependencies", owner: "keenko", version: target }]);
        expect(plan.packageUpdates).toEqual({ keenko: { addToPackageJson: false, version } });
      });
});
