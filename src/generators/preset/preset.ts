import { NodeFileSystem, NodePath } from "@effect/platform-node";
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
  "@typescript/native",
  "nx",
  "oxfmt",
  "oxlint",
  "oxlint-plugin-effect",
  "oxlint-tsgolint",
  "typescript",
  "ultracite",
]);

export const scripts = {
  build: "nx run-many -t build",
  check: "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build",
  codegen: "nx run-many -t codegen",
  "codegen:check": "keenko-codegen-check",
  dev: "nx run-many -t dev",
  format: "oxfmt .",
  "format:check": "oxfmt --check .",
  lint: "oxlint .",
  "lint:fix": "oxlint --fix .",
  prepare: "effect-tsgo patch --no-typescript --oxlint",
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
      }),
      E.provide(L.mergeAll(NodeFileSystem.layer, NodePath.layer))
    )
  );
}

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
    sync: {
      ...nxJson.sync,
      globalGenerators: [...(nxJson.sync?.globalGenerators ?? []), "keenko:sync"],
    },
  });
};
