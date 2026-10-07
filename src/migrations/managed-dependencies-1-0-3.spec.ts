import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { readJson, updateJson, writeJson, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, Layer as L, Option as O } from "effect";
import { describe, expect } from "vitest";

import type { PackageJson } from "../generators/helpers.js";
import { presetProgram } from "../generators/preset/preset.js";
import migrate from "./managed-dependencies-1-0-3.js";

const fixture = E.gen(function* () {
  const tree = createTreeWithEmptyWorkspace();
  yield* presetProgram(tree, { name: "supported" });
  tree.delete(".oxfmtrc.json");
  tree.write("bun.lock", "Bun-owned lockfile");
  return tree;
}).pipe(E.provide(L.mergeAll(NodeFileSystem.layer, NodePath.layer)));
const run = (tree: Tree) =>
  E.suspend(() => O.match(O.fromUndefinedOr(migrate(tree)), { onNone: () => E.void, onSome: (result) => E.promise(() => result) }));
const paths = [
  "package.json",
  "apps/web/package.json",
  "packages/backend/package.json",
  "packages/ui/package.json",
  "packages/shared/package.json",
];

describe("current supported managed dependency convergence", () => {
  it.live(
    "repairs changed, moved, deleted and duplicate slots across every role, preserves unrelated state and reruns without writes",
    () =>
      E.gen(function* () {
        const tree = yield* fixture;
        const canonical = Object.fromEntries(paths.map((path) => [path, readJson<PackageJson>(tree, path)]));
        for (const path of paths)
          updateJson<PackageJson>(tree, path, (manifest) => {
            const section = Object.keys(manifest.devDependencies ?? {}).length > 0 ? "devDependencies" : "dependencies";
            const opposite = section === "dependencies" ? "devDependencies" : "dependencies";
            const entries = manifest[section] ?? {};
            manifest[section] = entries;
            const names = Object.keys(entries).filter((name) => !name.startsWith("@supported/"));
            entries[names[0]] = "consumer-changed";
            if (names[1]) {
              manifest[opposite] = { ...manifest[opposite], [names[1]]: entries[names[1]] };
              Reflect.deleteProperty(entries, names[1]);
            }
            if (names[2]) Reflect.deleteProperty(entries, names[2]);
            if (names[3]) manifest[opposite] = { ...manifest[opposite], [names[3]]: "duplicate" };
            manifest.dependencies = { ...manifest.dependencies, "consumer-owned": "^7.0.0" };
            manifest.scripts = { ...manifest.scripts, custom: "owned" };
            return manifest;
          });
        yield* run(tree);
        for (const path of paths) {
          const actual = readJson<PackageJson>(tree, path);
          const expected = canonical[path];
          expect(actual).toEqual({
            ...expected,
            dependencies: { ...expected.dependencies, "consumer-owned": "^7.0.0" },
            scripts: { ...expected.scripts, custom: "owned" },
          });
        }
        expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned lockfile");
        const changes = tree.listChanges();
        yield* run(tree);
        expect(tree.listChanges()).toEqual(changes);
      })
  );

  it.live("leaves already canonical manifests byte-identical", () =>
    E.gen(function* () {
      const tree = yield* fixture;
      const before = tree.listChanges();
      yield* run(tree);
      expect(tree.listChanges()).toEqual(before);
    })
  );

  it.live("prevalidates every manifest before applying a repair", () =>
    E.gen(function* () {
      const tree = yield* fixture;
      updateJson<PackageJson>(tree, "package.json", (manifest) => ({ ...manifest, devDependencies: {} }));
      tree.write("packages/shared/package.json", '{"dependencies":null}');
      const before = tree.listChanges();
      expect(() => migrate(tree)).toThrow();
      expect(tree.listChanges()).toEqual(before);
    })
  );

  it.live("replicates the application tuple to renamed and sibling classified apps", () =>
    E.gen(function* () {
      const tree = yield* fixture;
      const expected = readJson<PackageJson>(tree, "apps/web/package.json");
      tree.rename("apps/web/package.json", "apps/portal/package.json");
      writeJson(tree, "apps/admin/package.json", {
        dependencies: {
          ...Object.fromEntries(Object.entries(expected.dependencies ?? {}).filter(([name]) => name.startsWith("@supported/"))),
          "consumer-owned": "^7.0.0",
        },
        nx: { tags: ["type:app"] },
      });
      yield* run(tree);
      const admin = readJson<PackageJson>(tree, "apps/admin/package.json");
      expect(admin.dependencies).toEqual({ ...expected.dependencies, "consumer-owned": "^7.0.0" });
      expect(admin.devDependencies).toEqual(expected.devDependencies);
      expect(readJson(tree, "apps/portal/package.json")).toEqual(expected);
    })
  );
});
