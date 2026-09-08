import type { Tree } from "@nx/devkit";
import type { PackageJson as NxPackageJson } from "@nx/devkit/internal";

// DELETE TREE DIRECTORY -------------------------------------------------------------------------------------------------------------------
export const deleteTreeDirectory = (tree: Tree, root: string): void => {
  if (tree.isFile(root)) {
    tree.delete(root);
    return;
  }
  for (const child of tree.children(root)) deleteTreeDirectory(tree, `${root}/${child}`);
};

//TYPES -----------------------------------------------------------------------------------------------------------------------------------
export type PackageJson = NxPackageJson & { engines?: Record<string, string>; imports?: Record<string, string> };
