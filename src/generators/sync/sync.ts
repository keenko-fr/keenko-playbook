import { NodeFileSystem, NodePath } from "@effect/platform-node";
import type { Tree } from "@nx/devkit";
import { Effect as E, Layer as L } from "effect";

import { syncManagedState } from "./managed-state.js";

// PROGRAM ---------------------------------------------------------------------------------------------------------------------------------
export const syncProgram = E.fn("keenko.sync")(function* (tree: Tree) {
  yield* syncManagedState(tree);

  return {
    outOfSyncMessage: "Keenko guidance is out of sync. Run `bun x nx sync`.",
  };
});

// GENERATOR -------------------------------------------------------------------------------------------------------------------------------
export default function syncGenerator(tree: Tree) {
  return E.runPromise(syncProgram(tree).pipe(E.provide(L.mergeAll(NodeFileSystem.layer, NodePath.layer))));
}
