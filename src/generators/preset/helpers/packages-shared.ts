import { addDependenciesToPackageJson, generateFiles, type Tree } from "@nx/devkit";
import { Effect as E, Path, Struct } from "effect";

import { packageVersions } from "../../versions.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const dependencies = Struct.pick(packageVersions, ["effect"]);

// GENERATE --------------------------------------------------------------------------------------------------------------------------------
export const generateShared = E.fn("keenko.preset.generateShared")(function* (tree: Tree, workspace: string) {
  const path = yield* Path.Path;
  const source = yield* path.fromFileUrl(new URL("../files/shared", import.meta.url)).pipe(E.orDie);
  generateFiles(tree, source, "packages/shared", { workspace });
  addDependenciesToPackageJson(tree, dependencies, {}, "packages/shared/package.json");
});
