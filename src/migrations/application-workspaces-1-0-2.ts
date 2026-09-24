/* oxlint-disable effect/maxCognitiveComplexity, effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
import { formatFiles, updateJson, type Tree } from "@nx/devkit";

type JsonObject = Record<string, unknown>;

const oldRouteTreePath = "apps/web/src/routeTree.gen.ts";
const applicationRouteTreePath = ":(glob)apps/*/src/routeTree.gen.ts";
const oldAppFiles = /files:\s*\[["']apps\/web\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const applicationFiles = /files:\s*\[["']apps\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const dependencyConstraint = /\{[^{}]*\}/gu;
const applicationTargetTags = ["scope:backend", "scope:shared", "scope:ui"];
const dependencyPolicyPath = "tools/dependency-boundaries.ts";
const dependencyPolicyImport =
  /import\s*\{\s*dependencyConstraints\s*\}\s*from\s*["']\.\/tools\/dependency-boundaries(?:\.(?:js|ts))?["'];/u;
const dependencyPolicyUsage = /depConstraints:\s*dependencyConstraints/u;
const oldHostedUi = "/(?:authkit|workos)/u";
const oldBaseUrl = /(\s*)const baseUrl = process\.env\.AUTH_E2E_BASE_URL \?\? ["']http:\/\/localhost:3210["'];/u;
const oldHostedUiRequest = /\/\(\?:authkit\|workos\)\/u\.test\(request\.url\(\)\)/u;
const oldHostedUiWait = "page.waitForURL(/(?:authkit|workos)/u)";
const oldHostedUiExpectation = "await expect(page).toHaveURL(/(?:authkit|workos)/u);";
const hostedUiRequestByOrigin = "isOutsideApplicationOrigin(request.url())";
const hostedUiWaitByOrigin = "page.waitForURL((url) => url.origin !== applicationOrigin)";
const hostedUiExpectationByOrigin = "expect(new URL(page.url()).origin).not.toBe(applicationOrigin);";

export default function applicationWorkspaces102(tree: Tree) {
  const authSmokeMigration = planAuthSmokeMigration(tree);
  const boundaryPolicyMigration = planBoundaryPolicyMigration(tree);
  migrateVitestDiscovery(tree);
  migrateRootVerification(tree);
  migrateApplicationTags(tree);
  migrateContinuousTargets(tree);
  if (authSmokeMigration !== undefined) tree.write(authSmokeMigration.path, authSmokeMigration.source);
  for (const write of boundaryPolicyMigration) tree.write(write.path, write.source);
  return formatFiles(tree);
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
  return classCanBeIncluded(inclusions) && !classIsExcluded(exclusions);
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

function classCanBeIncluded(patterns: readonly string[]) {
  if (patterns.length === 0) return true;
  let canInclude = patterns[0]?.startsWith("!") ?? false;
  for (const pattern of patterns) {
    const relation = applicationClassRelation(pattern);
    if (relation === "none") continue;
    if (pattern.startsWith("!")) {
      if (relation === "all") canInclude = false;
    } else canInclude = true;
  }
  return canInclude;
}

function classIsExcluded(patterns: readonly string[]) {
  if (patterns.length === 0) return false;
  let allExcluded = patterns[0]?.startsWith("!") ?? false;
  for (const pattern of patterns) {
    const relation = applicationClassRelation(pattern);
    if (relation === "none") continue;
    if (pattern.startsWith("!")) allExcluded = false;
    else if (relation === "all") allExcluded = true;
  }
  return allExcluded;
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
    const boundaryScript = scripts["boundaries:check"];
    if (boundaryScript !== undefined && boundaryScript !== "keenko-verify-boundaries")
      return conflict("package.json", "scripts.boundaries:check");
    scripts["boundaries:check"] = "keenko-verify-boundaries";
    if (!check.includes(applicationRouteTreePath)) {
      if (!check.includes(oldRouteTreePath)) return conflict("package.json", "scripts.check generated route-tree path");
      check = check.replace(oldRouteTreePath, applicationRouteTreePath);
    }
    if (!check.includes("bun run boundaries:check")) {
      check = check.includes("bun run typecheck")
        ? check.replace("bun run typecheck", "bun run boundaries:check && bun run typecheck")
        : `${check} && bun run boundaries:check`;
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
  const hasPolicyImport = dependencyPolicyImport.test(source);
  const hasPolicyUsage = dependencyPolicyUsage.test(source);
  const inlinePolicy = findArrayProperty(source, "depConstraints");
  const policySource = tree.read(dependencyPolicyPath, "utf-8");

  if (hasPolicyImport || hasPolicyUsage || policySource !== null) {
    if (!hasPolicyImport || !hasPolicyUsage || inlinePolicy !== undefined || policySource === null)
      return conflict(path, "shared dependency-boundary policy integration");
    const policyArray = findAssignedArray(policySource, "dependencyConstraints");
    if (policyArray === undefined) return conflict(dependencyPolicyPath, "dependency constraints");
    validateAndMigrateConstraints(policyArray.body, false);
    if (filesCompliant) return [];
    return [{ path, source: source.replace(oldAppFiles, 'files: ["apps/**/*.{ts,tsx}"]') }];
  }

  if (inlinePolicy === undefined) return conflict(path, "dependency constraints");
  const migratedPolicyBody = validateAndMigrateConstraints(inlinePolicy.body, true);
  const withPolicyUsage = `${source.slice(0, inlinePolicy.start)}depConstraints: dependencyConstraints,${source.slice(inlinePolicy.end)}`;
  const withPolicyImport = insertDependencyPolicyImport(withPolicyUsage);
  const migratedOxlint = filesCompliant ? withPolicyImport : withPolicyImport.replace(oldAppFiles, 'files: ["apps/**/*.{ts,tsx}"]');
  return [
    { path, source: migratedOxlint },
    { path: dependencyPolicyPath, source: `export const dependencyConstraints = [${migratedPolicyBody}\n];\n` },
  ];
}

function validateAndMigrateConstraints(body: string, migrateLegacyApplication: boolean) {
  const constraints = [...body.matchAll(dependencyConstraint)].map((match) => match[0]);
  if (constraints.length === 0 || constraints.some((constraint) => parseConstraint(constraint) === undefined))
    return conflict(dependencyPolicyPath, "dependency constraints");
  const required = [
    ["type:package", ["type:package"]],
    ["scope:backend", ["scope:shared"]],
    ["scope:ui", ["scope:shared"]],
    ["scope:shared", []],
  ] satisfies readonly (readonly [string, readonly string[]])[];
  for (const [sourceTag, targetTags] of required) {
    if (constraints.filter((constraint) => isConstraint(constraint, sourceTag, targetTags)).length !== 1)
      return conflict(dependencyPolicyPath, `${sourceTag} dependency constraint`);
  }
  const newApplications = constraints.filter((constraint) => isApplicationBoundary(constraint, "type:app"));
  const oldApplications = constraints.filter((constraint) => isApplicationBoundary(constraint, "scope:web"));
  if (newApplications.length === 1) return body;
  if (newApplications.length > 1 || !migrateLegacyApplication || oldApplications.length !== 1)
    return conflict(dependencyPolicyPath, "application dependency constraint");
  return body.replace(oldApplications[0] ?? "", (constraint) =>
    constraint.replace(/sourceTag:\s*(["'])scope:web\1/u, 'sourceTag: "type:app"')
  );
}

function parseConstraint(constraint: string) {
  const propertyNames = [...constraint.matchAll(/[,{]\s*([A-Za-z_$][\w$]*)\s*:/gu)].map((match) => match[1]);
  if (propertyNames.length !== 2 || !propertyNames.includes("sourceTag") || !propertyNames.includes("onlyDependOnLibsWithTags")) return;
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

function findAssignedArray(source: string, identifier: string) {
  return findArray(source, new RegExp(`${identifier}\\s*=\\s*\\[`, "u"));
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

function insertDependencyPolicyImport(source: string) {
  const imports = [...source.matchAll(/^import .*;\n/gmu)];
  const lastImport = imports.at(-1);
  if (lastImport === undefined || lastImport.index === undefined) return conflict("oxlint.config.ts", "imports");
  const insertion = lastImport.index + lastImport[0].length;
  return `${source.slice(0, insertion)}import { dependencyConstraints } from "./tools/dependency-boundaries.ts";\n${source.slice(insertion)}`;
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
  if (!source.includes(oldHostedUi)) {
    if (isOriginBasedHostedUiDetection(source)) return;
    return conflict(path, "Hosted UI transition detection");
  }
  if (
    !oldBaseUrl.test(source) ||
    !oldHostedUiRequest.test(source) ||
    !source.includes(oldHostedUiWait) ||
    !source.includes(oldHostedUiExpectation)
  )
    return conflict(path, "Hosted UI transition detection");

  const migrated = source
    .replace(
      oldBaseUrl,
      '$1const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";$1const applicationOrigin = new URL(baseUrl).origin;$1const isOutsideApplicationOrigin = (url: string) => new URL(url).origin !== applicationOrigin;'
    )
    .replace(oldHostedUiRequest, hostedUiRequestByOrigin)
    .replace(oldHostedUiWait, hostedUiWaitByOrigin)
    .replace(oldHostedUiExpectation, hostedUiExpectationByOrigin);
  if (migrated.includes(oldHostedUi)) return conflict(path, "Hosted UI transition detection");
  return { path, source: migrated };
}

function isOriginBasedHostedUiDetection(source: string) {
  if (!source.includes("AUTH_E2E_BASE_URL") || hasProviderHostnameInspection(source)) return false;
  const baseUrlNames = [...source.matchAll(/const\s+([\w$]+)\s*=\s*[^;\n]*AUTH_E2E_BASE_URL[^;\n]*;/gu)].map((match) => match[1]);
  const originNames = [...source.matchAll(/const\s+([\w$]+)\s*=\s*new URL\(([^;\n]+)\)\.origin\s*;/gu)]
    .filter((match) => {
      const input = match[2] ?? "";
      return input.includes("AUTH_E2E_BASE_URL") || baseUrlNames.some((name) => name !== undefined && input.trim() === name);
    })
    .map((match) => match[1]);
  return originNames.some((originName) => {
    if (originName === undefined) return false;
    const helpers = [...source.matchAll(/const\s+([\w$]+)\s*=\s*\(\s*([\w$]+)(?:\s*:[^)]*)?\)\s*=>\s*([^;]+);/gu)]
      .filter((match) => isOriginDepartureExpression(match[3] ?? "", match[2] ?? "", originName))
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    return findCallArguments(source, /page\.waitFor(?:Request|URL)\s*\(/gu).some((argument) => {
      const callback = /(?:async\s*)?\(\s*([\w$]+)(?:\s*:[^)]*)?\)\s*=>\s*([\s\S]*)/u.exec(argument);
      if (callback === null) return helpers.some((helper) => argument.trim() === helper);
      const parameter = callback[1] ?? "";
      const body = callback[2] ?? "";
      if (isOriginDepartureExpression(body, parameter, originName)) return true;
      return helpers.some((helper) => new RegExp(`\\b${helper}\\s*\\(\\s*${parameter}(?:\\.url\\(\\))?\\s*\\)`, "u").test(body));
    });
  });
}

function isOriginDepartureExpression(expression: string, inputName: string, originName: string) {
  const escapedInput = inputName.replaceAll(/[$()*+.?[\]^{|}]/gu, "\\$&");
  const escapedOrigin = originName.replaceAll(/[$()*+.?[\]^{|}]/gu, "\\$&");
  return new RegExp(
    `(?:new URL\\(\\s*${escapedInput}(?:\\.url\\(\\))?\\s*\\)\\.origin|${escapedInput}\\.origin)\\s*!==\\s*${escapedOrigin}`,
    "u"
  ).test(expression);
}

function findCallArguments(source: string, callPattern: RegExp) {
  const arguments_: string[] = [];
  for (const match of source.matchAll(callPattern)) {
    if (match.index === undefined) continue;
    const open = source.indexOf("(", match.index);
    let depth = 0;
    let quote = "";
    let escaped = false;
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
      if (character === "(") depth += 1;
      if (character !== ")") continue;
      depth -= 1;
      if (depth !== 0) continue;
      arguments_.push(source.slice(open + 1, index));
      break;
    }
  }
  return arguments_;
}

function hasProviderHostnameInspection(source: string) {
  return /\/[^/\n]*(?:authkit|workos)[^/\n]*\/[a-z]*|(?:includes|startsWith|endsWith)\([^)]*["'][^"']*(?:authkit|workos)/iu.test(source);
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
