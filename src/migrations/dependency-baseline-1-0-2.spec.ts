import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Test the frozen release migration artifact.
import { readFileSync } from "node:fs";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx fixtures serialize virtual-tree manifests and invoke the promise-returning Migrator. */
import { parseJson, readJson, readJsonFile } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import migration from "./dependency-baseline-1-0-2.js";

const roles = parseJson<
  Record<"root" | "application" | "backend" | "ui" | "shared", Record<"dependencies" | "devDependencies", Record<string, string>>>
>(readFileSync(new URL("files/dependency-baseline-1-0-2.json", import.meta.url), "utf-8"));
const target = {
  "apps/web/package.json": roles.application,
  "package.json": roles.root,
  "packages/backend/package.json": roles.backend,
  "packages/shared/package.json": roles.shared,
  "packages/ui/package.json": roles.ui,
};
const sections: readonly ("dependencies" | "devDependencies")[] = ["dependencies", "devDependencies"];

function divergeSlot(manifest: typeof roles.application, section: "dependencies" | "devDependencies", name: string, scenario: number) {
  const opposite = section === "dependencies" ? "devDependencies" : "dependencies";
  if (scenario === 0) manifest[section][name] = "0.0.1";
  if (scenario === 1) manifest[section][name] = "consumer-customized";
  if (scenario === 2) {
    Reflect.deleteProperty(manifest[section], name);
    manifest[opposite][name] = "consumer-customized";
  }
  if (scenario === 3) Reflect.deleteProperty(manifest[section], name);
  if (scenario === 4) manifest[opposite][name] = "duplicate";
}

const fixture = () => {
  const tree = createTreeWithEmptyWorkspace();
  for (const [path, slots] of Object.entries(target))
    tree.write(
      path,
      JSON.stringify({
        ...slots,
        nx: { tags: path.startsWith("apps/") ? ["type:app"] : [] },
        scripts: { custom: "project-owned" },
      })
    );
  tree.write("bun.lock", "Bun-owned lockfile\n");
  tree.write("apps/admin/package.json", '{"dependencies":{"effect":"project-owned"}}');
  return tree;
};

describe("1.0.2 dependency-baseline migration", () => {
  test("restores the UI React declaration slot missing from released 1.0.1", async () => {
    const tree = fixture();
    const manifest = readJson<typeof roles.ui>(tree, "packages/ui/package.json");
    Reflect.deleteProperty(manifest.devDependencies, "@types/react");
    manifest.devDependencies["consumer-owned"] = "^9.0.0";
    tree.write("packages/ui/package.json", JSON.stringify(manifest));

    await migration(tree);

    const upgraded = readJson<typeof manifest>(tree, "packages/ui/package.json");
    expect(upgraded.devDependencies["@types/react"]).toBe(target["packages/ui/package.json"].devDependencies["@types/react"]);
    expect(upgraded.devDependencies["@types/react-dom"]).toBeUndefined();
    expect(upgraded.devDependencies["consumer-owned"]).toBe("^9.0.0");
    expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned lockfile\n");
  });

  test("normalizes old, customized, moved, deleted, and duplicate slots across all target manifests", async () => {
    const tree = fixture();
    for (const [path, slots] of Object.entries(target)) {
      const manifest = readJson<typeof slots>(tree, path);
      let index = 0;
      for (const section of sections) for (const name of Object.keys(slots[section])) divergeSlot(manifest, section, name, index++ % 5);
      manifest.dependencies["consumer-owned"] = "^9.0.0";
      tree.write(path, JSON.stringify(manifest));
    }
    await migration(tree);
    for (const [path, slots] of Object.entries(target))
      expect(readJson(tree, path)).toEqual({
        ...slots,
        dependencies: { ...slots.dependencies, "consumer-owned": "^9.0.0" },
        nx: { tags: path.startsWith("apps/") ? ["type:app"] : [] },
        scripts: { custom: "project-owned" },
      });
    expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned lockfile\n");
    expect(tree.read("apps/admin/package.json", "utf-8")).toBe('{"dependencies":{"effect":"project-owned"}}');
  });

  test("leaves canonical manifests byte-for-byte unchanged and is idempotent", async () => {
    const tree = fixture();
    const before = tree.listChanges();
    await migration(tree);
    expect(tree.listChanges()).toEqual(before);
    tree.write("packages/shared/package.json", '{"dependencies":{"effect":"custom"}}');
    await migration(tree);
    const upgraded = tree.listChanges();
    await migration(tree);
    expect(tree.listChanges()).toEqual(upgraded);
  });

  test.each([{ applications: ["portal"] }, { applications: ["portal", "console", "studio"] }])(
    "replicates the single application role without apps/web: %j",
    async ({ applications }) => {
      const tree = fixture();
      tree.delete("apps/web/package.json");
      expect(Object.keys(roles)).toEqual(["root", "application", "backend", "ui", "shared"]);
      expect(Object.values(roles.application).reduce((count, slots) => count + Object.keys(slots).length, 0)).toBe(32);
      for (const application of applications) {
        const manifest = structuredClone(roles.application);
        let index = 0;
        for (const section of sections)
          for (const name of Object.keys(manifest[section])) divergeSlot(manifest, section, name, index++ % 5);
        manifest.dependencies["consumer-owned"] = "^9.0.0";
        tree.write(`apps/${application}/package.json`, JSON.stringify({ ...manifest, nx: { tags: ["scope:custom", "type:app"] } }));
      }
      tree.write("packages/other-app/package.json", '{"nx":{"tags":["type:app"]},"dependencies":{"effect":"outside-topology"}}');
      tree.write("apps/group/nested/package.json", '{"nx":{"tags":["type:app"]},"dependencies":{"effect":"nested"}}');
      await migration(tree);
      for (const application of applications)
        expect(readJson(tree, `apps/${application}/package.json`)).toEqual({
          ...roles.application,
          dependencies: { ...roles.application.dependencies, "consumer-owned": "^9.0.0" },
          nx: { tags: ["scope:custom", "type:app"] },
        });
      const count =
        Object.values(target).reduce(
          (sum, slots) => sum + Object.values(slots).reduce((n, entries) => n + Object.keys(entries).length, 0),
          0
        ) +
        32 * (applications.length - 1);
      expect(count).toBe(43 + 32 * applications.length);
      expect(tree.read("packages/other-app/package.json", "utf-8")).toContain("outside-topology");
      expect(tree.read("apps/group/nested/package.json", "utf-8")).toContain("nested");
      expect(tree.read("apps/admin/package.json", "utf-8")).toBe('{"dependencies":{"effect":"project-owned"}}');
      expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned lockfile\n");
      const upgraded = tree.listChanges();
      await migration(tree);
      expect(tree.listChanges()).toEqual(upgraded);
    }
  );

  test.each([
    '{"nx":{"tags":[false]}}',
    '{"nx":null}',
    '{"nx":{"tags":["type:app","type:package"]}}',
    '{"nx":{"tags":["type:app","type:app"]}}',
    '{"nx":{"tags":["type:app"]},"devDependencies":[]}',
  ])("validates every discovered application before writes: %s", (source) => {
    const tree = fixture();
    tree.write("package.json", "{}");
    tree.write("apps/zzz/package.json", source);
    const before = tree.listChanges();
    expect(() => {
      void migration(tree);
    }).toThrow("apps/zzz/package.json");
    expect(tree.listChanges()).toEqual(before);
  });

  test.each(["missing", "malformed"])("validates a later %s manifest before applying earlier writes", (scenario) => {
    const tree = fixture();
    tree.write("package.json", "{}");
    if (scenario === "missing") tree.delete("packages/shared/package.json");
    else tree.write("packages/shared/package.json", '{"dependencies":[]}');
    const before = tree.listChanges();
    expect(() => {
      void migration(tree);
    }).toThrow("packages/shared/package.json");
    expect(tree.listChanges()).toEqual(before);
  });

  test.each(["1.0.1", "1.0.2-rc.0"])("native Nx selects the correction from %s", async (sourceVersion) => {
    const migrationConfig = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
    const migrator = new Migrator({
      fetch: async (_packageName, targetVersion) => ({ ...migrationConfig, version: targetVersion }),
      from: {},
      getInstalledPackageVersion: () => sourceVersion,
      interactive: false,
      packageJson: { dependencies: { keenko: sourceVersion }, name: "migration-fixture", version: "0.0.0" },
      to: {},
    });
    const plan = await migrator.migrate("keenko", "1.0.2-rc.1");
    expect(plan.migrations.map(({ name }) => name)).toEqual([
      ...(sourceVersion === "1.0.1"
        ? ["1.0.2-application-workspaces", "1.0.2-backend-vitest-exclusions", "1.0.2-dependency-baseline", "1.0.2-bun-linker"]
        : []),
      "1.0.2-application-dependency-baseline",
    ]);
    expect(plan.migrations.at(-1)?.version).toBe("1.0.2-rc.1");
    const originalOnly = {
      ...migrationConfig,
      generators: Object.fromEntries(
        Object.entries(migrationConfig.generators ?? {}).filter(([name]) => name !== "1.0.2-application-dependency-baseline")
      ),
    };
    const oldMigrator = new Migrator({
      fetch: async (_name, version) => ({ ...originalOnly, version }),
      from: {},
      getInstalledPackageVersion: () => "1.0.2-rc.0",
      interactive: false,
      packageJson: { dependencies: { keenko: "1.0.2-rc.0" }, name: "fixture", version: "0.0.0" },
      to: {},
    });
    const oldPlan = await oldMigrator.migrate("keenko", "1.0.2-rc.1");
    expect(oldPlan.migrations).toEqual([]);
  });
});
