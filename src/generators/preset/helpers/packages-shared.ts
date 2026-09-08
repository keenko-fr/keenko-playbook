import { generateFiles, type Tree } from "@nx/devkit";
import { Effect as E, Path } from "effect";

// GENERATE --------------------------------------------------------------------------------------------------------------------------------
export const generateShared = E.fn("keenko.preset.generateShared")(function* (tree: Tree, workspace: string) {
  const path = yield* Path.Path;
  const source = yield* path.fromFileUrl(new URL("../files/shared", import.meta.url)).pipe(E.orDie);
  generateFiles(tree, source, "packages/shared", { workspace });
});
