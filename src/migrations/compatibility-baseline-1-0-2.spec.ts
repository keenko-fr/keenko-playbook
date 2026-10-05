/* oxlint-disable effect/noAsyncFunction -- Native Nx migrations return promises. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Inspect frozen release data.
import { readFileSync } from "node:fs";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { parseJson, readJson, serializeJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, Layer } from "effect";
import { describe, expect, test } from "vitest";

import { presetProgram } from "../generators/preset/preset.js";
import { packageVersions } from "../generators/versions.js";
import migration from "./compatibility-baseline-1-0-2.js";
import testingMigration from "./effect-testing-baseline-1-0-2.js";

type Slots = Record<"dependencies" | "devDependencies", Record<string, string>>;
const roles = parseJson<Record<string, Slots>>(readFileSync(new URL("files/compatibility-baseline-1-0-2.json", import.meta.url), "utf-8"));
const previous = parseJson<Record<string, Slots>>(
  readFileSync(new URL("files/effect-testing-baseline-1-0-2.json", import.meta.url), "utf-8")
);
const fixed = {
  backend: "packages/backend/package.json",
  root: "package.json",
  shared: "packages/shared/package.json",
  ui: "packages/ui/package.json",
};

describe("KEE-55 final compatibility tuple", () => {
  it.live("derives the frozen slots from fresh manifests", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      yield* presetProgram(tree, { name: "compatibility-tuple" });
      let count = 0;
      for (const [role, path] of Object.entries({ ...fixed, application: "apps/web/package.json" })) {
        const manifest = readJson<Slots>(tree, path);
        for (const section of ["dependencies", "devDependencies"] as const) {
          expect(
            Object.fromEntries(Object.entries(manifest[section] ?? {}).filter(([name]) => Object.hasOwn(packageVersions, name)))
          ).toEqual(roles[role][section]);
          count += Object.keys(manifest[section] ?? {}).filter((name) => Object.hasOwn(packageVersions, name)).length;
        }
        if (role !== "root") {
          expect(manifest.dependencies?.["@effect/vitest"]).toBeUndefined();
          expect(manifest.devDependencies?.["@effect/vitest"]).toBeUndefined();
          expect(manifest.devDependencies?.vitest).toBeUndefined();
        }
      }
      expect(count).toBe(76);
    }).pipe(E.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)))
  );

  test.each([["portal"], ["portal", "console"], ["portal", "console", "studio"]])(
    "converges %j after KEE-54 without rewriting history",
    async (...applications) => {
      const tree = createTreeWithEmptyWorkspace();
      const surfaces = [...Object.entries(fixed), ...applications.map((app) => ["application", `apps/${app}/package.json`])];
      for (const [role, path] of surfaces) tree.write(path, serializeJson({ ...previous[role], nx: { tags: ["type:app"] } }));
      tree.write(
        "oxfmt.config.ts",
        readFileSync(new URL("../generators/preset/files/root/oxfmt.config.ts.template", import.meta.url), "utf-8")
      );
      tree.write("bun.lock", "Bun owns the lockfile\n");
      const root = readJson<Slots>(tree, "package.json");
      root.dependencies["consumer-owned"] = "^1.0.0";
      root.dependencies.typescript = "custom";
      tree.write("package.json", serializeJson(root));
      await testingMigration(tree);
      expect(readJson<Slots>(tree, "package.json").devDependencies.typescript).toBe("6.0.2");
      await migration(tree);
      let count = 0;
      for (const [role, path] of surfaces) {
        const manifest = readJson<Slots>(tree, path);
        for (const section of ["dependencies", "devDependencies"] as const) {
          for (const [name, version] of Object.entries(roles[role][section])) expect(manifest[section][name]).toBe(version);
          count += Object.keys(roles[role][section]).length;
        }
      }
      expect(count).toBe(44 + 32 * applications.length);
      expect(readJson<Slots>(tree, "package.json").dependencies).toEqual({ "consumer-owned": "^1.0.0" });
      expect(tree.read("bun.lock", "utf-8")).toBe("Bun owns the lockfile\n");
      const before = tree.listChanges();
      await migration(tree);
      expect(tree.listChanges()).toEqual(before);
    }
  );

  test("rejects ambiguous application ownership atomically", async () => {
    const tree = createTreeWithEmptyWorkspace();
    for (const [role, path] of Object.entries(fixed)) tree.write(path, serializeJson(previous[role]));
    tree.write("apps/portal/package.json", serializeJson({ ...previous.application, nx: { tags: ["type:app", "type:lib"] } }));
    const before = tree.listChanges();
    await expect(async () => migration(tree)).rejects.toThrow("unambiguous application classification");
    expect(tree.listChanges()).toEqual(before);
  });
});
