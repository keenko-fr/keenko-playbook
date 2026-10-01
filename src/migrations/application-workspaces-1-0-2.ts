/* oxlint-disable effect/maxCognitiveComplexity, effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Native Nx migration planning synchronously reads packaged release baselines.
import { readFileSync } from "node:fs";

import { formatFiles, updateJson, type Tree } from "@nx/devkit";
import { FsTree } from "nx/src/generators/tree";
import * as ts from "typescript";

type JsonObject = Record<string, unknown>;

const oldRouteTreePath = "apps/web/src/routeTree.gen.ts";
const applicationRouteTreePath = ":(glob)apps/*/src/routeTree.gen.ts";
const oldAppFiles = /files:\s*\[["']apps\/web\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const applicationFiles = /files:\s*\[["']apps\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const dependencyConstraint = /\{[^{}]*\}/gu;
const applicationTargetTags = ["scope:backend", "scope:shared", "scope:ui"];

export default function applicationWorkspaces102(tree: Tree) {
  // Plan on a native Nx tree, including pending caller changes. Conflicts never mutate the caller's tree.
  const staged = new FsTree(tree.root, false);
  for (const change of tree.listChanges()) {
    if (change.type === "DELETE") staged.delete(change.path);
    else if (change.content !== null) staged.write(change.path, change.content, change.options);
  }
  const authSmokeMigration = planAuthSmokeMigration(staged);
  const boundaryPolicyMigration = planBoundaryPolicyMigration(staged);
  migrateVitestDiscovery(staged);
  migrateRootVerification(staged);
  migrateApplicationTags(staged);
  migrateContinuousTargets(staged);
  if (authSmokeMigration !== undefined) staged.write(authSmokeMigration.path, authSmokeMigration.source);
  for (const write of boundaryPolicyMigration) staged.write(write.path, write.source);
  return formatFiles(staged).then(() => {
    for (const change of staged.listChanges()) {
      if (change.type === "DELETE") tree.delete(change.path);
      else if (change.content !== null) tree.write(change.path, change.content, change.options);
    }
  });
}

function migrateApplicationTags(tree: Tree) {
  for (const workspace of tree.children("apps")) {
    const path = `apps/${workspace}/package.json`;
    if (!tree.exists(path)) continue;
    updateJson<JsonObject>(tree, path, (packageJson) => {
      const nx = packageJson.nx;
      if (nx === undefined) {
        packageJson.nx = { tags: ["type:app"] };
        return packageJson;
      }
      if (!isObject(nx)) return conflict(path, "nx application metadata");
      const tags = nx.tags;
      if (tags === undefined) {
        nx.tags = ["type:app"];
        return packageJson;
      }
      if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) return conflict(path, "nx.tags");
      if (tags.some((tag) => tag.startsWith("type:") && tag !== "type:app")) return conflict(path, "nx.tags application classification");
      if (!tags.includes("type:app")) tags.push("type:app");
      return packageJson;
    });
  }
}

function migrateVitestDiscovery(tree: Tree) {
  updateJson<JsonObject>(tree, "nx.json", (nxJson) => {
    const plugins = nxJson.plugins;
    if (!Array.isArray(plugins)) return conflict("nx.json", "@nx/vitest plugin configuration");
    const oldExclusion = "apps/web/vite.config.ts";
    const targetExclusion = "apps/*/vite.config.ts";
    // The 1.0.1 preset registered run/test with no include scope. Explicitly scoped project
    // registrations are unrelated unless they retain an owned old/target exclusion marker.
    const candidates = plugins.filter(
      (entry) =>
        isObject(entry) &&
        entry.plugin === "@nx/vitest" &&
        isObject(entry.options) &&
        entry.options.testMode === "run" &&
        entry.options.testTargetName === "test" &&
        (entry.include === undefined ||
          (Array.isArray(entry.exclude) && (entry.exclude.includes(oldExclusion) || entry.exclude.includes(targetExclusion))))
    );
    if (candidates.length !== 1) return conflict("nx.json", "@nx/vitest application scope");
    const registration = candidates[0];
    if (
      !isObject(registration) ||
      registration.include !== undefined ||
      !Array.isArray(registration.exclude) ||
      registration.exclude.length !== 1 ||
      (registration.exclude[0] !== oldExclusion && registration.exclude[0] !== targetExclusion)
    )
      return conflict("nx.json", "@nx/vitest application scope");
    registration.exclude[0] = targetExclusion;
    return nxJson;
  });
}

function migrateRootVerification(tree: Tree) {
  updateJson<JsonObject>(tree, "package.json", (packageJson) => {
    const scripts = packageJson.scripts;
    if (!isObject(scripts) || typeof scripts.check !== "string") return conflict("package.json", "scripts.check");
    let check = scripts.check;
    if (!check.includes(applicationRouteTreePath)) {
      if (!check.includes(oldRouteTreePath)) return conflict("package.json", "scripts.check generated route-tree path");
      check = check.replace(oldRouteTreePath, applicationRouteTreePath);
    }
    scripts.check = check;
    return packageJson;
  });
}

function planBoundaryPolicyMigration(tree: Tree) {
  const path = "oxlint.config.ts";
  const source = tree.read(path, "utf-8");
  if (source === null) return conflict(path, "application lint and boundary policy");
  const filesCompliant = applicationFiles.test(source);
  if (!filesCompliant && !oldAppFiles.test(source)) return conflict(path, "application lint and boundary policy");
  const inlinePolicy = findArrayProperty(source, "depConstraints");
  if (inlinePolicy === undefined) return conflict(path, "dependency constraints");
  const migratedPolicyBody = validateAndMigrateConstraints(inlinePolicy.body);
  const migratedPolicy = `${source.slice(0, inlinePolicy.start)}depConstraints: [${migratedPolicyBody}],${source.slice(inlinePolicy.end)}`;
  const migratedOxlint = filesCompliant ? migratedPolicy : migratedPolicy.replace(oldAppFiles, 'files: ["apps/**/*.{ts,tsx}"]');
  return migratedOxlint === source ? [] : [{ path, source: migratedOxlint }];
}

function validateAndMigrateConstraints(body: string) {
  const constraints = [...body.matchAll(dependencyConstraint)].map((match) => match[0]);
  if (constraints.length === 0) return conflict("oxlint.config.ts", "dependency constraints");
  const required = [
    ["type:package", ["type:package"]],
    ["scope:backend", ["scope:shared"]],
    ["scope:ui", ["scope:shared"]],
    ["scope:shared", []],
  ] satisfies readonly (readonly [string, readonly string[]])[];
  for (const [sourceTag, targetTags] of required) {
    if (constraints.filter((constraint) => isConstraint(constraint, sourceTag, targetTags)).length !== 1)
      return conflict("oxlint.config.ts", `${sourceTag} dependency constraint`);
  }
  const newApplications = constraints.filter((constraint) => isApplicationBoundary(constraint, "type:app"));
  const oldApplications = constraints.filter((constraint) => isApplicationBoundary(constraint, "scope:web"));
  if (newApplications.length === 1) return body;
  if (newApplications.length > 1 || oldApplications.length !== 1) return conflict("oxlint.config.ts", "application dependency constraint");
  return body.replace(oldApplications[0] ?? "", (constraint) =>
    constraint.replace(/sourceTag:\s*(["'])scope:web\1/u, 'sourceTag: "type:app"')
  );
}

function parseConstraint(constraint: string) {
  const sourceTag = /sourceTag:\s*["']([^"']+)["']/u.exec(constraint)?.[1];
  const targets = /onlyDependOnLibsWithTags:\s*\[([^\]]*)\]/u.exec(constraint)?.[1];
  if (sourceTag === undefined || targets === undefined) return;
  return {
    sourceTag,
    targetTags: [...targets.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1]).toSorted(),
  };
}

function isConstraint(constraint: string, sourceTag: string, targetTags: readonly string[]) {
  const parsed = parseConstraint(constraint);
  const expectedTargets = targetTags.toSorted();
  return (
    parsed !== undefined &&
    parsed.sourceTag === sourceTag &&
    parsed.targetTags.length === expectedTargets.length &&
    parsed.targetTags.every((tag, index) => tag === expectedTargets[index])
  );
}

function isApplicationBoundary(constraint: string, sourceTag: string) {
  return isConstraint(constraint, sourceTag, applicationTargetTags);
}

function findArrayProperty(source: string, property: string) {
  return findArray(source, new RegExp(`${property}:\\s*\\[`, "u"));
}

function findArray(source: string, pattern: RegExp) {
  const match = pattern.exec(source);
  if (match === null || match.index === undefined) return;
  const open = source.indexOf("[", match.index);
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (quote !== "") {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "[") depth += 1;
    if (character !== "]") continue;
    depth -= 1;
    if (depth !== 0) continue;
    const comma = /^\s*,/u.exec(source.slice(index + 1));
    return {
      body: source.slice(open + 1, index),
      end: comma === null ? index + 1 : index + 1 + (comma[0]?.length ?? 0),
      start: match.index,
    };
  }
  // oxlint-disable-next-line unicorn/no-useless-undefined -- Explicit absence satisfies noImplicitReturns for the source scanner.
  return undefined;
}

function migrateContinuousTargets(tree: Tree) {
  for (const root of ["apps", "packages"]) {
    for (const workspace of tree.children(root)) {
      const path = `${root}/${workspace}/package.json`;
      if (!tree.exists(path)) continue;
      updateJson<JsonObject>(tree, path, (packageJson) => {
        const scripts = packageJson.scripts;
        if (!isObject(scripts) || typeof scripts.dev !== "string") return packageJson;
        const nx = packageJson.nx;
        if (!isObject(nx) || !isContinuousWorkspace(nx.tags)) return packageJson;
        const targets = isObject(nx.targets) ? nx.targets : (nx.targets = {});
        const dev = targets.dev;
        if (dev === undefined) {
          targets.dev = { continuous: true };
          return packageJson;
        }
        if (!isObject(dev) || (dev.continuous !== undefined && dev.continuous !== true)) return conflict(path, "nx.targets.dev.continuous");
        dev.continuous = true;
        return packageJson;
      });
    }
  }
}

function planAuthSmokeMigration(tree: Tree) {
  const path = "apps/web/e2e/auth.e2e.ts";
  const source = tree.read(path, "utf-8");
  if (source === null) return;
  // Frozen release baselines: future generator changes must not change this migration's signatures.
  const oldSmoke = readFileSync(new URL("files/application-workspaces-1-0-2/auth.e2e.1-0-1.ts.template", import.meta.url), "utf-8");
  const targetSmoke = readFileSync(new URL("files/application-workspaces-1-0-2/auth.e2e.1-0-2.ts.template", import.meta.url), "utf-8");
  const signature = authSmokeTokens(source);
  if (signature === authSmokeTokens(targetSmoke)) return;
  if (signature !== authSmokeTokens(oldSmoke)) return conflict(path, "Hosted UI transition detection");
  return { path, source: targetSmoke };
}

// Compare complete syntax, allowing only formatter changes to whitespace, quotes, and trailing commas.
// No callback, binding, control-flow, or behavioral interpretation is performed.
function authSmokeTokens(source: string) {
  const file = ts.createSourceFile("auth.e2e.ts", source, ts.ScriptTarget.Latest, true);
  const tokens: (string | number)[] = [];
  let end = 0;
  function visit(node: ts.Node) {
    const children = node.getChildren(file);
    if (children.length > 0) {
      for (const child of children) {
        if (node.kind === ts.SyntaxKind.SyntaxList && child === children.at(-1) && child.kind === ts.SyntaxKind.CommaToken) {
          const trivia = source.slice(end, child.getStart(file)).trim();
          if (trivia !== "") tokens.push(trivia);
          end = child.end;
        } else visit(child);
      }
      return;
    }
    const trivia = source.slice(end, node.getStart(file)).trim();
    if (trivia !== "") tokens.push(trivia);
    tokens.push(node.kind, ts.isStringLiteralLike(node) ? node.text : node.getText(file));
    end = node.end;
  }
  visit(file);
  // oxlint-disable-next-line effect/noGlobals -- Serialization compares syntax tokens; it does not decode project data.
  return JSON.stringify(tokens);
}

function isContinuousWorkspace(tags: unknown) {
  return Array.isArray(tags) && (tags.includes("type:app") || tags.includes("scope:backend"));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function conflict(path: string, value: string): never {
  throw new Error(
    `Keenko-owned ${value} in ${path} conflicts with the 1.0.2 application-workspace contract. Reconcile the customization manually, then rerun the Keenko migration.`
  );
}
