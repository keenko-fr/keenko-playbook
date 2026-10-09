/* oxlint-disable effect/noAsyncFunction -- This native Bun fixture invokes Nx's promise-returning migration planner. */
import { describe, expect, test } from "bun:test";

import { readJsonFile } from "@nx/devkit";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

describe("supported stable, RC and recovery migration planning", () => {
  const source = readJsonFile<{ version: string; prerelease: string }>("tests/fixtures/upgrade-source.json");
  const collection = readJsonFile<{ generators: Record<string, { version: string }> }>("migrations.json").generators;
  const nextRc = collection["1.0.5-backend-shared-types"].version;
  const both = ["1.0.5-backend-convention", "1.0.5-backend-shared-types"];
  for (const [origin, target, entries, from] of [
    [source.version, nextRc, both, {}],
    [source.version, nextRc.split("-")[0], both, {}],
    [source.prerelease, nextRc, ["1.0.5-backend-shared-types"], {}],
    [source.prerelease, nextRc, both, { keenko: source.version }],
    [nextRc, nextRc, both, { keenko: source.version }],
    ["1.0.3", collection["1.0.4-managed-dependencies"].version, ["1.0.4-managed-dependencies"], {}],
    ["1.0.3", source.version, ["1.0.4-managed-dependencies"], {}],
  ] as const)
    test(`native Nx updates ${origin} to ${target} with ${entries.join(", ")} and from ${from.keenko ?? "installed"}`, async () => {
      const config = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
      const migrator = new Migrator({
        fetch: async (name, version) => {
          expect(name).toBe("keenko");
          return { ...config, version };
        },
        from,
        getInstalledPackageVersion: (name, overrides) => overrides?.[name] ?? origin,
        interactive: false,
        packageJson: {
          dependencies: { "consumer-owned": "^7.0.0", effect: "consumer-customized" },
          devDependencies: { keenko: origin, oxlint: "consumer-customized" },
          name: "consumer",
          version: "0.0.0",
        },
        to: {},
      });
      const plan = await migrator.migrate("keenko", target);
      expect(plan.packageUpdates).toEqual({ keenko: { addToPackageJson: false, version: target } });
      expect(plan.migrations.map(({ name, package: owner, version }) => ({ name, owner, version }))).toEqual(
        entries.map((name) => ({ name, owner: "keenko", version: collection[name].version }))
      );
    });
});
