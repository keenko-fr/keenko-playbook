import type { Tree } from "@nx/devkit";
import { generateFiles } from "@nx/devkit";
import { Effect as E, Path } from "effect";

// GENERATE --------------------------------------------------------------------------------------------------------------------------------
export const generateShadcnFiles = E.fn("keenko.preset.generateShadcnFiles")(function* (tree: Tree, workspace: string) {
  const path = yield* Path.Path;
  const source = yield* path.fromFileUrl(new URL("../files/shadcn", import.meta.url)).pipe(E.orDie);
  generateFiles(tree, source, ".", { workspace });
});
