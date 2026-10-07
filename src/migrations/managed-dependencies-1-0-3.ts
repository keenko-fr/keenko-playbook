/* oxlint-disable effect/noNewError, effect/noThrowStatement, effect/noNullish -- Native Nx reports malformed supported manifests before mutation. */
import { formatFiles, readJson, writeJson, type Tree } from "@nx/devkit";
import { Schema as S } from "effect";
import { FsTree } from "nx/src/generators/tree";

import type { PackageJson } from "../generators/helpers.js";
import { webDependencies, webDevDependencies } from "../generators/preset/helpers/apps-web.js";
import {
  dependencies as backendDependencies,
  devDependencies as backendDevDependencies,
} from "../generators/preset/helpers/packages-backend.js";
import { dependencies as sharedDependencies } from "../generators/preset/helpers/packages-shared.js";
import { dependencies as uiDependencies, devDependencies as uiDevDependencies } from "../generators/preset/helpers/packages-ui.js";
import { devDependencies as rootDevDependencies } from "../generators/preset/preset.js";
import { packageVersions } from "../generators/versions.js";

const sections = ["dependencies", "devDependencies"] as const;
const sManifest = S.Struct({
  dependencies: S.optionalKey(S.Record(S.String, S.String)),
  devDependencies: S.optionalKey(S.Record(S.String, S.String)),
});
const sClassification = S.Struct({ nx: S.optionalKey(S.Struct({ tags: S.optionalKey(S.Array(S.String)) })) });

// Current target-package preset maps own the tuple. N-1 sources select this
// boundary throughout the 1.0.3 line; no retired RC snapshot is loaded.
export default function managedDependencies103(tree: Tree) {
  const surfaces = new Map([
    ["package.json", { dependencies: {}, devDependencies: rootDevDependencies }],
    ["packages/backend/package.json", { dependencies: backendDependencies, devDependencies: backendDevDependencies }],
    [
      "packages/ui/package.json",
      {
        dependencies: { ...uiDependencies, react: packageVersions.react, "react-dom": packageVersions["react-dom"] },
        devDependencies: uiDevDependencies,
      },
    ],
    ["packages/shared/package.json", { dependencies: sharedDependencies, devDependencies: {} }],
  ]);
  for (const path of applications(tree)) surfaces.set(path, { dependencies: webDependencies, devDependencies: webDevDependencies });
  const writes = new Map<string, PackageJson>();
  for (const [path, slots] of surfaces) {
    if (!tree.exists(path)) throw new Error(`Keenko dependency migration requires the supported manifest: ${path}`);
    const manifest = readJson<PackageJson>(tree, path);
    S.decodeSync(sManifest)(manifest);
    if (converge(manifest, slots)) writes.set(path, manifest);
  }
  if (writes.size === 0) return;
  // Stage and format before copying changed manifests back. Bun owns bun.lock.
  const staged = new FsTree(tree.root, false);
  for (const change of tree.listChanges())
    if (change.type === "DELETE") staged.delete(change.path);
    else if (change.content !== null) staged.write(change.path, change.content, change.options);
  for (const [path, manifest] of writes) writeJson(staged, path, manifest);
  return formatFiles(staged, { sortRootTsconfigPaths: false }).then(() => {
    for (const path of writes.keys()) {
      const content = staged.read(path);
      if (content !== null) tree.write(path, content);
    }
  });
}

function applications(tree: Tree) {
  const paths: string[] = [];
  for (const app of tree.children("apps").toSorted()) {
    const path = `apps/${app}/package.json`;
    if (!tree.exists(path)) continue;
    const { nx } = S.decodeUnknownSync(sClassification)(readJson<{ nx?: unknown }>(tree, path));
    if (nx?.tags?.includes("type:app") !== true) continue;
    if (nx.tags.filter((tag) => tag.startsWith("type:")).length !== 1)
      throw new Error(`Keenko dependency migration requires unambiguous application classification: ${path}#nx.tags`);
    paths.push(path);
  }
  if (paths.length === 0) throw new Error("Keenko dependency migration requires a classified apps/* application");
  return paths;
}

function converge(manifest: PackageJson, slots: DependencySlots) {
  let changed = false;
  for (const section of sections) {
    const opposite = section === "dependencies" ? "devDependencies" : "dependencies";
    for (const [name, version] of Object.entries(slots[section])) {
      if (manifest[section]?.[name] === version && !Object.hasOwn(manifest[opposite] ?? {}, name)) continue;
      if (manifest[opposite]) Reflect.deleteProperty(manifest[opposite], name);
      manifest[section] ??= {};
      manifest[section][name] = version;
      changed = true;
    }
  }
  return changed;
}
interface DependencySlots {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}
