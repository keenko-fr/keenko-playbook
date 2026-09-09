import { addDependenciesToPackageJson, generateFiles, type Tree } from "@nx/devkit";
import { Effect as E, Path, Struct } from "effect";

import { packageVersions } from "../../versions.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const dependencies = Struct.pick(packageVersions, ["@confect/core", "@confect/server", "convex", "effect"]);
const devDependencies = Struct.pick(packageVersions, [
  "@confect/cli",
  "@edge-runtime/vm",
  "@typescript/native",
  "convex-test",
  "typescript",
]);

// GENERATE --------------------------------------------------------------------------------------------------------------------------------
export const generateBackend = E.fn("keenko.preset.generateBackend")(function* (tree: Tree, workspace: string) {
  const path = yield* Path.Path;
  const source = yield* path.fromFileUrl(new URL("../files/backend", import.meta.url)).pipe(E.orDie);
  generateFiles(tree, source, "packages/backend", { workspace });
  addDependenciesToPackageJson(tree, dependencies, devDependencies, "packages/backend/package.json");
});
