import type { Tree } from "@nx/devkit";

const PREVIOUS_CHECKS = new Set([
  "bun run format:check && bun run lint && bun run typecheck && bun run build",
  "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build",
]);
const CURRENT_CHECK = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";
const PREVIOUS_CODEGEN_CHECK = "keenko check --guidance";
const CURRENT_CODEGEN_CHECK = "keenko check --guidance --codegen";
const CURRENT_TEST = "bun test --pass-with-no-tests";
const PREVIOUS_OXLINT = "1.80.0";
const CURRENT_OXLINT = "1.81.0";
const PREVIOUS_EFFECT_TSGO = "0.38.0";
const CURRENT_EFFECT_TSGO = "0.39.1";
const PREVIOUS_EFFECT_PLUGIN = "0.11.0";
const CURRENT_EFFECT_PLUGIN = "0.12.0";

export default function normalizeCheck(tree: Tree) {
  const source = tree.read("package.json", "utf-8");
  if (source === null) {
    throw new Error("Cannot migrate: package.json is missing");
  }
  const pkg = object(JSON.parse(source), "package.json");
  const scripts = stringRecord(pkg.scripts, "package.json.scripts");
  if (scripts === undefined) {
    throw new Error("Cannot migrate package.json scripts because the Keenko baseline is missing");
  }

  if (scripts.check !== CURRENT_CHECK) {
    if (scripts.check === undefined || !PREVIOUS_CHECKS.has(scripts.check)) {
      throw new Error(
        "Cannot migrate package.json scripts.check because it was customized; reconcile it with the Keenko check pipeline first"
      );
    }
    scripts.check = CURRENT_CHECK;
  }
  if (scripts["codegen:check"] === undefined || scripts["codegen:check"] === PREVIOUS_CODEGEN_CHECK) {
    scripts["codegen:check"] = CURRENT_CODEGEN_CHECK;
  } else if (scripts["codegen:check"] !== CURRENT_CODEGEN_CHECK) {
    throw new Error(
      "Cannot migrate package.json scripts.codegen:check because it was customized; reconcile it with Keenko generated-code verification first"
    );
  }
  scripts.test ??= CURRENT_TEST;

  const devDependencies = stringRecord(pkg.devDependencies, "package.json.devDependencies");
  if (devDependencies === undefined) {
    throw new Error("Cannot migrate package.json devDependencies because the Keenko baseline is missing");
  }
  if (devDependencies.oxlint === PREVIOUS_OXLINT) {
    devDependencies.oxlint = CURRENT_OXLINT;
  } else if (devDependencies.oxlint !== CURRENT_OXLINT) {
    throw new Error("Cannot migrate devDependencies.oxlint because it was customized; reconcile it with the Keenko tooling baseline first");
  }
  migrateTool(devDependencies, "@effect/tsgo", PREVIOUS_EFFECT_TSGO, CURRENT_EFFECT_TSGO);
  migrateTool(devDependencies, "oxlint-plugin-effect", PREVIOUS_EFFECT_PLUGIN, CURRENT_EFFECT_PLUGIN);

  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

function migrateTool(devDependencies: Record<string, string>, name: string, previous: string, current: string) {
  if (devDependencies[name] === previous) {
    devDependencies[name] = current;
    return;
  }
  if (devDependencies[name] !== current) {
    throw new Error(
      `Cannot migrate devDependencies.${name} because it was customized; reconcile it with the Keenko tooling baseline first`
    );
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function stringRecord(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (!entries.every(([, entry]) => typeof entry === "string")) {
    throw new TypeError(`${label} must contain only strings`);
  }
  return Object.fromEntries(entries.map(([key, entry]) => [key, String(entry)]));
}
