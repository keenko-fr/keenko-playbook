/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish -- Native Nx fixtures exercise synchronous tree changes and its promise-returning Migrator. */
import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Verify the exact shipped compatibility asset.
import { readFileSync } from "node:fs";

import { readJson, readJsonFile } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import { authkitPatchKey, authkitPatchPath } from "../compatibility/authkit-test.js";
import migration from "./authkit-test-1-0-2.js";

const patch = readFileSync(new URL("../compatibility/files/workos-authkit-0.2.10.patch", import.meta.url), "utf-8");
const fixture = () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(
    "package.json",
    JSON.stringify({ name: "consumer", patchedDependencies: { "other@1.0.0": "patches/other.patch" }, scripts: { custom: "owned" } })
  );
  tree.write("patches/other.patch", "consumer patch");
  tree.write("bun.lock", "Bun-owned lockfile");
  tree.write("packages/backend/package.json", '{"dependencies":{"@convex-dev/workos-authkit":"0.2.10","consumer-owned":"^1.0.0"}}');
  return tree;
};

describe("KEE-53 AuthKit test migration", () => {
  test("adds only the owned patch and mapping, preserving dependencies, other patches and bun.lock", () => {
    const tree = fixture();
    const before = new Map(tree.listChanges().map(({ path, content }) => [path, content?.toString()]));
    migration(tree);
    expect(readJson(tree, "package.json")).toEqual({
      name: "consumer",
      patchedDependencies: { "other@1.0.0": "patches/other.patch", [authkitPatchKey]: authkitPatchPath },
      scripts: { custom: "owned" },
    });
    expect(tree.read(authkitPatchPath, "utf-8")).toBe(patch);
    for (const [path, content] of before) if (path !== "package.json") expect(tree.read(path, "utf-8")).toBe(content ?? null);
    const canonical = tree.listChanges();
    migration(tree);
    expect(tree.listChanges()).toEqual(canonical);
  });

  for (const partial of ["mapping", "asset"])
    test(`repairs a missing ${partial} without rewriting canonical state`, () => {
      const tree = fixture();
      migration(tree);
      if (partial === "mapping") tree.write("package.json", '{"name":"consumer"}');
      else tree.delete(authkitPatchPath);
      migration(tree);
      expect(readJson<{ patchedDependencies: Record<string, string> }>(tree, "package.json").patchedDependencies[authkitPatchKey]).toBe(
        authkitPatchPath
      );
      expect(tree.read(authkitPatchPath, "utf-8")).toBe(patch);
    });

  for (const patches of [null, [], "invalid", { [authkitPatchKey]: "patches/custom.patch" }])
    test(`rejects conflicting patch metadata atomically: ${JSON.stringify(patches)}`, () => {
      const tree = fixture();
      tree.write("package.json", JSON.stringify({ patchedDependencies: patches }));
      const before = tree.listChanges();
      expect(() => {
        migration(tree);
      }).toThrow("KEE-53 AuthKit test compatibility conflicts");
      expect(tree.listChanges()).toEqual(before);
    });

  test("rejects a customized owned asset before adding metadata", () => {
    const tree = fixture();
    tree.write(authkitPatchPath, "customized");
    const before = tree.listChanges();
    expect(() => {
      migration(tree);
    }).toThrow("KEE-53 AuthKit test compatibility conflicts");
    expect(tree.listChanges()).toEqual(before);
  });

  for (const sourceVersion of ["1.0.1", "1.0.2-rc.0", "1.0.2-rc.1", "1.0.2-rc.2"])
    test(`Nx selects the corrective rc.3 migration from ${sourceVersion}`, async () => {
      const config = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
      const migrator = new Migrator({
        fetch: async (_name, version) => ({ ...config, version }),
        from: {},
        getInstalledPackageVersion: () => sourceVersion,
        interactive: false,
        packageJson: { dependencies: { keenko: sourceVersion }, name: "consumer", version: "0.0.0" },
        to: {},
      });
      const plan = await migrator.migrate("keenko", "1.0.2-rc.3");
      expect(plan.migrations.at(-1)).toMatchObject({ name: "1.0.2-authkit-test", version: "1.0.2-rc.3" });
      if (sourceVersion === "1.0.2-rc.2") expect(plan.migrations).toHaveLength(1);
    });
});
