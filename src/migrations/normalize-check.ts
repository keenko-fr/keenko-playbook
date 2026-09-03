import type { Tree } from "@nx/devkit";
import { format } from "oxfmt";

import { KEENKO_BOUNDARY_CONSTRAINTS } from "../boundaries.ts";

const PREVIOUS_CHECKS = new Set([
  "bun run format:check && bun run lint && bun run typecheck && bun run build",
  "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build",
  "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build",
]);
const CURRENT_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const PREVIOUS_CODEGEN_CHECK = "keenko check --guidance";
const CURRENT_CODEGEN_CHECK = "keenko check --guidance --codegen";
const CURRENT_TEST = "bun test --pass-with-no-tests";
const PREVIOUS_OXLINT = "1.80.0";
const CURRENT_OXLINT = "1.81.0";
const PREVIOUS_EFFECT_TSGO = "0.38.0";
const CURRENT_EFFECT_TSGO = "0.39.1";
const PREVIOUS_EFFECT_PLUGIN = "0.11.0";
const CURRENT_EFFECT_PLUGIN = "0.12.0";
const PREVIOUS_TYPESCRIPT = "7.0.2";
const CURRENT_TYPESCRIPT = "npm:@typescript/typescript6@6.0.2";
const CURRENT_TYPESCRIPT_NATIVE = "npm:typescript@7.0.2";
const CURRENT_NX_OXLINT = "23.2.0";
const NX_BOUNDARY_PLUGIN = '"@nx/oxlint/boundaries-plugin"';
const CURRENT_GENERATED_IGNORES = [
  "packages/backend/confect/**",
  "packages/backend/convex/**",
  "!packages/backend/convex/tsconfig.json",
  "!packages/backend/convex/convex.config.ts",
];
const UI_OVERRIDE = `    {
      files: ["packages/ui/**/*"],
      rules: { "eslint/sort-keys": "off" },
    },
`;
const NX_BOUNDARY_CONSTRAINTS = KEENKO_BOUNDARY_CONSTRAINTS.map(
  ({ onlyDependOnLibsWithTags, sourceTag }) =>
    `          { onlyDependOnLibsWithTags: [${onlyDependOnLibsWithTags.map((tag) => `"${tag}"`).join(", ")}], sourceTag: "${sourceTag}" },`
).join("\n");
const NX_BOUNDARY_RULE = `    "@nx/enforce-module-boundaries": [
      "error",
      {
        allow: [],
        allowCircularSelfDependency: true,
        depConstraints: [
${NX_BOUNDARY_CONSTRAINTS}
        ],
      },
    ],
`;

export default async function normalizeCheck(tree: Tree) {
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
  migrateIntroducedTool(devDependencies, "@nx/oxlint", CURRENT_NX_OXLINT);
  migrateIntroducedTool(devDependencies, "@typescript/native", CURRENT_TYPESCRIPT_NATIVE);
  migrateTool(devDependencies, "typescript", PREVIOUS_TYPESCRIPT, CURRENT_TYPESCRIPT);

  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  migrateOxlintConfig(tree);
  await formatMigratedFiles(tree);
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

async function formatMigratedFiles(tree: Tree) {
  for (const path of ["package.json", "oxlint.config.ts"]) {
    const source = tree.read(path, "utf-8");
    if (source === null) {
      continue;
    }
    const result = await format(path, source, { printWidth: 140, sortImports: true, sortPackageJson: true });
    if (result.errors.length > 0) {
      throw new Error(`Cannot format migrated ${path}: ${result.errors.map(({ message }) => message).join(", ")}`);
    }
    tree.write(path, result.code);
  }
}

function migrateIntroducedTool(devDependencies: Record<string, string>, name: string, current: string) {
  if (devDependencies[name] === undefined) {
    devDependencies[name] = current;
    return;
  }
  if (devDependencies[name] !== current) {
    throw new Error(
      `Cannot migrate devDependencies.${name} because it was customized; reconcile it with the Keenko tooling baseline first`
    );
  }
}

function migrateOxlintConfig(tree: Tree) {
  const source = tree.read("oxlint.config.ts", "utf-8");
  if (source === null) {
    throw new Error("Cannot migrate oxlint.config.ts because the Keenko baseline is missing");
  }
  let migrated = migrateJsPlugins(source);
  migrated = migrateGeneratedIgnores(migrated);
  migrated = migrateUiOverride(migrated);
  migrated = migrateBoundaryRule(migrated);
  if (migrated !== source) {
    tree.write("oxlint.config.ts", migrated);
  }
}

function migrateGeneratedIgnores(source: string) {
  const match = /(?<prefix>\n  ignorePatterns:\s*\[)(?<entries>[^\]]*)(?<suffix>\],)/u.exec(source);
  if (match?.groups === undefined) {
    throw new Error(
      "Cannot migrate oxlint.config.ts ignorePatterns because the known Keenko-owned configuration was customized; reconcile it manually"
    );
  }
  const entries = match.groups.entries
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (!entries.every((entry) => /^"[^"]+"$/u.test(entry))) {
    throw new Error(
      "Cannot migrate oxlint.config.ts ignorePatterns because the known Keenko-owned configuration was customized; reconcile it manually"
    );
  }
  const next = [...entries];
  for (const pattern of CURRENT_GENERATED_IGNORES) {
    const quoted = `"${pattern}"`;
    if (!next.includes(quoted)) {
      next.push(quoted);
    }
  }
  return source.replace(match[0], `${match.groups.prefix}${next.join(", ")}${match.groups.suffix}`);
}

function migrateUiOverride(source: string) {
  const uiMarker = 'files: ["packages/ui/**/*"]';
  if (source.includes(uiMarker)) {
    if (!source.includes(UI_OVERRIDE)) {
      throw new Error(
        "Cannot migrate oxlint.config.ts packages/ui override because the Keenko-owned override was customized; reconcile it manually"
      );
    }
    return source;
  }
  const backendOverride = '    {\n      files: ["packages/backend/**/*.ts"],';
  if (!source.includes(backendOverride)) {
    throw new Error(
      "Cannot migrate oxlint.config.ts overrides because the known Keenko-owned configuration was customized; reconcile it manually"
    );
  }
  return source.replace(backendOverride, `${UI_OVERRIDE}${backendOverride}`);
}

function migrateJsPlugins(source: string) {
  const match = /(?<prefix>\n  jsPlugins:\s*\[)(?<entries>[^\]]*)(?<suffix>\],)/u.exec(source);
  if (match?.groups === undefined) {
    throw new Error(
      "Cannot migrate oxlint.config.ts jsPlugins because the known Keenko-owned configuration was customized; reconcile it manually"
    );
  }
  const entries = match.groups.entries
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (!entries.every((entry) => /^"[^"]+"$/u.test(entry))) {
    throw new Error(
      "Cannot migrate oxlint.config.ts jsPlugins because the known Keenko-owned configuration was customized; reconcile it manually"
    );
  }
  if (entries.includes(NX_BOUNDARY_PLUGIN)) {
    return source;
  }
  const nextEntries = [NX_BOUNDARY_PLUGIN, ...entries].join(", ");
  return source.replace(match[0], `${match.groups.prefix}${nextEntries}${match.groups.suffix}`);
}

function migrateBoundaryRule(source: string) {
  if (source.includes('"@nx/enforce-module-boundaries"')) {
    if (!source.includes(NX_BOUNDARY_RULE)) {
      throw new Error(
        "Cannot migrate oxlint.config.ts @nx/enforce-module-boundaries because the Keenko-owned rule was customized; reconcile it manually"
      );
    }
    return source;
  }
  const rootRules = "\n  rules: {\n";
  const rootRulesIndex = source.lastIndexOf(rootRules);
  if (rootRulesIndex === -1) {
    throw new Error(
      "Cannot migrate oxlint.config.ts rules because the known Keenko-owned configuration was customized; reconcile it manually"
    );
  }
  const insertion = rootRulesIndex + rootRules.length;
  return `${source.slice(0, insertion)}${NX_BOUNDARY_RULE}${source.slice(insertion)}`;
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
