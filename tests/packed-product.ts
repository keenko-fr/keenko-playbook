import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Clock, Console, Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

class ProductFailure extends S.TaggedError<ProductFailure>()("ProductFailure", { message: S.String }) {}

type PackageSource = { readonly _tag: "local" } | { readonly _tag: "published"; readonly version: string };
interface Verification {
  readonly shadcnCompatibility: boolean;
  readonly source: PackageSource;
}

const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

const parseVerification = E.fn("product.parseVerification")(function* (args: readonly string[]) {
  if (args.length === 0) return { shadcnCompatibility: false, source: { _tag: "local" } } satisfies Verification;
  if (args.length === 1 && args[0] === "--shadcn") return { shadcnCompatibility: true, source: { _tag: "local" } } satisfies Verification;
  const publishedArgs = S.decodeUnknownOption(S.Tuple([S.Literal("--published"), S.String]))(args);
  if (O.isSome(publishedArgs) && exactSemver.test(publishedArgs.value[1]))
    return {
      shadcnCompatibility: false,
      source: { _tag: "published", version: publishedArgs.value[1] },
    } satisfies Verification;

  return yield* new ProductFailure({
    message: "Usage: bun run test:product OR bun run test:published -- <exact-version> OR bun run test:shadcn",
  });
});

const assert = E.fn("product.assert")(function* (condition: boolean, message: string) {
  if (!condition) return yield* new ProductFailure({ message });
});

const startPhase = E.fn("product.startPhase")(function* (name: string) {
  yield* Console.log(`Product verification phase: ${name}`);
  return yield* Clock.currentTimeMillis;
});

const completePhase = E.fn("product.completePhase")(function* (name: string, startedAt: number) {
  const completedAt = yield* Clock.currentTimeMillis;
  yield* Console.log(`Product verification phase completed: ${name} (${completedAt - startedAt}ms)`);
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
const sDependenciesPackage = S.fromJsonString(S.Struct({ dependencies: S.Record(S.String, S.String) }));
const sManifest = S.fromJsonString(S.Record(S.String, S.Unknown));

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

  const shadcnFixturePackage = path.join(temporary, "shadcn-fixture-package");
  yield* fs.makeDirectory(shadcnFixturePackage);
  yield* fs.writeFileString(
    path.join(shadcnFixturePackage, "package.json"),
    yield* S.encodeEffect(sManifest)({
      exports: "./index.js",
      name: "keenko-shadcn-fixture",
      type: "module",
      version: packageVersion,
    })
  );
  yield* fs.writeFileString(path.join(shadcnFixturePackage, "index.js"), 'export const marker = "installed";\n');
  yield* command(shadcnFixturePackage, npmEnv, "npm", [
    "publish",
    "--registry",
    registry,
    "--ignore-scripts",
    "--access",
    "public",
    "--tag",
    "latest",
    "--loglevel=error",
  ]);

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

const startShadcnFixtureRegistry = E.fn("product.startShadcnFixtureRegistry")(function* (repository: string, fixtureVersion: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* spawner.spawn(
    ChildProcess.make("bun", ["run", "tests/shadcn-registry-fixture.ts"], {
      cwd: repository,
      env: { SHADCN_FIXTURE_VERSION: fixtureVersion },
      extendEnv: true,
      stderr: "inherit",
      stdout: "inherit",
    })
  );
});

const product = E.gen(function* () {
  // oxlint-disable-next-line effect/noGlobals -- process arguments are the published-test command boundary.
  const { shadcnCompatibility, source } = yield* parseVerification(process.argv.slice(2));
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
  const preparationStartedAt = yield* startPhase("package preparation and registry setup");
  const { bootstrapEnv, bootstrapExecutable, localLicense, packageVersion } = yield* preparePackageSource(
    source,
    repository,
    temporary,
    env
  );
  yield* completePhase("package preparation and registry setup", preparationStartedAt);
  if (!shadcnCompatibility && source._tag === "local") yield* startShadcnFixtureRegistry(repository, packageVersion);

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
  const creationStartedAt = yield* startPhase("fresh workspace creation");
  const createOutput = yield* command(temporary, bootstrapEnv, bootstrapExecutable, createArguments);
  yield* assert(!createOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Creation emitted a module-typeless package warning");
  yield* completePhase("fresh workspace creation", creationStartedAt);

  const workspace = path.join(temporary, identity);
  const assertionsStartedAt = yield* startPhase("distribution assertions");
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
  const packedLicense = yield* fs.readFileString(
    path.join(workspace, "node_modules/keenko/dist/generators/sync/files/skills/grilling/LICENSE")
  );
  if (O.isSome(localLicense))
    yield* assert(packedLicense === localLicense.value, "The packed Keenko artifact changed the representative skill license");
  yield* completePhase("distribution assertions", assertionsStartedAt);

  if (shadcnCompatibility) {
    const shadcnStartedAt = yield* startPhase("live shadcn compatibility");
    const uiPackage = yield* S.decodeEffect(sDependenciesPackage)(
      yield* fs.readFileString(path.join(workspace, "packages/ui/package.json"))
    );
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
    yield* completePhase("live shadcn compatibility", shadcnStartedAt);
    return;
  }

  const verificationStartedAt = yield* startPhase("clean frozen install and generated consumer canonical verification");
  for (const directory of ["", "apps/web", "packages/backend", "packages/ui", "packages/shared"])
    yield* fs.remove(path.join(workspace, directory, "node_modules"), { force: true, recursive: true });
  yield* command(workspace, bootstrapEnv, "bun", ["install", "--frozen-lockfile"]);
  const reinstalledPackage = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(installedPackagePath));
  yield* assert(reinstalledPackage.version === packageVersion, `The clean consumer did not reinstall Keenko ${packageVersion}`);
  const checkOutput = yield* command(workspace, env, "env", ["-u", "CI", "bun", "run", "check"]);
  yield* assert(!checkOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Fresh check emitted a module-typeless package warning");
  yield* completePhase("clean frozen install and generated consumer canonical verification", verificationStartedAt);

  if (source._tag === "published") return;

  const shadcnStartedAt = yield* startPhase("deterministic shadcn compatibility");
  const uiPackagePath = path.join(workspace, "packages/ui/package.json");
  const uiPackage = yield* S.decodeEffect(sDependenciesPackage)(yield* fs.readFileString(uiPackagePath));
  const shadcnVersion = uiPackage.dependencies.shadcn;
  yield* assert(exactSemver.test(shadcnVersion), `Generated packages/ui does not pin an exact shadcn version: ${shadcnVersion}`);
  yield* command(path.join(workspace, "apps/web"), { ...bootstrapEnv, REGISTRY_URL: "http://127.0.0.1:4874/r" }, "bun", [
    "x",
    "shadcn",
    "add",
    "fixture-button",
    "input-otp",
    "--yes",
  ]);
  for (const component of ["fixture-button.tsx", "input-otp.tsx"]) {
    yield* assert(
      yield* fs.exists(path.join(workspace, "packages/ui/src/components", component)),
      `shadcn did not route ${component} to packages/ui`
    );
    yield* assert(
      !(yield* fs.exists(path.join(workspace, "apps/web/src/components/ui", component))),
      `shadcn created an app-local ${component}`
    );
  }
  const updatedUiPackage = yield* S.decodeEffect(sDependenciesPackage)(yield* fs.readFileString(uiPackagePath));
  yield* assert(
    Object.hasOwn(updatedUiPackage.dependencies, "keenko-shadcn-fixture"),
    "packages/ui does not own the shadcn fixture dependency"
  );
  yield* command(path.join(workspace, "packages/ui"), bootstrapEnv, "bun", [
    "--eval",
    'import { marker } from "keenko-shadcn-fixture"; if (marker !== "installed") throw new Error("Missing shadcn fixture dependency");',
  ]);
  yield* completePhase("deterministic shadcn compatibility", shadcnStartedAt);
});

NodeRuntime.runMain(product.pipe(E.scoped, E.provide(NodeServices.layer)));
