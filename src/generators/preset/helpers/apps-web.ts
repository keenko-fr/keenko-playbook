import { addDependenciesToPackageJson, joinPathFragments, updateJson, type Tree } from "@nx/devkit";
import { createApp, createMemoryEnvironment, finalizeAddOns, getFrameworkById, populateAddOnOptionsDefaults } from "@tanstack/create";
import { Effect as E, Option as O, Path, Struct } from "effect";

import { TanStackCreateFailure } from "../../errors.js";
import type { PackageJson } from "../../helpers.js";
import { packageVersions } from "../../versions.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
export const START_ROUTE_TREE_FOOTER = `import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}`;

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

  const configuredVite = viteConfig.replace("    outdir: './src/paraglide',", "    outdir: './src/paraglide',\n    emitReadme: false,");
  if (configuredVite === viteConfig) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });
  output.files["vite.config.ts"] = configuredVite;

  for (const [relativePath, contents] of Object.entries(output.files)) tree.write(joinPathFragments("apps/web", relativePath), contents);

  addDependenciesToPackageJson(
    tree,
    { [`@${workspace}/ui`]: "workspace:*" },
    Struct.pick(packageVersions, ["@inlang/paraglide-js", "@tanstack/router-cli"]),
    "apps/web/package.json"
  );

  tree.write("apps/web/src/styles.css", `@import "@${workspace}/ui/globals.css";\n`);

  updateJson<PackageJson>(tree, "apps/web/package.json", (packageJson) => ({
    ...packageJson,
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
    },
  }));

  updateJson<{ routeTreeFileFooter: string[] }>(tree, "apps/web/tsr.config.json", (config) => ({
    ...config,
    routeTreeFileFooter: [START_ROUTE_TREE_FOOTER],
  }));
});
