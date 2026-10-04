import type { Tree } from "@nx/devkit";

import { installAuthkitTestPatch } from "../compatibility/authkit-test.js";

export default function authkitTest102(tree: Tree) {
  installAuthkitTestPatch(tree);
}
