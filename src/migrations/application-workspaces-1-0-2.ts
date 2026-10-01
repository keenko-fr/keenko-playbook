/* oxlint-disable effect/maxCognitiveComplexity, effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
import { formatFiles, updateJson, type Tree } from "@nx/devkit";

type JsonObject = Record<string, unknown>;

const oldRouteTreePath = "apps/web/src/routeTree.gen.ts";
const applicationRouteTreePath = ":(glob)apps/*/src/routeTree.gen.ts";
const oldAppFiles = /files:\s*\[["']apps\/web\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const applicationFiles = /files:\s*\[["']apps\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const dependencyConstraint = /\{[^{}]*\}/gu;
const applicationTargetTags = ["scope:backend", "scope:shared", "scope:ui"];
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
  const included = applicationMatcherConditions(inclusions, true, true);
  const notExcluded = applicationMatcherConditions(exclusions, false, false);
  return included.some((include) =>
    notExcluded.some((exclude) => [...include].every(([pattern, matches]) => !exclude.has(pattern) || exclude.get(pattern) === matches))
  );
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
    const helpers = findTransitionHelpers(source, originName);
    const urlTransition = findCallArguments(source, /page\.waitForURL\s*\(/gu).some((argument) =>
      waitForUrlProvesOriginDeparture(argument, helpers, originName)
    );
    const requestTransition = findCallArguments(source, /page\.waitForRequest\s*\(/gu).some((argument) =>
      waitForRequestProvesNavigationDeparture(argument, helpers, originName)
    );
    return urlTransition || requestTransition;
  });
}

interface TransitionHelper {
  readonly conjoinsNavigationAndOrigin: boolean;
  readonly name: string;
  readonly navigation: boolean;
  readonly originInput: "request" | "url" | undefined;
  readonly originRequired: boolean;
}

function findTransitionHelpers(source: string, originName: string) {
  return [...source.matchAll(/const\s+([\w$]+)\s*=\s*\(\s*([\w$]+)(?:\s*:[^)]*)?\)\s*=>\s*([^;]+);/gu)].flatMap(
    (match): TransitionHelper[] => {
      const name = match[1];
      const parameter = match[2];
      const body = match[3] ?? "";
      if (name === undefined || parameter === undefined) return [];
      const navigation = isNavigationRequestExpression(body, parameter);
      const originInput = originDepartureInput(body, parameter, originName);
      return [
        {
          conjoinsNavigationAndOrigin: navigation && originInput !== undefined,
          name,
          navigation,
          originInput,
          originRequired: originInput !== undefined,
        },
      ];
    }
  );
}

function waitForUrlProvesOriginDeparture(argument: string, helpers: readonly TransitionHelper[], originName: string) {
  const callback = parseWaitCallback(argument);
  if (callback === undefined)
    return helpers.some(({ name, originInput, originRequired }) => argument.trim() === name && originInput === "url" && originRequired);
  if (originDepartureInput(callback.body, callback.parameter, originName) === "url") return true;
  return helpers.some(
    ({ name, originInput, originRequired }) =>
      originInput === "url" &&
      originRequired &&
      hasRequiredPositiveCondition(callback.body, new RegExp(`^${name}\\s*\\(\\s*${callback.parameter}\\s*\\)$`, "u"))
  );
}

function waitForRequestProvesNavigationDeparture(argument: string, helpers: readonly TransitionHelper[], originName: string) {
  const callback = parseWaitCallback(argument);
  if (callback === undefined)
    return helpers.some(
      ({ conjoinsNavigationAndOrigin, name, originInput }) =>
        argument.trim() === name && conjoinsNavigationAndOrigin && originInput === "request"
    );
  const conjoinedHelper = helpers.some(
    ({ conjoinsNavigationAndOrigin, name, originInput }) =>
      conjoinsNavigationAndOrigin &&
      originInput === "request" &&
      hasRequiredPositiveCondition(callback.body, new RegExp(`^${name}\\s*\\(\\s*${callback.parameter}\\s*\\)$`, "u"))
  );
  if (conjoinedHelper) return true;
  const navigation =
    isNavigationRequestExpression(callback.body, callback.parameter) ||
    helpers.some(
      ({ name, navigation: helperNavigation }) =>
        helperNavigation && hasRequiredPositiveCondition(callback.body, new RegExp(`^${name}\\s*\\(\\s*${callback.parameter}\\s*\\)$`, "u"))
    );
  const originDeparture =
    originDepartureInput(callback.body, callback.parameter, originName) === "request" ||
    helpers.some(({ name, originInput, originRequired }) => {
      const argumentPattern = originInput === "request" ? callback.parameter : `${callback.parameter}\\.url\\(\\)`;
      return (
        originRequired &&
        originInput !== undefined &&
        hasRequiredPositiveCondition(callback.body, new RegExp(`^${name}\\s*\\(\\s*${argumentPattern}\\s*\\)$`, "u"))
      );
    });
  return navigation && originDeparture;
}

function hasRequiredPositiveCondition(expression: string, condition: RegExp): boolean {
  // Only prove required conjuncts. Disjunctions, ternaries, and statement bodies remain conflicts.
  if (expression.includes("||") || expression.includes("?") || expression.includes("{")) return false;
  const body = expression.trim();
  let depth = 0;
  let wrapped = body.startsWith("(");
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && body.slice(index, index + 2) === "&&")
      return (
        hasRequiredPositiveCondition(body.slice(0, index), condition) || hasRequiredPositiveCondition(body.slice(index + 2), condition)
      );
    if (index === body.length - 1 && character === ")" && depth === 0 && wrapped)
      return hasRequiredPositiveCondition(body.slice(1, -1), condition);
    // The first opening parenthesis must wrap the entire expression before it can be removed.
    if (character === ")" && depth === 0 && index < body.length - 1) wrapped = false;
  }
  return condition.test(body);
}

function parseWaitCallback(argument: string) {
  const callback = /(?:async\s*)?\(\s*([\w$]+)(?:\s*:[^)]*)?\)\s*=>\s*([\s\S]*)/u.exec(argument);
  const parameter = callback?.[1];
  const body = callback?.[2];
  return parameter === undefined || body === undefined ? undefined : { body, parameter };
}

function isNavigationRequestExpression(expression: string, inputName: string) {
  const escapedInput = inputName.replaceAll(/[$()*+.?[\]^{|}]/gu, "\\$&");
  return hasRequiredPositiveCondition(expression, new RegExp(`^${escapedInput}\\.isNavigationRequest\\(\\)$`, "u"));
}

function originDepartureInput(expression: string, inputName: string, originName: string): "request" | "url" | undefined {
  const escapedInput = inputName.replaceAll(/[$()*+.?[\]^{|}]/gu, "\\$&");
  const escapedOrigin = originName.replaceAll(/[$()*+.?[\]^{|}]/gu, "\\$&");
  if (
    hasRequiredPositiveCondition(
      expression,
      new RegExp(`^new URL\\(\\s*${escapedInput}\\.url\\(\\)\\s*\\)\\.origin\\s*!==\\s*${escapedOrigin}$`, "u")
    )
  )
    return "request";
  if (
    hasRequiredPositiveCondition(
      expression,
      new RegExp(`^(?:new URL\\(\\s*${escapedInput}\\s*\\)\\.origin|${escapedInput}\\.origin)\\s*!==\\s*${escapedOrigin}$`, "u")
    )
  )
    return "url";
  return undefined;
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
