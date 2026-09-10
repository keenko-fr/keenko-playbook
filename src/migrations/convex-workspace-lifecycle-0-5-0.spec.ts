/* oxlint-disable effect/noAs, effect/noInlineProvide, effect/noUnsafeDictionaryType, typescript/no-unsafe-type-assertion -- Nx migration tests intentionally exercise untyped project JSON and provide platform services to in-memory generator fixtures. */
import { describe, expect, test } from "bun:test";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { readJson, writeJson, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, Layer as L, Option as O } from "effect";

import migrations from "../../migrations.json" with { type: "json" };
import { presetProgram } from "../generators/preset/preset.js";
import { packageVersions } from "../generators/versions.js";
import convexWorkspaceLifecycle050 from "./convex-workspace-lifecycle-0-5-0.js";

type JsonObject = Record<string, unknown>;

const platformLayer = L.merge(NodeFileSystem.layer, NodePath.layer);
const readText = (tree: Tree, path: string) => O.getOrThrow(O.fromNullishOr(tree.read(path, "utf-8")));
const snapshotChanges = (tree: Tree) => tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

const createPriorBaseline = () =>
  E.gen(function* () {
    const tree = createTreeWithEmptyWorkspace();
    yield* presetProgram(tree, { name: "migration-test" }).pipe(E.provide(platformLayer));

    const rootPackage = readJson<JsonObject>(tree, "package.json");
    const rootScripts = {
      ...(rootPackage.scripts as JsonObject),
      dev: "nx run-many -t dev",
    };
    const rootDevDependencies = {
      ...(rootPackage.devDependencies as JsonObject),
    };
    delete rootDevDependencies.convex;
    delete rootDevDependencies["@tanstack/react-start"];
    writeJson(tree, "package.json", {
      ...rootPackage,
      devDependencies: rootDevDependencies,
      scripts: rootScripts,
    });

    const backendPackage = readJson<JsonObject>(tree, "packages/backend/package.json");
    writeJson(tree, "packages/backend/package.json", {
      ...backendPackage,
      scripts: {
        ...(backendPackage.scripts as JsonObject),
        dev: 'bun run --parallel "dev:*"',
        "dev:confect": "confect dev",
        "dev:convex": "convex dev",
      },
    });

    tree.delete("convex.json");
    tree.write(".gitignore", "dist\n");
    tree.write("apps/web/vite.config.ts", readText(tree, "apps/web/vite.config.ts").replace("  envDir: '../..',\n", ""));
    tree.write(
      "apps/web/src/config/env.ts",
      readText(tree, "apps/web/src/config/env.ts").replace(
        "export const getPublicEnv = () => S.decodeUnknownSync(sPublicEnv)(import.meta.env);",
        "export const publicEnv = S.decodeUnknownSync(sPublicEnv)(import.meta.env);"
      )
    );
    tree.write(
      "apps/web/src/router.tsx",
      readText(tree, "apps/web/src/router.tsx")
        .replace('import { getPublicEnv } from "./config/env.ts";', 'import { publicEnv } from "./config/env.ts";')
        .replace("getPublicEnv().VITE_CONVEX_URL", "publicEnv.VITE_CONVEX_URL")
    );

    return tree;
  });

const runMigration = (tree: Tree) =>
  E.sync(() => {
    convexWorkspaceLifecycle050(tree);
  });

describe("0.5.0 Convex workspace lifecycle migration", () => {
  test("registers the migration at the 0.5.0 boundary", () => {
    expect(migrations.generators["0.5.0-convex-workspace-lifecycle"]).toEqual({
      description: "Move Convex integration and development orchestration to the workspace root while preserving backend source ownership.",
      factory: "./dist/migrations/convex-workspace-lifecycle-0-5-0",
      version: "0.5.0",
    });
  });

  test(
    "moves tracked integration surfaces to the workspace root without moving Convex source",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const convexSource = tree.read("packages/backend/convex/convex.config.ts", "utf-8");
          const webPackage = readJson<JsonObject>(tree, "apps/web/package.json");

          yield* runMigration(tree);

          const rootPackage = readJson<JsonObject>(tree, "package.json");
          const rootScripts = rootPackage.scripts as JsonObject;
          const rootDevDependencies = rootPackage.devDependencies as JsonObject;
          expect(rootScripts.dev).toBe('convex dev --start "nx run-many -t dev"');
          expect(rootDevDependencies.convex).toBe(packageVersions.convex);
          expect(rootDevDependencies["@tanstack/react-start"]).toBe((webPackage.dependencies as JsonObject)["@tanstack/react-start"]);

          expect(readJson<JsonObject>(tree, "packages/backend/package.json").scripts as JsonObject).toEqual({
            codegen: "confect codegen",
            dev: "confect dev",
          });
          expect(readJson(tree, "convex.json")).toEqual({
            $schema: "./node_modules/convex/schemas/convex.schema.json",
            functions: "packages/backend/convex",
          });
          expect(tree.read(".gitignore", "utf-8")).toContain("/.env.local\n");
          expect(tree.read("apps/web/vite.config.ts", "utf-8")).toMatch(/envDir:\s*["']\.\.\/\.\.["']/u);
          expect(tree.read("apps/web/src/config/env.ts", "utf-8")).toContain("export const getPublicEnv = () =>");
          expect(tree.read("apps/web/src/router.tsx", "utf-8")).toContain("getPublicEnv().VITE_CONVEX_URL");

          expect(tree.read("packages/backend/convex/convex.config.ts", "utf-8")).toBe(convexSource);
          expect(tree.exists("convex")).toBe(false);
          expect(tree.exists("apps/web/convex")).toBe(false);
          expect(tree.exists("apps/web/.env.local")).toBe(false);
        })
      ),
    15_000
  );

  test(
    "is idempotent once the workspace lifecycle is current",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          yield* runMigration(tree);
          const expected = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

          yield* runMigration(tree);

          expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(expected);
        })
      ),
    15_000
  );

  test(
    "rejects package-local deployment state before changing tracked files",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const expectedPackage = tree.read("package.json", "utf-8");
          tree.write("apps/web/.env.local", "VITE_CONVEX_URL=https://example.convex.cloud\n");

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("Legacy package-local state exists");
          expect(tree.read("package.json", "utf-8")).toBe(expectedPackage);
          expect(tree.exists("convex.json")).toBe(false);
        })
      ),
    15_000
  );

  test(
    "rejects customized development orchestration before partial writes",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const rootPackage = readJson<JsonObject>(tree, "package.json");
          writeJson(tree, "package.json", {
            ...rootPackage,
            scripts: {
              ...(rootPackage.scripts as JsonObject),
              dev: "custom-dev",
            },
          });
          const expectedPackage = tree.read("package.json", "utf-8");

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("conflicts with the 0.5.0 Convex workspace lifecycle");
          expect(tree.read("package.json", "utf-8")).toBe(expectedPackage);
          expect(tree.exists("convex.json")).toBe(false);
        })
      ),
    15_000
  );

  test(
    "rejects project-owned backend dev participants before partial writes",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const backendPackage = readJson<JsonObject>(tree, "packages/backend/package.json");
          writeJson(tree, "packages/backend/package.json", {
            ...backendPackage,
            scripts: {
              ...(backendPackage.scripts as JsonObject),
              "dev:worker": "bun run worker",
            },
          });
          const expectedPackage = tree.read("package.json", "utf-8");

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("dev:worker");
          expect(tree.read("package.json", "utf-8")).toBe(expectedPackage);
          expect(tree.exists("convex.json")).toBe(false);
        })
      ),
    15_000
  );

  test(
    "rejects a removed canonical Confect development participant before mutation",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const backendPackage = readJson<JsonObject>(tree, "packages/backend/package.json");
          const scripts = { ...(backendPackage.scripts as JsonObject) };
          delete scripts["dev:confect"];
          writeJson(tree, "packages/backend/package.json", { ...backendPackage, scripts });
          const expected = snapshotChanges(tree);

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("scripts.dev:confect");
          expect(snapshotChanges(tree)).toEqual(expected);
        })
      ),
    15_000
  );

  test(
    "rejects a removed canonical Convex development participant before mutation",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const backendPackage = readJson<JsonObject>(tree, "packages/backend/package.json");
          const scripts = { ...(backendPackage.scripts as JsonObject) };
          delete scripts["dev:convex"];
          writeJson(tree, "packages/backend/package.json", { ...backendPackage, scripts });
          const expected = snapshotChanges(tree);

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("scripts.dev:convex");
          expect(snapshotChanges(tree)).toEqual(expected);
        })
      ),
    15_000
  );

  test(
    "rejects package-local Convex configuration before partial writes",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const expectedPackage = tree.read("package.json", "utf-8");
          tree.write("packages/backend/convex.json", '{"node":{"nodeVersion":"24"}}\n');

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("cannot safely infer how its project-relative settings should merge");
          expect(tree.read("package.json", "utf-8")).toBe(expectedPackage);
          expect(tree.exists("convex.json")).toBe(false);
        })
      ),
    15_000
  );

  test(
    "rejects project-owned publicEnv consumers before partial writes",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const expectedPackage = tree.read("package.json", "utf-8");
          tree.write(
            "apps/web/src/project-owned.ts",
            'import { publicEnv } from "./config/env.ts";\n\nexport const deploymentUrl = publicEnv.VITE_CONVEX_URL;\n'
          );

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("apps/web/src/project-owned.ts");
          expect(tree.read("package.json", "utf-8")).toBe(expectedPackage);
          expect(tree.exists("convex.json")).toBe(false);
        })
      ),
    15_000
  );

  test(
    "rejects a publicEnv barrel re-export before mutation",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          tree.write("apps/web/src/config/index.ts", 'export * from "./env.ts";\n');
          tree.write(
            "apps/web/src/project-owned.ts",
            'import { publicEnv } from "./config";\n\nexport const deploymentUrl = publicEnv.VITE_CONVEX_URL;\n'
          );
          const expected = snapshotChanges(tree);

          expect(() => {
            convexWorkspaceLifecycle050(tree);
          }).toThrow("apps/web/src/config/index.ts");
          expect(snapshotChanges(tree)).toEqual(expected);
        })
      ),
    15_000
  );

  test(
    "adds top-level Vite envDir when comments and nested objects mention envDir",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = yield* createPriorBaseline();
          const viteConfig = readText(tree, "apps/web/vite.config.ts").replace(
            "const config = defineConfig({",
            'const unrelated = { envDir: "../.." };\n// envDir: "../.." is intentionally unrelated.\nconst config = defineConfig({\n  nested: { envDir: "../.." },'
          );
          tree.write("apps/web/vite.config.ts", viteConfig);

          yield* runMigration(tree);

          expect(readText(tree, "apps/web/vite.config.ts")).toContain(
            'const config = defineConfig({\n  envDir: "../..",\n  nested: { envDir: "../.." },'
          );
        })
      ),
    15_000
  );
});
