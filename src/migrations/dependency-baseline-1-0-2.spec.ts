import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Test the frozen release migration artifact.
import { readFileSync } from "node:fs";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx fixtures serialize virtual-tree manifests and invoke the promise-returning Migrator. */
import { parseJson, readJson, readJsonFile } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import migration from "./dependency-baseline-1-0-2.js";

const target = parseJson<Record<string, Record<"dependencies" | "devDependencies", Record<string, string>>>>(
  readFileSync(new URL("files/dependency-baseline-1-0-2.json", import.meta.url), "utf-8")
);
const sections: readonly ("dependencies" | "devDependencies")[] = ["dependencies", "devDependencies"];

function divergeSlot(manifest: (typeof target)[string], section: "dependencies" | "devDependencies", name: string, scenario: number) {
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
  for (const [path, slots] of Object.entries(target)) tree.write(path, JSON.stringify({ ...slots, scripts: { custom: "project-owned" } }));
  tree.write("bun.lock", "Bun-owned lockfile\n");
  tree.write("apps/admin/package.json", '{"dependencies":{"effect":"project-owned"}}');
  return tree;
};

describe("1.0.2 dependency-baseline migration", () => {
  test("restores the UI React declaration slot missing from released 1.0.1", async () => {
    const tree = fixture();
    const manifest = readJson<(typeof target)[string]>(tree, "packages/ui/package.json");
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

  test("native Nx selects the separate KEE-45, KEE-51, and KEE-47 migrations", async () => {
    const migrationConfig = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
    const migrator = new Migrator({
      fetch: async (_packageName, targetVersion) => ({ ...migrationConfig, version: targetVersion }),
      from: {},
      getInstalledPackageVersion: () => "1.0.1",
      interactive: false,
      packageJson: { dependencies: { keenko: "1.0.1" }, name: "migration-fixture", version: "0.0.0" },
      to: {},
    });
    const plan = await migrator.migrate("keenko", "1.0.2-rc.0");
    expect(plan.migrations.map(({ name }) => name)).toEqual([
      "1.0.2-application-workspaces",
      "1.0.2-backend-vitest-exclusions",
      "1.0.2-dependency-baseline",
    ]);
  });
});
