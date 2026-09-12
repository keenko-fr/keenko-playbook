import { generateFiles, joinPathFragments, updateJson, type Tree } from "@nx/devkit";
import { createApp, createMemoryEnvironment, finalizeAddOns, getFrameworkById, populateAddOnOptionsDefaults } from "@tanstack/create";
import { Effect as E, Option as O, Path, Struct } from "effect";

import { TanStackCreateFailure } from "../../errors.js";
import { replaceExpected, type PackageJson } from "../../helpers.js";
import { packageVersions } from "../../versions.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
export const START_ROUTE_TREE_FOOTER = `import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`;

export const webDependencies = Struct.pick(packageVersions, [
  "@confect/core",
  "@convex-dev/react-query",
  "@tailwindcss/vite",
  "@tanstack/react-devtools",
  "@tanstack/react-form",
  "@tanstack/react-query",
  "@tanstack/react-query-devtools",
  "@tanstack/react-router",
  "@tanstack/react-router-devtools",
  "@tanstack/react-router-ssr-query",
  "@tanstack/react-start",
  "@tanstack/react-table",
  "@workos/authkit-tanstack-react-start",
  "convex",
  "effect",
  "lucide-react",
  "react",
  "react-dom",
  "tailwindcss",
]);
export const webDevDependencies = Struct.pick(packageVersions, [
  "@inlang/paraglide-js",
  "@playwright/test",
  "@tanstack/devtools-vite",
  "@tanstack/router-cli",
  "@testing-library/dom",
  "@testing-library/react",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "@vitejs/plugin-react",
  "@workos-inc/node",
  "jsdom",
  "typescript",
  "vite",
]);

// GENERATE --------------------------------------------------------------------------------------------------------------------------------
export const generateWeb = E.fn("keenko.preset.generateWeb")(function* (tree: Tree, workspace: string) {
  const frameworkOpt = O.fromUndefinedOr(getFrameworkById("react"));

  if (O.isNone(frameworkOpt)) return yield* new TanStackCreateFailure({ issue: "framework_unavailable" });

  const framework = frameworkOpt.value;

  const chosenAddOns = yield* E.tryPromise({
    catch: (cause) => new TanStackCreateFailure({ cause, issue: "generation_failed" }),
    try: () => finalizeAddOns(framework, "file-router", ["tanstack-query", "form", "table", "paraglide"]),
  });

  const path = yield* Path.Path;
  const webRoot = path.resolve("apps/web");
  const { environment, output } = createMemoryEnvironment(webRoot);

  yield* E.tryPromise({
    catch: (cause) => new TanStackCreateFailure({ cause, issue: "generation_failed" }),
    try: () =>
      createApp(environment, {
        addOnOptions: populateAddOnOptionsDefaults(chosenAddOns),
        chosenAddOns,
        framework,
        git: false,
        includeExamples: false,
        install: false,
        intent: false,
        mode: "file-router",
        packageManager: "bun",
        projectName: `@${workspace}/web`,
        projectPreset: "blank",
        routerOnly: false,
        tailwind: true,
        targetDir: webRoot,
        typescript: true,
      }),
  });

  if (output.commands.length > 0) return yield* new TanStackCreateFailure({ issue: "unexpected_command" });
  if (!("package.json" in output.files)) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });
  if (!("vite.config.ts" in output.files)) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });

  const viteConfig = output.files["vite.config.ts"];
  const viteWithRootConfig = replaceExpected(
    viteConfig,
    "const config = defineConfig({",
    `const config = defineConfig({
  envDir: '../..',
  server: {
    port: 3210,
    strictPort: true,
  },`
  );
  if (O.isNone(viteWithRootConfig)) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });
  const configuredVite = replaceExpected(
    viteWithRootConfig.value,
    "    outdir: './src/paraglide',",
    "    outdir: './src/paraglide',\n    emitReadme: false,"
  );
  if (O.isNone(configuredVite)) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });
  output.files["vite.config.ts"] = configuredVite.value;

  for (const [relativePath, contents] of Object.entries(output.files)) {
    if (relativePath.startsWith("src/components/") || relativePath.startsWith("src/integrations/") || relativePath.startsWith("messages/"))
      continue;
    tree.write(joinPathFragments("apps/web", relativePath), contents);
  }

  const webFiles = yield* path.fromFileUrl(new URL("../files/web", import.meta.url)).pipe(E.orDie);
  generateFiles(tree, webFiles, "apps/web", { workspace });

  tree.write(
    "apps/web/vitest.config.ts",
    'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({ test: { environment: "jsdom", passWithNoTests: true } });\n'
  );

  updateJson<PackageJson>(tree, "apps/web/package.json", (packageJson) => ({
    ...packageJson,
    dependencies: {
      ...webDependencies,
      [`@${workspace}/backend`]: "workspace:*",
      [`@${workspace}/shared`]: "workspace:*",
      [`@${workspace}/ui`]: "workspace:*",
    },
    devDependencies: webDevDependencies,
    imports: {
      ...packageJson.imports,
      "#components/*": "./src/components/*.tsx",
      "#hooks/*": "./src/hooks/*.ts",
      "#lib/*": "./src/lib/*.ts",
    },
    nx: {
      ...packageJson.nx,
      tags: ["type:app", "scope:web"],
      targets: {
        ...packageJson.nx?.targets,
        typecheck: {
          command: "node ../../node_modules/@typescript/native/bin/tsc --noEmit -p tsconfig.json",
          options: {
            cwd: "{projectRoot}",
          },
        },
      },
    },
    private: true,
    scripts: {
      ...packageJson.scripts,
      codegen:
        "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --strategy url baseLocale --no-emit-readme && tsr generate",
      "test:auth:e2e": "playwright test --config playwright.config.ts --headed --workers=1",
    },
  }));

  updateJson<{ routeTreeFileFooter: string[] }>(tree, "apps/web/tsr.config.json", (config) => ({
    ...config,
    routeTreeFileFooter: [START_ROUTE_TREE_FOOTER],
  }));
});
