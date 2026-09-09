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

const localeSwitcher = `import { m } from "#/paraglide/messages";
import { getLocale, locales, setLocale } from "#/paraglide/runtime";

export function LocaleSwitcher() {
  const currentLocale = getLocale();

  return (
    <div aria-label={m.language_label()} style={{ alignItems: "center", color: "inherit", display: "flex", gap: "0.5rem" }}>
      <span style={{ opacity: 0.85 }}>{m.current_locale({ locale: currentLocale })}</span>
      <div style={{ display: "flex", gap: "0.25rem" }}>
        {locales.map((locale) => (
          <button
            aria-pressed={locale === currentLocale}
            key={locale}
            onClick={() => {
              // oxlint-disable-next-line eslint/no-void -- React handlers return void while Paraglide locale changes are asynchronous.
              void setLocale(locale);
            }}
            style={{
              background: locale === currentLocale ? "#0f172a" : "transparent",
              border: "1px solid #d1d5db",
              borderRadius: "999px",
              color: locale === currentLocale ? "#f8fafc" : "inherit",
              cursor: "pointer",
              fontWeight: locale === currentLocale ? 700 : 500,
              letterSpacing: "0.01em",
              padding: "0.35rem 0.75rem",
            }}
            type="button"
          >
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
`;

const queryDevtools = `import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";

export const tanstackQueryDevtools = {
  name: "Tanstack Query",
  render: <ReactQueryDevtoolsPanel />,
};
`;

const queryRootProvider = `import { QueryClient } from "@tanstack/react-query";

export function createRouterContext() {
  return {
    queryClient: new QueryClient(),
  };
}
`;

const router = `import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { createRouterContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = createRouterContext();
  const router = createTanStackRouter({
    context,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({ queryClient: context.queryClient, router });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
`;

const rootRoute = `import type { QueryClient } from "@tanstack/react-query";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

import { tanstackQueryDevtools } from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

// ROUTE ---------------------------------------------------------------------
interface AppRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  beforeLoad: () => {
    if (typeof document !== "undefined") document.documentElement.setAttribute("lang", getLocale());
  },
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [{ charSet: "utf-8" }, { content: "width=device-width, initial-scale=1", name: "viewport" }, { title: m.home_page() }],
  }),
  shellComponent: RootDocument,
});

// LAYOUT --------------------------------------------------------------------
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }, tanstackQueryDevtools]}
        />
        <Scripts />
      </body>
    </html>
  );
}
`;

const indexRoute = `import { createFileRoute } from "@tanstack/react-router";

import { LocaleSwitcher } from "#/components/locale-switcher";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main>
      <h1>{m.example_message()}</h1>
      <LocaleSwitcher />
    </main>
  );
}
`;

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

  const configuredParaglide = viteConfig.replace(
    "      project: './project.inlang',\n      outdir: './src/paraglide',\n      strategy: ['url', 'baseLocale'],",
    "      emitReadme: false,\n      outdir: './src/paraglide',\n      project: './project.inlang',\n      strategy: ['url', 'baseLocale'],"
  );
  if (configuredParaglide === viteConfig) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });

  const pluginsFirst = configuredParaglide.replace(
    "const config = defineConfig({\n  resolve: { tsconfigPaths: true },\n  plugins: [",
    "const config = defineConfig({\n  plugins: ["
  );
  if (pluginsFirst === configuredParaglide) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });

  const configuredVite = pluginsFirst.replace(
    "    viteReact(),\n  ],\n})",
    "    viteReact(),\n  ],\n  resolve: { tsconfigPaths: true },\n})"
  );
  if (configuredVite === pluginsFirst) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });
  output.files["vite.config.ts"] = configuredVite;

  const editableSource = [
    "src/components/LocaleSwitcher.tsx",
    "src/integrations/tanstack-query/devtools.tsx",
    "src/integrations/tanstack-query/root-provider.tsx",
    "src/router.tsx",
    "src/routes/__root.tsx",
    "src/routes/index.tsx",
  ];
  if (editableSource.some((file) => !(file in output.files))) return yield* new TanStackCreateFailure({ issue: "unexpected_output" });

  delete output.files["src/components/LocaleSwitcher.tsx"];
  output.files["src/components/locale-switcher.tsx"] = localeSwitcher;
  output.files["src/integrations/tanstack-query/devtools.tsx"] = queryDevtools;
  output.files["src/integrations/tanstack-query/root-provider.tsx"] = queryRootProvider;
  output.files["src/router.tsx"] = router;
  output.files["src/routes/__root.tsx"] = rootRoute;
  output.files["src/routes/index.tsx"] = indexRoute;

  for (const [relativePath, contents] of Object.entries(output.files)) tree.write(joinPathFragments("apps/web", relativePath), contents);

  addDependenciesToPackageJson(
    tree,
    { [`@${workspace}/ui`]: "workspace:*" },
    Struct.pick(packageVersions, [
      "@inlang/paraglide-js",
      "@tanstack/router-cli",
      "@testing-library/dom",
      "@testing-library/react",
      "@types/node",
      "jsdom",
    ]),
    "apps/web/package.json"
  );

  tree.write(
    "apps/web/vitest.config.ts",
    'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({ test: { environment: "jsdom", passWithNoTests: true } });\n'
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
