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
const PREVIOUS_TYPESCRIPT = "7.0.2";
const PREVIOUS_WEB_TYPESCRIPT = "6.0.2";
const PREVIOUS_TYPESCRIPT_ALIAS = "npm:@typescript/typescript6@6.0.2";
const CURRENT_TYPESCRIPT = "6.0.2";
const CURRENT_TYPESCRIPT_NATIVE = "npm:typescript@7.0.2";
const CURRENT_TYPESCRIPT_NATIVE_TSC = "node ../../node_modules/@typescript/native/bin/tsc --noEmit";
const CURRENT_NX_OXLINT = "23.2.0";
const PREVIOUS_WEB_CODEGEN = "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide && tsr generate";
const CURRENT_WEB_CODEGEN = "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --no-emit-readme && tsr generate";
const PREVIOUS_UI = "bunx --bun shadcn@4.20.1 add -c apps/web";
const CURRENT_UI = "bun tools/keenko-ui.ts";
const CURRENT_UI_CVA = "0.7.1";
const WORKSPACE_MANIFESTS = [
  "apps/web/package.json",
  "packages/backend/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
] as const;
const CURRENT_GENERATED_IGNORES = [
  "packages/backend/confect/**",
  "packages/backend/convex/**",
  "!packages/backend/convex/tsconfig.json",
  "!packages/backend/convex/convex.config.ts",
] as const;
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
const UI_TOOL = `const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error("Pass at least one shadcn component name.");
}

const options = { stderr: "inherit", stdin: "inherit", stdout: "inherit" } as const;
const add = Bun.spawnSync(["bunx", "--bun", "shadcn@4.20.1", "add", "-c", "apps/web", ...args], options);
if (add.exitCode !== 0) {
  throw new Error("shadcn failed");
}

const install = Bun.spawnSync(["bun", "install"], options);
if (install.exitCode !== 0) {
  throw new Error("bun install failed after shadcn updated workspace dependencies");
}

const codegen = Bun.spawnSync(["bun", "run", "codegen"], options);
if (codegen.exitCode !== 0) {
  throw new Error("Keenko codegen failed after shadcn updated dependencies");
}

const format = Bun.spawnSync(["bun", "run", "format"], options);
if (format.exitCode !== 0) {
  throw new Error("Keenko format failed after shadcn generated components");
}

const lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], options);
if (lintFix.exitCode !== 0) {
  throw new Error("Keenko lint fixes failed after shadcn generated components");
}

const reformat = Bun.spawnSync(["bun", "run", "format"], options);
if (reformat.exitCode !== 0) {
  throw new Error("Keenko format failed after lint fixes");
}
`;

export default async function normalizeCheck(tree: Tree) {
  migrateRootPackage(tree);
  for (const file of WORKSPACE_MANIFESTS) {
    const previousTypescript = file === "apps/web/package.json" ? PREVIOUS_WEB_TYPESCRIPT : PREVIOUS_TYPESCRIPT;
    migrateWorkspaceTypescript(tree, file, previousTypescript);
  }
  migrateWebPackage(tree);
  migrateUiPackage(tree);
  migrateComponentsConfig(tree, "apps/web/components.json");
  migrateComponentsConfig(tree, "packages/ui/components.json");
  migrateUiTsconfig(tree);
  migrateUiTool(tree);
  migrateGeneratedConfig(tree, "oxfmt.config.ts");
  migrateOxlintConfig(tree);
  tree.delete("apps/web/src/paraglide/README.md");
  await formatMigratedFiles(tree);
}

function migrateRootPackage(tree: Tree) {
  const pkg = readJson(tree, "package.json");
  const name = stringValue(pkg.name, "package.json.name");
  const scripts = stringRecord(pkg.scripts, "package.json.scripts");
  if (scripts === undefined) {
    throw new Error("Cannot migrate package.json scripts because the Keenko baseline is missing");
  }

  migrateKnownString(scripts, "check", [...PREVIOUS_CHECKS], CURRENT_CHECK, "package.json scripts.check");
  migrateKnownString(
    scripts,
    "codegen:check",
    [undefined, PREVIOUS_CODEGEN_CHECK],
    CURRENT_CODEGEN_CHECK,
    "package.json scripts.codegen:check"
  );
  migrateKnownString(scripts, "test", [undefined], CURRENT_TEST, "package.json scripts.test");
  migrateKnownString(scripts, "dev", ["nx run web:dev"], `nx run @${name}/web:dev`, "package.json scripts.dev");
  migrateKnownString(scripts, "ui", [PREVIOUS_UI], CURRENT_UI, "package.json scripts.ui");

  const devDependencies = stringRecord(pkg.devDependencies, "package.json.devDependencies");
  if (devDependencies === undefined) {
    throw new Error("Cannot migrate package.json devDependencies because the Keenko baseline is missing");
  }
  migrateIntroducedTool(devDependencies, "@nx/oxlint", CURRENT_NX_OXLINT);
  migrateIntroducedTool(devDependencies, "@typescript/native", CURRENT_TYPESCRIPT_NATIVE);
  migrateKnownString(
    devDependencies,
    "typescript",
    [PREVIOUS_TYPESCRIPT, PREVIOUS_TYPESCRIPT_ALIAS],
    CURRENT_TYPESCRIPT,
    "package.json devDependencies.typescript"
  );

  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  writeJson(tree, "package.json", pkg);
}

function migrateWorkspaceTypescript(tree: Tree, file: string, previousTypescript: string) {
  const pkg = readJson(tree, file);
  const devDependencies = stringRecord(pkg.devDependencies, `${file}.devDependencies`);
  if (devDependencies === undefined) {
    throw new Error(`Cannot migrate ${file} devDependencies because the Keenko baseline is missing`);
  }
  const scripts = stringRecord(pkg.scripts, `${file}.scripts`);
  if (scripts === undefined) {
    throw new Error(`Cannot migrate ${file} scripts because the Keenko baseline is missing`);
  }
  migrateIntroducedTool(devDependencies, "@typescript/native", CURRENT_TYPESCRIPT_NATIVE);
  migrateKnownString(
    devDependencies,
    "typescript",
    [previousTypescript, PREVIOUS_TYPESCRIPT_ALIAS],
    CURRENT_TYPESCRIPT,
    `${file} devDependencies.typescript`
  );
  migrateKnownString(scripts, "typecheck", ["tsc --noEmit"], CURRENT_TYPESCRIPT_NATIVE_TSC, `${file} scripts.typecheck`);
  if (file !== "apps/web/package.json") {
    migrateKnownString(scripts, "build", ["tsc --noEmit"], CURRENT_TYPESCRIPT_NATIVE_TSC, `${file} scripts.build`);
  }
  pkg.devDependencies = devDependencies;
  pkg.scripts = scripts;
  writeJson(tree, file, pkg);
}

function migrateWebPackage(tree: Tree) {
  const pkg = readJson(tree, "apps/web/package.json");
  const scripts = stringRecord(pkg.scripts, "apps/web/package.json.scripts");
  if (scripts === undefined) {
    throw new Error("Cannot migrate apps/web/package.json scripts because the Keenko baseline is missing");
  }
  migrateKnownString(scripts, "codegen", [PREVIOUS_WEB_CODEGEN], CURRENT_WEB_CODEGEN, "apps/web package.json scripts.codegen");
  pkg.scripts = scripts;
  writeJson(tree, "apps/web/package.json", pkg);
}

function migrateUiPackage(tree: Tree) {
  const pkg = readJson(tree, "packages/ui/package.json");
  const dependencies = stringRecord(pkg.dependencies, "packages/ui/package.json.dependencies");
  if (dependencies === undefined) {
    throw new Error("Cannot migrate packages/ui/package.json dependencies because the Keenko baseline is missing");
  }
  migrateKnownString(dependencies, "class-variance-authority", [undefined], CURRENT_UI_CVA, "packages/ui class-variance-authority");
  pkg.dependencies = dependencies;
  writeJson(tree, "packages/ui/package.json", pkg);
}

function migrateComponentsConfig(tree: Tree, file: string) {
  const config = readJson(tree, file);
  if (config.base === "base") {
    delete config.base;
  } else if (config.base !== undefined) {
    throw new Error(`Cannot migrate ${file} base because the Keenko-owned shadcn setting was customized; reconcile it manually`);
  }
  writeJson(tree, file, config);
}

function migrateUiTsconfig(tree: Tree) {
  const config = readJson(tree, "packages/ui/tsconfig.json");
  const compilerOptions = object(config.compilerOptions, "packages/ui/tsconfig.json compilerOptions");
  if (compilerOptions.jsx === undefined) {
    compilerOptions.jsx = "react-jsx";
  } else if (compilerOptions.jsx !== "react-jsx") {
    throw new Error("Cannot migrate packages/ui/tsconfig.json compilerOptions.jsx because it was customized; reconcile it manually");
  }
  config.compilerOptions = compilerOptions;
  writeJson(tree, "packages/ui/tsconfig.json", config);
}

function migrateUiTool(tree: Tree) {
  const existing = tree.read("tools/keenko-ui.ts", "utf-8");
  if (existing === null) {
    tree.write("tools/keenko-ui.ts", UI_TOOL);
    return;
  }
  if (existing.trim() !== UI_TOOL.trim()) {
    throw new Error("Cannot migrate tools/keenko-ui.ts because the Keenko-owned shadcn wrapper was customized; reconcile it manually");
  }
}

function migrateGeneratedConfig(tree: Tree, file: string) {
  const source = readText(tree, file);
  const present = CURRENT_GENERATED_IGNORES.filter((pattern) => source.includes(`"${pattern}"`));
  if (present.length === CURRENT_GENERATED_IGNORES.length) {
    return;
  }
  if (present.length > 0) {
    throw new Error(
      `Cannot migrate ${file} generated-code exclusions because the Keenko-owned block was partially customized; reconcile it manually`
    );
  }
  const anchor = '"**/routeTree.gen.ts"';
  if (!source.includes(anchor)) {
    throw new Error(`Cannot migrate ${file} generated-code exclusions because the known Keenko anchor is missing; reconcile it manually`);
  }
  const additions = CURRENT_GENERATED_IGNORES.map((pattern) => `"${pattern}"`).join(", ");
  tree.write(file, source.replace(anchor, `${anchor}, ${additions}`));
}

function migrateOxlintConfig(tree: Tree) {
  migrateGeneratedConfig(tree, "oxlint.config.ts");
  let source = readText(tree, "oxlint.config.ts");

  const nxPlugin = '"@nx/oxlint/boundaries-plugin"';
  if (!source.includes(nxPlugin)) {
    const effectPlugin = '"oxlint-plugin-effect/plugin"';
    if (!source.includes(effectPlugin)) {
      throw new Error("Cannot migrate oxlint.config.ts jsPlugins because the known Keenko Effect plugin is missing; reconcile it manually");
    }
    source = source.replace(effectPlugin, `${nxPlugin}, ${effectPlugin}`);
  }

  if (source.includes('files: ["packages/ui/**/*"]')) {
    if (!source.includes(UI_OVERRIDE.trim())) {
      throw new Error(
        "Cannot migrate oxlint.config.ts packages/ui override because the Keenko-owned override was customized; reconcile it manually"
      );
    }
  } else {
    const backendOverride = '    {\n      files: ["packages/backend/**/*.ts"],';
    if (!source.includes(backendOverride)) {
      throw new Error(
        "Cannot migrate oxlint.config.ts overrides because the known Keenko backend override is missing; reconcile it manually"
      );
    }
    source = source.replace(backendOverride, `${UI_OVERRIDE}${backendOverride}`);
  }

  const boundaryRuleName = '"@nx/enforce-module-boundaries"';
  if (source.includes(boundaryRuleName)) {
    if (!source.includes(NX_BOUNDARY_RULE.trim())) {
      throw new Error(
        "Cannot migrate oxlint.config.ts @nx/enforce-module-boundaries because the Keenko-owned rule was customized; reconcile it manually"
      );
    }
  } else {
    const rootRulesAnchor = '  plugins: ["effecttsgo"],\n  rules: {\n';
    if (!source.includes(rootRulesAnchor)) {
      throw new Error("Cannot migrate oxlint.config.ts rules because the known Keenko root rules anchor is missing; reconcile it manually");
    }
    source = source.replace(rootRulesAnchor, `${rootRulesAnchor}${NX_BOUNDARY_RULE}`);
  }

  tree.write("oxlint.config.ts", source);
}

async function formatMigratedFiles(tree: Tree) {
  const paths = [
    "package.json",
    "apps/web/package.json",
    "packages/backend/package.json",
    "packages/shared/package.json",
    "packages/ui/package.json",
    "apps/web/components.json",
    "packages/ui/components.json",
    "packages/ui/tsconfig.json",
    "tools/keenko-ui.ts",
    "oxfmt.config.ts",
    "oxlint.config.ts",
  ];
  await Promise.all(
    paths.map(async (file) => {
      const source = tree.read(file, "utf-8");
      if (source === null) {
        return;
      }
      const result = await format(file, source, { printWidth: 140, sortImports: true, sortPackageJson: true });
      if (result.errors.length > 0) {
        throw new Error(`Cannot format migrated ${file}: ${result.errors.map(({ message }) => message).join(", ")}`);
      }
      tree.write(file, result.code);
    })
  );
}

function migrateIntroducedTool(devDependencies: Record<string, string>, name: string, current: string) {
  const value = devDependencies[name];
  if (value === undefined) {
    devDependencies[name] = current;
    return;
  }
  if (value !== current) {
    throw new Error(
      `Cannot migrate devDependencies.${name} because it was customized; reconcile it with the Keenko tooling baseline first`
    );
  }
}

function migrateKnownString(
  record: Record<string, string>,
  key: string,
  previousValues: (string | undefined)[],
  current: string,
  label: string
) {
  const value = record[key];
  if (value === current) {
    return;
  }
  if (previousValues.includes(value)) {
    record[key] = current;
    return;
  }
  throw new Error(`Cannot migrate ${label} because it was customized; reconcile it with the Keenko baseline first`);
}

function readJson(tree: Tree, file: string) {
  return object(JSON.parse(readText(tree, file)), file);
}

function writeJson(tree: Tree, file: string, value: Record<string, unknown>) {
  tree.write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readText(tree: Tree, file: string) {
  const source = tree.read(file, "utf-8");
  if (source === null) {
    throw new Error(`Cannot migrate: ${file} is missing`);
  }
  return source;
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

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}
