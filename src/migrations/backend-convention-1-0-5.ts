/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noThrowStatement, effect/noNullish -- Native Nx uses a Promise migration and stops on ambiguous configuration before writes. */
import { joinPathFragments, type Tree } from "@nx/devkit";
import { braceExpand, minimatch } from "minimatch";
import ts from "typescript";

import managedDependencies from "./managed-dependencies-1-0-4.js";

const compilerPath = "packages/backend/tsconfig.json";
const lintPath = "oxlint.config.ts";
const typeRule = "typescript/consistent-type-definitions";
const typeOwners = ["packages/backend/**/*.ts", "packages/shared/**/*.ts"];

// Qualify both configurations before the existing dependency migration can write.
export default async function backendConvention105(tree: Tree) {
  const compiler = updateCompiler(read(tree, compilerPath));
  const lint = updateLint(read(tree, lintPath));
  await managedDependencies(tree);
  if (compiler !== read(tree, compilerPath)) tree.write(compilerPath, compiler);
  if (lint !== read(tree, lintPath)) tree.write(lintPath, lint);
}

function read(tree: Tree, path: string) {
  const source = tree.read(path, "utf-8");
  if (source === null) return conflict(path);
  return source;
}

function conflict(path: string): never {
  throw new Error(
    `Keenko backend convention migration cannot safely update ${path}; reconcile the backend convention manually, then rerun Nx.`
  );
}

function updateCompiler(source: string) {
  if (ts.parseConfigFileTextToJson(compilerPath, source).error !== undefined) return conflict(compilerPath);
  const file = ts.parseJsonText(compilerPath, source);
  const [expression] = file.statements;
  if (expression === undefined || !ts.isExpressionStatement(expression) || !ts.isObjectLiteralExpression(expression.expression))
    return conflict(compilerPath);
  const config = expression.expression;
  const exclude = property(config, "exclude", compilerPath);
  if (exclude !== undefined) {
    if (!ts.isArrayLiteralExpression(exclude.initializer)) return conflict(compilerPath);
    for (const pattern of literals(exclude.initializer, compilerPath))
      if (excludesBackendOwner(pattern)) return conflict(`${compilerPath}#exclude "${pattern}" may exclude data/, domain/ or errors/`);
  }
  const include = property(config, "include", compilerPath);
  if (include === undefined) {
    // Without an explicit file list, TypeScript already includes all backend files.
    if (property(config, "files", compilerPath) !== undefined) return conflict(compilerPath);
    return source;
  }
  if (!ts.isArrayLiteralExpression(include.initializer)) return conflict(compilerPath);
  const paths = literals(include.initializer, compilerPath);
  const missing = ["data/**/*.ts", "domain/**/*.ts", "errors/**/*.ts"].filter(
    (path) => !paths.includes(path) && !paths.some((pattern) => ["**/*.ts", "**/*", "**"].includes(pattern))
  );
  return append(
    file,
    include.initializer.elements,
    include.initializer.end - 1,
    missing.map((path) => `"${path}"`)
  );
}

function excludesBackendOwner(pattern: string) {
  const path = pattern.replaceAll("\\", "/");
  if (path.length === 0) return false;
  // Absolute paths depend on the consumer's checkout and cannot be qualified here.
  if (/^(?:\/|[a-z]:)/iu.test(path)) return true;
  const normalized = joinPathFragments("/packages/backend", path);
  // TypeScript expands extensionless directory paths to recursive globs, including paths to ancestors.
  const expanded = /[.*?]/u.test(normalized.split("/").at(-1) ?? "") ? normalized : joinPathFragments(normalized, "**", "*");
  const glob = expanded.replaceAll("[", "\\[").replaceAll("]", "\\]");
  return ["data", "domain", "errors"].some((owner) =>
    minimatch(`/packages/backend/${owner}`, glob, {
      dot: true,
      // Use TypeScript's wildcard subset; other glob syntax is literal.
      nobrace: true,
      nocase: true,
      nocomment: true,
      noext: true,
      nonegate: true,
      // Partial matching also rejects exclusions of possible descendants, not just existing files.
      partial: true,
    })
  );
}

function updateLint(source: string) {
  const { diagnostics } = ts.transpileModule(source, { fileName: lintPath, reportDiagnostics: true });
  if (diagnostics?.some(({ category }) => category === ts.DiagnosticCategory.Error) === true) return conflict(lintPath);
  const file = ts.createSourceFile(lintPath, source, ts.ScriptTarget.Latest, true);
  const exported = file.statements.filter(ts.isExportAssignment);
  if (exported.length !== 1) return conflict(lintPath);
  const [{ expression }] = exported;
  if (
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== "defineConfig" ||
    expression.arguments.length !== 1
  )
    return conflict(lintPath);
  const [config] = expression.arguments;
  if (!ts.isObjectLiteralExpression(config)) return conflict(lintPath);
  const overrides = property(config, "overrides", lintPath);
  if (overrides === undefined || !ts.isArrayLiteralExpression(overrides.initializer)) return conflict(lintPath);
  const covered = new Set(overrides.initializer.elements.flatMap(checkTypeOverride));
  const missing = typeOwners.filter((owner) => !covered.has(owner));
  if (missing.length === 0) return source;
  // Add only the type policy; consumer Effect rules and common/separate overrides stay byte-identical.
  return append(file, overrides.initializer.elements, overrides.initializer.end - 1, [
    `{ files: [${missing.map((owner) => `"${owner}"`).join(", ")}], rules: { "${typeRule}": "off" } }`,
  ]);
}

function checkTypeOverride(override: ts.Expression) {
  if (!ts.isObjectLiteralExpression(override)) return conflict(lintPath);
  const files = property(override, "files", lintPath);
  if (files === undefined || !ts.isArrayLiteralExpression(files.initializer)) return conflict(lintPath);
  const patterns = literals(files.initializer, lintPath);
  const owners = ["packages/backend", "packages/shared"].filter((owner) =>
    patterns.some((pattern) => minimatch(owner, pattern, { dot: true, nocase: true, partial: true }))
  );
  if (owners.length === 0) return [];
  const rules = property(override, "rules", lintPath);
  if (rules === undefined) return [];
  if (!ts.isObjectLiteralExpression(rules.initializer)) return conflict(lintPath);
  const existing = property(rules.initializer, typeRule, lintPath);
  if (existing === undefined) return [];
  const value = ts.isArrayLiteralExpression(existing.initializer) ? existing.initializer.elements[0] : existing.initializer;
  if (value === undefined || !((ts.isStringLiteral(value) && value.text === "off") || (ts.isNumericLiteral(value) && value.text === "0")))
    return conflict(`${lintPath}#competing backend/shared ${typeRule}`);
  checkTypeExclusions(override, owners);
  return patterns.filter((pattern) => typeOwners.includes(pattern));
}

function checkTypeExclusions(override: ts.ObjectLiteralExpression, owners: readonly string[]) {
  const excluded = property(override, "excludeFiles", lintPath);
  if (excluded === undefined) return;
  if (!ts.isArrayLiteralExpression(excluded.initializer)) return conflict(`${lintPath}#excludeFiles is ambiguous`);
  for (const pattern of literals(excluded.initializer, `${lintPath}#excludeFiles`)) {
    const context = `${lintPath}#excludeFiles "${pattern}" may exclude backend/shared type-policy coverage`;
    for (const expanded of braceExpand(pattern)) {
      if (/^(?:\/|[a-z]:)|[\\()!{}]|(?:^|\/)\.\.(?:\/|$)/iu.test(expanded)) return conflict(context);
      // A literal prefix disjoint from the override's owned trees proves safety regardless of wildcard separator semantics.
      const [prefix] = expanded
        .toLowerCase()
        .replaceAll(/\/{2,}/gu, "/")
        .replace(/^(?:\.\/)+/u, "")
        .split(/[*?[\]]/u);
      if (owners.some((owner) => owner.startsWith(prefix) || prefix.startsWith(`${owner}/`))) return conflict(context);
    }
  }
}

function property(object: ts.ObjectLiteralExpression, name: string, path: string): ts.PropertyAssignment | undefined {
  for (const entry of object.properties) {
    if (ts.isSpreadAssignment(entry) && ts.isIdentifier(entry.expression) && entry.expression.text === "effectRules") continue;
    if (ts.isSpreadAssignment(entry) && entry.expression.getText() === "effectTsgoRecommended.rules") continue;
    if (!ts.isPropertyAssignment(entry) || (!ts.isIdentifier(entry.name) && !ts.isStringLiteral(entry.name))) return conflict(path);
  }
  const matches = object.properties.filter(
    (entry): entry is ts.PropertyAssignment =>
      ts.isPropertyAssignment(entry) && (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) && entry.name.text === name
  );
  if (matches.length > 1) return conflict(path);
  return matches[0];
}

function literals(array: ts.ArrayLiteralExpression, path: string) {
  return array.elements.map((entry) => {
    if (!ts.isStringLiteral(entry)) return conflict(path);
    return entry.text;
  });
}

function append(file: ts.SourceFile, entries: ts.NodeArray<ts.Node>, emptyPosition: number, additions: readonly string[]) {
  const source = file.text;
  if (additions.length === 0) return source;
  const last = entries.at(-1);
  let position = last ? last.end : emptyPosition;
  if (entries.hasTrailingComma) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
    scanner.resetTokenState(position);
    if (scanner.scan() !== ts.SyntaxKind.CommaToken) return conflict("configuration separator");
    position = scanner.getTokenEnd();
  }
  const indent = last ? /^\s*/u.exec(source.slice(source.lastIndexOf("\n", last.getStart(file)) + 1, last.getStart(file)))?.[0] : "  ";
  const prefix = last && !entries.hasTrailingComma ? "," : "";
  const suffix = entries.hasTrailingComma ? "," : "";
  return `${source.slice(0, position)}${prefix}\n${indent ?? ""}${additions.join(`,\n${indent ?? ""}`)}${suffix}${source.slice(position)}`;
}
