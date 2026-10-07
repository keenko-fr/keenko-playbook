/* oxlint-disable effect/noGlobals, effect/noNullish -- Native Nx preset fixtures exercise synchronous tree changes. */
import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Verify the exact shipped compatibility asset.
import { readFileSync } from "node:fs";

import { readJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";

import { authkitPatchKey, authkitPatchPath, installAuthkitTestPatch } from "./authkit-test.js";

const patch = readFileSync(new URL("files/workos-authkit-0.2.10.patch", import.meta.url), "utf-8");
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

describe("AuthKit test patch ownership", () => {
  test("adds only the owned patch and mapping, preserving dependencies, other patches and bun.lock", () => {
    const tree = fixture();
    const before = new Map(tree.listChanges().map(({ path, content }) => [path, content?.toString()]));
    installAuthkitTestPatch(tree);
    expect(readJson(tree, "package.json")).toEqual({
      name: "consumer",
      patchedDependencies: { "other@1.0.0": "patches/other.patch", [authkitPatchKey]: authkitPatchPath },
      scripts: { custom: "owned" },
    });
    expect(tree.read(authkitPatchPath, "utf-8")).toBe(patch);
    for (const [path, content] of before) if (path !== "package.json") expect(tree.read(path, "utf-8")).toBe(content ?? null);
    const canonical = tree.listChanges();
    installAuthkitTestPatch(tree);
    expect(tree.listChanges()).toEqual(canonical);
  });

  for (const partial of ["mapping", "asset"])
    test(`repairs a missing ${partial} without rewriting canonical state`, () => {
      const tree = fixture();
      installAuthkitTestPatch(tree);
      if (partial === "mapping") tree.write("package.json", '{"name":"consumer"}');
      else tree.delete(authkitPatchPath);
      installAuthkitTestPatch(tree);
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
        installAuthkitTestPatch(tree);
      }).toThrow("KEE-53 AuthKit test compatibility conflicts");
      expect(tree.listChanges()).toEqual(before);
    });

  test("rejects a customized owned asset before adding metadata", () => {
    const tree = fixture();
    tree.write(authkitPatchPath, "customized");
    const before = tree.listChanges();
    expect(() => {
      installAuthkitTestPatch(tree);
    }).toThrow("KEE-53 AuthKit test compatibility conflicts");
    expect(tree.listChanges()).toEqual(before);
  });
});
