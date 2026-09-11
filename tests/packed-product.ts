import { isDeepStrictEqual } from "node:util";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  webDependencies as canonicalWebDependencies,
  webDevDependencies as canonicalWebDevDependencies,
} from "../src/generators/preset/helpers/apps-web.js";
import { packageVersions } from "../src/generators/versions.js";

const OXC_EXTENSION = "oxc.oxc-vscode";
const expectedBackendDev = `WORKOS_CLIENT_ID="$(bun --eval 'process.stdout.write(crypto.randomUUID())')" WORKOS_API_KEY="$(bun --eval 'process.stdout.write(crypto.randomUUID())')" WORKOS_WEBHOOK_SECRET="$(bun --eval 'process.stdout.write(crypto.randomUUID())')" confect dev`;
const canonicalVscodeSettings = {
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "always",
    "source.format.oxc": "always",
  },
  "editor.defaultFormatter": OXC_EXTENSION,
  "editor.formatOnPaste": true,
  "editor.formatOnSave": false,
  "js/ts.experimental.useTsgo": true,
  "js/ts.tsdk.additionalLocations": ["./node_modules/typescript/bin"],
  "js/ts.tsdk.path": "./node_modules/typescript/bin",
  "js/ts.tsdk.promptToUseWorkspaceVersion": true,
};

class ProductFailure extends S.TaggedError<ProductFailure>()("ProductFailure", { message: S.String }) {}

type PackageSource = { readonly _tag: "local" } | { readonly _tag: "published"; readonly version: string };

const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

const parsePackageSource = E.fn("product.parsePackageSource")(function* (args: readonly string[]) {
  if (args.length === 0) return { _tag: "local" } satisfies PackageSource;
  const publishedArgs = S.decodeUnknownOption(S.Tuple([S.Literal("--published"), S.String]))(args);
  if (O.isSome(publishedArgs) && exactSemver.test(publishedArgs.value[1]))
    return { _tag: "published", version: publishedArgs.value[1] } satisfies PackageSource;

  return yield* new ProductFailure({
    message: "Usage: bun run test:product OR bun run test:published -- <exact-version>",
  });
});

const assert = E.fn("product.assert")(function* (condition: boolean, message: string) {
  if (!condition) return yield* new ProductFailure({ message });
});

const command = E.fn("product.command")(
  function* (
    cwd: string,
    env: Record<string, string>,
    executable: string,
    args: readonly string[],
    expected: "success" | "failure" = "success"
  ) {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const outputFile = yield* fs.makeTempFileScoped({ prefix: "keenko-product-output-" });
    const child = yield* spawner.spawn(
      ChildProcess.make(
        "/bin/sh",
        ["-c", 'output=$1; shift; exec "$@" >"$output" 2>&1', "keenko-product-command", outputFile, executable, ...args],
        {
          cwd,
          env,
          extendEnv: true,
        }
      )
    );
    const exitCode = yield* child.exitCode;
    const output = yield* fs.readFileString(outputFile);
    yield* assert(
      expected === "failure" ? exitCode !== 0 : exitCode === 0,
      `${executable} ${args.join(" ")} exited ${exitCode} in ${cwd}\n${output.slice(-16_000)}`
    );
    return output;
  },
  E.scoped,
  E.timeout("10 minutes")
);

const sVersionPackage = S.fromJsonString(S.Struct({ version: S.String }));
const sNamedPackage = S.fromJsonString(S.Struct({ name: S.String }));
const sDependenciesPackage = S.fromJsonString(S.Struct({ dependencies: S.Record(S.String, S.String) }));
const sDevDependenciesPackage = S.fromJsonString(S.Struct({ devDependencies: S.Record(S.String, S.String) }));
const sLifecyclePackage = S.fromJsonString(
  S.Struct({ devDependencies: S.Record(S.String, S.String), scripts: S.Record(S.String, S.String) })
);
const sConvexConfig = S.fromJsonString(
  S.Struct({
    $schema: S.String,
    authKit: S.Struct({
      dev: S.Struct({
        configure: S.Struct({
          appHomepageUrl: S.String,
          corsOrigins: S.Array(S.String),
          redirectUris: S.Array(S.String),
        }),
        localEnvVars: S.Struct({
          WORKOS_API_KEY: S.String,
          WORKOS_CLIENT_ID: S.String,
          WORKOS_REDIRECT_URI: S.String,
        }),
      }),
    }),
    functions: S.String,
  })
);
const sManifest = S.fromJsonString(S.Record(S.String, S.Unknown));
const sProject = S.fromJsonString(S.Struct({ targets: S.Record(S.String, S.Unknown) }));
const sInlangSettings = S.fromJsonString(S.Struct({ baseLocale: S.String, locales: S.Array(S.String) }));
const sMessages = S.fromJsonString(S.Record(S.String, S.String));

const preparePackageSource = E.fn("product.preparePackageSource")(function* (
  source: PackageSource,
  repository: string,
  temporary: string,
  env: Readonly<Record<string, string>>
) {
  if (source._tag === "published") {
    yield* Console.log(`Keenko published product test version: ${source.version}`);
    return {
      bootstrapEnv: env,
      bootstrapExecutable: "bunx",
      localLicense: O.none<string>(),
      packageVersion: source.version,
    };
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const registry = "http://127.0.0.1:4873";
  const npmrc = path.join(temporary, "npmrc");
  const bunCache = path.join(temporary, "bun-cache");
  yield* fs.writeFileString(npmrc, `registry=${registry}\n//127.0.0.1:4873/:_authToken=secretVerdaccioToken\n`);
  const npmEnv = {
    ...env,
    NPM_CONFIG_CACHE: path.join(temporary, "npm-cache"),
    NPM_CONFIG_REGISTRY: registry,
    NPM_CONFIG_USERCONFIG: npmrc,
  };
  const bootstrapEnv = {
    ...npmEnv,
    BUN_CONFIG_REGISTRY: registry,
    BUN_INSTALL_CACHE_DIR: bunCache,
  };

  yield* spawner.spawn(
    ChildProcess.make("bun", ["x", "nx", "run", "keenko:local-registry"], {
      cwd: repository,
      env: npmEnv,
      extendEnv: true,
      stderr: "inherit",
      stdout: "inherit",
    })
  );

  yield* command(repository, env, "bun", ["run", "build"]);
  const packed = path.join(temporary, "packed");
  yield* fs.makeDirectory(packed);
  yield* command(repository, env, "bun", ["pm", "pack", "--destination", packed]);

  const localPackage = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(path.join(repository, "package.json")));
  const tarball = path.join(packed, `keenko-${localPackage.version}.tgz`);
  yield* assert(yield* fs.exists(tarball), `Packed Keenko artifact is missing: ${tarball}`);

  const runId = `run-${path.basename(temporary).replaceAll(/[^0-9A-Za-z-]/gu, "-")}`;
  const packageVersion = `${localPackage.version}-product.${runId}`;
  const repack = path.join(temporary, "repack");
  yield* fs.makeDirectory(repack);
  yield* command(temporary, env, "tar", ["-xzf", tarball, "-C", repack]);
  const packedManifestPath = path.join(repack, "package/package.json");
  const packedManifest = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(packedManifestPath));
  yield* fs.writeFileString(packedManifestPath, yield* S.encodeEffect(sManifest)({ ...packedManifest, version: packageVersion }));
  const testTarball = path.join(packed, `keenko-${packageVersion}.tgz`);
  yield* command(temporary, env, "tar", ["-czf", testTarball, "-C", repack, "package"]);
  yield* Console.log(`Keenko local product test version: ${packageVersion}`);

  yield* command(temporary, npmEnv, "npm", [
    "publish",
    testTarball,
    "--registry",
    registry,
    "--ignore-scripts",
    "--access",
    "public",
    "--tag",
    "latest",
    "--loglevel=error",
  ]);

  const bootstrapPrime = path.join(temporary, "bootstrap-prime");
  yield* fs.makeDirectory(bootstrapPrime);
  yield* fs.writeFileString(
    path.join(bootstrapPrime, "package.json"),
    yield* S.encodeEffect(sManifest)({ dependencies: { "create-nx-workspace": "23.2.0" }, private: true })
  );
  yield* command(bootstrapPrime, bootstrapEnv, "bun", ["install", "--ignore-scripts"]);

  return {
    bootstrapEnv,
    bootstrapExecutable: "bunx",
    localLicense: O.some(yield* fs.readFileString(path.join(repository, "src/generators/sync/files/skills/grilling/LICENSE"))),
    packageVersion,
  };
});

const product = E.gen(function* () {
  // oxlint-disable-next-line effect/noGlobals -- process arguments are the published-test command boundary.
  const source = yield* parsePackageSource(process.argv.slice(2));
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repository = yield* path.fromFileUrl(new URL("../", import.meta.url));
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-product-" });
  const env = {
    CI: "true",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_GLOBAL: path.join(temporary, "gitconfig-global"),
    GIT_CONFIG_KEY_0: "user.useConfigOnly",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_VALUE_0: "true",
    NX_DAEMON: "false",
    NX_INTERACTIVE: "false",
    WORKOS_API_KEY: "",
    WORKOS_CLIENT_ID: "",
    WORKOS_COOKIE_PASSWORD: "",
    WORKOS_WEBHOOK_SECRET: "",
  };
  const { bootstrapEnv, bootstrapExecutable, localLicense, packageVersion } = yield* preparePackageSource(
    source,
    repository,
    temporary,
    env
  );

  const identity = "product-acceptance";
  const createArguments = [
    "create-nx-workspace@23.2.0",
    identity,
    source._tag === "local" ? "--preset=keenko" : `--preset=keenko@${packageVersion}`,
    "--packageManager=bun",
    "--nxCloud=skip",
    "--interactive=false",
    "--trustThirdPartyPreset",
  ];
  const createOutput = yield* command(temporary, bootstrapEnv, bootstrapExecutable, createArguments);
  yield* assert(!createOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Creation emitted a module-typeless package warning");

  const workspace = path.join(temporary, identity);
  yield* assert(!(yield* fs.exists(path.join(workspace, ".editorconfig"))), "Fresh creation retained Nx's .editorconfig");
  for (const [file, name] of [
    ["package.json", identity],
    ["apps/web/package.json", `@${identity}/web`],
    ["packages/backend/package.json", `@${identity}/backend`],
    ["packages/ui/package.json", `@${identity}/ui`],
    ["packages/shared/package.json", `@${identity}/shared`],
  ]) {
    const manifest = yield* S.decodeEffect(sNamedPackage)(yield* fs.readFileString(path.join(workspace, file)));
    yield* assert(manifest.name === name, `Incorrect package name at ${file}`);
  }

  for (const project of [`@${identity}/web`, `@${identity}/backend`, `@${identity}/ui`, `@${identity}/shared`]) {
    const configuration = yield* S.decodeEffect(sProject)(
      yield* command(workspace, env, "bun", ["x", "nx", "show", "project", project, "--json"])
    );
    yield* assert(Object.hasOwn(configuration.targets, "test"), `${project} is missing its inferred Vitest target`);
  }

  for (const file of [
    "CONTEXT.md",
    ".keenko/docs/core/tooling.md",
    ".keenko/skills/grilling/SKILL.md",
    ".keenko/skills/grilling/LICENSE",
    ".agents/skills/grilling/SKILL.md",
    ".claude/skills/grilling/SKILL.md",
    "AGENTS.md",
  ])
    yield* assert(yield* fs.exists(path.join(workspace, file)), `Missing representative shipped file: ${file}`);

  const agents = yield* fs.readFileString(path.join(workspace, "AGENTS.md"));
  yield* assert(
    agents.includes("<!-- keenko:start -->") && agents.includes("<!-- keenko:end -->"),
    "AGENTS.md is missing the Keenko managed markers"
  );
  const installedPackagePath = path.join(workspace, "node_modules/keenko/package.json");
  const installedPackageSource = yield* fs.readFileString(installedPackagePath);
  const installedPackage = yield* S.decodeEffect(sVersionPackage)(installedPackageSource);
  yield* assert(installedPackage.version === packageVersion, `The consumer did not install Keenko ${packageVersion}`);
  const installedPackageManifest = yield* S.decodeEffect(sManifest)(installedPackageSource);
  yield* assert(!Object.hasOwn(installedPackageManifest, "nx-migrations"), "Pre-1.0 package unexpectedly exposes Nx migration metadata");
  yield* assert(
    !(yield* fs.exists(path.join(workspace, "node_modules/keenko/migrations.json"))),
    "Pre-1.0 package unexpectedly ships an executable migration manifest"
  );
  const webPackage = yield* S.decodeEffect(sDevDependenciesPackage)(
    yield* fs.readFileString(path.join(workspace, "apps/web/package.json"))
  );
  yield* assert(webPackage.devDependencies["@types/node"] === "24.13.3", "Generated web does not use Node 24 types");
  const rootManifest = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(path.join(workspace, "package.json")));
  yield* assert(rootManifest.type === "module", "Generated root package is not explicitly an ES module");
  const lifecyclePackage = yield* S.decodeEffect(sLifecyclePackage)(yield* fs.readFileString(path.join(workspace, "package.json")));
  const backendLifecyclePackage = yield* S.decodeEffect(sLifecyclePackage)(
    yield* fs.readFileString(path.join(workspace, "packages/backend/package.json"))
  );
  const backendManifest = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(path.join(workspace, "packages/backend/package.json")));
  const webManifest = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(path.join(workspace, "apps/web/package.json")));
  const webDependencies = yield* S.decodeUnknownEffect(S.Record(S.String, S.String))(webManifest.dependencies);
  yield* assert(
    lifecyclePackage.scripts.dev === 'convex dev --start "nx run-many -t dev"',
    "Generated root dev script does not let Convex establish deployment state before Nx application processes"
  );
  yield* assert(
    lifecyclePackage.devDependencies.convex === packageVersions.convex,
    "Generated root lifecycle does not declare the canonical Convex CLI"
  );
  yield* assert(
    lifecyclePackage.devDependencies["@tanstack/react-start"] === webDependencies["@tanstack/react-start"],
    "Generated root lifecycle does not expose the web framework marker used by Convex environment detection"
  );
  yield* assert(
    lifecyclePackage.devDependencies["@tanstack/react-start"] === packageVersions["@tanstack/react-start"],
    "Root React Start detection marker does not use the canonical exact version"
  );
  yield* assert(
    webDependencies["@workos/authkit-tanstack-react-start"] === packageVersions["@workos/authkit-tanstack-react-start"],
    "Generated web does not use the canonical AuthKit TanStack Start SDK"
  );
  yield* assert(
    lifecyclePackage.scripts["test:auth:e2e"] === "bun --env-file=../../.env.local run --cwd apps/web test:auth:e2e",
    "Generated root does not expose the separate provisioned authentication smoke"
  );
  yield* assert(
    backendLifecyclePackage.scripts.dev === expectedBackendDev,
    "Generated local Confect watcher does not contain eager WorkOS validation with process-scoped sentinels"
  );
  yield* assert(
    isDeepStrictEqual(backendManifest.exports, {
      "./confect/_generated/refs": "./confect/_generated/refs.js",
      "./convex/_generated/api": {
        default: "./convex/_generated/api.js",
        types: "./convex/_generated/api.d.ts",
      },
    }),
    "Generated backend does not expose both canonical caller representations"
  );
  for (const rootCode of (yield* fs.readDirectory(workspace)).filter((entry) => /\.(?:c|m)?(?:j|t)sx?$/u.test(entry)))
    yield* assert(
      !(yield* fs.readFileString(path.join(workspace, rootCode))).includes("@tanstack/react-start"),
      `Root code ${rootCode} unexpectedly imports or uses React Start`
    );
  const convexConfig = yield* S.decodeEffect(sConvexConfig)(yield* fs.readFileString(path.join(workspace, "convex.json")));
  yield* assert(
    isDeepStrictEqual(convexConfig, {
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
    }),
    "Generated root Convex configuration does not preserve backend source ownership"
  );
  const vscodeSettings = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(path.join(workspace, ".vscode/settings.json")));
  for (const [key, expected] of Object.entries(canonicalVscodeSettings))
    yield* assert(
      isDeepStrictEqual(vscodeSettings[key], expected),
      `Generated VS Code setting ${key} does not match the canonical baseline`
    );
  const vscodeExtensions = yield* S.decodeEffect(S.fromJsonString(S.Struct({ recommendations: S.Array(S.String) })))(
    yield* fs.readFileString(path.join(workspace, ".vscode/extensions.json"))
  );
  yield* assert(vscodeExtensions.recommendations.includes(OXC_EXTENSION), "Generated VS Code extensions do not recommend Oxc");

  const components = path.join(workspace, "apps/web/src/components");
  const integrations = path.join(workspace, "apps/web/src/integrations");
  const router = path.join(workspace, "apps/web/src/router.tsx");
  const envModule = path.join(workspace, "apps/web/src/config/env.ts");
  const viteConfig = path.join(workspace, "apps/web/vite.config.ts");
  const rootRoute = path.join(workspace, "apps/web/src/routes/__root.tsx");
  const authStart = path.join(workspace, "apps/web/src/start.ts");
  const authCallback = path.join(workspace, "apps/web/src/routes/api/auth/callback.tsx");
  const authSignIn = path.join(workspace, "apps/web/src/routes/api/auth/sign-in.tsx");
  const protectedRoute = path.join(workspace, "apps/web/src/routes/protected.tsx");
  const backendIdentitySpec = path.join(workspace, "packages/backend/confect/identity.spec.ts");
  const backendIdentityImpl = path.join(workspace, "packages/backend/confect/identity.impl.ts");
  const backendWorkOS = path.join(workspace, "packages/backend/confect/workos.ts");
  const backendAuthConfig = path.join(workspace, "packages/backend/convex/auth.config.ts");
  const backendHttp = path.join(workspace, "packages/backend/convex/http.ts");
  const backendIdentity = path.join(workspace, "packages/backend/convex/identity.ts");

  const homeRoute = path.join(workspace, "apps/web/src/routes/index.tsx");
  const inlangSettings = path.join(workspace, "apps/web/project.inlang/settings.json");
  const frenchMessages = path.join(workspace, "apps/web/messages/fr.json");
  const englishMessages = path.join(workspace, "apps/web/messages/en.json");
  const germanMessages = path.join(workspace, "apps/web/messages/de.json");

  yield* assert(!(yield* fs.exists(components)), "Fresh creation retained TanStack's generated components directory");
  yield* assert(!(yield* fs.exists(integrations)), "Fresh creation retained TanStack's generated integrations directory");
  for (const authFile of [
    authStart,
    authCallback,
    authSignIn,
    protectedRoute,
    backendIdentitySpec,
    backendIdentityImpl,
    backendWorkOS,
    backendAuthConfig,
    backendHttp,
    backendIdentity,
  ])
    yield* assert(yield* fs.exists(authFile), `Fresh creation is missing AuthKit scaffold: ${path.relative(workspace, authFile)}`);
  yield* assert(
    (yield* fs.readFileString(authStart)).includes("requestMiddleware: [csrfMiddleware, authkitMiddleware()]"),
    "Generated AuthKit middleware does not preserve TanStack Start CSRF protection"
  );
  yield* assert(
    (yield* fs.readFileString(backendWorkOS)).includes("new AuthKit<GenericDataModel>(components.workOSAuthKit)"),
    "Generated backend does not install the official WorkOS AuthKit component client"
  );
  const generatedConvexApi = yield* fs.readFileString(path.join(workspace, "packages/backend/convex/_generated/api.d.ts"));
  yield* assert(
    generatedConvexApi.includes('import type * as identity from "../identity.js"'),
    "Generated Convex API is missing the identity group"
  );
  yield* assert(
    !generatedConvexApi.includes('import type * as authentication from "../authentication.js"'),
    "Generated Convex API retains the authentication group"
  );
  yield* assert(
    !(yield* fs.exists(path.join(workspace, "packages/backend/confect/authentication.ts"))),
    "Fresh creation retained the native authentication group file"
  );
  yield* assert(
    !(yield* fs.exists(path.join(workspace, "packages/backend/confect/authentication.spec.ts"))),
    "Fresh creation retained the authentication group spec"
  );
  yield* assert(
    !(yield* fs.exists(path.join(workspace, "packages/backend/confect/authentication.impl.ts"))),
    "Fresh creation retained the authentication group implementation"
  );
  yield* assert(
    !(yield* fs.exists(path.join(workspace, "packages/backend/confect/identity.ts"))),
    "Fresh creation created an unnecessary native identity group file"
  );
  const identitySpec = yield* fs.readFileString(backendIdentitySpec);
  const identityImpl = yield* fs.readFileString(backendIdentityImpl);
  const oxlintConfig = yield* fs.readFileString(path.join(workspace, "oxlint.config.ts"));
  yield* assert(
    identitySpec.match(/FunctionSpec\.publicQuery/gu)?.length === 2,
    "Generated identity spec does not contain two Confect queries"
  );
  yield* assert(!identitySpec.includes("FunctionSpec.convexPublicQuery"), "Generated findCurrent retains native provenance");
  yield* assert(identitySpec.includes('name: "findCurrent"'), "Generated identity spec is missing findCurrent");
  yield* assert(identitySpec.includes('name: "getCurrent"'), "Generated identity spec is missing getCurrent");
  yield* assert(identitySpec.includes("Schema.OptionFromNullOr(sCurrentIdentity)"), "Generated findCurrent is not nullable on transport");
  yield* assert(identitySpec.includes("AuthenticationRequired"), "Generated getCurrent is missing its typed auth failure");
  yield* assert(identityImpl.includes("const auth = yield* Auth"), "Generated findCurrent does not use Confect Auth");
  yield* assert(identityImpl.includes("const ctx = yield* QueryCtx"), "Generated findCurrent does not use generated Confect QueryCtx");
  yield* assert(
    identityImpl.includes("E.option(auth.getUserIdentity)"),
    "Generated findCurrent does not represent optional identity with Option"
  );
  yield* assert(
    identityImpl.includes("E.promise(() => authKit.getAuthUser(ctx))"),
    "Generated findCurrent does not adapt the native WorkOS Promise"
  );
  yield* assert(!identityImpl.includes("queryGeneric"), "Generated identity implementation retains a native query boundary");
  yield* assert(!identityImpl.includes("Auth.layer"), "Generated identity implementation manually provides Confect Auth");
  yield* assert(!identityImpl.includes("E.runPromise"), "Generated identity implementation manually runs Effect");
  yield* assert(!identityImpl.includes("throw new Error"), "Generated identity implementation retains an application throw");
  yield* assert(
    identitySpec.includes(
      "// SPEC ------------------------------------------------------------------------------------------------------------------------------------"
    ),
    "Generated identity spec is missing its level-1 SPEC section"
  );
  yield* assert(
    identitySpec.includes(
      "// QUERIES -------------------------------------------------------------------------------------------------------------------------------"
    ),
    "Generated identity spec is missing its query separator"
  );
  yield* assert(
    identityImpl.includes(
      "// GROUP -----------------------------------------------------------------------------------------------------------------------------------"
    ),
    "Generated identity impl is missing its final GROUP section"
  );
  yield* assert(oxlintConfig.includes('files: ["packages/backend/**/*.ts"]'), "Generated Effect lint scope is not backend-wide");
  yield* assert(!oxlintConfig.includes('"effect/noAsyncFunction": "off"'), "Generated auth lint carve-out remains");
  yield* assert(
    yield* fs.exists(path.join(workspace, ".keenko/docs/stacks/workos-authkit/README.md")),
    "Fresh creation is missing canonical WorkOS AuthKit guidance"
  );
  const tanStackQueryGuide = yield* fs.readFileString(path.join(workspace, ".keenko/docs/stacks/tanstack-query/README.md"));
  const confectGuide = yield* fs.readFileString(path.join(workspace, ".keenko/docs/stacks/confect/README.md"));
  const convexGuide = yield* fs.readFileString(path.join(workspace, ".keenko/docs/stacks/convex/README.md"));
  yield* assert(
    tanStackQueryGuide.includes("Browser, TanStack, and ordinary JavaScript consumers use Convex's generated `api` references by default"),
    "Fresh creation is missing the canonical browser Convex api boundary"
  );
  yield* assert(
    confectGuide.includes("Effect / server consumer\n→ generated Confect refs"),
    "Fresh creation is missing the canonical Effect Confect refs boundary"
  );
  yield* assert(
    convexGuide.includes("Infinite-scroll and load-more interfaces use native reactive Convex pagination"),
    "Fresh creation is missing the native reactive pagination boundary"
  );
  const environmentExample = path.join(workspace, ".env.example");
  yield* assert(yield* fs.exists(environmentExample), "Fresh creation is missing the secret-free env reference");
  yield* assert(
    !(yield* fs.readFileString(environmentExample)).includes("WORKOS_WEBHOOK_SECRET"),
    "Fresh creation incorrectly asks developers to copy the deployment-only webhook secret into local environment state"
  );
  yield* assert(!(yield* fs.exists(path.join(workspace, ".env.local"))), "Fresh creation unexpectedly wrote WorkOS credentials");
  yield* assert(
    (yield* fs.readFileString(router)).includes("new ConvexQueryClient(convexClient)"),
    "Fresh creation did not install the Keenko router baseline"
  );
  yield* assert(
    /envDir:\s*["']\.\.\/\.\.["']/u.test(yield* fs.readFileString(viteConfig)),
    "Web development does not load root environment state"
  );
  yield* assert(
    (yield* fs.readFileString(envModule)).includes("export const getPublicEnv = () =>"),
    "Fresh creation eagerly validates the Convex URL before application runtime initialization"
  );
  yield* assert(!(yield* fs.readFileString(rootRoute)).includes("MyRouterContext"), "Fresh creation retained tutorial context naming");

  const settings = yield* S.decodeEffect(sInlangSettings)(yield* fs.readFileString(inlangSettings));

  yield* assert(settings.baseLocale === "fr", "Fresh web base locale is not fr");
  yield* assert(isDeepStrictEqual(settings.locales, ["fr", "en"]), "Fresh web locales are not exactly fr/en");

  yield* assert(yield* fs.exists(frenchMessages), "Fresh web is missing messages/fr.json");
  yield* assert(yield* fs.exists(englishMessages), "Fresh web is missing messages/en.json");
  yield* assert(!(yield* fs.exists(germanMessages)), "Fresh web retained TanStack's messages/de.json");

  const french = yield* S.decodeEffect(sMessages)(yield* fs.readFileString(frenchMessages));
  const english = yield* S.decodeEffect(sMessages)(yield* fs.readFileString(englishMessages));

  const starterMessages = {
    calm_green_otter: {
      en: "Welcome to Keenko",
      fr: "Bienvenue chez Keenko",
    },
  };

  for (const [id, messages] of Object.entries(starterMessages)) {
    yield* assert(french[id] === messages.fr, `French starter message ${id} is incorrect`);
    yield* assert(english[id] === messages.en, `English starter message ${id} is incorrect`);
  }

  const home = yield* fs.readFileString(homeRoute);

  yield* assert(home.includes("#/paraglide/messages"), "Fresh home route does not use generated Paraglide messages");
  yield* assert(
    home.includes("useQuery(convexQuery(api.identity.findCurrent, {}))"),
    "Fresh home route does not use generated Convex api through TanStack Query"
  );
  yield* assert(!home.includes("@confect/react"), "Fresh home route decodes Confect representations in ordinary React code");
  yield* assert(!home.includes("confect/_generated/refs"), "Fresh home route uses Confect refs instead of generated Convex api");

  for (const id of Object.keys(starterMessages))
    yield* assert(home.includes(`m.${id}(`), `Fresh home route does not use Paraglide message ${id}`);

  yield* assert(!home.includes("Welcome to TanStack Start"), "Fresh home route retained TanStack's hard-coded welcome copy");

  const webRuntime = yield* S.decodeEffect(sDependenciesPackage)(yield* fs.readFileString(path.join(workspace, "apps/web/package.json")));
  yield* assert(
    isDeepStrictEqual(webRuntime.dependencies, {
      ...canonicalWebDependencies,
      [`@${identity}/backend`]: "workspace:*",
      [`@${identity}/shared`]: "workspace:*",
      [`@${identity}/ui`]: "workspace:*",
    }),
    "Generated web runtime dependencies do not match the canonical compatibility map"
  );
  yield* assert(
    isDeepStrictEqual(webPackage.devDependencies, canonicalWebDevDependencies),
    "Generated web development dependencies do not match the canonical compatibility map"
  );
  for (const specification of [...Object.values(canonicalWebDependencies), ...Object.values(canonicalWebDevDependencies)])
    yield* assert(exactSemver.test(specification), `Generated web dependency is not exactly pinned: ${specification}`);
  const sharedRuntime = yield* S.decodeEffect(sDependenciesPackage)(
    yield* fs.readFileString(path.join(workspace, "packages/shared/package.json"))
  );
  yield* assert(Object.hasOwn(sharedRuntime.dependencies, "effect"), "Generated shared package is missing effect");
  const packedLicense = yield* fs.readFileString(
    path.join(workspace, "node_modules/keenko/dist/generators/sync/files/skills/grilling/LICENSE")
  );
  if (O.isSome(localLicense))
    yield* assert(packedLicense === localLicense.value, "The packed Keenko artifact changed the representative skill license");

  const routeTree = path.join(workspace, "apps/web/src/routeTree.gen.ts");
  const routeTreeAfterCreation = yield* fs.readFileString(routeTree);
  const ignoredParaglide = path.join(workspace, "apps/web/src/paraglide/messages.js");
  for (const generated of [
    "apps/web/src/routeTree.gen.ts",
    "apps/web/src/paraglide/messages.js",
    "packages/backend/confect/_generated/schema.ts",
    "packages/backend/convex/_generated/api.d.ts",
    "packages/backend/convex/_generated/api.js",
    "packages/backend/convex/schema.ts",
  ])
    yield* assert(yield* fs.exists(path.join(workspace, generated)), `Fresh creation did not materialize ${generated}`);

  yield* assert(
    (yield* command(workspace, env, "git", ["rev-parse", "--is-inside-work-tree"])).trim() === "true",
    "Canonical creation did not initialize Git"
  );
  yield* assert(
    (yield* command(workspace, env, "git", ["symbolic-ref", "--short", "HEAD"])).trim() === "main",
    "Canonical creation did not leave Git on main"
  );
  for (const localEnv of [".env.local", "apps/web/.env.local", "packages/backend/.env.local"])
    yield* assert(!(yield* fs.exists(path.join(workspace, localEnv))), `Fresh creation unexpectedly created ${localEnv}`);
  yield* command(workspace, env, "git", ["check-ignore", ".env.local"]);
  yield* assert(!(yield* fs.exists(path.join(workspace, "convex"))), "Fresh creation added a root Convex source directory");
  yield* assert(!(yield* fs.exists(path.join(workspace, "apps/web/convex"))), "Fresh creation added web-owned Convex source");
  yield* command(workspace, env, "git", ["rev-parse", "--verify", "HEAD"], "failure");
  const initialCheckOutput = yield* command(workspace, env, "env", ["-u", "CI", "bun", "run", "check"]);
  yield* assert(!initialCheckOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Fresh check emitted a module-typeless package warning");
  yield* command(workspace, env, "git", ["check-ignore", "apps/web/src/paraglide/messages.js"]);

  yield* assert(
    (yield* fs.readFileString(routeTree)) === routeTreeAfterCreation,
    "Check changed the fresh route tree before the first commit"
  );
  yield* command(workspace, env, "git", ["config", "user.email", "product-test@example.invalid"]);
  yield* command(workspace, env, "git", ["config", "user.name", "Keenko product test"]);
  yield* command(workspace, env, "git", ["add", "."]);
  yield* command(workspace, env, "git", ["commit", "-m", "Record fresh generated workspace"]);
  yield* assert(
    (yield* command(workspace, env, "git", ["ls-files", "--error-unmatch", "apps/web/src/routeTree.gen.ts"])).trim() !== "",
    "Fresh route tree is not tracked"
  );

  const realGit = (yield* command(workspace, env, "which", ["git"])).trim();
  const gitShim = path.join(workspace, "node_modules/.bin/git");
  yield* fs.writeFileString(
    gitShim,
    `#!/bin/sh
if [ "$KEENKO_TEST_GIT_FAILURE" = "status" ] && [ "$1" = "status" ]; then exit 73; fi
if [ "$KEENKO_TEST_GIT_FAILURE" = "head" ] && [ "$1" = "rev-parse" ] && [ "$2" = "--verify" ]; then exit 74; fi
exec "${realGit}" "$@"
`
  );
  yield* command(workspace, env, "chmod", ["+x", gitShim]);
  const statusFailure = yield* command(workspace, { ...env, KEENKO_TEST_GIT_FAILURE: "status" }, "bun", ["run", "check"], "failure");
  yield* assert(statusFailure.includes("Unable to inspect generated code with Git."), "Git status failure was not propagated");
  const headFailure = yield* command(workspace, { ...env, KEENKO_TEST_GIT_FAILURE: "head" }, "bun", ["run", "check"], "failure");
  yield* assert(headFailure.includes("Unable to resolve Git HEAD"), "Unexpected rev-parse failure was treated as unborn Git");
  yield* fs.remove(gitShim);

  const failingTest = path.join(workspace, "packages/shared/src/acceptance.test.ts");
  yield* fs.writeFileString(
    failingTest,
    'import { expect, test } from "vitest";\n\ntest("packed check executes Vitest", () => {\n  expect(true).toBe(false);\n});\n'
  );
  const failingTestOutput = yield* command(workspace, env, "bun", ["run", "check"], "failure");
  yield* assert(
    failingTestOutput.includes("packed check executes Vitest"),
    `Check did not execute the failing Nx/Vitest target:\n${failingTestOutput}`
  );
  yield* fs.remove(failingTest);

  const driftRoute = path.join(workspace, "apps/web/src/routes/generated-drift.tsx");
  yield* fs.writeFileString(
    driftRoute,
    'import { createFileRoute } from "@tanstack/react-router";\n\nexport const Route = createFileRoute("/generated-drift")({ component: () => null });\n'
  );
  const driftOutput = yield* command(workspace, env, "bun", ["run", "check"], "failure");
  yield* assert(driftOutput.includes("apps/web/src/routeTree.gen.ts"), `Check did not report tracked generated drift:\n${driftOutput}`);
  yield* assert(
    (yield* fs.readFileString(routeTree)) !== routeTreeAfterCreation,
    "Check did not leave the regenerated route tree available for review"
  );
  yield* command(workspace, env, "git", ["add", "apps/web/src/routes/generated-drift.tsx", "apps/web/src/routeTree.gen.ts"]);
  yield* command(workspace, env, "git", ["commit", "-m", "Accept generated route update"]);

  const backendManifestPath = path.join(workspace, "packages/backend/package.json");
  const expectedBackendManifest = yield* fs.readFileString(backendManifestPath);
  const newGenerated = path.join(workspace, "packages/backend/confect/_generated/new-generated.ts");
  const changedBackendManifest = expectedBackendManifest.replace(
    'confect codegen",',
    'confect codegen && printf generated > confect/_generated/new-generated.ts",'
  );
  yield* assert(changedBackendManifest !== expectedBackendManifest, "Could not configure the new generated-file scenario");
  yield* fs.writeFileString(backendManifestPath, changedBackendManifest);
  const newGeneratedOutput = yield* command(workspace, env, "bun", ["run", "check"], "failure");
  yield* assert(
    newGeneratedOutput.includes("packages/backend/confect/_generated/new-generated.ts"),
    `Check did not report newly generated tracked-intent output:\n${newGeneratedOutput}`
  );
  yield* assert(yield* fs.exists(newGenerated), "Check did not leave newly generated output available for review");
  yield* fs.writeFileString(backendManifestPath, expectedBackendManifest);
  yield* fs.remove(newGenerated);

  const projectOwned = path.join(workspace, "packages/shared/src/unrelated.ts");
  const authoredConfect = path.join(workspace, "packages/backend/confect/authored.ts");
  yield* fs.writeFileString(projectOwned, "export const unrelated = true;\n");
  yield* fs.writeFileString(authoredConfect, "export const authored = true;\n");
  yield* fs.writeFileString(ignoredParaglide, "deliberately stale ignored output\n");
  yield* command(workspace, env, "bun", ["run", "check"]);
  yield* assert(
    (yield* command(workspace, env, "git", ["status", "--porcelain"])).includes("packages/shared/src/unrelated.ts"),
    "Canonical check did not preserve unrelated project-owned dirty state"
  );
  yield* assert(
    (yield* command(workspace, env, "git", ["status", "--porcelain"])).includes("packages/backend/confect/authored.ts"),
    "Canonical check did not preserve authored Confect dirty state"
  );
  yield* fs.remove(authoredConfect);
  yield* fs.remove(projectOwned);

  const tooling = path.join(workspace, ".keenko/docs/core/tooling.md");
  const expectedTooling = yield* fs.readFileString(tooling);
  yield* fs.writeFileString(tooling, "deliberately stale");
  yield* command(workspace, env, "bun", ["x", "nx", "sync:check"], "failure");
  yield* assert((yield* fs.readFileString(tooling)) === "deliberately stale", "sync:check repaired managed guidance");
  yield* command(workspace, env, "bun", ["x", "nx", "sync"]);
  yield* command(workspace, env, "bun", ["x", "nx", "sync:check"]);
  yield* assert((yield* fs.readFileString(tooling)) === expectedTooling, "Sync did not restore managed guidance");

  const uiPackage = yield* S.decodeEffect(sDependenciesPackage)(yield* fs.readFileString(path.join(workspace, "packages/ui/package.json")));
  const shadcnVersion = uiPackage.dependencies.shadcn;
  yield* assert(exactSemver.test(shadcnVersion), `Generated packages/ui does not pin an exact shadcn version: ${shadcnVersion}`);
  yield* command(path.join(workspace, "apps/web"), env, "bunx", [`shadcn@${shadcnVersion}`, "add", "button", "input-otp", "--yes"]);
  for (const component of ["button.tsx", "input-otp.tsx"]) {
    yield* assert(
      yield* fs.exists(path.join(workspace, "packages/ui/src/components", component)),
      `shadcn did not route ${component} to packages/ui`
    );
    yield* assert(
      !(yield* fs.exists(path.join(workspace, "apps/web/src/components/ui", component))),
      `shadcn created an app-local ${component}`
    );
  }
  const updatedUiPackage = yield* S.decodeEffect(sDependenciesPackage)(
    yield* fs.readFileString(path.join(workspace, "packages/ui/package.json"))
  );
  yield* assert(Object.hasOwn(updatedUiPackage.dependencies, "input-otp"), "packages/ui does not own the input-otp dependency");
  yield* command(path.join(workspace, "packages/ui"), env, "bun", [
    "--eval",
    'import { OTPInput } from "input-otp"; if (!OTPInput) throw new Error("Missing input-otp dependency");',
  ]);

  const sharedManifestPath = path.join(workspace, "packages/shared/package.json");
  const forbiddenImport = path.join(workspace, "packages/shared/src/forbidden.ts");
  const expectedSharedManifest = yield* fs.readFileString(sharedManifestPath);
  const sharedManifest = yield* S.decodeEffect(sManifest)(expectedSharedManifest);
  yield* fs.writeFileString(
    sharedManifestPath,
    yield* S.encodeEffect(sManifest)({ ...sharedManifest, dependencies: { [`@${identity}/ui`]: "workspace:*" } })
  );
  yield* fs.writeFileString(forbiddenImport, `import "@${identity}/ui/lib/utils";\n`);
  yield* command(workspace, env, "bun", ["install"]);
  for (const directory of [".nx/cache", ".nx/workspace-data"])
    yield* fs.remove(path.join(workspace, directory), { force: true, recursive: true });
  const boundaryOutput = yield* command(workspace, env, "bun", ["run", "lint"], "failure");
  const boundaryRule = "@nx/enforce-module-boundaries";
  yield* assert(
    boundaryOutput.includes(boundaryRule) || boundaryOutput.includes(`${boundaryRule.replace("/", "(")})`),
    `Lint did not report the Nx boundary diagnostic:\n${boundaryOutput}`
  );
  yield* fs.remove(forbiddenImport);
  yield* fs.writeFileString(sharedManifestPath, expectedSharedManifest);

  const extra = path.join(workspace, "packages/extra");
  yield* fs.makeDirectory(path.join(extra, "src"), { recursive: true });
  yield* fs.writeFileString(path.join(extra, "src/index.ts"), 'export const label = "extra";\n');
  yield* fs.writeFileString(
    path.join(extra, "package.json"),
    yield* S.encodeEffect(sManifest)({
      exports: { ".": "./src/index.ts" },
      name: `@${identity}/extra`,
      nx: { tags: ["type:package", "scope:shared"] },
      private: true,
      type: "module",
    })
  );
  yield* command(workspace, env, "bun", ["install"]);
  const projects = yield* command(workspace, env, "bun", ["x", "nx", "show", "projects", "--json"]);
  yield* assert(projects.includes(`@${identity}/extra`), "Nx did not discover @product-acceptance/extra");

  yield* command(workspace, env, "bun", ["x", "oxlint", "--fix-dangerously", "packages/ui/src/components"], "failure");
  yield* command(workspace, env, "bun", ["x", "oxlint", "--fix-dangerously", "packages/ui/src/components"]);
  yield* command(workspace, env, "bun", ["run", "format"]);
  yield* command(workspace, env, "bun", ["x", "nx", "sync"]);
  yield* command(workspace, env, "bun", ["run", "check"]);
  yield* command(workspace, env, "git", ["add", "."]);
  yield* command(workspace, env, "git", ["commit", "-m", "Materialize acceptance changes"]);
  for (const directory of ["", "apps/web", "packages/backend", "packages/ui", "packages/shared", "packages/extra"])
    yield* fs.remove(path.join(workspace, directory, "node_modules"), { force: true, recursive: true });

  yield* command(workspace, env, "bun", ["install", "--frozen-lockfile"]);
  yield* command(workspace, env, "bun", ["run", "check"]);
  yield* assert(
    (yield* command(workspace, env, "git", ["status", "--porcelain"])).trim() === "",
    "Final acceptance left the consumer checkout dirty"
  );
});

NodeRuntime.runMain(product.pipe(E.scoped, E.provide(NodeServices.layer)));
