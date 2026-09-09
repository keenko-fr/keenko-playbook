import { NodeFileSystem, NodePath, NodeServices } from "@effect/platform-node";
import {
  addDependenciesToPackageJson,
  generateFiles,
  installPackagesTask,
  readNxJson,
  updateJson,
  updateNxJson,
  type Tree,
} from "@nx/devkit";
import { Effect as E, HashSet as HS, Layer as L, Path, Schema as S, Struct } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { WorkspaceFailure } from "../errors.js";
import type { PackageJson } from "../helpers.js";
import { syncManagedState } from "../sync/managed-state.js";
import { packageVersions, runtimeVersions } from "../versions.js";
import { generateWeb } from "./helpers/apps-web.js";
import { generateBackend } from "./helpers/packages-backend.js";
import { generateShared } from "./helpers/packages-shared.js";
import { generateUi } from "./helpers/packages-ui.js";
import { generateShadcnFiles } from "./helpers/shadcn.js";
import { sPresetGeneratorSchema, type PresetGeneratorSchema } from "./schema.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
export const devDependencies = Struct.pick(packageVersions, [
  "@effect/tsgo",
  "@nx/oxlint",
  "@nx/vitest",
  "@typescript/native",
  "nx",
  "oxfmt",
  "oxlint",
  "oxlint-plugin-effect",
  "oxlint-tsgolint",
  "typescript",
  "ultracite",
  "vitest",
]);

export const generatedDriftCheck = `{ generated_drift="$(git status --porcelain --untracked-files=all -- apps/web/src/routeTree.gen.ts packages/backend/confect/_generated packages/backend/convex ':(exclude)packages/backend/convex/convex.config.ts' ':(exclude)packages/backend/convex/tsconfig.json')" || { generated_status=$?; printf 'Unable to inspect generated code with Git.\\n' >&2; exit "$generated_status"; }; if git rev-parse --verify HEAD >/dev/null 2>&1; then if [ -n "$generated_drift" ]; then printf 'Generated code has drifted:\\n%s\\n' "$generated_drift"; exit 1; fi; else head_ref="$(git symbolic-ref --quiet HEAD 2>/dev/null)" || { printf 'Unable to resolve Git HEAD as a commit or unborn main.\\n' >&2; exit 1; }; if [ "$head_ref" != "refs/heads/main" ]; then printf 'Unable to resolve Git HEAD as a commit or unborn main.\\n' >&2; exit 1; fi; git show-ref --verify --quiet refs/heads/main; main_ref_status=$?; if [ "$main_ref_status" -ne 1 ]; then printf 'Unable to resolve Git HEAD as a commit or unborn main.\\n' >&2; exit 1; fi; fi; }`;

export const scripts = {
  build: "nx run-many -t build",
  check: `nx sync:check && bun run codegen && ${generatedDriftCheck} && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`,
  codegen: "nx run-many -t codegen",
  dev: "nx run-many -t dev",
  format: "oxfmt .",
  "format:check": "oxfmt --check .",
  lint: "oxlint .",
  "lint:fix": "oxlint --fix .",
  prepare: "effect-tsgo patch --no-typescript --oxlint",
  test: "nx run-many -t test",
  typecheck: "nx run-many -t typecheck",
} satisfies Record<string, string>;

const managedRoots = HS.make("apps/web", "packages/backend", "packages/ui", "packages/shared");

// PROGRAM ---------------------------------------------------------------------------------------------------------------------------------
export const presetProgram = E.fn("keenko.preset.generate")(function* (tree: Tree, input: PresetGeneratorSchema) {
  const { name: workspace } = yield* S.decodeEffect(sPresetGeneratorSchema)(input);

  if (HS.some(managedRoots, (root) => tree.isFile(root) || tree.children(root).length > 0))
    return yield* new WorkspaceFailure({ issue: "target_occupied" });

  yield* generateWeb(tree, workspace);
  yield* generateShared(tree, workspace);
  yield* generateBackend(tree, workspace);
  yield* generateUi(tree, workspace);
  yield* generateShadcnFiles(tree, workspace);

  const path = yield* Path.Path;
  const rootFiles = yield* path.fromFileUrl(new URL("files/root", import.meta.url)).pipe(E.orDie);

  configureRootPackageJson(tree, workspace);
  configureNx(tree);
  generateFiles(tree, rootFiles, ".", { runtimeVersions });
  yield* syncManagedState(tree);
});

// GENERATOR -------------------------------------------------------------------------------------------------------------------------------
export default function presetGenerator(tree: Tree, options: PresetGeneratorSchema) {
  return E.runPromise(
    presetProgram(tree, options).pipe(
      E.as(() => {
        installPackagesTask(tree);
        return E.runPromise(materializeInitialGeneratedState(tree.root).pipe(E.provide(NodeServices.layer)));
      }),
      E.provide(L.mergeAll(NodeFileSystem.layer, NodePath.layer))
    )
  );
}

const materializeInitialGeneratedState = E.fn("keenko.preset.materializeInitialGeneratedState")(function* (workspace: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("bun", ["run", "codegen"], {
      cwd: workspace,
      stderr: "inherit",
      stdout: "inherit",
    })
  );

  if (exitCode !== 0) return yield* new WorkspaceFailure({ exitCode, issue: "initial_codegen_failed" });
});

// INTERNALS -------------------------------------------------------------------------------------------------------------------------------
const configureRootPackageJson = (tree: Tree, workspace: string) => {
  addDependenciesToPackageJson(tree, {}, devDependencies);
  updateJson<PackageJson>(tree, "package.json", (packageJson) => ({
    ...packageJson,
    engines: { ...packageJson.engines, bun: runtimeVersions.bunRange, node: runtimeVersions.nodeRange },
    name: workspace,
    nx: { ...packageJson.nx, includedScripts: [] },
    packageManager: `bun@${runtimeVersions.bun}`,
    private: true,
    scripts: { ...packageJson.scripts, ...scripts },
    type: "module",
    workspaces: ["apps/*", "packages/*"],
  }));
};

const configureNx = (tree: Tree) => {
  const nxJson = readNxJson(tree) ?? {};

  updateNxJson(tree, {
    ...nxJson,
    analytics: false,
    cli: { ...nxJson.cli, packageManager: "bun" },
    migrate: { ...nxJson.migrate, agentic: false, createCommits: false },
    plugins: [
      ...(nxJson.plugins ?? []),
      {
        exclude: ["apps/web/vite.config.ts"],
        options: { testMode: "run", testTargetName: "test" },
        plugin: "@nx/vitest",
      },
    ],
    sync: {
      ...nxJson.sync,
      globalGenerators: [...(nxJson.sync?.globalGenerators ?? []), "keenko:sync"],
    },
  });
};
