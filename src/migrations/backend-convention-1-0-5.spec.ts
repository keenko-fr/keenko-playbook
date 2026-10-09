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
          "\n  ],\n  plugins:",
          '\n    { files: ["packages/backend/**/*.ts", "packages/shared/**/*.ts"], rules: { "typescript/consistent-type-definitions": "off" } },\n  ],\n  plugins:'
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
      tree.write(
        compilerPath,
        `{
          "extends": "../../tsconfig.base.json",
          "include": ["**/*.ts"],
          "exclude": ["", "test/**", "node_modules", "convex/_generated/**", "../ui/**", "domain.ts", "errors.json", "!domain/**", "{domain,errors}/**", "[de]omain/**"]
        }`
      );
      const compiler = tree.read(compilerPath, "utf-8");
      yield* run(tree);
      expect(tree.read(compilerPath, "utf-8")).toBe(compiler);
      const before = tree.listChanges();
      yield* run(tree);
      expect(tree.listChanges()).toEqual(before);
    })
  );

  for (const [name, lint, unchanged] of [
    [
      "common Effect override",
      releasedLint.replace('["packages/backend/**/*.ts"]', '["packages/backend/**/*.ts", "packages/shared/**/*.ts"]'),
      false,
    ],
    [
      "common override already off",
      releasedLint
        .replace('["packages/backend/**/*.ts"]', '["packages/backend/**/*.ts", "packages/shared/**/*.ts"]')
        .replace('"no-use-before-define": "off",', '"no-use-before-define": "off", "typescript/consistent-type-definitions": "off",'),
      true,
    ],
    [
      "separate Effect overrides",
      releasedLint.replace(
        "overrides: [",
        'overrides: [{ files: ["packages/shared/**/*.ts"], rules: { "effect/noThrowStatement": "error", "eslint/no-unused-vars": "off" } },'
      ),
      false,
    ],
    [
      "separate overrides already off",
      releasedLint
        .replace('"no-use-before-define": "off",', '"no-use-before-define": "off", "typescript/consistent-type-definitions": 0,')
        .replace(
          "overrides: [",
          'overrides: [{ files: ["packages/shared/**/*.ts"], rules: { "typescript/consistent-type-definitions": ["off"] } },'
        ),
      true,
    ],
    [
      "published RC backend-only policy",
      releasedLint.replace(
        '"no-use-before-define": "off",',
        '"no-use-before-define": "off", "typescript/consistent-type-definitions": "off",'
      ),
      false,
    ],
    ...[
      '["apps/**", "packages/ui/**"]',
      '["./packages/ui/**", "packages/backend-tools/**"]',
      '["packages/{ui,docs}/**", "scripts/**/*.ts"]',
      "[]",
    ].map(
      (exclude) =>
        [
          `common override with foreign excludeFiles ${exclude}`,
          releasedLint
            .replace('["packages/backend/**/*.ts"]', '["packages/backend/**/*.ts", "packages/shared/**/*.ts"]')
            .replace("rules: {\n        ...effectRules", `excludeFiles: ${exclude}, rules: {\n        ...effectRules`)
            .replace('"no-use-before-define": "off",', '"no-use-before-define": "off", "typescript/consistent-type-definitions": "off",'),
          true,
        ] as const
    ),
    [
      "separate overrides with foreign excludeFiles",
      releasedLint
        .replace("rules: {\n        ...effectRules", 'excludeFiles: ["packages/ui/**"], rules: {\n        ...effectRules')
        .replace('"no-use-before-define": "off",', '"no-use-before-define": "off", "typescript/consistent-type-definitions": "off",')
        .replace(
          "overrides: [",
          'overrides: [{ files: ["packages/shared/**/*.ts"], excludeFiles: ["apps/**"], rules: { "typescript/consistent-type-definitions": "off" } },'
        ),
      true,
    ],
    [
      "separate overrides with excludeFiles outside their respective scopes",
      releasedLint
        .replace("rules: {\n        ...effectRules", 'excludeFiles: ["packages/shared/**"], rules: {\n        ...effectRules')
        .replace('"no-use-before-define": "off",', '"no-use-before-define": "off", "typescript/consistent-type-definitions": "off",')
        .replace(
          "overrides: [",
          'overrides: [{ files: ["packages/shared/**/*.ts"], excludeFiles: ["packages/backend/**"], rules: { "typescript/consistent-type-definitions": "off" } },'
        ),
      true,
    ],
  ] as const)
    it.live(`preserves ${name} and converges both packages without splitting overrides`, () =>
      E.gen(function* () {
        const tree = yield* fixture;
        tree.write(lintPath, `// Consumer comment\n${lint}`);
        const before = tree.read(lintPath, "utf-8");
        yield* run(tree);
        const after = tree.read(lintPath, "utf-8");
        if (unchanged) expect(after).toBe(before);
        else {
          const insertion = after?.slice(
            after.indexOf("    { files:", after.lastIndexOf('"unicorn/throw-new-error"')),
            after.indexOf("\n  ],\n  plugins:")
          );
          expect(after?.replace(`\n${insertion}`, "")).toBe(before);
        }
        expect(after).toContain("...effectRules");
        expect(after).toContain("...effectTsgoRecommended.rules");
        expect(after).toContain('["apps/**/*.{ts,tsx}"]');
        expect(after).toContain('["packages/shared/src/index.ts"]');
        if (name.includes("excludeFiles")) expect(after).toContain("excludeFiles:");
        const changes = tree.listChanges();
        yield* run(tree);
        expect(tree.listChanges()).toEqual(changes);
      })
    );

  for (const [name, configure] of [
    ...[
      ["."],
      [".."],
      ["../.."],
      ["../backend"],
      ["domain/**"],
      ["errors/**"],
      ["**/domain/**", "**/errors/**"],
      ["./**/domain/**"],
      ["**/domain"],
      ["**/errors/"],
      ["d?main/**"],
      ["*rrors/**/*.ts"],
      ["**/*.ts"],
      ["**/*"],
      ["**"],
      ["domain/nested/**"],
      ["**/*.spec.ts"],
      ["../backend/errors/**"],
      ["../../packages/backend/domain/**"],
      [".\\errors\\**"],
      ["DOMAIN/**"],
      ["/consumer/packages/backend/domain/**"],
    ].map(
      (exclude) =>
        [
          `compiler exclusion ${exclude.join(", ")}`,
          (tree: Tree) => {
            updateJson<CompilerConfig>(tree, compilerPath, (config) => ({
              ...config,
              compilerOptions: { noUnusedParameters: true },
              exclude,
            }));
          },
        ] as const
    ),
    ...[
      'files: ["packages/shared/**/*.ts"], rules: { "typescript/consistent-type-definitions": "error" }',
      'files: ["packages/backend/**/*.ts", "packages/shared/**/*.ts"], rules: { "typescript/consistent-type-definitions": "warn" }',
      'files: ["packages/shared/src/**/*.ts"], rules: { "typescript/consistent-type-definitions": "error" }',
      'files: ["packages/shared/**/*.ts"], rules: customRules',
      'files: ["packages/shared/**/*.ts"], rules: { ...customRules }',
      ...[
        '["packages/backend/domain/**/*.ts"]',
        '["packages/shared/src/nested/**/*.ts"]',
        '["**/*.test.ts"]',
        '["*.ts"]',
        '["packages/{ui,backend}/**"]',
        '["./packages/shared/**"]',
        '["packages/ui/../backend/**"]',
        '["/consumer/packages/backend/**"]',
        '["!packages/ui/**"]',
        "consumerExclusions",
        "[42]",
      ].map(
        (exclude) =>
          `files: ["packages/backend/**/*.ts", "packages/shared/**/*.ts"], excludeFiles: ${exclude}, rules: { "typescript/consistent-type-definitions": "off" }`
      ),
      'files: ["packages/backend/**/*.ts"], excludeFiles: ["packages/backend/domain/**/*.ts"], rules: { "typescript/consistent-type-definitions": "off" }',
      'files: ["packages/shared/**/*.ts"], excludeFiles: ["packages/shared/src/**/*.ts"], rules: { "typescript/consistent-type-definitions": "off" }',
    ].map(
      (override) =>
        [
          `ambiguous or contradictory shared override ${override}`,
          (tree: Tree) => {
            tree.write(lintPath, releasedLint.replace("overrides: [", `overrides: [{ ${override} },`));
          },
        ] as const
    ),
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
      "contradictory duplicate backend overrides",
      (tree: Tree) => {
        tree.write(
          lintPath,
          releasedLint.replace(
            "overrides: [",
            'overrides: [{ files: ["packages/backend/**/*.ts"], rules: { "typescript/consistent-type-definitions": "error" } },'
          )
        );
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
        updateJson<PackageJson>(tree, "package.json", (manifest) => ({
          ...manifest,
          dependencies: { ...manifest.dependencies, "consumer-owned": "^7.0.0" },
          devDependencies: {},
        }));
        const before = tree.listChanges();
        const result = yield* E.exit(run(tree));
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const message = Cause.pretty(result.cause);
          expect(message).toContain("reconcile the backend convention manually");
          if (name.startsWith("compiler exclusion")) {
            expect(message).toContain(`${compilerPath}#exclude`);
            expect(message).toContain("may exclude domain/ or errors/");
          }
          if (name.includes("excludeFiles")) expect(message).toContain(`${lintPath}#excludeFiles`);
        }
        expect(tree.listChanges()).toEqual(before);
      })
    );
});
