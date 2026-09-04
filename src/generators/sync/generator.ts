import type { Tree } from "@nx/devkit";

import { syncGuidance } from "../../guidance.ts";

export default function syncGenerator(tree: Tree) {
  syncGuidance(tree);
}
