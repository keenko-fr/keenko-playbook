import type { Tree } from "@nx/devkit";
import type { PackageJson as NxPackageJson } from "@nx/devkit/internal";
import { Option as O } from "effect";

// DELETE TREE DIRECTORY -------------------------------------------------------------------------------------------------------------------
export const deleteTreeDirectory = (tree: Tree, root: string): void => {
  if (tree.isFile(root)) {
    tree.delete(root);
    return;
  }
  for (const child of tree.children(root)) deleteTreeDirectory(tree, `${root}/${child}`);
};

// REPLACE EXPECTED ------------------------------------------------------------------------------------------------------------------------
export const replaceExpected = (source: string, expected: string, replacement: string) => {
  const first = source.indexOf(expected);
  return first === -1 || source.includes(expected, first + 1) ? O.none() : O.some(source.replace(expected, replacement));
};

//TYPES -----------------------------------------------------------------------------------------------------------------------------------
export type PackageJson = NxPackageJson & { engines?: Record<string, string>; imports?: Record<string, string> };
