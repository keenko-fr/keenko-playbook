/* oxlint-disable effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnsafeDictionaryType -- Native Nx migrations synchronously validate and transform manifest slots, reporting malformed input before mutation. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Read the immutable dependency-slot snapshot shipped with this release migration.
import { readFileSync } from "node:fs";

import { formatFiles, parseJson, readJson, writeJson, type Tree } from "@nx/devkit";
import { FsTree } from "nx/src/generators/tree";
import * as ts from "typescript";

import type { PackageJson } from "../generators/helpers.js";

type DependencyRole = "root" | "application" | "backend" | "ui" | "shared";
type DependencySlots = Record<DependencyRole, Record<"dependencies" | "devDependencies", Record<string, string>>>;
const formatterPath = "oxfmt.config.ts";
const nativeInstructionsIgnore = "tools/ai-migrations/**";
const sections: readonly ("dependencies" | "devDependencies")[] = ["dependencies", "devDependencies"];

// Frozen rc.4 slots. Historical migrations keep their original snapshots.
const target = parseJson<DependencySlots>(readFileSync(new URL("files/effect-testing-baseline-1-0-2.json", import.meta.url), "utf-8"));

export default function effectTestingBaseline102(tree: Tree) {
  const surfaces: [string, DependencyRole][] = [
    ["package.json", "root"],
    ...applicationManifests(tree).map((path): [string, DependencyRole] => [path, "application"]),
    ["packages/backend/package.json", "backend"],
    ["packages/ui/package.json", "ui"],
    ["packages/shared/package.json", "shared"],
  ];
  const writes = new Map<string, PackageJson>();
  for (const [path, role] of surfaces) {
    if (!tree.exists(path)) throw new Error(`KEE-54 dependency migration requires the supported workspace manifest: ${path}`);
    const manifest = readJson<PackageJson>(tree, path);
    for (const section of sections) {
      const entries = manifest[section];
      if (entries !== undefined && (entries === null || typeof entries !== "object" || Array.isArray(entries)))
        throw new Error(`KEE-54 dependency migration requires an object in ${path}#${section}`);
    }
    if (convergeSlots(manifest, target[role])) writes.set(path, manifest);
  }
  const formatter = addNativeInstructionsIgnore(tree);
  if (writes.size === 0 && formatter === undefined) return;
  // Format with native Nx before applying any write, and copy back only changed files.
  const staged = new FsTree(tree.root, false);
  for (const change of tree.listChanges())
    if (change.type === "DELETE") staged.delete(change.path);
    else if (change.content !== null) staged.write(change.path, change.content, change.options);
  for (const [path, manifest] of writes) writeJson(staged, path, manifest);
  const changedPaths = [...writes.keys(), ...(formatter === undefined ? [] : [formatterPath])];
  return formatFiles(staged, { sortRootTsconfigPaths: false }).then(() => {
    // Oxfmt must load the existing on-disk TypeScript config before it is staged.
    if (formatter !== undefined) staged.write(formatterPath, formatter);
    for (const path of changedPaths) {
      const content = staged.read(path);
      if (content !== null) tree.write(path, content);
    }
  });
}

function applicationManifests(tree: Tree) {
  const paths: string[] = [];
  // KEE-45 classifies direct apps/* manifests before this migration executes.
  for (const workspace of tree.children("apps").toSorted()) {
    const path = `apps/${workspace}/package.json`;
    if (!tree.exists(path)) continue;
    const { nx } = readJson<PackageJson>(tree, path);
    if (nx === undefined) continue;
    if (
      nx === null ||
      typeof nx !== "object" ||
      Array.isArray(nx) ||
      (nx.tags !== undefined && (!Array.isArray(nx.tags) || nx.tags.some((tag) => typeof tag !== "string")))
    )
      throw new Error(`KEE-54 dependency migration requires valid application classification in ${path}#nx.tags`);
    if (nx.tags?.includes("type:app") === true) {
      if (nx.tags.filter((tag) => tag.startsWith("type:")).length !== 1)
        throw new Error(`KEE-54 dependency migration requires unambiguous application classification in ${path}#nx.tags`);
      paths.push(path);
    }
  }
  return paths;
}

function convergeSlots(manifest: PackageJson, slots: DependencySlots[DependencyRole]) {
  let changed = false;
  for (const section of sections) {
    const opposite = section === "dependencies" ? "devDependencies" : "dependencies";
    for (const [name, version] of Object.entries(slots[section])) {
      if (manifest[section]?.[name] === version && !Object.hasOwn(manifest[opposite] ?? {}, name)) continue;
      if (manifest[opposite] !== undefined) Reflect.deleteProperty(manifest[opposite], name);
      manifest[section] ??= {};
      manifest[section][name] = version;
      changed = true;
    }
  }
  return changed;
}

function addNativeInstructionsIgnore(tree: Tree) {
  const source = tree.read(formatterPath, "utf-8");
  if (source === null) throw new Error(`KEE-54 migration requires ${formatterPath}`);
  const file = ts.createSourceFile(formatterPath, source, ts.ScriptTarget.Latest, true);
  const config = formatterConfig(file);
  const properties = config.properties.filter(
    (property) =>
      property.name !== undefined &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === "ignorePatterns"
  );
  const property = properties.length === 1 ? properties[0] : undefined;
  if (property === undefined || !ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer))
    return formatterConflict();
  if (config.properties.some((entry) => entry.pos > property.end && ts.isSpreadAssignment(entry))) return formatterConflict();
  const array = property.initializer;
  if (array.elements.some((element) => ts.isStringLiteral(element) && element.text === nativeInstructionsIgnore)) return;
  const last = array.elements.at(-1);
  const insertion = last?.end ?? array.getStart(file) + 1;
  const prefix = last === undefined ? "" : ",";
  const suffix = array.elements.hasTrailingComma ? "" : ",";
  return `${source.slice(0, insertion)}${prefix}\n    "${nativeInstructionsIgnore}"${suffix}${source.slice(insertion)}`;
}

function formatterConfig(file: ts.SourceFile) {
  const exports = file.statements.filter(ts.isExportAssignment);
  const [declaration] = exports;
  if (exports.length !== 1 || declaration === undefined || declaration.isExportEquals === true) return formatterConflict();
  const { expression } = declaration;
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== "defineConfig")
    return formatterConflict();
  const [config] = expression.arguments;
  if (config === undefined || !ts.isObjectLiteralExpression(config)) return formatterConflict();
  return config;
}

function formatterConflict(): never {
  throw new Error(
    `KEE-54 migration requires a literal ignorePatterns array in ${formatterPath}; preserve project settings and reconcile the owned native-instructions ignore`
  );
}
