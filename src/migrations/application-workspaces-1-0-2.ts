/* oxlint-disable effect/maxCognitiveComplexity, effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
import { formatFiles, updateJson, type Tree } from "@nx/devkit";
import { findMatchingConfigFiles } from "@nx/devkit/internal";
import { Minimatch } from "minimatch";
import * as ts from "typescript";

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
  const current = analyzeAuthTransitions(source);
  if (current.compliant && !current.providerCoupled) return;
  if (!source.includes(oldHostedUiWait)) return conflict(path, "Hosted UI transition detection");
  if (
    analyzeAuthTransitions(source.replaceAll(oldHostedUi, "")).providerCoupled ||
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
  const result = analyzeAuthTransitions(migrated);
  if (!result.compliant || result.providerCoupled) return conflict(path, "Hosted UI transition detection");
  return { path, source: migrated };
}

interface AuthFacts {
  readonly source?: "request" | "url" | "origin" | "string" | undefined;
  readonly application?: "base" | "url" | "origin" | undefined;
  readonly fixedHost?: boolean;
  readonly departure?: boolean;
  readonly navigation?: boolean;
  readonly coupled?: boolean;
}

type AuthFunction = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

function propertyName(node: ts.Node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  return "";
}

function unwrap(node: ts.Node): ts.Node {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))
    return unwrap(node.expression);
  return node;
}

function bindsName(name: ts.BindingName, identifier: string): boolean {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some((element) => ts.isBindingElement(element) && bindsName(element.name, identifier));
}

function binding(identifier: ts.Identifier): ts.VariableDeclaration | ts.ParameterDeclaration | AuthFunction | undefined {
  for (let scope: ts.Node | undefined = identifier.parent; scope !== undefined; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) {
      const parameter = scope.parameters.find(({ name }) => bindsName(name, identifier.text));
      if (parameter !== undefined) return parameter;
      if ((ts.isFunctionExpression(scope) || ts.isFunctionDeclaration(scope)) && scope.name?.text === identifier.text) return scope;
    }
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === identifier.text) return statement;
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(({ name }) => bindsName(name, identifier.text));
      if (declaration !== undefined) return declaration;
    }
  }
  return undefined;
}

function isConstant(declaration: ts.VariableDeclaration) {
  // oxlint-disable-next-line eslint/no-bitwise -- TypeScript combines declaration modifiers and async context in a native bit mask.
  return ts.isVariableDeclarationList(declaration.parent) && Boolean(declaration.parent.flags & ts.NodeFlags.Const);
}

function fixedText(text: string) {
  return (
    (URL.canParse(text) && new URL(text).hostname !== "") || /^(?:[\w-]+\.)+[\w-]+(?::\d+)?$/u.test(text) || /authkit|workos/iu.test(text)
  );
}

function analyzeAuthTransitions(source: string) {
  const file = ts.createSourceFile("auth.e2e.ts", source, ts.ScriptTarget.Latest, true);
  const active = new Set<ts.Node>();
  const matches = new Set(["includes", "startsWith", "endsWith", "match", "search", "indexOf", "lastIndexOf"]);
  let compliant = false;
  let providerCoupled = false;

  function callable(input: ts.Node, seen = new Set<ts.Node>()): AuthFunction | undefined {
    const node = unwrap(input);
    if (seen.has(node)) return;
    seen.add(node);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return node;
    if (!ts.isIdentifier(node)) return;
    const declaration = binding(node);
    if (declaration !== undefined && (ts.isFunctionDeclaration(declaration) || ts.isFunctionExpression(declaration))) return declaration;
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstant(declaration)
    )
      return callable(declaration.initializer, seen);
    return undefined;
  }

  function invoke(
    fn: AuthFunction,
    arguments_: readonly AuthFacts[],
    parameters: ReadonlyMap<ts.ParameterDeclaration, AuthFacts>
  ): AuthFacts {
    if (fn.body === undefined || active.has(fn)) return {};
    active.add(fn);
    const bindings = new Map(parameters);
    for (const [index, parameter] of fn.parameters.entries()) bindings.set(parameter, arguments_[index] ?? {});
    const result = returnedFacts(fn.body, bindings);
    active.delete(fn);
    return result;
  }

  function returnedFacts(body: ts.ConciseBody, parameters: ReadonlyMap<ts.ParameterDeclaration, AuthFacts>): AuthFacts {
    if (!ts.isBlock(body)) return evaluate(body, parameters);
    const statements = body.statements;
    const last = statements.at(-1);
    const simple =
      last !== undefined &&
      ts.isReturnStatement(last) &&
      statements
        .slice(0, -1)
        .every((statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations.every(isConstant));
    if (simple && last.expression !== undefined) return evaluate(last.expression, parameters);
    // Competing paths cannot certify required conditions. Inspect only returned values for coupling/provenance.
    const returned: AuthFacts[] = [];
    function visitReturns(node: ts.Node) {
      if (ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression !== undefined) returned.push(evaluate(node.expression, parameters));
      else ts.forEachChild(node, visitReturns);
    }
    visitReturns(body);
    return { coupled: returned.some((facts) => facts.coupled), source: returned.find((facts) => facts.source !== undefined)?.source };
  }

  function evaluate(input: ts.Node, parameters: ReadonlyMap<ts.ParameterDeclaration, AuthFacts>): AuthFacts {
    const node = unwrap(input);
    if (active.has(node)) return {};
    active.add(node);
    const result = expressionFacts(node, parameters);
    active.delete(node);
    return result;
  }

  // oxlint-disable-next-line eslint/complexity -- One AST evaluator shares lexical resolution and provenance across predicate, origin, and host analysis.
  function expressionFacts(node: ts.Node, parameters: ReadonlyMap<ts.ParameterDeclaration, AuthFacts>): AuthFacts {
    if (ts.isIdentifier(node)) {
      const declaration = binding(node);
      if (declaration !== undefined && ts.isParameter(declaration)) return parameters.get(declaration) ?? {};
      if (
        declaration !== undefined &&
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer !== undefined &&
        isConstant(declaration)
      )
        return evaluate(declaration.initializer, parameters);
      return {};
    }
    if (ts.isStringLiteralLike(node)) return { fixedHost: fixedText(node.text) };
    if (ts.isRegularExpressionLiteral(node)) return { fixedHost: /authkit|workos|\\\./iu.test(node.text) };
    if (ts.isTemplateExpression(node)) {
      const values = node.templateSpans.map((span) => evaluate(span.expression, parameters));
      return {
        coupled: values.some((facts) => facts.coupled),
        fixedHost: /^[a-z][\w+.-]*:\/\//iu.test(node.head.text) || values.some((facts) => facts.fixedHost),
        source: values.find((facts) => facts.source !== undefined)?.source,
      };
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return propertyFacts(node, parameters);
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "URL" &&
      binding(node.expression) === undefined
    ) {
      const value = node.arguments?.[0];
      const facts = value === undefined ? {} : evaluate(value, parameters);
      return {
        ...facts,
        application: facts.application === "base" ? "url" : undefined,
        source: facts.source === undefined ? undefined : "url",
      };
    }
    if (ts.isCallExpression(node)) return callFacts(node, parameters);
    if (ts.isBinaryExpression(node)) {
      const left = evaluate(node.left, parameters);
      const right = evaluate(node.right, parameters);
      const coupled = left.coupled === true || right.coupled === true;
      const operator = node.operatorToken.kind;
      if ([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(operator) && left.application === "base") return left;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken)
        return {
          coupled,
          departure: left.departure === true || right.departure === true,
          navigation: left.navigation === true || right.navigation === true,
        };
      const comparison = [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
      ].includes(operator);
      return {
        coupled:
          coupled ||
          (comparison &&
            ((left.source !== undefined && right.fixedHost === true) || (right.source !== undefined && left.fixedHost === true))),
        departure:
          operator === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
          ((left.source === "origin" && right.application === "origin") || (right.source === "origin" && left.application === "origin")),
      };
    }
    // Negation, disjunction, and conditional expressions do not certify positive required conjuncts.
    let coupled = false;
    ts.forEachChild(node, (child) => {
      coupled ||= Boolean(evaluate(child, parameters).coupled);
    });
    return { coupled };
  }

  function propertyFacts(
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    parameters: ReadonlyMap<ts.ParameterDeclaration, AuthFacts>
  ): AuthFacts {
    const name = propertyName(node);
    const receiver = unwrap(node.expression);
    if (
      name === "AUTH_E2E_BASE_URL" &&
      propertyName(receiver) === "env" &&
      (ts.isPropertyAccessExpression(receiver) || ts.isElementAccessExpression(receiver)) &&
      ts.isIdentifier(receiver.expression) &&
      receiver.expression.text === "process" &&
      binding(receiver.expression) === undefined
    )
      return { application: "base" };
    const value = evaluate(receiver, parameters);
    if (name === "origin")
      return {
        ...value,
        application: value.application === "url" ? "origin" : undefined,
        source: value.source === "url" ? "origin" : undefined,
      };
    return {
      coupled: Boolean(value.coupled),
      fixedHost: Boolean(value.fixedHost),
      source: ["href", "host", "hostname"].includes(name) && value.source === "url" ? "string" : undefined,
    };
  }

  function callFacts(node: ts.CallExpression, parameters: ReadonlyMap<ts.ParameterDeclaration, AuthFacts>): AuthFacts {
    const arguments_ = node.arguments.map((argument) => evaluate(argument, parameters));
    const fn = callable(node.expression);
    if (fn !== undefined) return invoke(fn, arguments_, parameters);
    const method = propertyName(node.expression);
    const receiver =
      ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)
        ? evaluate(node.expression.expression, parameters)
        : {};
    if (method === "isNavigationRequest" && receiver.source === "request") return { navigation: true };
    if (method === "url" && receiver.source === "request") return { source: "string" };
    const coupled =
      Boolean(receiver.coupled) ||
      arguments_.some((facts) => facts.coupled) ||
      (matches.has(method) && receiver.source !== undefined && arguments_.some((facts) => facts.fixedHost)) ||
      (method === "test" && Boolean(receiver.fixedHost) && arguments_.some((facts) => facts.source !== undefined));
    // Preserve URL provenance through transformations, including unknown helpers; only fixed-host comparisons/matches couple it.
    return {
      coupled,
      fixedHost: Boolean(receiver.fixedHost) || arguments_.some((facts) => facts.fixedHost),
      source: receiver.source !== undefined || arguments_.some((facts) => facts.source !== undefined) ? "string" : undefined,
    };
  }

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "page" &&
      ["waitForURL", "waitForRequest"].includes(node.expression.name.text)
    ) {
      const predicate = node.arguments[0];
      if (predicate !== undefined) {
        const fn = callable(predicate);
        const parameters = new Map<ts.ParameterDeclaration, AuthFacts>();
        const facts =
          fn === undefined
            ? evaluate(predicate, parameters)
            : invoke(fn, [{ source: node.expression.name.text === "waitForURL" ? "url" : "request" }], parameters);
        compliant ||= Boolean(facts.departure && (node.expression.name.text === "waitForURL" || facts.navigation));
        providerCoupled ||= facts.coupled === true || (fn === undefined && facts.fixedHost === true);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { compliant, providerCoupled };
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
