/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noThrowStatement, effect/noNullish -- Native Nx uses a Promise migration and stops on ambiguous configuration before writes. */
import type { Tree } from "@nx/devkit";
import ts from "typescript";

import managedDependencies from "./managed-dependencies-1-0-4.js";

const compilerPath = "packages/backend/tsconfig.json";
const lintPath = "oxlint.config.ts";
const typeRule = "typescript/consistent-type-definitions";

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
  throw new Error(`Keenko 1.0.5 migration cannot safely update ${path}; reconcile the backend convention manually, then rerun Nx.`);
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
    if (literals(exclude.initializer, compilerPath).some((path) => /^(?:\.\/)?(?:domain|errors)(?:\/|$)/u.test(path)))
      return conflict(compilerPath);
  }
  const include = property(config, "include", compilerPath);
  if (include === undefined) {
    // Without an explicit file list, TypeScript already includes all backend files.
    if (property(config, "files", compilerPath) !== undefined) return conflict(compilerPath);
    return source;
  }
  if (!ts.isArrayLiteralExpression(include.initializer)) return conflict(compilerPath);
  const paths = literals(include.initializer, compilerPath);
  const missing = ["domain/**/*.ts", "errors/**/*.ts"].filter(
    (path) => !paths.includes(path) && !paths.some((pattern) => ["**/*.ts", "**/*", "**"].includes(pattern))
  );
  return append(
    file,
    include.initializer.elements,
    include.initializer.end - 1,
    missing.map((path) => `"${path}"`)
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
  const rules = backendRules(overrides.initializer);
  const existing = property(rules, typeRule, lintPath);
  if (existing !== undefined) {
    const value = ts.isArrayLiteralExpression(existing.initializer) ? existing.initializer.elements[0] : existing.initializer;
    if (value === undefined) return conflict(`${lintPath}#${typeRule}`);
    if ((ts.isStringLiteral(value) && value.text === "off") || (ts.isNumericLiteral(value) && value.text === "0")) return source;
    return conflict(`${lintPath}#${typeRule}`);
  }
  const following = rules.properties.find(
    (entry) => ts.isPropertyAssignment(entry) && ts.isStringLiteral(entry.name) && entry.name.text > typeRule
  );
  if (following === undefined) return append(file, rules.properties, rules.end - 1, [`"${typeRule}": "off"`]);
  const position = following.getStart(file);
  const indent = /^\s*/u.exec(source.slice(source.lastIndexOf("\n", position) + 1, position))?.[0] ?? "";
  return `${source.slice(0, position)}"${typeRule}": "off",\n${indent}${source.slice(position)}`;
}

function backendRules(overrides: ts.ArrayLiteralExpression) {
  const backends: ts.ObjectLiteralExpression[] = [];
  for (const override of overrides.elements) {
    if (!ts.isObjectLiteralExpression(override)) return conflict(lintPath);
    const files = property(override, "files", lintPath);
    if (files === undefined || !ts.isArrayLiteralExpression(files.initializer)) return conflict(lintPath);
    const patterns = literals(files.initializer, lintPath);
    if (!patterns.includes("packages/backend/**/*.ts")) {
      checkOtherOverride(override, patterns);
      continue;
    }
    if (patterns.length !== 1) return conflict(lintPath);
    backends.push(override);
  }
  if (backends.length !== 1) return conflict(lintPath);
  const rules = property(backends[0], "rules", lintPath);
  if (rules === undefined || !ts.isObjectLiteralExpression(rules.initializer)) return conflict(lintPath);
  return rules.initializer;
}

function checkOtherOverride(override: ts.ObjectLiteralExpression, patterns: readonly string[]) {
  if (patterns.every((pattern) => /^(?:apps\/|packages\/(?:ui|shared)\/)/u.test(pattern))) return;
  const rules = property(override, "rules", lintPath);
  if (rules === undefined) return;
  if (!ts.isObjectLiteralExpression(rules.initializer) || property(rules.initializer, typeRule, lintPath) !== undefined)
    return conflict(`${lintPath}#competing backend override`);
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
