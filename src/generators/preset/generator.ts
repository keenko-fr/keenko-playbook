import type { Tree } from "@nx/devkit";
import { createApp, createMemoryEnvironment, finalizeAddOns, getFrameworkById, populateAddOnOptionsDefaults } from "@tanstack/create";
import { readFileSync } from "node:fs";
import path from "node:path";
import { format } from "oxfmt";

import { KEENKO_BOUNDARY_CONSTRAINTS } from "../../boundaries.ts";
import { syncGuidance } from "../../guidance.ts";
import { versions } from "../../versions.ts";

interface PresetSchema {
  name: string;
}

const TANSTACK_PINS: Record<string, string> = {
  "@inlang/paraglide-js": versions.paraglide,
  "@tailwindcss/vite": versions.tailwind,
  "@tanstack/devtools-vite": "0.8.5",
  "@tanstack/match-sorter-utils": "9.1.2",
  "@tanstack/react-devtools": "0.10.12",
  "@tanstack/react-form": versions.tanstackForm,
  "@tanstack/react-query": versions.tanstackQuery,
  "@tanstack/react-query-devtools": versions.tanstackQuery,
  "@tanstack/react-router": versions.tanstackRouter,
  "@tanstack/react-router-devtools": "1.167.1",
  "@tanstack/react-router-ssr-query": "1.167.2",
  "@tanstack/react-start": versions.tanstackStart,
  "@tanstack/react-table": versions.tanstackTable,
  "@tanstack/router-cli": "1.167.33",
  react: versions.react,
  "react-dom": versions.react,
  tailwindcss: versions.tailwind,
};
const TYPESCRIPT_API = "npm:@typescript/typescript6@6.0.2";
const TYPESCRIPT_NATIVE = "npm:typescript@7.0.2";

export default async function presetGenerator(tree: Tree, options: PresetSchema) {
  const projectName = normalizeName(options.name);
  await generateWeb(tree, projectName);
  writeWorkspaceFiles(tree, projectName);
  writeBackend(tree, projectName);
  writeUi(tree, projectName);
  writeShared(tree, projectName);
  await formatAuthoredFiles(tree);
  syncGuidance(tree);
}

async function generateWeb(tree: Tree, projectName: string) {
  const framework = getFrameworkById("react");
  if (framework === undefined) {
    throw new Error("@tanstack/create did not expose its React framework");
  }
  const chosenAddOns = await finalizeAddOns(framework, "file-router", ["tanstack-query", "form", "table", "paraglide", "shadcn"]);
  const { environment, output } = createMemoryEnvironment();
  await createApp(environment, {
    addOnOptions: populateAddOnOptionsDefaults(chosenAddOns),
    chosenAddOns,
    framework,
    git: false,
    includeExamples: false,
    install: false,
    intent: false,
    mode: "file-router",
    packageManager: "bun",
    projectName: "web",
    projectPreset: "blank",
    tailwind: true,
    targetDir: "apps/web",
    typescript: true,
  });
  const errors = environment.getErrors();
  if (errors.length > 0) {
    throw new Error(`TanStack application generation failed:\n${errors.join("\n")}`);
  }

  for (const [file, content] of Object.entries(output.files)) {
    const normalized = file.replaceAll("\\", "/");
    const marker = "/apps/web/";
    const index = normalized.lastIndexOf(marker);
    if (index === -1) {
      throw new Error(`Unexpected @tanstack/create output path: ${file}`);
    }
    tree.write(`apps/web/${normalized.slice(index + marker.length)}`, content);
  }

  const pkg = readJson(tree, "apps/web/package.json");
  pkg.name = `@${projectName}/web`;
  pkg.nx = { tags: ["type:app", "scope:web"] };
  pkg.imports = {
    "#/*": "./src/*",
    "#components/*": "./src/components/*.tsx",
    "#hooks/*": "./src/hooks/*.ts",
    "#lib/*": "./src/lib/*.ts",
  };
  delete pkg.pnpm;
  pkg.scripts = {
    ...stringRecord(pkg.scripts, "apps/web/package.json.scripts"),
    codegen: "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --no-emit-readme && tsr generate",
    typecheck: "tsc --noEmit",
  };
  pkg.dependencies = {
    ...stringRecord(pkg.dependencies, "apps/web/package.json.dependencies"),
    "@confect/react": versions.confect,
    [`@${projectName}/backend`]: "workspace:*",
    [`@${projectName}/shared`]: "workspace:*",
    [`@${projectName}/ui`]: "workspace:*",
  };
  pkg.devDependencies = {
    ...stringRecord(pkg.devDependencies, "apps/web/package.json.devDependencies"),
    "@typescript/native": TYPESCRIPT_NATIVE,
    typescript: TYPESCRIPT_API,
  };
  pinDependencies(pkg);
  tree.write("apps/web/package.json", json(pkg));
  tree.write("apps/web/components.json", json(componentsConfig(projectName, "web")));
  tree.rename("apps/web/src/components/LocaleSwitcher.tsx", "apps/web/src/components/locale-switcher.tsx");
  const localeSwitcher = tree.read("apps/web/src/components/locale-switcher.tsx", "utf-8");
  if (localeSwitcher !== null) {
    tree.write(
      "apps/web/src/components/locale-switcher.tsx",
      localeSwitcher.replace("onClick={() => setLocale(locale)}", "onClick={() => { void setLocale(locale); }}")
    );
  }
  tree.delete("apps/web/src/paraglide/README.md");
  tree.delete("apps/web/README.md");
  tree.delete("apps/web/.cursorrules");
  tree.delete("apps/web/.cta.json");
}

function writeWorkspaceFiles(tree: Tree, projectName: string) {
  const boundaryConstraints = KEENKO_BOUNDARY_CONSTRAINTS.map(
    ({ onlyDependOnLibsWithTags, sourceTag }) =>
      `          { onlyDependOnLibsWithTags: [${onlyDependOnLibsWithTags.map((tag) => `"${tag}"`).join(", ")}], sourceTag: "${sourceTag}" },`
  ).join("\n");
  tree.write(
    "package.json",
    json({
      devDependencies: {
        "@effect/tsgo": "0.39.1",
        "@nx/oxlint": versions.nx,
        "@types/bun": versions.bun,
        "@typescript/native": TYPESCRIPT_NATIVE,
        keenko: keenkoVersion(),
        nx: versions.nx,
        oxfmt: "0.65.0",
        oxlint: "1.81.0",
        "oxlint-plugin-effect": "0.12.0",
        "oxlint-tsgolint": "7.0.2001",
        typescript: TYPESCRIPT_API,
        ultracite: "7.10.7",
      },
      engines: { bun: ">=1.4.0 <2", node: ">=24 <25" },
      name: projectName,
      packageManager: `bun@${versions.bun}`,
      private: true,
      scripts: {
        build: "nx run-many -t build",
        check: "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build",
        codegen: "nx run-many -t codegen",
        "codegen:check": "keenko check --guidance --codegen",
        dev: `nx run @${projectName}/web:dev`,
        format: "oxfmt .",
        "format:check": "oxfmt --check .",
        lint: "oxlint .",
        "lint:fix": "oxlint --fix .",
        postinstall: "effect-tsgo patch --oxlint",
        test: "bun test --pass-with-no-tests",
        typecheck: "nx run-many -t typecheck",
        ui: "bun tools/keenko-ui.ts",
      },
      type: "module",
      version: "0.0.0",
      workspaces: ["apps/*", "packages/*"],
    })
  );
  tree.write(
    "tools/keenko-ui.ts",
    `const args = process.argv.slice(2);\n\nif (args.length === 0) {\n  throw new Error("Pass at least one shadcn component name.");\n}\n\nconst options = { stderr: "inherit", stdin: "inherit", stdout: "inherit" } as const;\nconst add = Bun.spawnSync(["bunx", "--bun", "shadcn@${versions.shadcn}", "add", "-c", "apps/web", ...args], options);\nif (add.exitCode !== 0) {\n  throw new Error("shadcn failed");\n}\n\nconst install = Bun.spawnSync(["bun", "install"], options);\nif (install.exitCode !== 0) {\n  throw new Error("bun install failed after shadcn updated workspace dependencies");\n}\n\nconst codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}\n\nconst format = Bun.spawnSync(["bun", "run", "format"], options);\nif (format.exitCode !== 0) {\n  throw new Error("Keenko format failed after shadcn generated components");\n}\n\nconst lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], options);\nif (lintFix.exitCode !== 0) {\n  throw new Error("Keenko lint fixes failed after shadcn generated components");\n}\n\nconst reformat = Bun.spawnSync(["bun", "run", "format"], options);\nif (reformat.exitCode !== 0) {\n  throw new Error("Keenko format failed after lint fixes");\n}\n`
  );
  tree.write(
    "nx.json",
    json({
      $schema: "./node_modules/nx/schemas/nx-schema.json",
      defaultBase: "main",
      neverConnectToCloud: true,
      targetDefaults: {
        build: { cache: true, dependsOn: ["^build"] },
        typecheck: { cache: true, dependsOn: ["^typecheck"] },
      },
    })
  );
  tree.write(
    "tsconfig.json",
    json({
      compilerOptions: {
        allowImportingTsExtensions: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        noEmit: true,
        plugins: [{ diagnostics: false, name: "@effect/language-service" }],
        resolvePackageJsonImports: true,
        skipLibCheck: true,
        strict: true,
        target: "ES2023",
        verbatimModuleSyntax: true,
      },
    })
  );
  tree.write(
    ".editorconfig",
    "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\nindent_size = 2\nindent_style = space\ninsert_final_newline = true\n"
  );
  tree.write(".gitignore", "node_modules/\n.nx/cache/\n.nx/workspace-data/\n.env\n.env.local\ndist/\ncoverage/\n");
  tree.write(
    "oxfmt.config.ts",
    `import { defineConfig } from "oxfmt";\nimport ultracite from "ultracite/oxfmt";\n\nconst { endOfLine: _endOfLine, tabWidth: _tabWidth, useTabs: _useTabs, ...formatting } = ultracite;\n\nexport default defineConfig({\n  ...formatting,\n  ignorePatterns: [...(formatting.ignorePatterns ?? []), ".keenko/**", ".agents/skills/**", ".claude/skills/**", "**/_generated/**", "**/routeTree.gen.ts", "packages/backend/confect/**", "packages/backend/convex/**", "!packages/backend/convex/tsconfig.json", "!packages/backend/convex/convex.config.ts"],\n  printWidth: 140,\n});\n`
  );
  tree.write(
    "oxlint.config.ts",
    `import { recommended as effectTsgoRecommended } from "@effect/tsgo/oxlint-presets";\nimport { defineConfig } from "oxlint";\nimport { recommended as effectRecommended } from "oxlint-plugin-effect/presets/recommended";\nimport core from "ultracite/oxlint/core";\n\nexport default defineConfig({\n  extends: [core],\n  ignorePatterns: [".keenko/**", ".agents/skills/**", ".claude/skills/**", "**/_generated/**", "**/routeTree.gen.ts", "packages/backend/confect/**", "packages/backend/convex/**", "!packages/backend/convex/tsconfig.json", "!packages/backend/convex/convex.config.ts"],\n  jsPlugins: ["@nx/oxlint/boundaries-plugin", "oxlint-plugin-effect/plugin"],\n  options: { typeAware: true },\n  overrides: [\n    {\n      files: ["apps/web/**/*"],\n      rules: {\n        "eslint/no-empty-function": "off",\n        "eslint/no-use-before-define": "off",\n        "eslint/require-await": "off",\n        "eslint/sort-keys": "off",\n      },\n    },\n    {\n      files: ["packages/ui/**/*"],\n      rules: { "eslint/sort-keys": "off" },\n    },\n    {\n      files: ["packages/backend/**/*.ts"],\n      rules: {\n        ...effectTsgoRecommended.rules,\n        ...effectRecommended,\n        "effect/noTernary": "off",\n      },\n    },\n  ],\n  plugins: ["effecttsgo"],\n  rules: {\n    "@nx/enforce-module-boundaries": [\n      "error",\n      {\n        allow: [],\n        allowCircularSelfDependency: true,\n        depConstraints: [\n${boundaryConstraints}\n        ],\n      },\n    ],\n    "eslint/no-plusplus": "off",\n    "func-style": "off",\n    "import/consistent-type-specifier-style": ["error", "prefer-top-level-if-only-type-imports"],\n  },\n});\n`
  );
  tree.write(
    ".github/workflows/ci.yml",
    `name: CI\n\non:\n  pull_request:\n  push:\n    branches: [main]\n\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v5\n      - uses: actions/setup-node@v5\n        with:\n          node-version: 24\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: ${versions.bun}\n      - run: bun install --frozen-lockfile\n      - run: bun run check\n`
  );
  tree.write(
    "README.md",
    `# ${projectName}\n\nKeenko application workspace. Node 24 runs Nx and tooling that requires Node; Bun ${versions.bun} owns packages, scripts, the lockfile, and supported application execution.\n\n## Commands\n\n\`\`\`sh\nbun install\nbun run check\nbun run dev\n\`\`\`\n\nAdd shadcn components from the app boundary: \`bun run ui -- button\`. The CLI routes reusable UI into \`packages/ui\`.\n`
  );
}

function writeBackend(tree: Tree, projectName: string) {
  tree.write(
    "packages/backend/package.json",
    json({
      dependencies: {
        [`@${projectName}/shared`]: "workspace:*",
        "@confect/core": versions.confect,
        "@confect/server": versions.confect,
        "@effect/platform-node": versions.effect,
        convex: versions.convex,
        effect: versions.effect,
      },
      devDependencies: {
        "@confect/cli": versions.confect,
        "@typescript/native": TYPESCRIPT_NATIVE,
        typescript: TYPESCRIPT_API,
      },
      exports: { ".": "./src/index.ts" },
      imports: { "#lib/*": "./src/lib/*.ts" },
      name: `@${projectName}/backend`,
      nx: { tags: ["type:lib", "scope:backend"] },
      private: true,
      scripts: { build: "tsc --noEmit", codegen: "confect codegen", typecheck: "tsc --noEmit" },
      type: "module",
      version: "0.0.0",
    })
  );
  tree.write("packages/backend/src/index.ts", "export const backendReady = true;\n");
  tree.write("packages/backend/confect/.gitkeep", "");
  tree.write("packages/backend/convex/tsconfig.json", json({ compilerOptions: { allowJs: true }, extends: "../tsconfig.json" }));
  tree.write("packages/backend/convex/convex.config.ts", 'import { defineApp } from "convex/server";\n\nexport default defineApp();\n');
  tree.write("packages/backend/tsconfig.json", packageTsconfig("src/**/*.ts", "convex/**/*.ts"));
}

function writeUi(tree: Tree, projectName: string) {
  tree.write(
    "packages/ui/package.json",
    json({
      dependencies: {
        "@base-ui/react": versions.baseUi,
        "class-variance-authority": "0.7.1",
        [`@${projectName}/shared`]: "workspace:*",
        clsx: "2.1.1",
        "tailwind-merge": "3.3.1",
      },
      devDependencies: {
        "@types/react": "19.2.0",
        "@types/react-dom": "19.2.0",
        "@typescript/native": TYPESCRIPT_NATIVE,
        typescript: TYPESCRIPT_API,
      },
      exports: {
        "./components/*": "./src/components/*.tsx",
        "./globals.css": "./src/styles/globals.css",
        "./hooks/*": "./src/hooks/*.ts",
        "./lib/*": "./src/lib/*.ts",
      },
      imports: { "#components/*": "./src/components/*.tsx", "#hooks/*": "./src/hooks/*.ts", "#lib/*": "./src/lib/*.ts" },
      name: `@${projectName}/ui`,
      nx: { tags: ["type:lib", "scope:ui"] },
      peerDependencies: { react: versions.react, "react-dom": versions.react },
      private: true,
      scripts: { build: "tsc --noEmit", typecheck: "tsc --noEmit" },
      type: "module",
      version: "0.0.0",
    })
  );
  tree.write("packages/ui/components.json", json(componentsConfig(projectName, "ui")));
  tree.write(
    "packages/ui/src/lib/utils.ts",
    'import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n'
  );
  tree.write(
    "packages/ui/src/styles/globals.css",
    '@import "tailwindcss";\n@source "../../../apps/**/*.{ts,tsx}";\n@source "../**/*.{ts,tsx}";\n'
  );
  tree.write(
    "packages/ui/tsconfig.json",
    json({
      compilerOptions: { composite: false, jsx: "react-jsx" },
      extends: "../../tsconfig.json",
      include: ["src/**/*.ts", "src/**/*.tsx"],
    })
  );
}

function writeShared(tree: Tree, projectName: string) {
  tree.write(
    "packages/shared/package.json",
    json({
      devDependencies: { "@typescript/native": TYPESCRIPT_NATIVE, typescript: TYPESCRIPT_API },
      exports: { ".": "./src/index.ts" },
      imports: { "#lib/*": "./src/lib/*.ts" },
      name: `@${projectName}/shared`,
      nx: { tags: ["type:lib", "scope:shared"] },
      private: true,
      scripts: { build: "tsc --noEmit", typecheck: "tsc --noEmit" },
      type: "module",
      version: "0.0.0",
    })
  );
  tree.write("packages/shared/src/index.ts", "export const sharedReady = true;\n");
  tree.write("packages/shared/tsconfig.json", packageTsconfig("src/**/*.ts"));
}

function componentsConfig(projectName: string, owner: "web" | "ui") {
  const ui = owner === "ui";
  return {
    $schema: "https://ui.shadcn.com/schema.json",
    aliases: ui
      ? { components: "#components", hooks: "#hooks", lib: "#lib", ui: "#components", utils: "#lib/utils" }
      : {
          components: "#components",
          hooks: "#hooks",
          lib: "#lib",
          ui: `@${projectName}/ui/components`,
          utils: `@${projectName}/ui/lib/utils`,
        },
    iconLibrary: "lucide",
    rsc: false,
    style: "base-nova",
    tailwind: {
      baseColor: "neutral",
      config: "",
      css: ui ? "src/styles/globals.css" : "../../packages/ui/src/styles/globals.css",
      cssVariables: true,
    },
    tsx: true,
  };
}

function pinDependencies(pkg: Record<string, unknown>) {
  for (const field of ["dependencies", "devDependencies"]) {
    if (pkg[field] === undefined) {
      continue;
    }
    const dependencies = stringRecord(pkg[field], `package.json.${field}`);
    for (const [name, value] of Object.entries(dependencies)) {
      dependencies[name] = value.replace(/^[~^]/u, "");
    }
    for (const [name, version] of Object.entries(TANSTACK_PINS)) {
      if (name in dependencies) {
        dependencies[name] = version;
      }
    }
    pkg[field] = dependencies;
  }
}

function packageTsconfig(...include: string[]) {
  return json({ compilerOptions: { composite: false }, extends: "../../tsconfig.json", include });
}

function normalizeName(name: string) {
  const value = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
  if (value.length === 0) {
    throw new Error("Project name must contain letters or numbers");
  }
  return value;
}

function readJson(tree: Tree, file: string): Record<string, unknown> {
  const content = tree.read(file, "utf-8");
  if (content === null) {
    throw new Error(`Missing generated file: ${file}`);
  }
  return object(JSON.parse(content), file);
}

function stringRecord(value: unknown, label: string) {
  const record = object(value, label);
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "string") {
      throw new TypeError(`${label}.${key} must be a string`);
    }
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, String(item)]));
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

async function formatAuthoredFiles(tree: Tree) {
  const supported = /\.(?:css|json|md|ts|tsx|ya?ml)$/u;
  await Promise.all(
    tree.listChanges().map(async (change) => {
      if (change.content === null || !supported.test(change.path)) {
        return;
      }
      const result = await format(change.path, change.content.toString("utf-8"), {
        printWidth: 140,
        sortImports: true,
        sortPackageJson: true,
      });
      if (result.errors.length > 0) {
        throw new Error(`Oxfmt could not format generated ${change.path}: ${result.errors.map(({ message }) => message).join(", ")}`);
      }
      tree.write(change.path, result.code);
    })
  );
}

function keenkoVersion() {
  let current = path.resolve(import.meta.dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(current, "package.json");
    try {
      const pkg = object(JSON.parse(readFileSync(packagePath, "utf-8")), packagePath);
      if (pkg.name === "keenko" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // Keep walking until the packaged Keenko root is found.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error("Could not resolve the running Keenko package version");
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
