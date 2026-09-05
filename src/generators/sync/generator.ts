import type { Tree } from "@nx/devkit";

import { syncGuidance } from "../../guidance.ts";
import { verifyWorkspaceManifestDependencies } from "../../workspace-dependencies.ts";

export default function syncGenerator(tree: Tree) {
  verifyWorkspaceManifestDependencies(tree);
  syncGuidance(tree);
  return { outOfSyncMessage: "Keenko generated guidance is out of sync. Run 'bun x nx sync'." };
}
