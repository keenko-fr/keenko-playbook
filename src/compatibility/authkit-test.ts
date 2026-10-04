/* oxlint-disable effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement -- Native Nx validates this one version-specific compatibility patch before writing consumer state. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- This asset ships in the packed Keenko artifact.
import { readFileSync } from "node:fs";

import { readJson, writeJson, type Tree } from "@nx/devkit";

import type { PackageJson } from "../generators/helpers.js";

export const authkitPatchKey = "@convex-dev/workos-authkit@0.2.10";
export const authkitPatchPath = "patches/keenko-workos-authkit-0.2.10.patch";
const patch = readFileSync(new URL("files/workos-authkit-0.2.10.patch", import.meta.url), "utf-8");

// KEE-53 owns only this mapping and asset. Remove them with a focused migration
// when an upstream-fixed AuthKit version replaces 0.2.10; unrelated patches stay project-owned.
export function installAuthkitTestPatch(tree: Tree) {
  const manifest = readJson<PackageJson & { patchedDependencies?: Record<string, string> }>(tree, "package.json");
  const patches = manifest.patchedDependencies;
  const existing = tree.read(authkitPatchPath, "utf-8");
  if (
    (patches !== undefined && (patches === null || typeof patches !== "object" || Array.isArray(patches))) ||
    (patches?.[authkitPatchKey] !== undefined && patches[authkitPatchKey] !== authkitPatchPath) ||
    (existing !== null && existing !== patch)
  )
    throw new Error(
      `KEE-53 AuthKit test compatibility conflicts with ${authkitPatchKey} or ${authkitPatchPath}. Reconcile the custom patch before rerunning the migration.`
    );

  if (existing === null) tree.write(authkitPatchPath, patch);
  if (patches?.[authkitPatchKey] !== authkitPatchPath) {
    manifest.patchedDependencies = { ...patches, [authkitPatchKey]: authkitPatchPath };
    writeJson(tree, "package.json", manifest);
  }
}
