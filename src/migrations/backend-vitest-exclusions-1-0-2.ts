/* oxlint-disable effect/noNewError, effect/noNullish, effect/noThrowStatement -- Native Nx migrations report unsupported project-owned configuration before writing. */
import type { Tree } from "@nx/devkit";
import * as ts from "typescript";

const path = "packages/backend/vitest.config.ts";

export default function backendVitestExclusions102(tree: Tree) {
  const source = tree.read(path, "utf-8");
  if (source === null) return conflict();
  if (
    ts.transpileModule(source, { reportDiagnostics: true }).diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error) ===
    true
  )
    return conflict();
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const { defineConfig, defaults } = vitestBindings(file);
  const exclude = nodeExclusions(file, defineConfig);
  if (hasNativeExclusions(exclude, defaults)) return;
  // Only the known Node exclusion field and its native API import change. Surrounding source stays byte-for-byte intact.
  const identifiers = new Set<string>();
  function collect(item: ts.Node) {
    if (ts.isIdentifier(item)) identifiers.add(item.text);
    ts.forEachChild(item, collect);
  }
  collect(file);
  const name = defaults?.name.text ?? (identifiers.has("configDefaults") ? "keenkoVitestDefaults" : "configDefaults");
  if (defaults === undefined && identifiers.has(name)) return conflict();
  const edits = [{ position: exclude.getStart(file) + 1, text: `...${name}.exclude, ` }];
  if (defaults === undefined) {
    const names = defineConfig.parent;
    if (!ts.isNamedImports(names)) return conflict();
    const specifier = name === "configDefaults" ? name : `configDefaults as ${name}`;
    edits.push({ position: names.getStart(file) + 1, text: ` ${specifier},` });
  }
  let updated = source;
  for (const edit of edits.toSorted((left, right) => right.position - left.position))
    updated = `${updated.slice(0, edit.position)}${edit.text}${updated.slice(edit.position)}`;
  tree.write(path, updated);
}

function vitestBindings(file: ts.SourceFile) {
  const imports = file.statements
    .filter(ts.isImportDeclaration)
    .filter(
      (item) =>
        ts.isStringLiteral(item.moduleSpecifier) &&
        item.moduleSpecifier.text === "vitest/config" &&
        item.importClause?.phaseModifier === undefined
    );
  const bindings = imports.flatMap((item) => {
    const names = item.importClause?.namedBindings;
    return names !== undefined && ts.isNamedImports(names) ? [...names.elements].filter((name) => !name.isTypeOnly) : [];
  });
  const defineConfig = bindings.filter((item) => (item.propertyName ?? item.name).text === "defineConfig");
  const defaults = bindings.filter((item) => (item.propertyName ?? item.name).text === "configDefaults");
  const [definition] = defineConfig;
  if (defineConfig.length !== 1 || definition === undefined || defaults.length > 1) return conflict();
  return { defaults: defaults[0], defineConfig: definition };
}

function nodeExclusions(file: ts.SourceFile, defineConfig: ts.ImportSpecifier) {
  const exported = file.statements.filter(ts.isExportAssignment);
  const call = exported[0]?.expression;
  if (
    exported.length !== 1 ||
    call === undefined ||
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== defineConfig.name.text ||
    call.arguments.length !== 1
  )
    return conflict();
  const projects = property(property(call.arguments[0], "test"), "projects");
  if (projects === undefined || !ts.isArrayLiteralExpression(projects) || projects.elements.some(ts.isSpreadElement)) return conflict();
  const nodes = projects.elements.filter((project) => {
    const name = property(property(project, "test", false), "name", false);
    return name !== undefined && ts.isStringLiteral(name) && name.text === "node";
  });
  if (nodes.length !== 1) return conflict();
  const node = property(nodes[0], "test");
  const environment = property(node, "environment");
  const exclude = property(node, "exclude");
  if (
    environment === undefined ||
    !ts.isStringLiteral(environment) ||
    environment.text !== "node" ||
    exclude === undefined ||
    !ts.isArrayLiteralExpression(exclude)
  )
    return conflict();
  return exclude;
}

function hasNativeExclusions(exclude: ts.ArrayLiteralExpression, defaults: ts.ImportSpecifier | undefined) {
  const [first] = exclude.elements;
  const extended = first !== undefined && ts.isSpreadElement(first);
  const specific = [...exclude.elements].slice(extended ? 1 : 0);
  if (specific.length !== 2 || !specific.every((item, index) => ts.isStringLiteral(item) && item.text === ["convex/**", "test/**"][index]))
    return conflict();
  if (extended) {
    const { expression } = first;
    if (
      defaults === undefined ||
      !ts.isPropertyAccessExpression(expression) ||
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== defaults.name.text ||
      expression.name.text !== "exclude"
    )
      return conflict();
    return true;
  }
  return false;
}

// Recognize direct literal fields only; opaque spreads, computed keys, and duplicate fields require reconciliation.
function property(node: ts.Node | undefined, name: string, owned = true): ts.Expression | undefined {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) return;
  if (
    owned &&
    node.properties.some((item) => ts.isSpreadAssignment(item) || (item.name !== undefined && ts.isComputedPropertyName(item.name)))
  )
    return conflict();
  const fields = node.properties.filter(
    (item) => item.name !== undefined && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name
  );
  if (fields.length === 0) return;
  const [field] = fields;
  if (fields.length !== 1 || field === undefined || !ts.isPropertyAssignment(field)) return conflict();
  return field.initializer;
}

function conflict(): never {
  throw new Error(
    `Keenko-owned Node test exclusions in ${path} conflict with the 1.0.2 backend Vitest contract. Reconcile the customization manually, then rerun the Keenko migration.`
  );
}
