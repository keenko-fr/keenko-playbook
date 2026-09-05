import {
  generateFiles,
  installPackagesTask,
  joinPathFragments,
  readJsonFile,
  runTasksInSerial,
  type PackageJson,
  type Tree,
  updateJson,
  writeJson,
} from "@nx/devkit";
import { createApp, createMemoryEnvironment, finalizeAddOns, getFrameworkById, populateAddOnOptionsDefaults } from "@tanstack/create";
import path from "node:path";

import { KEENKO_BOUNDARY_CONSTRAINTS } from "../../boundaries.ts";
import { syncGuidance } from "../../guidance.ts";
import { normalizeStartRouteGeneration } from "../../start-route-generation.ts";
import { versions } from "../../versions.ts";

interface PresetSchema {
  name: string;
}

interface GeneratedPackageJson extends PackageJson {
  imports?: Record<string, string>;
  nx?: { tags: string[] };
  pnpm?: unknown;
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
const TYPESCRIPT_NATIVE_TSC = "node ../../node_modules/@typescript/native/bin/tsc --noEmit";

export default async function presetGenerator(tree: Tree, options: PresetSchema) {
  const projectName = validateProjectName(options.name);
  await generateWeb(tree);
  materializeKeenkoFiles(tree, projectName);
  writeStructuredWorkspaceConfig(tree, projectName);
  applyWebConfiguration(tree, projectName);
  normalizeStartRouteGeneration(tree);
  applyWebCorrections(tree);
  syncGuidance(tree);

  return runTasksInSerial(installPackagesTask(tree), async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("bun", ["run", "codegen"], { cwd: tree.root, stdio: "inherit" });
  });
}

async function generateWeb(tree: Tree) {
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
}

function materializeKeenkoFiles(tree: Tree, projectName: string) {
  const boundaryConstraints = KEENKO_BOUNDARY_CONSTRAINTS.map(
    ({ onlyDependOnLibsWithTags, sourceTag }) =>
      `          { onlyDependOnLibsWithTags: ${JSON.stringify(onlyDependOnLibsWithTags)}, sourceTag: ${JSON.stringify(sourceTag)} },`
  ).join("\n");

  generateFiles(tree, joinPathFragments(import.meta.dirname, "files"), ".", {
    boundaryConstraints,
    bunVersion: versions.bun,
    projectName,
    shadcnVersion: versions.shadcn,
    tmpl: "",
  });
}

function writeStructuredWorkspaceConfig(tree: Tree, projectName: string) {
  writeJson(tree, "package.json", {
    devDependencies: {
      "@effect/tsgo": versions.effectTsgo,
      "@nx/oxlint": versions.nx,
      "@types/bun": versions.bun,
      "@typescript/native": versions.typescriptNative,
      keenko: keenkoVersion(),
      nx: versions.nx,
      oxfmt: versions.oxfmt,
      oxlint: versions.oxlint,
      "oxlint-plugin-effect": versions.oxlintPluginEffect,
      "oxlint-tsgolint": versions.oxlintTsgolint,
      typescript: versions.typescriptApi,
      "typescript-api": versions.typescriptApiBridge,
      ultracite: versions.ultracite,
    },
    engines: { bun: ">=1.4.0 <2", node: ">=24 <25" },
    name: projectName,
    packageManager: `bun@${versions.bun}`,
    private: true,
    scripts: {
      build: "nx run-many -t build",
      check: "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build",
      codegen: "nx run-many -t codegen",
      "codegen:check": "bun tools/check-generated.ts",
      dev: `nx run @${projectName}/web:dev`,
      format: "oxfmt .",
      "format:check": "oxfmt --check .",
      lint: "nx show projects && oxlint .",
      "lint:fix": "oxlint --fix .",
      postinstall: "effect-tsgo patch --oxlint && bun tools/keenko-patch-nx-typescript.ts",
      test: "bun test --pass-with-no-tests",
      typecheck: "nx run-many -t typecheck",
      ui: "bun tools/keenko-ui.ts",
    },
    type: "module",
    version: "0.0.0",
    workspaces: ["apps/*", "packages/*"],
  });
  writeJson(tree, "nx.json", {
    $schema: "./node_modules/nx/schemas/nx-schema.json",
    defaultBase: "main",
    neverConnectToCloud: true,
    sync: { globalGenerators: ["keenko:sync"] },
    targetDefaults: {
      build: { cache: true, dependsOn: ["^build"] },
      typecheck: { cache: true, dependsOn: ["^typecheck"] },
    },
  });
  writeJson(tree, "tsconfig.json", {
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
  });

  writeJson(tree, "packages/backend/package.json", {
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
      "@typescript/native": versions.typescriptNative,
      typescript: versions.typescriptApi,
    },
    exports: { ".": "./src/index.ts" },
    imports: { "#lib/*": "./src/lib/*.ts" },
    name: `@${projectName}/backend`,
    nx: { tags: ["type:lib", "scope:backend"] },
    private: true,
    scripts: { build: TYPESCRIPT_NATIVE_TSC, codegen: "confect codegen", typecheck: TYPESCRIPT_NATIVE_TSC },
    type: "module",
    version: "0.0.0",
  });
  writeJson(tree, "packages/backend/convex/tsconfig.json", { compilerOptions: { allowJs: true }, extends: "../tsconfig.json" });
  writeJson(tree, "packages/backend/tsconfig.json", packageTsconfig("src/**/*.ts", "convex/**/*.ts"));

  writeJson(tree, "packages/ui/package.json", {
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
      "@typescript/native": versions.typescriptNative,
      typescript: versions.typescriptApi,
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
    scripts: { build: TYPESCRIPT_NATIVE_TSC, typecheck: TYPESCRIPT_NATIVE_TSC },
    type: "module",
    version: "0.0.0",
  });
  writeJson(tree, "packages/ui/components.json", componentsConfig(projectName, "ui"));
  writeJson(tree, "packages/ui/tsconfig.json", {
    compilerOptions: { composite: false, jsx: "react-jsx" },
    extends: "../../tsconfig.json",
    include: ["src/**/*.ts", "src/**/*.tsx"],
  });

  writeJson(tree, "packages/shared/package.json", {
    devDependencies: { "@typescript/native": versions.typescriptNative, typescript: versions.typescriptApi },
    exports: { ".": "./src/index.ts" },
    imports: { "#lib/*": "./src/lib/*.ts" },
    name: `@${projectName}/shared`,
    nx: { tags: ["type:lib", "scope:shared"] },
    private: true,
    scripts: { build: TYPESCRIPT_NATIVE_TSC, typecheck: TYPESCRIPT_NATIVE_TSC },
    type: "module",
    version: "0.0.0",
  });
  writeJson(tree, "packages/shared/tsconfig.json", packageTsconfig("src/**/*.ts"));
}

function applyWebConfiguration(tree: Tree, projectName: string) {
  updateJson<GeneratedPackageJson>(tree, "apps/web/package.json", (pkg) => {
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
      ...(pkg.scripts ?? {}),
      codegen: "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --no-emit-readme && tsr generate",
      typecheck: TYPESCRIPT_NATIVE_TSC,
    };
    pkg.dependencies = {
      ...(pkg.dependencies ?? {}),
      "@confect/react": versions.confect,
      [`@${projectName}/backend`]: "workspace:*",
      [`@${projectName}/shared`]: "workspace:*",
      [`@${projectName}/ui`]: "workspace:*",
    };
    pkg.devDependencies = {
      ...(pkg.devDependencies ?? {}),
      "@typescript/native": versions.typescriptNative,
      typescript: versions.typescriptApi,
    };
    pinDependencies(pkg);
    return pkg;
  });
  writeJson(tree, "apps/web/components.json", componentsConfig(projectName, "web"));
}

function applyWebCorrections(tree: Tree) {
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

function pinDependencies(pkg: PackageJson) {
  for (const field of ["dependencies", "devDependencies"] as const) {
    const dependencies = pkg[field];
    if (dependencies === undefined) {
      continue;
    }
    for (const [name, value] of Object.entries(dependencies)) {
      dependencies[name] = value.replace(/^[~^]/u, "");
    }
    for (const [name, version] of Object.entries(TANSTACK_PINS)) {
      if (name in dependencies) {
        dependencies[name] = version;
      }
    }
  }
}

function packageTsconfig(...include: string[]) {
  return { compilerOptions: { composite: false }, extends: "../../tsconfig.json", include };
}

function validateProjectName(name: string) {
  if (!/^[a-z][a-z0-9._-]*$/u.test(name)) {
    throw new Error(
      "Keenko workspace name must start with a lowercase letter and contain only lowercase letters, numbers, dots, underscores, or hyphens so the same value is valid as an npm package name and scope"
    );
  }
  for (const packageName of [name, `@${name}/web`, `@${name}/backend`, `@${name}/ui`, `@${name}/shared`]) {
    if (packageName.length > 214) {
      throw new Error(`Keenko workspace name is too long for npm package name ${packageName}`);
    }
  }
  return name;
}

function keenkoVersion() {
  let current = path.resolve(import.meta.dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(current, "package.json");
    try {
      const pkg = readJsonFile<PackageJson>(packagePath);
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
