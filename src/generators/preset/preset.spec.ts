// oxlint-disable-next-line effect/noNodeBuiltinImport -- Parse the existing Bun-owned CI fixture in a native Bun child process.
import { spawnSync } from "node:child_process";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { readJson, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, FileSystem, Layer as L, Option as O, Path, Schema as S, Struct } from "effect";
import { describe, expect, test } from "vitest";

import { authkitPatchKey, authkitPatchPath } from "../../compatibility/authkit-test.js";
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

const expectedScripts = {
  build: "nx run-many -t build",
  check: `nx sync:check && bun run codegen && ${generatedDriftCheck} && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`,
  codegen: "nx run-many -t codegen",
  dev: 'NX_TUI=false convex dev --start "nx run-many -t dev"',
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
  "@effect/vitest",
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
  it.live("generates the version-specific native Bun AuthKit test patch", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();
      expect(readJson<{ patchedDependencies: Record<string, string> }>(tree, "package.json").patchedDependencies[authkitPatchKey]).toBe(
        authkitPatchPath
      );
      expect(tree.read(authkitPatchPath, "utf-8")).toBe(
        yield* readTemplate(new URL("../../compatibility/files/workos-authkit-0.2.10.patch", import.meta.url))
      );
    })
  );
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

  it.live("replaces initial Nx boilerplate with a concise consumer README", () =>
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
      expect(readme).toContain("/mon-espace");
      expect(readme).not.toContain("/protected");
      for (const document of ["CONTEXT.md", "docs/project/architecture.md"]) {
        expect(readme).toContain(`](${document})`);
        expect(tree.exists(document)).toBe(true);
      }
    })
  );

  it.live("generates a minimal consumer CI gate owned by the canonical check", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();
      const workflowPath = ".github/workflows/check.yml";
      expect(tree.exists(workflowPath)).toBe(true);
      const workflow = O.getOrThrow(O.fromNullishOr(tree.read(workflowPath, "utf-8")));
      const checkoutAction: unknown = expect.stringMatching(/^actions\/checkout@[a-f\d]{40}$/u);
      const nodeAction: unknown = expect.stringMatching(/^actions\/setup-node@[a-f\d]{40}$/u);
      const bunAction: unknown = expect.stringMatching(/^oven-sh\/setup-bun@[a-f\d]{40}$/u);

      const parsed = spawnSync("bun", [
        "--eval",
        "import { YAML } from 'bun'; console.log(JSON.stringify(YAML.parse(process.argv[1])));",
        workflow,
      ]);
      expect(parsed.status, parsed.stderr.toString()).toBe(0);
      expect(yield* S.decodeEffect(S.fromJsonString(S.Unknown))(parsed.stdout.toString())).toEqual({
        concurrency: {
          "cancel-in-progress": true,
          // oxlint-disable-next-line no-template-curly-in-string -- This assertion checks literal GitHub Actions expressions written into the generated workflow.
          group: "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
        },
        jobs: {
          check: {
            if: "github.event_name == 'push' || github.event.pull_request.draft == false",
            "runs-on": "ubuntu-latest",
            steps: [
              { uses: checkoutAction, with: { "persist-credentials": false } },
              { uses: nodeAction, with: { "node-version": runtimeVersions.nodeRange } },
              { uses: bunAction, with: { "bun-version": runtimeVersions.bun } },
              { run: "bun install --frozen-lockfile" },
              { run: "bun run check" },
            ],
            "timeout-minutes": 10,
          },
        },
        name: "Check",
        on: {
          pull_request: { types: ["opened", "synchronize", "reopened", "ready_for_review", "converted_to_draft"] },
          push: { branches: ["main"] },
        },
        permissions: { contents: "read" },
      });
    })
  );

  it.live("owns web codegen through its package script and canonical dependency specs", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();
      const web = readJson<PackageJson>(tree, "apps/web/package.json");
      const tsrConfig = readJson<{ routeTreeFileFooter?: string[] }>(tree, "apps/web/tsr.config.json");
      const viteConfig = tree.read("apps/web/vite.config.ts", "utf-8");

      expect(web.scripts?.codegen).toBe(
        "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --strategy url baseLocale --no-emit-readme && tsr generate"
      );
      expect(web.scripts?.dev).toBe("vite dev");
      expect(viteConfig).toContain("emitReadme: false");
      expect(viteConfig).toContain("envDir: '../..'");
      expect(viteConfig).toContain("port: 3210");
      expect(viteConfig).toContain("strictPort: true");
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
      expect(web.devDependencies?.["@types/node"]).toBe(packageVersions["@types/node"]);
      expect(web.nx?.targets?.codegen).toBeUndefined();
      expect(tree.exists("apps/web/project.inlang/settings.json")).toBe(true);
      expect(tree.exists("apps/web/tsr.config.json")).toBe(true);
      expect(tsrConfig.routeTreeFileFooter).toEqual([START_ROUTE_TREE_FOOTER]);
    })
  );

  it.live("generates the initial workspace topology", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      expect(tree.exists("apps/web/package.json")).toBe(true);
      expect(tree.exists("packages/backend/package.json")).toBe(true);
      expect(tree.exists("packages/shared/package.json")).toBe(true);
      expect(tree.exists("packages/ui/package.json")).toBe(true);
    })
  );

  it.live("configures inferred Vitest targets for every fixed workspace", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      for (const config of ["apps/web/vitest.config.ts", "packages/shared/vitest.config.ts", "packages/ui/vitest.config.ts"])
        expect(tree.read(config, "utf-8")).toContain("passWithNoTests: true");

      expect(tree.read("apps/web/vitest.config.ts", "utf-8")).toContain('environment: "jsdom"');
      expect(tree.read("packages/ui/vitest.config.ts", "utf-8")).toContain('environment: "jsdom"');
      expect(tree.read("packages/shared/vitest.config.ts", "utf-8")).toContain('environment: "node"');

      const backendConfig = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/vitest.config.ts", "utf-8")));
      expect(backendConfig).toContain('environment: "node"');
      expect(backendConfig).toContain('environment: "edge-runtime"');
      expect(backendConfig).toContain('include: ["test/**/*.test.{ts,js}"]');
      expect(backendConfig.match(/passWithNoTests/gu)).toHaveLength(1);

      expect(readJson<PackageJson>(tree, "packages/backend/package.json").devDependencies).toMatchObject(
        Struct.pick(packageVersions, ["@confect/test", "@edge-runtime/vm", "convex-test"])
      );
      expect(readJson<PackageJson>(tree, "packages/ui/package.json").devDependencies).toMatchObject(
        Struct.pick(packageVersions, ["@testing-library/dom", "@testing-library/react", "@types/react", "jsdom"])
      );
    })
  );

  it.live("uses the Nx workspace name unchanged as the Keenko identity", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("my-project");

      expect(readJson<PackageJson>(tree, "package.json").name).toBe("my-project");
      expect(readJson<PackageJson>(tree, "apps/web/package.json").name).toBe("@my-project/web");

      for (const scope of packageScopes)
        expect(readJson<PackageJson>(tree, `packages/${scope}/package.json`).name).toBe(`@my-project/${scope}`);
    })
  );

  it.live("accepts valid npm identity forms without normalization", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("my_app");

      expect(readJson<PackageJson>(tree, "package.json").name).toBe("my_app");
      expect(readJson<PackageJson>(tree, "apps/web/package.json").name).toBe("@my_app/web");
      expect(readJson<PackageJson>(tree, "packages/backend/package.json").name).toBe("@my_app/backend");
      expect(readJson<PackageJson>(tree, "packages/shared/package.json").name).toBe("@my_app/shared");
      expect(readJson<PackageJson>(tree, "packages/ui/package.json").name).toBe("@my_app/ui");
    })
  );

  it.live("rejects an invalid workspace identity before generation", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();

      const exit = yield* E.exit(runPreset(tree, "myProject"));

      expect(exit._tag).toBe("Failure");

      expect(tree.exists("apps/web/package.json")).toBe(false);
      expect(tree.exists("packages/backend/package.json")).toBe(false);
      expect(tree.exists("packages/shared/package.json")).toBe(false);
      expect(tree.exists("packages/ui/package.json")).toBe(false);
    })
  );

  it.live("does not partially write when a managed target is occupied", () =>
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
  );

  for (const root of managedRoots)
    it.live(`refuses occupied ${root}`, () =>
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
    );

  it.live("configures the Bun workspace roots", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      expect(readJson<PackageJson>(tree, "package.json").workspaces).toEqual(expectedWorkspaces);
    })
  );

  it.live("configures the canonical root project lifecycle", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();
      const packageJson = readJson<PackageJson & { intent: { skills: string[] } }>(tree, "package.json");

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
      expect(packageJson.devDependencies?.["@tanstack/intent"]).toBe(packageVersions["@tanstack/intent"]);
      expect(packageJson.intent).toEqual({ skills: ["@tanstack/*"] });

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
            exclude: ["apps/*/vite.config.ts"],
            options: { testMode: "run", testTargetName: "test" },
            plugin: "@nx/vitest",
          },
        ],
        sync: {
          globalGenerators: ["keenko:sync"],
        },
      });
    })
  );

  it.live("configures the workspace development loop", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      const rootPackageJson = readJson<PackageJson>(tree, "package.json");
      const backendPackageJson = readJson<PackageJson>(tree, "packages/backend/package.json");
      const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");

      expect(rootPackageJson.scripts?.dev).toBe('NX_TUI=false convex dev --start "nx run-many -t dev"');
      expect(rootPackageJson.devDependencies?.convex).toBe(packageVersions.convex);
      expect(rootPackageJson.devDependencies?.["@tanstack/react-start"]).toBe(packageVersions["@tanstack/react-start"]);
      expect(webPackageJson.dependencies?.["@tanstack/react-start"]).toBe(packageVersions["@tanstack/react-start"]);
      for (const rootCode of tree.children("").filter((entry) => /\.(?:c|m)?(?:j|t)sx?$/u.test(entry)))
        expect(tree.read(rootCode, "utf-8")).not.toContain("@tanstack/react-start");

      expect(backendPackageJson.scripts).toEqual({ codegen: "confect codegen", dev: "confect dev" });
      expect(backendPackageJson.nx?.targets?.dev).toEqual({ continuous: true });
      expect(webPackageJson.nx?.targets?.dev).toEqual({ continuous: true });

      expect(readJson(tree, "convex.json")).toEqual({
        $schema: "./node_modules/convex/schemas/convex.schema.json",
        authKit: {
          dev: {
            configure: {
              appHomepageUrl: "http://localhost:3210",
              corsOrigins: ["http://localhost:3210"],
              redirectUris: ["http://localhost:3210/api/auth/callback"],
            },
            localEnvVars: {
              WORKOS_API_KEY: `\${authEnv.WORKOS_API_KEY}`,
              WORKOS_CLIENT_ID: `\${authEnv.WORKOS_CLIENT_ID}`,
              WORKOS_REDIRECT_URI: "http://localhost:3210/api/auth/callback",
            },
          },
        },
        functions: "packages/backend/convex",
      });
      expect(tree.exists("apps/web/.env.local")).toBe(false);
      expect(tree.exists("convex")).toBe(false);
      expect(tree.exists("apps/web/convex")).toBe(false);
    })
  );

  it.live("generates the canonical root tooling configuration", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      expect(tree.exists("oxfmt.config.ts")).toBe(true);
      expect(tree.exists("oxlint.config.ts")).toBe(true);
      expect(tree.read("bunfig.toml", "utf-8")).toBe('[install]\nlinker = "isolated"\nhoist = false\n');
      expect(readJson<PackageJson>(tree, "package.json").type).toBe("module");

      expect(readJson(tree, "tsconfig.base.json")).toMatchObject({
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          moduleResolution: "bundler",
          noEmit: true,
          strict: true,
        },
      });
    })
  );

  it.live("keeps authored TypeScript inside each workspace compiler project", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();
      const backend = readJson<{ include: string[] }>(tree, "packages/backend/tsconfig.json");
      const shared = readJson<{ include: string[] }>(tree, "packages/shared/tsconfig.json");
      const ui = readJson<{ include: string[] }>(tree, "packages/ui/tsconfig.json");
      const web = readJson<{ compilerOptions: { exactOptionalPropertyTypes?: boolean }; include: string[] }>(
        tree,
        "apps/web/tsconfig.json"
      );

      expect(backend.include).toContain("vitest.config.ts");
      expect(backend.include).toContain("test/**/*.ts");
      expect(shared.include).toContain("vitest.config.ts");
      expect(ui.include).toContain("vitest.config.ts");
      expect(web.include).toContain("**/*.ts");
      expect(web.include).toContain("**/*.tsx");

      const oxlintConfig = tree.read("oxlint.config.ts", "utf-8");
      expect(oxlintConfig).not.toContain("effecttsgo/any-unknown-in-error-context");
    })
  );

  it.live("removes the EditorConfig created by the base Nx workspace", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      tree.write(".editorconfig", "root = true\n");

      yield* runPreset(tree);

      expect(tree.exists(".editorconfig")).toBe(false);
    })
  );

  it.live("replaces TanStack editable source with the Keenko web baseline", () =>
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
      expect(rootRoute).toContain(`notFoundComponent: () => <h1 className="text-3xl font-bold">{m.plain_dark_angelfish_scoop()}</h1>`);
      expect(router).toContain("<AuthKitProvider>");
      expect(router).toContain("<ConvexProviderWithAuth client={convexClient} useAuth={useAuthFromWorkOS}>");
      expect(rootRoute).not.toContain("<ConvexProvider");

      expect(oxlintConfig).toContain('files: ["apps/**/*.{ts,tsx}"]');
      expect(oxlintConfig).not.toContain('sourceTag: "scope:web"');
      expect(oxlintConfig).toContain('sourceTag: "type:app"');
      expect(oxlintConfig).toContain("depConstraints: [");
      expect(tree.exists("tools/dependency-boundaries.ts")).toBe(false);
      expect(oxlintConfig).toContain('"eslint/sort-keys": "off"');
    })
  );

  it.live("seeds the canonical Paraglide starter baseline", () =>
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
        calm_green_otter: "Keenko",
      });

      expect(english).toMatchObject({
        calm_green_otter: "Keenko",
      });

      expect(homeRoute).toContain("#/paraglide/messages");

      expect(homeRoute).toContain("m.calm_green_otter()");
    })
  );

  it.live("configures package typecheck targets", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      for (const scope of packageScopes) {
        const packageJson = readJson<PackageJson>(tree, `packages/${scope}/package.json`);

        expect(packageJson.nx?.targets?.typecheck).toEqual(expectedTypecheckTarget);
      }
    })
  );

  it.live("configures web typechecking without replacing TanStack configuration", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();
      const packageJson = readJson<PackageJson>(tree, "apps/web/package.json");

      expect(packageJson.nx).toMatchObject({
        tags: ["type:app"],
        targets: {
          typecheck: expectedTypecheckTarget,
        },
      });

      expect(tree.exists("apps/web/tsconfig.json")).toBe(true);
    })
  );

  it.live("configures the shared package contract", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      const packageJson = readJson<PackageJson>(tree, "packages/shared/package.json");
      const tsconfig = readJson<{ include: string[] }>(tree, "packages/shared/tsconfig.json");

      expect(packageJson.exports).toEqual({ "./*": "./src/*.ts" });
      expect(packageJson.dependencies).toEqual(Struct.pick(packageVersions, ["effect"]));
      expect(tsconfig.include).toEqual(["vitest.config.ts", "src/**/*.ts"]);

      expect(tree.read("packages/shared/src/index.ts", "utf-8")).toBe("");
      expect(tree.exists("packages/shared/src/schemas/string.ts")).toBe(true);
    })
  );

  it.live("creates a domain-neutral Confect backend baseline", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      expect(tree.exists("packages/backend/confect/.gitkeep")).toBe(true);
      expect(tree.exists("packages/backend/convex/convex.config.ts")).toBe(true);
      expect(tree.exists("packages/backend/data/confect.ts")).toBe(true);
      expect(tree.exists("packages/shared/data/confect.ts")).toBe(false);
      expect(tree.exists("packages/backend/confect/data.ts")).toBe(false);

      const dataHelpers = tree.read("packages/backend/data/confect.ts", "utf-8");
      for (const helper of [
        "dieOnCodecError",
        "dieOnDecodeError",
        "dieOnEncodeError",
        "dieOnPatchError",
        "optionByBlob",
        "optionById",
        "optionByIndex",
      ])
        expect(dataHelpers).toContain(`export function ${helper}`);
    })
  );

  it.live("scaffolds the fixed WorkOS AuthKit baseline without tracked credentials", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");
      const rootPackageJson = readJson<PackageJson>(tree, "package.json");
      const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");
      const backendPackageJson = readJson<PackageJson>(tree, "packages/backend/package.json");
      const authSmoke = O.getOrThrow(O.fromNullishOr(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")));

      expect(webPackageJson.dependencies).toMatchObject({
        "@acme/backend": "workspace:*",
        "@confect/core": packageVersions["@confect/core"],
        "@workos/authkit-tanstack-react-start": packageVersions["@workos/authkit-tanstack-react-start"],
      });
      expect(webPackageJson.dependencies).not.toHaveProperty("@confect/react");
      expect(webPackageJson.devDependencies?.["@playwright/test"]).toBe(packageVersions["@playwright/test"]);
      expect(webPackageJson.devDependencies).not.toHaveProperty("@workos-inc/node");
      expect(webPackageJson.scripts?.["test:auth:e2e"]).toBe("playwright test --config playwright.config.ts --headed --workers=1");
      expect(rootPackageJson.scripts?.["test:auth:e2e"]).toBe("bun --env-file=../../.env.local run --cwd apps/web test:auth:e2e");
      expect(authSmoke).toContain("request.isNavigationRequest()");
      expect(authSmoke).toContain("await page.pause()");
      expect(authSmoke).toContain('page.getByTestId("convex-authenticated")');
      expect(authSmoke).toContain('page.getByTestId("workos-user-synchronized")');
      expect(authSmoke).toContain("url.origin !== applicationOrigin");
      expect(authSmoke).not.toContain("/(?:authkit|workos)/u");
      expect(authSmoke).not.toMatch(/AUTH_E2E_EMAIL_DOMAIN|createUser|deleteUser|Password|Continue with email/u);
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
        "apps/web/src/routes/mon-espace.tsx",
        "apps/web/src/server/auth.ts",
        "apps/web/e2e/auth.e2e.ts",
        "apps/web/playwright.config.ts",
        "packages/backend/confect/auth.ts",
        "packages/backend/confect/identity.spec.ts",
        "packages/backend/confect/identity.impl.ts",
        "packages/backend/confect/http.ts",
        "packages/backend/confect/workos.ts",
        "packages/backend/confect/workos.spec.ts",
        "packages/backend/confect/workos.impl.ts",
        "packages/backend/convex/_generated/api.d.ts",
        "packages/backend/convex/_generated/api.js",
      ])
        expect(tree.exists(file)).toBe(true);

      const convexConfig = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/convex/convex.config.ts", "utf-8")));
      const generatedApi = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/convex/_generated/api.d.ts", "utf-8")));
      const identitySpec = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/confect/identity.spec.ts", "utf-8")));
      const identityImpl = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/confect/identity.impl.ts", "utf-8")));
      const workspaceRoute = O.getOrThrow(O.fromNullishOr(tree.read("apps/web/src/routes/mon-espace.tsx", "utf-8")));
      const oxlintConfig = tree.read("oxlint.config.ts", "utf-8");

      expect(convexConfig).toContain('"@convex-dev/workos-authkit/convex.config"');
      expect(convexConfig).toContain("WORKOS_API_KEY: v.string()");
      expect(convexConfig).toContain("WORKOS_CLIENT_ID: v.string()");
      expect(convexConfig).toContain("WORKOS_WEBHOOK_SECRET: v.optional(v.string())");
      const workOSClient = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/confect/workos.ts", "utf-8")));
      const workOSSpec = O.getOrThrow(O.fromNullishOr(tree.read("packages/backend/confect/workos.spec.ts", "utf-8")));
      expect(workOSClient).toContain('"@convex-dev/workos-authkit"');
      expect(workOSSpec).toContain('FunctionSpec.convexInternalMutation<typeof backfillUsers>()("backfillUsers")');
      expect(tree.read("packages/backend/confect/auth.ts", "utf-8")).toContain("WORKOS_CLIENT_ID");
      expect(tree.read("packages/backend/confect/auth.ts", "utf-8")).toContain("O.fromUndefinedOr(clientId).pipe(");
      expect(identityImpl).toContain('CFG.String("WORKOS_CLIENT_ID").pipe(E.orDie)');
      expect(tree.read("apps/web/src/start.ts", "utf-8")).toContain('"@workos/authkit-tanstack-react-start"');
      expect(generatedApi).toContain("identity: typeof");
      expect(generatedApi).toContain("workos: typeof");
      expect(generatedApi).not.toContain("authentication: typeof");

      for (const file of [
        "packages/backend/confect/authentication.ts",
        "packages/backend/confect/authentication.spec.ts",
        "packages/backend/confect/authentication.impl.ts",
        "packages/backend/confect/identity.ts",
      ])
        expect(tree.exists(file)).toBe(false);

      for (const functionName of ["findCurrent", "getCurrent", "findSynchronized"])
        expect(identitySpec).toContain(`name: "${functionName}"`);
      expect(identitySpec.split("FunctionSpec.publicQuery")).toHaveLength(4);
      expect(identitySpec).toContain("returns: () => Schema.OptionFromNullOr(sCurrentIdentity)");
      expect(identitySpec).toContain("returns: () => sCurrentIdentity");
      expect(identitySpec).toContain("error: () => AuthenticationRequired");
      expect(identitySpec).toContain("returns: () => Schema.OptionFromNullOr(sSynchronizedIdentity)");

      expect(workspaceRoute).toContain("api.identity.findCurrent");
      expect(workspaceRoute).toContain("api.identity.findSynchronized");
      expect(workspaceRoute).not.toContain("workOSUserSynchronized");
      expect(identitySpec).toContain(
        "// SCHEMAS ---------------------------------------------------------------------------------------------------------------------------------"
      );
      expect(identitySpec).toContain(
        "// SPEC ------------------------------------------------------------------------------------------------------------------------------------"
      );
      expect(identitySpec).toContain(
        "// QUERIES -------------------------------------------------------------------------------------------------------------------------------"
      );
      expect(identityImpl).toContain(
        "// GROUP -----------------------------------------------------------------------------------------------------------------------------------"
      );
      expect(oxlintConfig).toContain('files: ["packages/backend/**/*.ts"]');
      expect(oxlintConfig).not.toContain("effect/noEffectRunInTests");
      expect(rootPackageJson.devDependencies?.["oxlint-plugin-effect"]).toBe("0.27.0");
      expect(oxlintConfig).not.toContain("packages/backend/confect/identity.impl.ts");
      expect(oxlintConfig).not.toContain("packages/backend/confect/authentication.ts");
      for (const rule of ["effect/noAsyncFunction", "effect/noNewError", "effect/noNullish", "effect/noThrowStatement"])
        expect(oxlintConfig).not.toContain(`"${rule}": "off"`);
      expect(tree.read(".env.example", "utf-8")).not.toContain("WORKOS_WEBHOOK_SECRET=");
      expect(tree.read(".env.example", "utf-8")).not.toContain("AUTH_E2E_EMAIL_DOMAIN=");
      expect(tree.read(".env.example", "utf-8")).not.toMatch(/(?:client_|sk_|whsec_)[A-Za-z0-9]/u);
      expect(backendPackageJson.scripts?.codegen).toBe("confect codegen");
      expect(backendPackageJson.scripts?.dev).toBe("confect dev");
      expect(tree.exists(".env.local")).toBe(false);
      expect(tree.read(".gitignore", "utf-8")).toContain("/.env.local");
    })
  );

  it.live("connects the web app to the shared ui stylesheet", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      const packageJson = readJson<PackageJson>(tree, "apps/web/package.json");

      expect(packageJson.dependencies).toMatchObject({
        ...Struct.pick(packageVersions, ["@convex-dev/react-query", "convex", "effect"]),
        "@acme/shared": "workspace:*",
        "@acme/ui": "workspace:*",
      });
    })
  );

  it.live("configures ui runtime and styling dependencies", () =>
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
  );

  it.live("keeps ui on the canonical React compatibility versions", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      const webPackageJson = readJson<PackageJson>(tree, "apps/web/package.json");
      const uiPackageJson = readJson<PackageJson>(tree, "packages/ui/package.json");

      expect(uiPackageJson.dependencies?.react).toBe(packageVersions.react);
      expect(uiPackageJson.dependencies?.["react-dom"]).toBe(packageVersions["react-dom"]);
      expect(webPackageJson.dependencies?.react).toBe(packageVersions.react);
      expect(webPackageJson.dependencies?.["react-dom"]).toBe(packageVersions["react-dom"]);
    })
  );

  it.live("creates the shadcn utility entrypoint", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      expect(tree.read("packages/ui/src/lib/utils.ts", "utf-8")).toBe('export { cn } from "cn";\n');
    })
  );

  it.live("creates the shared Tailwind and shadcn stylesheet", () =>
    E.gen(function* () {
      const tree = yield* generatePreset("acme");

      const css = tree.read("packages/ui/src/styles/globals.css", "utf-8");

      expect(css).toContain('@import "tailwindcss" source(none);');
      expect(css).toContain('@import "tw-animate-css";');
      expect(css).toContain('@import "shadcn/tailwind.css";');

      expect(css).toContain("@theme inline");
      expect(css).toContain(":root");
      expect(css).toContain(".dark");
      expect(css).toContain("@layer base");

      expect(css).not.toContain("../../../../apps");
    })
  );

  it.live("routes shadcn components to the ui workspace", () =>
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
        style: "base-vega",
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
        style: "base-vega",
        tailwind: {
          baseColor: "neutral",
          config: "",
          css: "src/styles/globals.css",
          cssVariables: true,
        },
        tsx: true,
      });
    })
  );

  it.live("exports the ui surfaces used by shadcn and web", () =>
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
  );

  it.live("synchronizes Keenko-managed guidance in a fresh workspace", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      expect(tree.exists(".keenko/docs/core/tooling.md")).toBe(true);

      for (const stack of ["confect", "convex", "workos-authkit"])
        expect(tree.read(`.keenko/docs/stacks/${stack}/README.md`, "utf-8")).toBe(
          yield* readTemplate(new URL(`../sync/files/docs/stacks/${stack}/README.md`, import.meta.url))
        );

      expect(tree.exists(".keenko/skills/confect/SKILL.md")).toBe(true);

      expect(tree.exists(".agents/skills/confect/SKILL.md")).toBe(true);
      expect(tree.exists(".claude/skills/confect/SKILL.md")).toBe(true);

      expect(tree.read("AGENTS.md", "utf-8")).toContain("<!-- keenko:start -->");

      expect(tree.read("CLAUDE.md", "utf-8")).toContain("<!-- keenko:start -->");
    })
  );

  it.live("seeds project-owned guidance", () =>
    E.gen(function* () {
      const tree = yield* generatePreset();

      expect(tree.read("CONTEXT.md", "utf-8")).toBe(yield* readTemplate(new URL("files/root/CONTEXT.md", import.meta.url)));

      expect(tree.read("docs/project/architecture.md", "utf-8")).toBe(
        yield* readTemplate(new URL("files/root/docs/project/architecture.md", import.meta.url))
      );

      expect(tree.read("docs/project/overrides.md", "utf-8")).toBe(
        yield* readTemplate(new URL("files/root/docs/project/overrides.md", import.meta.url))
      );

      expect(tree.read("docs/project/ui.md", "utf-8")).toBe(yield* readTemplate(new URL("files/root/docs/project/ui.md", import.meta.url)));
    })
  );
});
