import { describe, expect, test } from "bun:test";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { readJson, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { YAML } from "bun";
import { Effect as E, FileSystem, Layer as L, Option as O, Path, Struct } from "effect";

import type { PackageJson } from "../helpers.js";
import { packageVersions, runtimeVersions } from "../versions.js";
import { START_ROUTE_TREE_FOOTER, webDependencies, webDevDependencies } from "./helpers/apps-web.js";
import { generatedDriftCheck, makeInitialCodegenCommand, presetProgram } from "./preset.js";

// TYPES -----------------------------------------------------------------------------------------------------------------------------------
type ExpectedPackageScope = "backend" | "shared" | "ui";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const packageScopes: readonly ExpectedPackageScope[] = ["backend", "shared", "ui"];

const managedRoots = ["apps/web", "packages/backend", "packages/shared", "packages/ui"];

const expectedWorkspaces = ["apps/*", "packages/*"];

const exactPackageVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

const expectedBackendSentinels = `WORKOS_CLIENT_ID="$(bun --eval 'process.stdout.write(crypto.randomUUID())')" WORKOS_API_KEY="$(bun --eval 'process.stdout.write(crypto.randomUUID())')" WORKOS_WEBHOOK_SECRET="$(bun --eval 'process.stdout.write(crypto.randomUUID())')"`;
const expectedBackendCodegen = `${expectedBackendSentinels} confect codegen`;
const expectedBackendDev = `${expectedBackendSentinels} confect dev`;

const expectedScripts = {
  build: "nx run-many -t build",
  check: `nx sync:check && bun run codegen && ${generatedDriftCheck} && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`,
  codegen: "nx run-many -t codegen",
  dev: 'convex dev --start "nx run-many -t dev"',
  format: "oxfmt .",
  "format:check": "oxfmt --check .",
  lint: "oxlint .",
  "lint:fix": "oxlint --fix .",
  test: "nx run-many -t test",
  "test:auth:e2e": "bun --env-file=../../.env.local run --cwd apps/web test:auth:e2e",
  typecheck: "nx run-many -t typecheck",
} satisfies Record<string, string>;

const expectedDevDependencies = Struct.pick(packageVersions, [
  "@effect/tsgo",
  "@nx/oxlint",
  "@nx/vitest",
  "@typescript/native",
  "convex",
  "nx",
  "oxfmt",
  "oxlint",
  "oxlint-plugin-effect",
  "oxlint-tsgolint",
  "typescript",
  "ultracite",
  "vitest",
]);

const expectedTypecheckTarget = {
  command: "node ../../node_modules/@typescript/native/bin/tsc --noEmit -p tsconfig.json",
  options: {
    cwd: "{projectRoot}",
  },
};

const platformLayer = L.mergeAll(NodeFileSystem.layer, NodePath.layer);

// HELPERS ---------------------------------------------------------------------------------------------------------------------------------
const runPreset = (tree: Tree, name = "test") => presetProgram(tree, { name }).pipe(E.provide(platformLayer));

const generatePreset = (name = "test") =>
  E.gen(function* () {
    const tree = createTreeWithEmptyWorkspace();

    yield* runPreset(tree, name);

    return tree;
  });

const readTemplate = (source: URL) =>
  E.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(yield* path.fromFileUrl(source));
  }).pipe(E.provide(platformLayer));

// TESTS -----------------------------------------------------------------------------------------------------------------------------------
describe("keenko preset", () => {
  test("disables the Nx TUI for initial codegen while preserving the parent environment", () => {
    expect(makeInitialCodegenCommand("workspace")).toMatchObject({
      _tag: "StandardCommand",
      args: ["run", "codegen"],
      command: "bun",
      options: {
        cwd: "workspace",
        env: { NX_TUI: "false" },
        extendEnv: true,
        stderr: "inherit",
        stdout: "inherit",
      },
    });
  });

  test("replaces initial Nx boilerplate with a concise consumer README", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        tree.write("README.md", "# Nx boilerplate\n");
        yield* runPreset(tree);
        const readme = O.getOrThrow(O.fromNullishOr(tree.read("README.md", "utf-8")));

        expect(readme).toBe(yield* readTemplate(new URL("files/root/README.md", import.meta.url)));
        expect(readme).not.toContain("Nx boilerplate");
        for (const command of ["dev", "codegen", "check"]) {
          expect(readme).toContain(`bun run ${command}`);
          expect(readJson<PackageJson>(tree, "package.json").scripts?.[command]).toBeTypeOf("string");
        }
        for (const root of managedRoots) {
          expect(readme).toContain(root);
          expect(tree.exists(`${root}/package.json`)).toBe(true);
        }
        expect(readme).toContain("bun x nx sync");
        expect(readme).toContain("bun x nx sync:check");
        for (const document of ["CONTEXT.md", "docs/project/architecture.md"]) {
          expect(readme).toContain(`](${document})`);
          expect(tree.exists(document)).toBe(true);
        }
      })
    ));

  test("generates a minimal consumer CI gate owned by the canonical check", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();
        const workflowPath = ".github/workflows/check.yml";
        expect(tree.exists(workflowPath)).toBe(true);
        const workflow = O.getOrThrow(O.fromNullishOr(tree.read(workflowPath, "utf-8")));
        const checkoutAction: unknown = expect.stringMatching(/^actions\/checkout@[a-f\d]{40}$/u);
        const nodeAction: unknown = expect.stringMatching(/^actions\/setup-node@[a-f\d]{40}$/u);
        const bunAction: unknown = expect.stringMatching(/^oven-sh\/setup-bun@[a-f\d]{40}$/u);

        expect(YAML.parse(workflow)).toEqual({
          jobs: {
            check: {
              "runs-on": "ubuntu-latest",
              steps: [
                { uses: checkoutAction, with: { "persist-credentials": false } },
                { uses: nodeAction, with: { "node-version": runtimeVersions.nodeRange } },
                { uses: bunAction, with: { "bun-version": runtimeVersions.bun } },
                { run: "bun install --frozen-lockfile" },
                { run: "bun run check" },
              ],
            },
          },
          name: "Check",
          on: { pull_request: {}, push: { branches: ["main"] } },
          permissions: { contents: "read" },
        });
      })
    ));

  test("owns web codegen through its package script and canonical dependency specs", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();
        const web = readJson<PackageJson>(tree, "apps/web/package.json");
        const tsrConfig = readJson<{ routeTreeFileFooter?: string[] }>(tree, "apps/web/tsr.config.json");
        const viteConfig = tree.read("apps/web/vite.config.ts", "utf-8");

        expect(web.scripts?.codegen).toBe(
          "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --strategy url baseLocale --no-emit-readme && tsr generate"
        );
        expect(viteConfig).toContain("emitReadme: false");
        expect(web.dependencies).toEqual({
          ...webDependencies,
          "@test/backend": "workspace:*",
          "@test/shared": "workspace:*",
          "@test/ui": "workspace:*",
        });
        expect(web.devDependencies).toEqual(webDevDependencies);
        for (const specification of [...Object.values(webDependencies), ...Object.values(webDevDependencies)])
          expect(exactPackageVersion.test(specification)).toBe(true);
        expect(web.devDependencies?.["@types/node"]).toBe("24.13.3");
        expect(web.nx?.targets?.codegen).toBeUndefined();
        expect(tree.exists("apps/web/project.inlang/settings.json")).toBe(true);
        expect(tree.exists("apps/web/tsr.config.json")).toBe(true);
        expect(tsrConfig.routeTreeFileFooter).toEqual([START_ROUTE_TREE_FOOTER]);
      })
    ));

  test("generates the initial workspace topology", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        expect(tree.exists("apps/web/package.json")).toBe(true);
        expect(tree.exists("packages/backend/package.json")).toBe(true);
        expect(tree.exists("packages/shared/package.json")).toBe(true);
        expect(tree.exists("packages/ui/package.json")).toBe(true);
      })
    ));

  test("configures inferred Vitest targets for every fixed workspace", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        for (const config of [
          "apps/web/vitest.config.ts",
          "packages/backend/vitest.config.ts",
          "packages/shared/vitest.config.ts",
          "packages/ui/vitest.config.ts",
        ])
          expect(tree.read(config, "utf-8")).toContain("passWithNoTests: true");

        expect(tree.read("apps/web/vitest.config.ts", "utf-8")).toContain('environment: "jsdom"');
        expect(tree.read("packages/ui/vitest.config.ts", "utf-8")).toContain('environment: "jsdom"');
        expect(tree.read("packages/shared/vitest.config.ts", "utf-8")).toContain('environment: "node"');

        const backendConfig = tree.read("packages/backend/vitest.config.ts", "utf-8");
        expect(backendConfig).toContain('environment: "node"');
        expect(backendConfig).toContain('environment: "edge-runtime"');
        expect(backendConfig).toContain('include: ["convex/**/*.test.{ts,js}"]');

        expect(readJson<PackageJson>(tree, "packages/backend/package.json").devDependencies).toMatchObject(
          Struct.pick(packageVersions, ["@edge-runtime/vm", "convex-test"])
        );
        expect(readJson<PackageJson>(tree, "packages/ui/package.json").devDependencies).toMatchObject(
          Struct.pick(packageVersions, ["@testing-library/dom", "@testing-library/react", "jsdom"])
        );
      })
    ));

  test("uses the Nx workspace name unchanged as the Keenko identity", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("my-project");

        expect(readJson<PackageJson>(tree, "package.json").name).toBe("my-project");
        expect(readJson<PackageJson>(tree, "apps/web/package.json").name).toBe("@my-project/web");

        for (const scope of packageScopes)
          expect(readJson<PackageJson>(tree, `packages/${scope}/package.json`).name).toBe(`@my-project/${scope}`);
      })
    ));

  test("accepts valid npm identity forms without normalization", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("my_app");

        expect(readJson<PackageJson>(tree, "package.json").name).toBe("my_app");
        expect(readJson<PackageJson>(tree, "apps/web/package.json").name).toBe("@my_app/web");
        expect(readJson<PackageJson>(tree, "packages/backend/package.json").name).toBe("@my_app/backend");
        expect(readJson<PackageJson>(tree, "packages/shared/package.json").name).toBe("@my_app/shared");
        expect(readJson<PackageJson>(tree, "packages/ui/package.json").name).toBe("@my_app/ui");
      })
    ));

  test("rejects an invalid workspace identity before generation", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        const exit = yield* E.exit(runPreset(tree, "myProject"));

        expect(exit._tag).toBe("Failure");

        expect(tree.exists("apps/web/package.json")).toBe(false);
        expect(tree.exists("packages/backend/package.json")).toBe(false);
        expect(tree.exists("packages/shared/package.json")).toBe(false);
        expect(tree.exists("packages/ui/package.json")).toBe(false);
      })
    ));

  test("does not partially write when a managed target is occupied", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write("packages/ui/existing.ts", "");

        const failure = yield* runPreset(tree).pipe(E.flip);

        expect(failure).toMatchObject({
          _tag: "WorkspaceFailure",
          issue: "target_occupied",
        });

        expect(tree.exists("apps/web/package.json")).toBe(false);
        expect(tree.exists("packages/backend/package.json")).toBe(false);
        expect(tree.exists("packages/shared/package.json")).toBe(false);
        expect(tree.exists("packages/ui/existing.ts")).toBe(true);
      })
    ));

  for (const root of managedRoots)
    test(`refuses occupied ${root}`, () =>
      E.runPromise(
        E.gen(function* () {
          const tree = createTreeWithEmptyWorkspace();

          tree.write(`${root}/existing.ts`, "");

          const failure = yield* runPreset(tree).pipe(E.flip);

          expect(failure).toMatchObject({
            _tag: "WorkspaceFailure",
            issue: "target_occupied",
          });

          expect(tree.exists(`${root}/existing.ts`)).toBe(true);
          expect(tree.exists("apps/web/package.json")).toBe(false);
          expect(tree.exists("packages/backend/package.json")).toBe(false);
          expect(tree.exists("packages/shared/package.json")).toBe(false);
          expect(tree.exists("packages/ui/package.json")).toBe(false);
        })
      ));

  test("configures the Bun workspace roots", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        expect(readJson<PackageJson>(tree, "package.json").workspaces).toEqual(expectedWorkspaces);
      })
    ));

  test("configures the canonical root project lifecycle", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();
        const packageJson = readJson<PackageJson>(tree, "package.json");

        expect(packageJson.scripts).toMatchObject(expectedScripts);
        expect(packageJson.scripts).not.toHaveProperty("codegen:check");
        expect(packageJson.scripts?.check?.split(" && ")).toEqual([
          "nx sync:check",
          "bun run codegen",
          generatedDriftCheck,
          "bun run format:check",
          "bun run lint",
          "bun run typecheck",
          "bun run test",
          "bun run build",
        ]);
        expect(packageJson.devDependencies).toMatchObject(expectedDevDependencies);

        expect(packageJson).toMatchObject({
          engines: {
            bun: runtimeVersions.bunRange,
            node: runtimeVersions.nodeRange,
          },

          name: "test",

          nx: {
            includedScripts: [],
          },
          packageManager: `bun@${runtimeVersions.bun}`,
          private: true,
        });

        expect(readJson(tree, "nx.json")).toMatchObject({
          cli: {
            packageManager: "bun",
          },
          migrate: {
            agentic: false,
            createCommits: false,
          },
          plugins: [
            {
              exclude: ["apps/web/vite.config.ts"],
              options: { testMode: "run", testTargetName: "test" },
              plugin: "@nx/vitest",
            },
          ],
          sync: {
            globalGenerators: ["keenko:sync"],
          },
        });
      })
    ));

  test("configures the workspace development loop", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const rootPackageJson = readJson<PackageJson>(tree, "package.json");
        const backendPackageJson = readJson<PackageJson>(tree, "packages/backend/package.json");
        const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");

        expect(rootPackageJson.scripts?.dev).toBe('convex dev --start "nx run-many -t dev"');
        expect(rootPackageJson.devDependencies?.convex).toBe(packageVersions.convex);
        expect(rootPackageJson.devDependencies?.["@tanstack/react-start"]).toBe(packageVersions["@tanstack/react-start"]);
        expect(webPackageJson.dependencies?.["@tanstack/react-start"]).toBe(packageVersions["@tanstack/react-start"]);
        for (const rootCode of tree.children("").filter((entry) => /\.(?:c|m)?(?:j|t)sx?$/u.test(entry)))
          expect(tree.read(rootCode, "utf-8")).not.toContain("@tanstack/react-start");

        expect(backendPackageJson.scripts).toEqual({ codegen: expectedBackendCodegen, dev: expectedBackendDev });

        expect(readJson(tree, "convex.json")).toEqual({
          $schema: "./node_modules/convex/schemas/convex.schema.json",
          authKit: {
            dev: {
              configure: {
                appHomepageUrl: "http://localhost:3000",
                corsOrigins: ["http://localhost:3000"],
                redirectUris: ["http://localhost:3000/api/auth/callback"],
              },
              localEnvVars: {
                WORKOS_API_KEY: `\${authEnv.WORKOS_API_KEY}`,
                WORKOS_CLIENT_ID: `\${authEnv.WORKOS_CLIENT_ID}`,
                WORKOS_REDIRECT_URI: "http://localhost:3000/api/auth/callback",
              },
            },
          },
          functions: "packages/backend/convex",
        });
        expect(tree.read(".gitignore", "utf-8")).toBe("/.env.local\n");
        expect(tree.exists(".env.local")).toBe(false);
        expect(tree.exists("apps/web/.env.local")).toBe(false);
        expect(tree.exists("convex")).toBe(false);
        expect(tree.exists("apps/web/convex")).toBe(false);
      })
    ));

  test("generates the canonical root tooling configuration", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        expect(tree.exists("oxfmt.config.ts")).toBe(true);
        expect(tree.exists("oxlint.config.ts")).toBe(true);
        expect(tree.read("bunfig.toml", "utf-8")).toBe('[install]\nlinker = "hoisted"\n');
        expect(readJson<PackageJson>(tree, "package.json").type).toBe("module");

        expect(readJson(tree, "tsconfig.base.json")).toMatchObject({
          compilerOptions: {
            moduleResolution: "bundler",
            noEmit: true,
            strict: true,
          },
        });
      })
    ));

  test("removes the EditorConfig created by the base Nx workspace", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        tree.write(".editorconfig", "root = true\n");

        yield* runPreset(tree);

        expect(tree.exists(".editorconfig")).toBe(false);
      })
    ));

  test("replaces TanStack editable source with the Keenko web baseline", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();
        const router = tree.read("apps/web/src/router.tsx", "utf-8");
        const rootRoute = tree.read("apps/web/src/routes/__root.tsx", "utf-8");
        const oxlintConfig = tree.read("oxlint.config.ts", "utf-8");

        expect(tree.exists("apps/web/src/components/LocaleSwitcher.tsx")).toBe(false);
        expect(tree.exists("apps/web/src/integrations/tanstack-query/devtools.tsx")).toBe(false);
        expect(tree.exists("apps/web/src/integrations/tanstack-query/root-provider.tsx")).toBe(false);

        expect(tree.exists("apps/web/src/config/env.ts")).toBe(true);
        expect(tree.read("apps/web/vite.config.ts", "utf-8")).toContain("envDir: '../..'");
        expect(tree.read("apps/web/src/config/env.ts", "utf-8")).toContain(
          "export const getPublicEnv = () => S.decodeUnknownSync(sPublicEnv)(import.meta.env);"
        );
        expect(tree.read("apps/web/src/config/env.ts", "utf-8")).not.toContain("export const publicEnv =");
        expect(router).toContain("getPublicEnv().VITE_CONVEX_URL");
        expect(router).toContain("new ConvexReactClient(convexUrl)");
        expect(router).toContain("new ConvexQueryClient(convexClient)");
        expect(router).toContain('declare module "@tanstack/react-router"');

        expect(rootRoute).not.toContain("MyRouterContext");
        expect(rootRoute).toContain("title: m.calm_green_otter()");
        expect(rootRoute).toContain("notFoundComponent: () => <p>Not Found</p>");
        expect(router).toContain("<AuthKitProvider>");
        expect(router).toContain("<ConvexProviderWithAuth client={convexClient} useAuth={useAuthFromWorkOS}>");
        expect(rootRoute).not.toContain("<ConvexProvider");

        expect(oxlintConfig).toContain('files: ["apps/web/**/*.{ts,tsx}"]');
        expect(oxlintConfig).toContain('"eslint/sort-keys": "off"');
      })
    ));

  test("seeds the canonical Paraglide starter baseline", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        const settings = readJson<{
          baseLocale: string;
          locales: string[];
        }>(tree, "apps/web/project.inlang/settings.json");

        const french = readJson<Record<string, string>>(tree, "apps/web/messages/fr.json");
        const english = readJson<Record<string, string>>(tree, "apps/web/messages/en.json");

        const homeRoute = tree.read("apps/web/src/routes/index.tsx", "utf-8");

        expect(settings).toMatchObject({
          baseLocale: "fr",
          locales: ["fr", "en"],
        });

        expect(tree.exists("apps/web/messages/fr.json")).toBe(true);
        expect(tree.exists("apps/web/messages/en.json")).toBe(true);
        expect(tree.exists("apps/web/messages/de.json")).toBe(false);

        // Replace these with the actual stable Sherlock IDs you chose.
        expect(french).toMatchObject({
          calm_green_otter: "Bienvenue chez Keenko",
        });

        expect(english).toMatchObject({
          calm_green_otter: "Welcome to Keenko",
        });

        expect(homeRoute).toContain("#/paraglide/messages");

        expect(homeRoute).toContain("m.calm_green_otter()");
      })
    ));

  test("configures package typecheck targets", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        for (const scope of packageScopes) {
          const packageJson = readJson<PackageJson>(tree, `packages/${scope}/package.json`);

          expect(packageJson.nx?.targets?.typecheck).toEqual(expectedTypecheckTarget);
        }
      })
    ));

  test("configures web typechecking without replacing TanStack configuration", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();
        const packageJson = readJson<PackageJson>(tree, "apps/web/package.json");

        expect(packageJson.nx).toMatchObject({
          tags: ["type:app", "scope:web"],
          targets: {
            typecheck: expectedTypecheckTarget,
          },
        });

        expect(tree.exists("apps/web/tsconfig.json")).toBe(true);
      })
    ));

  test("configures the shared package contract", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const packageJson = readJson<PackageJson>(tree, "packages/shared/package.json");
        const tsconfig = readJson<{ include: string[] }>(tree, "packages/shared/tsconfig.json");

        expect(packageJson.exports).toEqual({ "./*": "./src/*.ts" });
        expect(packageJson.dependencies).toEqual(Struct.pick(packageVersions, ["effect"]));
        expect(tsconfig.include).toEqual(["src/**/*.ts"]);

        expect(tree.read("packages/shared/src/index.ts", "utf-8")).toBe("");
        expect(tree.exists("packages/shared/src/schemas/string.ts")).toBe(true);
      })
    ));

  test("creates a domain-neutral Confect backend baseline", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        expect(tree.exists("packages/backend/confect/.gitkeep")).toBe(true);
        expect(tree.exists("packages/backend/convex/convex.config.ts")).toBe(true);

        const packageJson = readJson<PackageJson>(tree, "packages/backend/package.json");

        expect(packageJson.scripts).toMatchObject({ codegen: expectedBackendCodegen, dev: expectedBackendDev });
      })
    ));

  test("scaffolds the fixed WorkOS AuthKit baseline without tracked credentials", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");
        const rootPackageJson = readJson<PackageJson>(tree, "package.json");
        const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");
        const backendPackageJson = readJson<PackageJson>(tree, "packages/backend/package.json");

        expect(webPackageJson.dependencies).toMatchObject({
          "@acme/backend": "workspace:*",
          "@confect/core": packageVersions["@confect/core"],
          "@workos/authkit-tanstack-react-start": packageVersions["@workos/authkit-tanstack-react-start"],
        });
        expect(webPackageJson.dependencies).not.toHaveProperty("@confect/react");
        expect(webPackageJson.devDependencies?.["@playwright/test"]).toBe(packageVersions["@playwright/test"]);
        expect(webPackageJson.devDependencies?.["@workos-inc/node"]).toBe(packageVersions["@workos-inc/node"]);
        expect(webPackageJson.scripts?.["test:auth:e2e"]).toBe("playwright test --config playwright.config.ts --headed --workers=1");
        expect(rootPackageJson.scripts?.["test:auth:e2e"]).toBe("bun --env-file=../../.env.local run --cwd apps/web test:auth:e2e");
        expect(backendPackageJson.dependencies).toMatchObject(
          Struct.pick(packageVersions, ["@convex-dev/workos-authkit", "@workos-inc/authkit-react", "@workos-inc/node"])
        );
        expect(backendPackageJson.exports).toEqual({
          "./confect/_generated/refs": "./confect/_generated/refs.js",
          "./convex/_generated/api": {
            default: "./convex/_generated/api.js",
            types: "./convex/_generated/api.d.ts",
          },
        });

        for (const file of [
          "apps/web/src/start.ts",
          "apps/web/src/routes/api/auth/callback.tsx",
          "apps/web/src/routes/api/auth/sign-in.tsx",
          "apps/web/src/routes/protected.tsx",
          "apps/web/src/server/auth.ts",
          "apps/web/e2e/auth.e2e.ts",
          "apps/web/playwright.config.ts",
          "packages/backend/confect/auth.ts",
          "packages/backend/confect/authentication.ts",
          "packages/backend/confect/authentication.spec.ts",
          "packages/backend/confect/authentication.impl.ts",
          "packages/backend/confect/http.ts",
          "packages/backend/confect/workos.ts",
          "packages/backend/convex/_generated/api.d.ts",
          "packages/backend/convex/_generated/api.js",
        ])
          expect(tree.exists(file)).toBe(true);

        expect(tree.read("packages/backend/convex/convex.config.ts", "utf-8")).toContain("app.use(workOSAuthKit)");
        expect(tree.read("packages/backend/confect/auth.ts", "utf-8")).toContain("process.env.WORKOS_CLIENT_ID");
        expect(tree.read("packages/backend/confect/auth.ts", "utf-8")).not.toContain("getAuthConfigProviders");
        expect(tree.read("packages/backend/confect/workos.ts", "utf-8")).toContain(
          "new AuthKit<GenericDataModel>(components.workOSAuthKit)"
        );
        const authenticationSource = tree.read("packages/backend/confect/authentication.ts", "utf-8");
        const authenticationSpec = tree.read("packages/backend/confect/authentication.spec.ts", "utf-8");
        const authenticationImpl = tree.read("packages/backend/confect/authentication.impl.ts", "utf-8");
        const oxlintConfig = tree.read("oxlint.config.ts", "utf-8");

        expect(authenticationSource).toContain("handler: async (ctx)");
        expect(authenticationSource).toContain("E.runPromise");
        expect(authenticationSource).toContain("ctx.auth.getUserIdentity()");
        expect(authenticationSource).not.toContain("RegisteredQuery");
        expect(authenticationSource).not.toContain("throw new Error");
        expect(authenticationSpec).toContain(
          "// SCHEMAS ---------------------------------------------------------------------------------------------------------------------------------"
        );
        expect(authenticationSpec).toContain(
          "// SPEC ------------------------------------------------------------------------------------------------------------------------------------"
        );
        expect(authenticationSpec).toContain(
          "// QUERIES -------------------------------------------------------------------------------------------------------------------------------"
        );
        expect(authenticationSpec).toContain("FunctionSpec.publicQuery");
        expect(authenticationImpl).toContain("yield* Auth.Auth");
        expect(authenticationImpl).toContain("AuthenticationRequired");
        expect(authenticationImpl).toContain(
          "// GROUP -----------------------------------------------------------------------------------------------------------------------------------"
        );
        expect(oxlintConfig).toContain('files: ["packages/backend/confect/**/*.impl.ts", "packages/backend/confect/**/*.spec.ts"]');
        expect(oxlintConfig).not.toContain('files: ["packages/backend/**/*.ts"]');
        expect(oxlintConfig).not.toContain('"effect/noAsyncFunction": "off"');
        expect(tree.read("apps/web/src/start.ts", "utf-8")).toContain("requestMiddleware: [csrfMiddleware, authkitMiddleware()]");
        expect(tree.read("apps/web/src/routes/index.tsx", "utf-8")).toContain(
          "useQuery(convexQuery(api.authentication.getCurrentAuthentication, {}))"
        );
        expect(tree.read("apps/web/src/routes/index.tsx", "utf-8")).not.toContain("@confect/react");
        expect(tree.read("apps/web/src/routes/index.tsx", "utf-8")).not.toContain("confect/_generated/refs");
        expect(tree.read("apps/web/src/routes/protected.tsx", "utf-8")).toContain("const { user } = await getAuth()");
        expect(tree.read("apps/web/src/server/auth.ts", "utf-8")).toContain("const { user } = await getAuth()");
        expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("createUser({ email, emailVerified: true, password })");
        expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("deleteUser(user.id)");
        expect(tree.read(".env.example", "utf-8")).not.toContain("WORKOS_WEBHOOK_SECRET=");
        expect(tree.read(".env.example", "utf-8")).toContain("AUTH_E2E_EMAIL_DOMAIN=");
        expect(tree.read(".env.example", "utf-8")).not.toMatch(/(?:client_|sk_|whsec_)[A-Za-z0-9]/u);
        expect(backendPackageJson.scripts?.codegen).not.toContain("offline_codegen");
        expect(backendPackageJson.scripts?.codegen).not.toMatch(/WORKOS_(?:CLIENT_ID|API_KEY|WEBHOOK_SECRET)=[A-Za-z0-9_-]+/u);
        expect(backendPackageJson.scripts?.dev).not.toMatch(/WORKOS_(?:CLIENT_ID|API_KEY|WEBHOOK_SECRET)=[A-Za-z0-9_-]+/u);
        expect(tree.exists(".env.local")).toBe(false);
        expect(tree.read(".gitignore", "utf-8")).toBe("/.env.local\n");
        expect(tree.read(".keenko/docs/stacks/workos-authkit/README.md", "utf-8")).toContain("authentication/infrastructure identity");
      })
    ));

  test("connects the web app to the shared ui stylesheet", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        expect(tree.read("apps/web/src/styles.css", "utf-8")).toBe('@import "@acme/ui/globals.css";\n');

        const packageJson = readJson<PackageJson>(tree, "apps/web/package.json");

        expect(packageJson.dependencies).toMatchObject({
          ...Struct.pick(packageVersions, ["@convex-dev/react-query", "convex", "effect"]),
          "@acme/shared": "workspace:*",
          "@acme/ui": "workspace:*",
        });
      })
    ));

  test("configures ui runtime and styling dependencies", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");
        const uiPackageJson = readJson<PackageJson>(tree, "packages/ui/package.json");

        expect(uiPackageJson.dependencies).toMatchObject({
          ...Struct.pick(packageVersions, ["@base-ui/react", "class-variance-authority", "cn", "lucide-react", "shadcn", "tw-animate-css"]),
          react: webPackageJson.dependencies?.react,
          "react-dom": webPackageJson.dependencies?.["react-dom"],
        });

        expect(uiPackageJson.devDependencies).toMatchObject(Struct.pick(packageVersions, ["tailwindcss"]));

        expect(uiPackageJson.dependencies).not.toHaveProperty("clsx");
        expect(uiPackageJson.dependencies).not.toHaveProperty("tailwind-merge");
      })
    ));

  test("keeps ui on the canonical React compatibility versions", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");
        const uiPackageJson = readJson<PackageJson>(tree, "packages/ui/package.json");

        expect(uiPackageJson.dependencies?.react).toBe(packageVersions.react);
        expect(uiPackageJson.dependencies?.["react-dom"]).toBe(packageVersions["react-dom"]);
        expect(webPackageJson.dependencies?.react).toBe(packageVersions.react);
        expect(webPackageJson.dependencies?.["react-dom"]).toBe(packageVersions["react-dom"]);
      })
    ));

  test("creates the shadcn utility entrypoint", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        expect(tree.read("packages/ui/src/lib/utils.ts", "utf-8")).toBe('export { cn } from "cn";\n');
      })
    ));

  test("creates the shared Tailwind and shadcn stylesheet", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const css = tree.read("packages/ui/src/styles/globals.css", "utf-8");

        expect(css).toContain('@import "tailwindcss";');
        expect(css).toContain('@import "tw-animate-css";');
        expect(css).toContain('@import "shadcn/tailwind.css";');

        expect(css).toContain('@source "../**/*.{ts,tsx}";');

        expect(css).toContain("@theme inline");
        expect(css).toContain(":root");
        expect(css).toContain(".dark");
        expect(css).toContain("@layer base");

        expect(css).not.toContain("../../../../apps");
      })
    ));

  test("routes shadcn components to the ui workspace", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const webComponentsJson = readJson<PackageJson>(tree, "apps/web/components.json");
        const uiComponentsJson = readJson<PackageJson>(tree, "packages/ui/components.json");

        expect(webComponentsJson).toMatchObject({
          aliases: {
            components: "#components",
            hooks: "#hooks",
            lib: "#lib",
            ui: "@acme/ui/components",
            utils: "@acme/ui/lib/utils",
          },
          iconLibrary: "lucide",
          rsc: false,
          style: "base-nova",
          tailwind: {
            baseColor: "neutral",
            config: "",
            css: "../../packages/ui/src/styles/globals.css",
            cssVariables: true,
          },
          tsx: true,
        });

        expect(uiComponentsJson).toMatchObject({
          aliases: {
            components: "#components",
            hooks: "#hooks",
            lib: "#lib",
            ui: "#components",
            utils: "#lib/utils",
          },
          iconLibrary: "lucide",
          rsc: false,
          style: "base-nova",
          tailwind: {
            baseColor: "neutral",
            config: "",
            css: "src/styles/globals.css",
            cssVariables: true,
          },
          tsx: true,
        });
      })
    ));

  test("exports the ui surfaces used by shadcn and web", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset("acme");

        const packageJson = readJson<PackageJson>(tree, "packages/ui/package.json");

        expect(packageJson.exports).toEqual({
          "./components/*": "./src/components/*.tsx",
          "./globals.css": "./src/styles/globals.css",
          "./hooks/*": "./src/hooks/*.ts",
          "./lib/*": "./src/lib/*.ts",
        });
      })
    ));

  test("synchronizes Keenko-managed guidance in a fresh workspace", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        expect(tree.exists(".keenko/docs/core/tooling.md")).toBe(true);

        expect(tree.exists(".keenko/skills/confect/SKILL.md")).toBe(true);

        expect(tree.exists(".agents/skills/confect/SKILL.md")).toBe(true);
        expect(tree.exists(".claude/skills/confect/SKILL.md")).toBe(true);

        expect(tree.read("AGENTS.md", "utf-8")).toContain("<!-- keenko:start -->");

        expect(tree.read("CLAUDE.md", "utf-8")).toContain("<!-- keenko:start -->");
      })
    ));

  test("seeds project-owned guidance", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = yield* generatePreset();

        expect(tree.read("CONTEXT.md", "utf-8")).toBe(yield* readTemplate(new URL("files/root/CONTEXT.md", import.meta.url)));

        expect(tree.read("docs/project/architecture.md", "utf-8")).toBe(
          yield* readTemplate(new URL("files/root/docs/project/architecture.md", import.meta.url))
        );

        expect(tree.read("docs/project/overrides.md", "utf-8")).toBe(
          yield* readTemplate(new URL("files/root/docs/project/overrides.md", import.meta.url))
        );

        expect(tree.read("docs/project/ui.md", "utf-8")).toBe(
          yield* readTemplate(new URL("files/root/docs/project/ui.md", import.meta.url))
        );
      })
    ));
});
