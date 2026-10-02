/* oxlint-disable effect/maxCognitiveComplexity, effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Native Nx migration planning synchronously reads packaged release baselines.
import { readFileSync } from "node:fs";

import { formatFiles, updateJson, type Tree } from "@nx/devkit";
import { FsTree } from "nx/src/generators/tree";
import * as ts from "typescript";

type JsonObject = Record<string, unknown>;

// Frozen fragments from the supported 1.0.1 source and 1.0.2 target generators.
const sourceRouteTreeDriftCheck = "git status --porcelain --untracked-files=all -- apps/web/src/routeTree.gen.ts";
const targetRouteTreeDriftCheck = "git status --porcelain --untracked-files=all -- ':(glob)apps/*/src/routeTree.gen.ts'";
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
  // Keep caller configuration available to Nx's formatter, but copy back only migration changes.
  const changedPaths = new Set(
    staged
      .listChanges()
      .filter((change) => {
        const original = tree.read(change.path);
        return change.content === null ? original !== null : original === null || !change.content.equals(original);
      })
      .map((change) => change.path)
  );
  const sourceWrites = new Map(
    [...boundaryPolicyMigration, ...(authSmokeMigration === undefined ? [] : [authSmokeMigration])].map((write) => [
      write.path,
      write.source,
    ])
  );
  return formatFiles(staged).then(() => {
    for (const change of staged.listChanges()) {
      if (!changedPaths.has(change.path)) continue;
      if (change.type === "DELETE") tree.delete(change.path);
      else if (change.content !== null) tree.write(change.path, sourceWrites.get(change.path) ?? change.content, change.options);
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
      const classifications = tags.filter((tag) => tag.startsWith("type:"));
      if (classifications.length > 1 || classifications.some((tag) => tag !== "type:app"))
        return conflict(path, "nx.tags application classification");
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
    const markers: { exclude: unknown[]; index: number }[] = [];
    for (const entry of plugins) {
      if (!isObject(entry) || entry.plugin !== "@nx/vitest" || !Array.isArray(entry.exclude)) continue;
      for (const [index, value] of entry.exclude.entries())
        if (value === oldExclusion || value === targetExclusion) markers.push({ exclude: entry.exclude, index });
    }
    const marker = markers[0];
    if (markers.length !== 1 || marker === undefined) return conflict("nx.json", "@nx/vitest application scope");
    marker.exclude[marker.index] = targetExclusion;
    return nxJson;
  });
}

function migrateRootVerification(tree: Tree) {
  updateJson<JsonObject>(tree, "package.json", (packageJson) => {
    const scripts = packageJson.scripts;
    if (!isObject(scripts) || typeof scripts.check !== "string") return conflict("package.json", "scripts.check");
    const check = scripts.check;
    const matches = routeTreeCommandMatches(check);
    const match = matches[0];
    if (matches.length !== 1 || match === undefined) return conflict("package.json", "scripts.check generated route-tree command");
    scripts.check = `${check.slice(0, match.index)}${targetRouteTreeDriftCheck}${check.slice(match.index + match.fragment.length)}`;
    return packageJson;
  });
}

// Only locate the frozen command at lexical boundaries. No shell behavior or command equivalence is evaluated.
// oxlint-disable-next-line eslint/complexity -- Keep the bounded quote/escape/substitution state machine together; it only locates frozen fragments.
function routeTreeCommandMatches(script: string) {
  const matches: { fragment: string; index: number }[] = [];
  const substitutions: string[] = [];
  let quote = "";
  let commandStart = true;
  for (let index = 0; index < script.length; index += 1) {
    const character = script[index];
    const next = script[index + 1];
    if (quote === "'") {
      if (character === "'") quote = "";
      continue;
    }
    if (character === "\\") {
      if (next === undefined) return conflict("package.json", "scripts.check generated route-tree command");
      if (next !== "\n") commandStart = false;
      index += 1;
      continue;
    }
    if (character === "$" && next === "{") {
      const parameter = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}/u.exec(script.slice(index))?.[0];
      if (parameter !== undefined) {
        index += parameter.length - 1;
        commandStart = false;
        continue;
      }
    }
    // ponytail: reject opaque shell data/expansions instead of parsing their contents as commands.
    if (
      character === "`" ||
      (character === "$" && (next === "{" || (next === "(" && script[index + 2] === "("))) ||
      (quote === "" && character === "<" && next === "<")
    )
      return conflict("package.json", "scripts.check generated route-tree command");
    if (character === "$" && next === "(") {
      substitutions.push(quote);
      quote = "";
      commandStart = true;
      index += 1;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      commandStart = false;
      continue;
    }
    if (character === "#" && (index === 0 || /[\s;&|)]/u.test(script[index - 1] ?? ""))) {
      const newline = script.indexOf("\n", index);
      if (newline === -1) break;
      index = newline - 1;
      continue;
    }
    if (character === ")" && substitutions.length > 0) {
      quote = substitutions.pop() ?? "";
      commandStart = false;
      continue;
    }
    if (character === ";" || character === "\n" || (character === "&" && next === "&") || (character === "|" && next === "|")) {
      commandStart = true;
      if (character === "&" || character === "|") index += 1;
      continue;
    }
    if (/\s/u.test(character ?? "")) continue;
    if (commandStart) {
      const fragment = [sourceRouteTreeDriftCheck, targetRouteTreeDriftCheck].find((candidate) => script.startsWith(candidate, index));
      if (fragment !== undefined) {
        const end = index + fragment.length;
        if (end === script.length || /[\s;&|)]/u.test(script[end] ?? "")) {
          matches.push({ fragment, index });
          index = end - 1;
        }
      }
    }
    commandStart = false;
  }
  if (quote !== "" || substitutions.length > 0) return conflict("package.json", "scripts.check generated route-tree command");
  return matches;
}

function planBoundaryPolicyMigration(tree: Tree) {
  const path = "oxlint.config.ts";
  const source = tree.read(path, "utf-8");
  if (source === null) return conflict(path, "application lint and boundary policy");
  const parsed = ts.transpileModule(source, { reportDiagnostics: true });
  if (parsed.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error))
    return conflict(path, "application lint and boundary policy");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const config = exportedOxlintConfig(file);
  const overrides = configProperty(config, "overrides");
  if (overrides === undefined || !ts.isArrayLiteralExpression(overrides)) return conflict(path, "application lint override");
  const oldFiles = "apps/web/**/*.{ts,tsx}";
  const targetFiles = "apps/**/*.{ts,tsx}";
  const applicationOverrides = overrides.elements.filter((override) => {
    const files = configProperty(override, "files", false);
    if (
      files === undefined ||
      !ts.isArrayLiteralExpression(files) ||
      !files.elements.some((element) => ts.isStringLiteral(element) && (element.text === oldFiles || element.text === targetFiles))
    )
      return false;
    const rule = configProperty(configProperty(override, "rules", false), "eslint/sort-keys", false);
    return rule !== undefined && ts.isStringLiteral(rule) && rule.text === "off";
  });
  if (applicationOverrides.length !== 1) return conflict(path, "application lint override");
  configProperty(configProperty(applicationOverrides[0], "rules"), "eslint/sort-keys");
  const files = configProperty(applicationOverrides[0], "files");
  if (files === undefined || !ts.isArrayLiteralExpression(files) || files.elements.length !== 1)
    return conflict(path, "application lint override");
  const filesMarker = files.elements[0];
  if (filesMarker === undefined || !ts.isStringLiteral(filesMarker)) return conflict(path, "application lint override");
  const rule = configProperty(configProperty(config, "rules"), "@nx/enforce-module-boundaries");
  if (rule === undefined || !ts.isArrayLiteralExpression(rule)) return conflict(path, "dependency constraints");
  const constraints = configProperty(rule.elements[1], "depConstraints");
  if (constraints === undefined || !ts.isArrayLiteralExpression(constraints)) return conflict(path, "dependency constraints");
  const applicationTag = applicationConstraintTag(constraints);
  const edits = [
    ...(filesMarker.text === oldFiles ? [{ node: filesMarker, source: '"apps/**/*.{ts,tsx}"' }] : []),
    ...(applicationTag.text === "scope:web" ? [{ node: applicationTag, source: '"type:app"' }] : []),
  ];
  let migrated = source;
  for (const edit of edits.toSorted((left, right) => right.node.getStart() - left.node.getStart()))
    migrated = `${migrated.slice(0, edit.node.getStart())}${edit.source}${migrated.slice(edit.node.end)}`;
  return migrated === source ? [] : [{ path, source: migrated }];
}

function exportedOxlintConfig(file: ts.SourceFile) {
  const path = "oxlint.config.ts";
  const exports = file.statements.filter(ts.isExportAssignment);
  const expression = exports[0]?.expression;
  if (
    exports.length !== 1 ||
    expression === undefined ||
    !ts.isCallExpression(expression) ||
    expression.expression.getText(file) !== "defineConfig"
  )
    return conflict(path, "application lint and boundary policy");
  return expression.arguments[0];
}

// Select direct literal properties only. No evaluation of config expressions or bindings.
function configProperty(node: ts.Node | undefined, name: string, owned = true) {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) return;
  const properties = node.properties.filter(
    (property) =>
      property.name !== undefined && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name
  );
  const property = properties[0];
  if (property === undefined) return;
  // Candidate discovery must not validate unrelated project objects. Validate only the selected owned context.
  if (!owned) return ts.isPropertyAssignment(property) ? property.initializer : undefined;
  if (
    properties.length > 1 ||
    !ts.isPropertyAssignment(property) ||
    node.properties.some(
      (following) =>
        following.pos > property.pos &&
        (ts.isSpreadAssignment(following) || (following.name !== undefined && ts.isComputedPropertyName(following.name)))
    )
  )
    return conflict("oxlint.config.ts", name);
  return property.initializer;
}

function applicationConstraintTag(constraints: ts.ArrayLiteralExpression) {
  const recognized = constraints.elements.filter((constraint) => {
    const tag = configProperty(constraint, "sourceTag", false);
    if (tag === undefined || !ts.isStringLiteral(tag)) return false;
    return (
      (tag.text === "type:app" || tag.text === "scope:web") &&
      matchesApplicationTargets(configProperty(constraint, "onlyDependOnLibsWithTags", false))
    );
  });
  if (recognized.length !== 1) return conflict("oxlint.config.ts", "application dependency constraint");
  const constraint = recognized[0];
  const tag = configProperty(constraint, "sourceTag");
  if (tag === undefined || !ts.isStringLiteral(tag) || !matchesApplicationTargets(configProperty(constraint, "onlyDependOnLibsWithTags")))
    return conflict("oxlint.config.ts", "application dependency constraint");
  return tag;
}

function matchesApplicationTargets(node: ts.Node | undefined) {
  if (node === undefined || !ts.isArrayLiteralExpression(node) || node.elements.some((element) => !ts.isStringLiteral(element)))
    return false;
  const tags = node.elements.map((element) => (ts.isStringLiteral(element) ? element.text : "")).toSorted();
  return tags.length === applicationTargetTags.length && tags.every((tag, index) => tag === applicationTargetTags[index]);
}

function migrateContinuousTargets(tree: Tree) {
  for (const root of ["apps", "packages"]) {
    for (const workspace of tree.children(root)) {
      const path = `${root}/${workspace}/package.json`;
      if (!tree.exists(path)) continue;
      updateJson<JsonObject>(tree, path, (packageJson) => {
        const nx = packageJson.nx;
        if (!isObject(nx) || !isContinuousWorkspace(nx.tags)) return packageJson;
        if (nx.targets !== undefined && !isObject(nx.targets)) return conflict(path, "nx.targets");
        const scripts = packageJson.scripts;
        if ((!isObject(scripts) || typeof scripts.dev !== "string") && (!isObject(nx.targets) || nx.targets.dev === undefined))
          return packageJson;
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
  const old = authSmokeFields(oldSmoke);
  const target = authSmokeFields(targetSmoke);
  const signatures = new Map<string, Set<string>>();
  for (const baseline of [old, target])
    for (const [key, node] of baseline) {
      const known = signatures.get(key) ?? new Set<string>();
      known.add(authSmokeTokens(node.getText()));
      signatures.set(key, known);
    }
  const current = authSmokeFields(source, signatures);
  const matches = (baseline: Map<string, ts.Node>) =>
    current.size === baseline.size &&
    [...current.keys()].join(",") === [...baseline.keys()].join(",") &&
    [...baseline].every(([key, node]) => {
      const actual = current.get(key);
      return actual !== undefined && authSmokeTokens(actual.getText()) === authSmokeTokens(node.getText());
    });
  if (matches(target)) return;
  if (!matches(old)) return conflict(path, "Hosted UI transition detection");
  const body = current.get("baseUrl")?.parent;
  if (
    body !== undefined &&
    ts.isBlock(body) &&
    body.statements.some(
      (statement) =>
        (ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some((declaration) => declaresAuthAuthority(declaration.name))) ||
        ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
          statement.name !== undefined &&
          ["applicationOrigin", "isOutsideApplicationOrigin"].includes(statement.name.text))
    )
  )
    return conflict(path, "Hosted UI transition detection");
  const edits = [...current].map(([key, node]) => {
    const replacement = target.get(key);
    if (replacement === undefined) return conflict(path, "Hosted UI transition detection");
    const line = source.slice(source.lastIndexOf("\n", node.getStart()) + 1, node.getStart());
    const indent = /^[\t ]*/u.exec(line)?.[0] ?? "";
    const authority =
      key === "baseUrl"
        ? [target.get("applicationOrigin"), target.get("isOutsideApplicationOrigin")]
            .map((field) => (field === undefined ? "" : `\n${indent}${authFieldText(field, indent)}`))
            .join("")
        : "";
    return { end: node.end, source: `${authFieldText(replacement, indent)}${authority}`, start: node.getStart() };
  });
  let migrated = source;
  for (const edit of edits.toSorted((left, right) => right.start - left.start))
    migrated = `${migrated.slice(0, edit.start)}${edit.source}${migrated.slice(edit.end)}`;
  return { path, source: migrated };
}

// Prevent inserted baseline declarations from colliding with existing bindings; do not resolve their values.
function declaresAuthAuthority(name: ts.BindingName): boolean {
  return ts.isIdentifier(name)
    ? ["applicationOrigin", "isOutsideApplicationOrigin"].includes(name.text)
    : name.elements.some((element) => ts.isBindingElement(element) && declaresAuthAuthority(element.name));
}

// Reindent only inserted baseline fields; surrounding project source is left byte-for-byte intact.
function authFieldText(node: ts.Node, indent: string) {
  const source = node.getSourceFile().text;
  const baselineIndent = node.getStart() - (source.lastIndexOf("\n", node.getStart()) + 1);
  return node
    .getText()
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indent}${line.slice(baselineIndent)}`))
    .join("\n");
}

// Locate only generated transition fields. This is syntax selection, not helper resolution or semantic analysis.
function authSmokeFields(source: string, signatures?: Map<string, Set<string>>) {
  const path = "apps/web/e2e/auth.e2e.ts";
  const parsed = ts.transpileModule(source, { reportDiagnostics: true });
  if (parsed.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error))
    return conflict(path, "Hosted UI transition detection");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const fields = new Map<string, ts.Node>();
  const declarationNames = new Set(["baseUrl", "applicationOrigin", "isOutsideApplicationOrigin", "hostedUiDocumentRequest"]);
  const callees = ["expect(page).toHaveURL", "expect(new URL(page.url()).origin).not.toBe"];
  const namedCall = (node: ts.Node, name: string): node is ts.CallExpression =>
    ts.isCallExpression(node) && authSmokeTokens(node.expression.getText(file)) === authSmokeTokens(name);
  const add = (key: string, node: ts.Node) => {
    if (signatures !== undefined && !signatures.get(key)?.has(authSmokeTokens(node.getText()))) return;
    if (fields.has(key)) return conflict(path, "Hosted UI transition detection");
    fields.set(key, node);
  };
  const bodies: ts.Block[] = [];
  function locate(node: ts.Node) {
    if (ts.isBlock(node) && hasAuthSmokeFields(node, signatures)) bodies.push(node);
    ts.forEachChild(node, locate);
  }
  locate(file);
  if (bodies.length !== 1) return conflict(path, "Hosted UI transition detection");
  for (const body of bodies) {
    for (const item of body.statements) {
      if (ts.isVariableStatement(item)) {
        for (const declaration of item.declarationList.declarations)
          if (ts.isIdentifier(declaration.name) && declarationNames.has(declaration.name.text)) {
            add(declaration.name.text, item);
          }
      }
      if (!ts.isExpressionStatement(item)) continue;
      const expression = ts.isAwaitExpression(item.expression) ? item.expression.expression : item.expression;
      if (callees.some((callee) => namedCall(expression, callee))) add("hostedUiAssertion", item);
      if (!namedCall(expression, "Promise.all")) continue;
      const array = expression.arguments[0];
      if (
        array === undefined ||
        !ts.isArrayLiteralExpression(array) ||
        !array.elements.some((element) => ts.isIdentifier(element) && element.text === "hostedUiDocumentRequest")
      )
        continue;
      for (const element of array.elements) if (namedCall(element, "page.waitForURL")) add("hostedUiWait", element);
    }
  }
  return fields;
}

// The request declaration anchors a coherent field set in one block, independent of its wrapper.
function hasAuthSmokeFields(body: ts.Block, signatures?: Map<string, Set<string>>) {
  return body.statements
    .filter(ts.isVariableStatement)
    .some((item) =>
      signatures === undefined
        ? item.declarationList.declarations.some(
            (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "hostedUiDocumentRequest"
          )
        : signatures.get("hostedUiDocumentRequest")?.has(authSmokeTokens(item.getText()))
    );
}

// Compare owned-field syntax, allowing only formatter changes to whitespace, quotes, and trailing commas.
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
