import type { Tree } from "@nx/devkit";

import { syncGuidance } from "../../guidance.ts";

export default function syncGenerator(tree: Tree) {
  syncGuidance(tree);
  return { outOfSyncMessage: "Keenko generated guidance is out of sync. Run 'nx sync'." };
}
