// oxlint-disable-next-line effect/noNodeBuiltinImport -- Frozen published Nx configuration fixtures use the native file reader.
import { readFileSync } from "node:fs";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { parseJson, readJson, updateJson, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Cause, Effect as E, Exit, Layer as L } from "effect";
import { describe, expect } from "vitest";

import type { PackageJson } from "../generators/helpers.js";
import { presetProgram } from "../generators/preset/preset.js";
import { packageVersions } from "../generators/versions.js";
import migrate from "./backend-convention-1-0-5.js";

interface CompilerConfig {
  include: string[];
  compilerOptions?: Record<string, boolean>;
  exclude?: string[];
}

const compilerPath = "packages/backend/tsconfig.json";
const lintPath = "oxlint.config.ts";
// Frozen published 1.0.4 assets, not the current preset under test.
const releasedCompiler = readFileSync("tests/fixtures/backend-convention-1-0-4/tsconfig.json", "utf-8");
const releasedLint = readFileSync("tests/fixtures/backend-convention-1-0-4/oxlint.config.ts.txt", "utf-8");
const fixture = E.gen(function* () {
  const tree = createTreeWithEmptyWorkspace();
  yield* presetProgram(tree, { name: "supported" });
  tree.delete(".oxfmtrc.json");
  tree.write(compilerPath, releasedCompiler);
  tree.write(lintPath, releasedLint);
  tree.write("bun.lock", "Bun-owned");
  tree.write("packages/backend/data/owned.ts", "consumer data");
  tree.write("packages/backend/features/owned.ts", "consumer feature");
  return tree;
}).pipe(E.provide(L.mergeAll(NodeFileSystem.layer, NodePath.layer)));
const run = (tree: Tree) => E.promise(() => migrate(tree));

describe("1.0.5 backend convention migration", () => {
  it.live("extends published configuration, repairs dependencies and preserves consumer state on rerun", () =>
    E.gen(function* () {
      const tree = yield* fixture;
      const compiler = `// Consumer compiler comment\n${releasedCompiler}`;
      const lint = `// Consumer lint comment\n${releasedLint}`;
      tree.write(compilerPath, compiler);
      tree.write(lintPath, lint);
      updateJson<CompilerConfig>(tree, compilerPath, (config) => ({ ...config, compilerOptions: { noUnusedParameters: true } }));
      tree.write(compilerPath, `// Consumer compiler comment\n${tree.read(compilerPath, "utf-8")}`);
      const configuredCompiler = tree.read(compilerPath, "utf-8");
      updateJson<PackageJson>(tree, "package.json", (manifest) => ({
        ...manifest,
        dependencies: { ...manifest.dependencies, "consumer-owned": "^7.0.0" },
        devDependencies: { ...manifest.devDependencies, oxfmt: "consumer-changed" },
      }));
      yield* run(tree);
      const config = readJson<CompilerConfig>(tree, compilerPath);
      expect(config.include).toEqual([...parseJson<CompilerConfig>(releasedCompiler).include, "domain/**/*.ts", "errors/**/*.ts"]);
      expect(config.compilerOptions).toEqual({ noUnusedParameters: true });
      expect(tree.read(compilerPath, "utf-8")).toBe(
        configuredCompiler?.replace('"test/**/*.ts"', '"test/**/*.ts",\n    "domain/**/*.ts",\n    "errors/**/*.ts"')
      );
      expect(tree.read(lintPath, "utf-8")).toBe(
        lint.replace(
          '"typescript/promise-function-async": "off",',
          '"typescript/consistent-type-definitions": "off",\n        "typescript/promise-function-async": "off",'
        )
      );
      expect(readJson<PackageJson>(tree, "package.json").devDependencies?.oxfmt).toBe(packageVersions.oxfmt);
      expect(readJson<PackageJson>(tree, "package.json").dependencies?.["consumer-owned"]).toBe("^7.0.0");
      expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned");
      expect(tree.read("packages/backend/data/owned.ts", "utf-8")).toBe("consumer data");
      expect(tree.read("packages/backend/features/owned.ts", "utf-8")).toBe("consumer feature");
      const changes = tree.listChanges();
      yield* run(tree);
      expect(tree.listChanges()).toEqual(changes);
    })
  );

  it.live("leaves current and broadly inclusive compiler configurations unchanged", () =>
    E.gen(function* () {
      const tree = yield* fixture;
      tree.write(compilerPath, '{ "extends": "../../tsconfig.base.json", "include": ["**/*.ts"] }');
      const compiler = tree.read(compilerPath, "utf-8");
      yield* run(tree);
      expect(tree.read(compilerPath, "utf-8")).toBe(compiler);
      const before = tree.listChanges();
      yield* run(tree);
      expect(tree.listChanges()).toEqual(before);
    })
  );

  for (const [name, configure] of [
    [
      "customized backend rule",
      (tree: Tree) => {
        tree.write(
          lintPath,
          releasedLint.replace(
            '"no-use-before-define": "off",',
            '"no-use-before-define": "off",\n        "typescript/consistent-type-definitions": "error",'
          )
        );
      },
    ],
    [
      "computed overrides",
      (tree: Tree) => {
        tree.write(lintPath, releasedLint.replace("overrides: [", "overrides: [...custom,"));
      },
    ],
    [
      "duplicate backend overrides",
      (tree: Tree) => {
        tree.write(lintPath, releasedLint.replace("overrides: [", 'overrides: [{ files: ["packages/backend/**/*.ts"], rules: {} },'));
      },
    ],
    [
      "excluded domain",
      (tree: Tree) => {
        updateJson<CompilerConfig>(tree, compilerPath, (config) => ({ ...config, exclude: ["domain/**"] }));
      },
    ],
    [
      "invalid includes",
      (tree: Tree) => {
        tree.write(compilerPath, '{"include":[42]}');
      },
    ],
    [
      "excluded default owner",
      (tree: Tree) => {
        tree.write(compilerPath, '{"exclude":["errors/**"]}');
      },
    ],
    [
      "malformed compiler JSON",
      (tree: Tree) => {
        tree.write(compilerPath, '{"include": [');
      },
    ],
    [
      "competing backend rule",
      (tree: Tree) => {
        tree.write(
          lintPath,
          releasedLint.replace(
            "overrides: [",
            'overrides: [{ files: ["**/*.ts"], rules: {"typescript/consistent-type-definitions": "error"} },'
          )
        );
      },
    ],
  ] as const)
    it.live(`rejects ${name} before dependency or configuration writes`, () =>
      E.gen(function* () {
        const tree = yield* fixture;
        configure(tree);
        updateJson<PackageJson>(tree, "package.json", (manifest) => ({ ...manifest, devDependencies: {} }));
        const before = tree.listChanges();
        const result = yield* E.exit(run(tree));
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) expect(Cause.pretty(result.cause)).toContain("reconcile the backend convention manually");
        expect(tree.listChanges()).toEqual(before);
      })
    );
});
