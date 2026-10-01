/* oxlint-disable effect/maxCognitiveComplexity, effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Native Nx migration planning synchronously reads packaged release baselines.
import { readFileSync } from "node:fs";

import { formatFiles, updateJson, type Tree } from "@nx/devkit";
import { findMatchingConfigFiles } from "@nx/devkit/internal";
import { Minimatch } from "minimatch";
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
    const registrations = plugins.filter((entry) => isObject(entry) && entry.plugin === "@nx/vitest");
    for (const registration of registrations) {
      if (!isOptionalStringArray(registration.include) || !isOptionalStringArray(registration.exclude))
        return conflict("nx.json", "@nx/vitest include/exclude scope");
    }
    const coveringRegistrations = registrations.filter(registrationCoversApplicationViteConfig);
    if (coveringRegistrations.length === 0) return nxJson;
    const legacyRegistrations = coveringRegistrations.filter(
      ({ exclude }) => Array.isArray(exclude) && exclude.includes("apps/web/vite.config.ts")
    );
    if (legacyRegistrations.length !== 1 || coveringRegistrations.length !== 1) return conflict("nx.json", "@nx/vitest application scope");
    const plugin = legacyRegistrations[0];
    if (plugin === undefined || !Array.isArray(plugin.exclude)) return conflict("nx.json", "@nx/vitest application scope");
    const exclusions = plugin.exclude;
    const legacyIndex = exclusions.indexOf("apps/web/vite.config.ts");
    if (legacyIndex === -1) return conflict("nx.json", "@nx/vitest application scope");
    exclusions[legacyIndex] = "apps/*/vite.config.ts";
    return nxJson;
  });
}

function registrationCoversApplicationViteConfig(registration: JsonObject) {
  const inclusions = isStringArray(registration.include) ? registration.include : [];
  const exclusions = isStringArray(registration.exclude) ? registration.exclude : [];
  const included = applicationMatcherConditions(inclusions, true, true);
  const notExcluded = applicationMatcherConditions(exclusions, false, false);
  return included.some((include) =>
    notExcluded.some((exclude) => {
      const conditions = [...include, ...exclude];
      // A positive finite matcher bounds the entire intersection, not a sample of application names.
      // Let Nx evaluate every candidate against both ordered arrays, including differently spelled patterns.
      for (const [pattern, matches] of conditions) {
        if (!matches) continue;
        const paths = finitePatternPaths(pattern);
        if (paths !== undefined)
          return (
            findMatchingConfigFiles(
              paths.filter((path) => /^apps\/[^/]+\/vite\.config\.ts$/u.test(path)),
              inclusions,
              exclusions
            ).length > 0
          );
      }
      const compiledConditions = new Map<string, boolean>();
      for (const [pattern, matches] of conditions) {
        const matcher = new Minimatch(pattern, { dot: true }).makeRe().toString();
        if (compiledConditions.has(matcher) && compiledConditions.get(matcher) !== matches) return false;
        compiledConditions.set(matcher, matches);
      }
      return true;
    })
  );
}

function finitePatternPaths(pattern: string) {
  const alternatives = new Minimatch(pattern, { dot: true }).set;
  if (!alternatives.every((parts) => parts.every((part) => typeof part === "string"))) return;
  return alternatives.map((parts) => parts.join("/"));
}

// Each outcome requires its last matching pattern and no later matches, exactly as Nx's ordered matcher does.
// Preserve shared pattern identities across include/exclude; unknown glob overlaps remain conservative conflicts.
function applicationMatcherConditions(patterns: readonly string[], outcome: boolean, emptyValue: boolean) {
  const conditions: Map<string, boolean>[] = [];
  const initial = patterns.length === 0 ? emptyValue : (patterns[0]?.startsWith("!") ?? false);
  for (let lastMatch = -1; lastMatch < patterns.length; lastMatch += 1) {
    const value = lastMatch === -1 ? initial : !patterns[lastMatch]?.startsWith("!");
    if (value !== outcome) continue;
    const condition = new Map<string, boolean>();
    let possible = true;
    for (let index = Math.max(0, lastMatch); index < patterns.length; index += 1) {
      const pattern = patterns[index] ?? "";
      const matches = index === lastMatch;
      const relation = applicationClassRelation(pattern);
      if (relation !== "some") {
        if ((relation === "all") !== matches) possible = false;
        continue;
      }
      const normalized = pattern.startsWith("!") ? pattern.slice(1) : pattern;
      if (condition.has(normalized) && condition.get(normalized) !== matches) possible = false;
      condition.set(normalized, matches);
    }
    if (possible) conditions.push(condition);
  }
  return conditions;
}

type ApplicationClassRelation = "all" | "none" | "some";

function applicationClassRelation(pattern: string): ApplicationClassRelation {
  const normalized = pattern.startsWith("!") ? pattern.slice(1) : pattern;
  if (["apps/*/vite.config.ts", "apps/**/vite.config.ts", "apps/**"].includes(normalized)) return "all";
  const literalPrefix = /^[^*?[{!(]+/u.exec(normalized)?.[0] ?? "";
  if (literalPrefix !== "" && !"apps/".startsWith(literalPrefix) && !literalPrefix.startsWith("apps/")) return "none";
  if (!/[*?[{!(]/u.test(normalized)) return /^apps\/[^/]+\/vite\.config\.ts$/u.test(normalized) ? "some" : "none";
  // Nx owns actual matching. Any glob whose intersection cannot be disproved is conservatively covering.
  return "some";
}

function isOptionalStringArray(value: unknown) {
  return value === undefined || isStringArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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
