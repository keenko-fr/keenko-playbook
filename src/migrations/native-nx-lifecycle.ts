import type { Tree } from "@nx/devkit";
import { format } from "oxfmt";

import { GENERATED_CODE_CHECK } from "../generated-code-check.ts";

const PREVIOUS_CHECK =
  "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_CHECK =
  "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const PREVIOUS_CODEGEN_CHECK = "keenko check --guidance --codegen";
const CURRENT_CODEGEN_CHECK = "bun tools/check-generated.ts";
const SYNC_GENERATOR = "keenko:sync";

export default async function nativeNxLifecycle(tree: Tree) {
  const generatedCodeCheck = await formattedGeneratedCodeCheck();
  migrateRootPackage(tree);
  migrateNxConfig(tree);
  migrateGeneratedCodeCheck(tree, generatedCodeCheck);
  await formatMigratedFiles(tree);
}

function migrateRootPackage(tree: Tree) {
  const file = "package.json";
  const pkg = readJson(tree, file);
  const scripts = record(pkg.scripts, `${file}.scripts`);
  migrateKnownString(scripts, "check", PREVIOUS_CHECK, CURRENT_CHECK, `${file} scripts.check`);
  migrateKnownString(scripts, "codegen:check", PREVIOUS_CODEGEN_CHECK, CURRENT_CODEGEN_CHECK, `${file} scripts.codegen:check`);
  pkg.scripts = scripts;
  tree.write(file, json(pkg));
}

function migrateNxConfig(tree: Tree) {
  const file = "nx.json";
  const nx = readJson(tree, file);
  const sync = nx.sync === undefined ? {} : record(nx.sync, `${file}.sync`);
  const configured = sync.globalGenerators;
  if (configured === undefined) {
    sync.globalGenerators = [SYNC_GENERATOR];
  } else {
    if (!Array.isArray(configured) || !configured.every((entry) => typeof entry === "string")) {
      throw new TypeError(`${file}.sync.globalGenerators must be an array of strings`);
    }
    if (!configured.includes(SYNC_GENERATOR)) {
      sync.globalGenerators = [...configured, SYNC_GENERATOR];
    }
  }
  nx.sync = sync;
  tree.write(file, json(nx));
}

function migrateGeneratedCodeCheck(tree: Tree, generatedCodeCheck: string) {
  const file = "tools/check-generated.ts";
  const current = tree.read(file, "utf-8");
  if (current !== null && current !== generatedCodeCheck) {
    throw new Error(`Cannot add ${file} because the project already owns a different file at that path; reconcile it manually`);
  }
  tree.write(file, generatedCodeCheck);
}

function migrateKnownString(recordValue: Record<string, unknown>, key: string, previous: string, current: string, label: string) {
  const value = recordValue[key];
  if (value === current) {
    return;
  }
  if (value !== previous) {
    throw new Error(`Cannot update ${label} because the generated Keenko value was customized; reconcile it manually`);
  }
  recordValue[key] = current;
}

async function formattedGeneratedCodeCheck() {
  const result = await format("tools/check-generated.ts", GENERATED_CODE_CHECK, {
    printWidth: 140,
    sortImports: true,
    sortPackageJson: true,
  });
  if (result.errors.length > 0) {
    throw new Error(`Cannot format generated code check: ${result.errors.map(({ message }) => message).join(", ")}`);
  }
  return result.code;
}

async function formatMigratedFiles(tree: Tree) {
  const formatted = await Promise.all(
    ["package.json", "nx.json"].map(async (file) => {
      const source = tree.read(file, "utf-8");
      if (source === null) {
        throw new Error(`Cannot format migrated ${file}: file is missing`);
      }
      const result = await format(file, source, { printWidth: 140, sortImports: true, sortPackageJson: true });
      if (result.errors.length > 0) {
        throw new Error(`Cannot format migrated ${file}: ${result.errors.map(({ message }) => message).join(", ")}`);
      }
      return [file, result.code] as const;
    })
  );
  for (const [file, source] of formatted) {
    tree.write(file, source);
  }
}

function readJson(tree: Tree, file: string): Record<string, unknown> {
  const source = tree.read(file, "utf-8");
  if (source === null) {
    throw new Error(`Cannot update ${file}: file is missing`);
  }
  return record(JSON.parse(source), file);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
