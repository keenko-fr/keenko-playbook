import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { parseJson, serializeJson } from "@nx/devkit";
import { Clock, Console, Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

class ProductFailure extends S.TaggedError<ProductFailure>()("ProductFailure", { message: S.String }) {}

const sPackageSource = S.Union([S.TaggedStruct("local", {}), S.TaggedStruct("published", { preset: S.String, version: S.String })]).pipe(
  S.toTaggedUnion("_tag")
);
type PackageSource = S.Schema.Type<typeof sPackageSource>;
interface Verification {
  readonly shadcnCompatibility: boolean;
  readonly source: PackageSource;
}

const withoutBackendWorkOSEnv = ["-u", "WORKOS_API_KEY", "-u", "WORKOS_CLIENT_ID", "-u", "WORKOS_WEBHOOK_SECRET"];
const dependencySections: readonly ("dependencies" | "devDependencies")[] = ["dependencies", "devDependencies"];

const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

const parseVerification = E.fn("product.parseVerification")(function* (args: readonly string[]) {
  if (args.length === 0) return { shadcnCompatibility: false, source: { _tag: "local" } } satisfies Verification;
  if (args.length === 1 && args[0] === "--shadcn") return { shadcnCompatibility: true, source: { _tag: "local" } } satisfies Verification;
  const publishedExactArgs = S.decodeUnknownOption(S.Tuple([S.Literal("--published"), S.String]))(args);

  if (O.isSome(publishedExactArgs) && exactSemver.test(publishedExactArgs.value[1])) {
    const [, version] = publishedExactArgs.value;

    return {
      shadcnCompatibility: false,
      source: {
        _tag: "published",
        preset: `keenko@${version}`,
        version,
      },
    } satisfies Verification;
  }

  const publishedSelectorArgs = S.decodeUnknownOption(S.Tuple([S.Literal("--published"), S.String, S.String]))(args);

  if (O.isSome(publishedSelectorArgs) && exactSemver.test(publishedSelectorArgs.value[1])) {
    const [, version, preset] = publishedSelectorArgs.value;

    return {
      shadcnCompatibility: false,
      source: {
        _tag: "published",
        preset,
        version,
      },
    } satisfies Verification;
  }

  return yield* new ProductFailure({
    message: "Usage: bun run test:product OR bun run test:published -- <exact-version> [preset] OR bun run test:shadcn",
  });
});

const assert = E.fn("product.assert")(function* (condition: boolean, message: string) {
  if (!condition) {
    yield* Console.error(message);
    return yield* new ProductFailure({ message });
  }
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
          forceKillAfter: "5 seconds",
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
const sDependencySections = S.fromJsonString(
  S.Struct({
    dependencies: S.optionalKey(S.Record(S.String, S.String)),
    devDependencies: S.optionalKey(S.Record(S.String, S.String)),
  })
);
const sDependencyBaseline = S.fromJsonString(
  S.Record(S.String, S.Struct({ dependencies: S.Record(S.String, S.String), devDependencies: S.Record(S.String, S.String) }))
);
const sMigrations = S.fromJsonString(S.Struct({ migrations: S.Array(S.Struct({ name: S.String, package: S.String, version: S.String })) }));

type DependencyBaseline = S.Schema.Type<typeof sDependencyBaseline>;
type DependencySections = S.Schema.Type<typeof sDependencySections>;

const roleBaseline = (roles: DependencyBaseline, applications: readonly string[]): DependencyBaseline => ({
  ...Object.fromEntries(applications.map((application) => [`apps/${application}/package.json`, roles.application])),
  "package.json": roles.root,
  "packages/backend/package.json": roles.backend,
  "packages/shared/package.json": roles.shared,
  "packages/ui/package.json": roles.ui,
});

const verifySlotCount = E.fn("product.verifySlotCount")(function* (target: DependencyBaseline, applicationCount: number) {
  const count = Object.values(target).reduce(
    (sum, slots) => sum + Object.values(slots).reduce((n, entries) => n + Object.keys(entries).length, 0),
    0
  );
  yield* assert(count === 15 + 32 * applicationCount + 13 + 14 + 1, `Unexpected managed slot count: ${count}`);
  yield* Console.log(`Managed dependency proof: ${applicationCount} application(s), ${count} slot instances.`);
});

const prepareApplicationTopology = E.fn("product.prepareApplicationTopology")(function* (
  workspace: string,
  env: Record<string, string>,
  applications: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const web = path.join(workspace, "apps/web");
  for (const application of applications.filter((name) => name !== "web")) {
    const destination = path.join(workspace, "apps", application);
    if (applications.length === 1) yield* fs.rename(web, destination);
    else {
      const archive = yield* fs.makeTempFileScoped({ prefix: "keenko-application-fixture-" });
      yield* command(web, env, "tar", [
        "--exclude=./node_modules",
        "--exclude=./.output",
        "--exclude=./.tanstack",
        "--exclude=./dist",
        "-cf",
        archive,
        ".",
      ]);
      yield* fs.makeDirectory(destination);
      yield* command(destination, env, "tar", ["-xf", archive]);
    }
    const manifestPath = path.join(destination, "package.json");
    const manifest = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(manifestPath));
    const nx = yield* S.decodeUnknownEffect(S.Struct({ tags: S.Array(S.String), targets: S.Unknown }))(manifest.nx);
    yield* fs.writeFileString(
      manifestPath,
      serializeJson({
        ...manifest,
        name: `@${path.basename(workspace)}/${application}`,
        nx: { ...nx, tags: ["type:app", `scope:${application}`] },
      })
    );
  }
  if (!applications.includes("web"))
    yield* assert(!(yield* fs.exists(path.join(web, "package.json"))), "Renamed fixture still has apps/web/package.json");
});

const customizeDependencySlots = E.fn("product.customizeDependencySlots")(function* (workspace: string, manifestPaths: readonly string[]) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const relative of manifestPaths) {
    const source = yield* fs.readFileString(path.join(workspace, relative));
    const manifest = yield* S.decodeEffect(sManifest)(source);
    const sections = yield* S.decodeEffect(sDependencySections)(source);
    const dependencies = { ...sections.dependencies };
    const devDependencies = { ...sections.devDependencies };
    if (relative === "package.json") devDependencies.oxlint = "1.81.0";
    if (relative.startsWith("apps/")) {
      delete devDependencies.vite;
      dependencies.vite = "8.0.0";
      // Already canonical.
      devDependencies.typescript = "6.0.2";
      dependencies["is-number"] = "^7.0.0";
    }
    if (relative === "packages/backend/package.json") {
      delete dependencies.effect;
      devDependencies.effect = "4.0.0-rc.115";
      dependencies["is-number"] = "^7.0.0";
    }
    if (relative === "packages/ui/package.json") delete dependencies["lucide-react"];
    if (relative === "packages/shared/package.json") dependencies.effect = "4.0.0-rc.114";
    yield* fs.writeFileString(path.join(workspace, relative), serializeJson({ ...manifest, dependencies, devDependencies }));
  }
});

const verifyDependencySlots = E.fn("product.verifyDependencySlots")(function* (
  workspace: string,
  target: DependencyBaseline,
  before: ReadonlyMap<string, DependencySections> = new Map()
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const [relative, slots] of Object.entries(target)) {
    const actual = yield* S.decodeEffect(sDependencySections)(yield* fs.readFileString(path.join(workspace, relative)));
    for (const section of dependencySections) {
      const opposite = section === "dependencies" ? "devDependencies" : "dependencies";
      for (const [name, version] of Object.entries(slots[section]))
        yield* assert(
          actual[section]?.[name] === version && !Object.hasOwn(actual[opposite] ?? {}, name),
          `Slot did not converge: ${relative}#${section}.${name}`
        );
      for (const [name, version] of Object.entries(before.get(relative)?.[section] ?? {})) {
        if (Object.hasOwn(slots.dependencies, name) || Object.hasOwn(slots.devDependencies, name) || name === "keenko") continue;
        yield* assert(actual[section]?.[name] === version, `Consumer-owned slot changed: ${relative}#${section}.${name}`);
      }
    }
  }
});

const verifyInstalledSlots = E.fn("product.verifyInstalledSlots")(function* (
  workspace: string,
  target: DependencyBaseline,
  lockSource: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const lock = parseJson<{ workspaces: Record<string, DependencySections> }>(lockSource);
  for (const [relative, slots] of Object.entries(target)) {
    const directory = path.dirname(relative);
    const lockWorkspace = directory === "." ? "" : directory;
    for (const section of dependencySections)
      for (const [name, specification] of Object.entries(slots[section])) {
        yield* assert(
          lock.workspaces[lockWorkspace]?.[section]?.[name] === specification,
          `Lockfile workspace slot differs: ${relative}#${section}.${name}`
        );
        const nested = path.join(workspace, directory, "node_modules", name, "package.json");
        const installedPath = (yield* fs.exists(nested)) ? nested : path.join(workspace, "node_modules", name, "package.json");
        const actual = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(installedPath));
        const version = specification.startsWith("npm:") ? specification.slice(specification.lastIndexOf("@") + 1) : specification;
        yield* assert(
          actual.version === version,
          `Installed package differs: ${relative}#${section}.${name}, expected ${version}, got ${actual.version}`
        );
      }
  }
});

const createWorkspace = E.fn("product.createWorkspace")(function* (
  temporary: string,
  env: Record<string, string>,
  identity: string,
  preset: string
) {
  return yield* command(temporary, env, "env", [
    ...withoutBackendWorkOSEnv,
    "bunx",
    "create-nx-workspace@23.2.1",
    identity,
    `--preset=${preset}`,
    "--packageManager=bun",
    "--nxCloud=skip",
    "--interactive=false",
    "--trustThirdPartyPreset",
  ]);
});

const preparePackageSource = E.fn("product.preparePackageSource")(function* (
  source: PackageSource,
  repository: string,
  temporary: string,
  env: Readonly<Record<string, string>>,
  forwardUpgrade: boolean
) {
  if (source._tag === "published") {
    yield* Console.log(`Keenko published product test version: ${source.version}`);
    return {
      bootstrapEnv: env,
      bootstrapExecutable: "bunx",
      localLicense: O.none<string>(),
      packageVersion: source.version,
      releasedWorkspaces: [],
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

  // Isolate local Keenko artifacts from npm. The historical bootstrap also needs the
  // unchanged platform-node-shared RC recorded in v1.0.1's lock, before stable is made available.
  const config = path.join(temporary, "verdaccio.yml");
  const localPackages = ["keenko", ...(forwardUpgrade ? ["@effect/platform-node-shared"] : [])];
  const localRules = localPackages.map((name) => `  "${name}":\n    access: $all\n    publish: $all\n    unpublish: $all\n`).join("");
  yield* fs.writeFileString(
    config,
    (yield* fs.readFileString(path.join(repository, ".verdaccio/config.yml"))).replace("packages:\n", `packages:\n${localRules}`)
  );

  yield* spawner.spawn(
    ChildProcess.make(
      "bun",
      [
        "x",
        "nx",
        "run",
        "keenko:local-registry",
        `--config=${path.relative(repository, config)}`,
        `--storage=${path.join(temporary, "registry-storage")}`,
      ],
      {
        cwd: repository,
        env: npmEnv,
        extendEnv: true,
        forceKillAfter: "5 seconds",
        stderr: "inherit",
        stdout: "inherit",
      }
    )
  );

  const releasedWorkspaces: string[] = [];
  if (forwardUpgrade) {
    const releasedStartedAt = yield* startPhase("released 1.0.1 consumer creation");
    const archives = path.join(temporary, "released-archives");
    yield* fs.makeDirectory(archives);
    const publicEnv = {
      ...env,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
      NPM_CONFIG_USERCONFIG: path.join(temporary, "public-npmrc"),
    };
    yield* fs.writeFileString(publicEnv.NPM_CONFIG_USERCONFIG, "registry=https://registry.npmjs.org\n");
    for (const selector of ["keenko@1.0.1", "keenko@1.0.2-rc.0", "keenko@1.0.2-rc.1", "@effect/platform-node-shared@4.0.0-rc.115"])
      yield* command(temporary, publicEnv, "npm", ["pack", selector, "--pack-destination", archives, "--ignore-scripts"]);
    for (const archive of ["keenko-1.0.1.tgz", "effect-platform-node-shared-4.0.0-rc.115.tgz"])
      yield* command(temporary, npmEnv, "npm", [
        "publish",
        path.join(archives, archive),
        "--ignore-scripts",
        "--provenance=false",
        "--access",
        "public",
        "--tag",
        "latest",
        "--loglevel=error",
      ]);
    for (const identity of ["upgrade-untouched", "upgrade-divergent", "upgrade-renamed", "upgrade-multiple"]) {
      yield* createWorkspace(
        temporary,
        { ...bootstrapEnv, BUN_INSTALL_CACHE_DIR: path.join(temporary, "released-bun-cache") },
        identity,
        "keenko@1.0.1"
      );
      const workspace = path.join(temporary, identity);
      const installed = yield* S.decodeEffect(sVersionPackage)(
        yield* fs.readFileString(path.join(workspace, "node_modules/keenko/package.json"))
      );
      yield* assert(installed.version === "1.0.1", "The source consumer was not generated with released keenko@1.0.1");
      releasedWorkspaces.push(workspace);
    }
    // Make the target's stable transitive dependency available only after real RC-based creation.
    yield* command(temporary, publicEnv, "npm", [
      "pack",
      "@effect/platform-node-shared@4.0.0",
      "--pack-destination",
      archives,
      "--ignore-scripts",
    ]);
    yield* command(temporary, npmEnv, "npm", [
      "publish",
      path.join(archives, "effect-platform-node-shared-4.0.0.tgz"),
      "--ignore-scripts",
      "--provenance=false",
      "--access",
      "public",
      "--loglevel=error",
    ]);
    yield* completePhase("released 1.0.1 consumer creation", releasedStartedAt);
    for (const version of ["1.0.2-rc.0", "1.0.2-rc.1"]) {
      const rcStartedAt = yield* startPhase(`published ${version} consumer creation`);
      yield* command(temporary, npmEnv, "npm", [
        "publish",
        path.join(archives, `keenko-${version}.tgz`),
        "--ignore-scripts",
        "--provenance=false",
        "--access",
        "public",
        "--tag",
        "rc",
        "--loglevel=error",
      ]);
      const identity = version === "1.0.2-rc.0" ? "upgrade-published-rc" : "upgrade-published-rc1";
      yield* createWorkspace(
        temporary,
        { ...bootstrapEnv, BUN_INSTALL_CACHE_DIR: path.join(temporary, `published-${version}-bun-cache`) },
        identity,
        `keenko@${version}`
      );
      const rcWorkspace = path.join(temporary, identity);
      const rcInstalled = yield* S.decodeEffect(sVersionPackage)(
        yield* fs.readFileString(path.join(rcWorkspace, "node_modules/keenko/package.json"))
      );
      yield* assert(rcInstalled.version === version, `The RC source consumer was not generated with published keenko@${version}`);
      const rcSlots = yield* S.decodeEffect(sDependencySections)(yield* fs.readFileString(path.join(rcWorkspace, "package.json")));
      yield* assert(rcSlots.devDependencies?.["oxlint-plugin-effect"] === "0.12.1", `Published ${version} did not start on plugin 0.12.1`);
      releasedWorkspaces.push(rcWorkspace);
      yield* completePhase(`published ${version} consumer creation`, rcStartedAt);
    }
  }

  yield* command(repository, env, "bun", ["run", "build"]);
  const packed = path.join(temporary, "packed");
  yield* fs.makeDirectory(packed);
  yield* command(repository, env, "bun", ["pm", "pack", "--destination", packed]);

  const localPackage = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(path.join(repository, "package.json")));
  const tarball = path.join(packed, `keenko-${localPackage.version}.tgz`);
  yield* assert(yield* fs.exists(tarball), `Packed Keenko artifact is missing: ${tarball}`);

  const runId = `run-${path.basename(temporary).replaceAll(/[^0-9A-Za-z-]/gu, "-")}`;
  const releaseOutput = yield* command(repository, env, "bun", ["x", "nx", "release", "version", "--preid", "rc", "--dry-run"]);
  const nextRc = /to get new version (?<version>\d+\.\d+\.\d+-rc\.\d+)/u.exec(releaseOutput)?.groups?.version;
  const candidateRc = nextRc ?? localPackage.version;
  yield* assert(
    exactSemver.test(candidateRc) && candidateRc.includes("-rc."),
    `Nx Release did not resolve a candidate RC: ${releaseOutput}`
  );
  const packageVersion = `${candidateRc}-product.${runId}`;
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
    yield* S.encodeEffect(sManifest)({ dependencies: { "create-nx-workspace": "23.2.1" }, private: true })
  );
  yield* command(bootstrapPrime, bootstrapEnv, "bun", ["install", "--ignore-scripts"]);

  return {
    bootstrapEnv,
    bootstrapExecutable: "bunx",
    localLicense: O.some(yield* fs.readFileString(path.join(repository, "src/generators/sync/files/skills/grilling/LICENSE"))),
    packageVersion,
    releasedWorkspaces,
  };
});

const verifyBackendTestOwnership = E.fn("product.verifyBackendTestOwnership")(function* (workspace: string, env: Record<string, string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const backend = path.join(workspace, "packages/backend");
  const dependency = path.join(backend, "node_modules/@convex-dev/workos-authkit");
  yield* assert(
    path.relative(yield* fs.realPath(workspace), yield* fs.realPath(dependency)).split(path.sep)[0] !== "..",
    "Backend dependency resolved outside the canonical isolated workspace"
  );
  const dependencyTests = (yield* fs.readDirectory(dependency, { recursive: true })).filter((file) =>
    /\.test\.(?:ts|tsx|js|jsx)$/u.test(file)
  );
  yield* assert(dependencyTests.length > 0, "Backend isolated installation has no reachable dependency-owned test files");
  const nodeTest = path.join(backend, "keenko-node-ownership.test.ts");
  const integrationTest = path.join(backend, "test/keenko-integration-ownership.test.ts");
  const generatedTest = path.join(backend, "convex/keenko-generated-ownership.test.ts");
  const report = yield* fs.makeTempFileScoped({ prefix: "keenko-backend-test-ownership-" });
  yield* fs.makeDirectory(path.dirname(integrationTest), { recursive: true });
  yield* fs.writeFileString(
    nodeTest,
    'import { expect, test } from "vitest"; test("authored Node ownership", () => { expect(typeof EdgeRuntime).toBe("undefined"); });\n'
  );
  yield* fs.writeFileString(
    integrationTest,
    'import { expect, test } from "vitest"; test("authored integration ownership", () => { expect(typeof EdgeRuntime).toBe("string"); });\n'
  );
  yield* fs.writeFileString(generatedTest, 'throw new Error("Generated convex tests must not run");\n');
  yield* E.gen(function* () {
    yield* command(backend, env, "bun", ["x", "vitest", "run", "--reporter=json", `--outputFile=${report}`]);
    const result = yield* S.decodeEffect(
      S.fromJsonString(
        S.Struct({
          numPassedTests: S.Finite,
          numTotalTests: S.Finite,
          testResults: S.Array(S.Struct({ assertionResults: S.Array(S.Struct({ fullName: S.String })), name: S.String })),
        })
      )
    )(yield* fs.readFileString(report));
    yield* assert(
      result.numTotalTests === 2 && result.numPassedTests === 2 && result.testResults.length === 2,
      "Backend verification discovered tests outside the two authored ownership fixtures"
    );
    yield* assert(
      result.testResults
        .flatMap((file) => file.assertionResults.map((test) => test.fullName))
        .toSorted()
        .join("|") === "authored Node ownership|authored integration ownership",
      "Backend authored fixtures did not run exactly once in their intended environments"
    );
    yield* Console.log(
      `Backend ownership passed in ${workspace}: one Node test, one Edge Runtime test; ${dependencyTests.length} reachable dependency test files excluded.`
    );
  }).pipe(
    E.ensuring(
      E.forEach([nodeTest, integrationTest, generatedTest], (file) => fs.remove(file, { force: true }), { discard: true }).pipe(E.orDie)
    )
  );
});

const verifyResolution = E.fn("product.verifyResolution")(function* (workspace: string, env: Record<string, string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const script = yield* fs.readFileString(yield* path.fromFileUrl(new URL("fixtures/product-resolution.mjs.template", import.meta.url)));
  const resolution = (yield* command(workspace, env, "node", ["--input-type=module", "--eval", script, workspace])).trim();
  yield* verifyAuthkitTest(workspace, env);
  const compiler = yield* command(workspace, env, "node", ["node_modules/@typescript/native/bin/tsc", "--version"]);
  const manifest = yield* S.decodeEffect(sDependencySections)(yield* fs.readFileString(path.join(workspace, "package.json")));
  yield* assert(
    compiler.trim() === `Version ${manifest.devDependencies?.["@typescript/native"]?.replace("npm:typescript@", "")}`,
    "Native compiler version disagrees with its selected alias"
  );
  const effect = (yield* command(path.join(workspace, "packages/shared"), env, "bun", [
    "--eval",
    'import { Effect } from "effect"; const version = require("effect/package.json").version; if (version !== require("./package.json").dependencies.effect || Effect.runSync(Effect.succeed("ok")) !== "ok") throw new Error("Stale Bun Effect resolution"); console.log(JSON.stringify({ path: Bun.resolveSync("effect", process.cwd()), version }));',
  ])).trim();
  yield* Console.log(`Product resolution in ${workspace}: ${resolution}; native compiler: ${compiler.trim()}; Bun Effect: ${effect}`);
  return `${resolution}\n${effect}`;
});

const verifyAuthkitTest = E.fn("product.verifyAuthkitTest")(function* (workspace: string, env: Record<string, string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const backend = path.join(workspace, "packages/backend");
  const fixture = path.join(backend, "test/kee-53");
  yield* fs.makeDirectory(fixture, { recursive: true });
  yield* E.gen(function* () {
    for (const [source, target] of [
      ["authkit-test.vitest.ts.template", "authkit.test.ts"],
      ["authkit-test.types.ts.template", "authkit.types.ts"],
    ])
      yield* fs.writeFileString(
        path.join(fixture, target),
        yield* fs.readFileString(yield* path.fromFileUrl(new URL(`fixtures/${source}`, import.meta.url)))
      );
    yield* fs.writeFileString(
      path.join(fixture, "tsconfig.json"),
      serializeJson({
        compilerOptions: { module: "ESNext", moduleResolution: "Bundler", skipLibCheck: false, strict: true, target: "ES2023", types: [] },
        include: ["authkit.types.ts"],
      })
    );
    yield* command(backend, env, "node", ["../../node_modules/@typescript/native/bin/tsc", "--noEmit", "-p", "test/kee-53/tsconfig.json"]);
    yield* command(backend, env, "node", ["../../node_modules/@typescript/native/bin/tsc", "--noEmit", "-p", "tsconfig.json"]);
    const output = yield* command(backend, env, "bun", ["x", "vitest", "run", "--project=integration", "test/kee-53/authkit.test.ts"]);
    yield* assert(output.includes("2 passed"), "AuthKit public test helper did not execute both default and custom registrations");
    yield* Console.log("AuthKit test proof: strict declarations, backend typecheck, 2 real component-query tests passed.");
  }).pipe(E.ensuring(fs.remove(fixture, { force: true, recursive: true }).pipe(E.orDie)));
});

const verifyReinstalls = E.fn("product.verifyReinstalls")(function* (
  workspace: string,
  env: Record<string, string>,
  initialResolution: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const lockPath = path.join(workspace, "bun.lock");
  const lock = yield* fs.readFileString(lockPath);
  for (const args of [["install", "--frozen-lockfile"], ["install"]]) {
    yield* command(workspace, env, "bun", args);
    yield* assert((yield* fs.readFileString(lockPath)) === lock, `${args.join(" ")} changed the reconciled lockfile`);
    yield* assert((yield* verifyResolution(workspace, env)) === initialResolution, `${args.join(" ")} changed module resolution`);
  }
});

const verifyHistoricalEffect = E.fn("product.verifyHistoricalEffect")(function* (workspace: string, env: Record<string, string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = yield* command(path.join(workspace, "packages/shared"), env, "bun", [
    "--eval",
    'console.log(JSON.stringify({ path: Bun.resolveSync("effect", process.cwd()), version: require("effect/package.json").version }));',
  ]);
  const result = yield* S.decodeEffect(S.fromJsonString(S.Struct({ path: S.String, version: S.String })))(output);
  yield* Console.log(`Historical Effect probe: ${output.trim()}`);
  yield* assert(result.version === "4.0.0-rc.114", "Divergent historical consumer did not reproduce its stale Effect RC");
  yield* assert(
    (yield* fs.realPath(result.path)).startsWith(
      `${yield* fs.realPath(path.join(workspace, "packages/shared/node_modules/effect"))}${path.sep}`
    ),
    "Historical Effect was not workspace-local"
  );
  yield* Console.log(`Historical stale Effect: ${output.trim()}`);
});

const prepareUpgradeFixture = E.fn("product.prepareUpgradeFixture")(function* (
  workspace: string,
  roles: DependencyBaseline,
  env: Record<string, string>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sSections = S.decodeEffect(sDependencySections);
  const identity = path.basename(workspace);
  const publishedRc = identity.startsWith("upgrade-published-rc");
  let sourceVersion = publishedRc ? "1.0.2-rc.0" : "1.0.1";
  if (identity === "upgrade-published-rc1") sourceVersion = "1.0.2-rc.1";
  let applications = ["web"];
  if (identity === "upgrade-renamed") applications = ["portal"];
  if (identity === "upgrade-multiple") applications = ["web", "console", "studio"];
  if (publishedRc) applications = ["web", "console"];
  const target = roleBaseline(roles, applications);
  const manifestPaths = Object.keys(target);
  const phase = `controlled ${sourceVersion} forward upgrade: ${identity}`;
  const startedAt = yield* startPhase(phase);
  yield* assert(
    (yield* fs.readFileString(path.join(workspace, "bunfig.toml"))) ===
      (publishedRc ? '[install]\nlinker = "isolated"\nhoist = false\n' : '[install]\nlinker = "hoisted"\n'),
    `Released ${sourceVersion} consumer did not retain its historical linker configuration`
  );
  yield* prepareApplicationTopology(workspace, env, applications);
  yield* verifySlotCount(target, applications.length);
  const divergent = identity === "upgrade-divergent";
  if (divergent || identity === "upgrade-multiple") yield* customizeDependencySlots(workspace, manifestPaths);
  if (publishedRc) yield* customizeDependencySlots(workspace, ["apps/console/package.json"]);
  const canonicalInitialApp = publishedRc
    ? O.some(yield* fs.readFileString(path.join(workspace, "apps/web/package.json")))
    : O.none<string>();
  const before = new Map<string, S.Schema.Type<typeof sDependencySections>>();
  for (const relative of manifestPaths) before.set(relative, yield* sSections(yield* fs.readFileString(path.join(workspace, relative))));

  const expectedMigrations = [
    ...(publishedRc
      ? []
      : ["1.0.2-application-workspaces", "1.0.2-backend-vitest-exclusions", "1.0.2-dependency-baseline", "1.0.2-bun-linker"].map(
          (name) => ({ name, package: "keenko", version: "1.0.2-rc.0" })
        )),
    ...(sourceVersion === "1.0.2-rc.1"
      ? []
      : [{ name: "1.0.2-application-dependency-baseline", package: "keenko", version: "1.0.2-rc.1" }]),
    { name: "1.0.2-effect-policy-baseline", package: "keenko", version: "1.0.2-rc.2" },
    { name: "1.0.2-authkit-test", package: "keenko", version: "1.0.2-rc.3" },
  ];
  return {
    applications,
    before,
    canonicalInitialApp,
    divergent,
    expectedMigrations,
    manifestPaths,
    phase,
    sourceVersion,
    startedAt,
    target,
  };
});

const verifyMigrationExecution = E.fn("product.verifyMigrationExecution")(function* (
  workspace: string,
  migrationOutput: string,
  expectedMigrations: readonly { readonly name: string }[],
  applications: readonly string[],
  canonicalInitialApp: O.Option<string>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let previousIndex = -1;
  for (const migration of expectedMigrations) {
    const index = migrationOutput.indexOf(migration.name);
    yield* assert(index > previousIndex, `Native Nx ran ${migration.name} in an unexpected order`);
    previousIndex = index;
  }
  if (O.isSome(canonicalInitialApp))
    yield* assert(
      (yield* fs.readFileString(path.join(workspace, "apps/web/package.json"))) === canonicalInitialApp.value,
      "Dependency migration changed the canonical published RC initial application"
    );
  for (const application of applications) {
    const manifest = yield* S.decodeEffect(S.fromJsonString(S.Struct({ nx: S.Struct({ tags: S.Array(S.String) }) })))(
      yield* fs.readFileString(path.join(workspace, "apps", application, "package.json"))
    );
    yield* assert(manifest.nx.tags.includes("type:app"), `Application classification missing from apps/${application}`);
  }
});

const verifyForwardUpgrades = E.fn("product.verifyForwardUpgrades")(function* (
  roles: DependencyBaseline,
  releasedWorkspaces: readonly string[],
  packageVersion: string,
  env: Record<string, string>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const workspace of releasedWorkspaces) {
    const {
      applications,
      before,
      canonicalInitialApp,
      divergent,
      expectedMigrations,
      manifestPaths,
      phase,
      sourceVersion,
      startedAt,
      target,
    } = yield* prepareUpgradeFixture(workspace, roles, env);

    yield* command(workspace, env, "bun", ["x", "nx", "migrate", `keenko@${packageVersion}`]);
    const plan = yield* S.decodeEffect(sMigrations)(yield* fs.readFileString(path.join(workspace, "migrations.json")));
    yield* assert(
      serializeJson(plan.migrations) === serializeJson(expectedMigrations),
      `Native Nx did not discover and order the expected migrations: ${serializeJson(plan)}`
    );
    yield* Console.log(`Native Nx ${sourceVersion} migration plan: ${serializeJson(plan)}`);
    yield* command(workspace, env, "bun", ["install"]);
    const installed = yield* S.decodeEffect(sVersionPackage)(
      yield* fs.readFileString(path.join(workspace, "node_modules/keenko/package.json"))
    );
    yield* assert(installed.version === packageVersion, "Nx did not install the packed target candidate");
    for (const artifact of [
      "migrations.json",
      "dist/migrations/application-workspaces-1-0-2.js",
      "dist/migrations/backend-vitest-exclusions-1-0-2.js",
      "dist/migrations/dependency-baseline-1-0-2.js",
      "dist/migrations/bun-linker-1-0-2.js",
      "dist/migrations/authkit-test-1-0-2.js",
      "dist/compatibility/authkit-test.js",
      "dist/compatibility/files/workos-authkit-0.2.10.patch",
      "dist/migrations/files/dependency-baseline-1-0-2.json",
    ])
      yield* assert(
        yield* fs.exists(path.join(workspace, "node_modules/keenko", artifact)),
        `Missing packed migration artifact: ${artifact}`
      );
    const packedRoles = yield* S.decodeEffect(sDependencyBaseline)(
      yield* fs.readFileString(path.join(workspace, "node_modules/keenko/dist/migrations/files/dependency-baseline-1-0-2.json"))
    );
    yield* assert(
      serializeJson(packedRoles) === serializeJson(roles),
      "Packed migration role data differs from the verified fresh baseline"
    );
    const lockPath = path.join(workspace, "bun.lock");
    const lockBefore = yield* fs.readFileString(lockPath);
    if (divergent) yield* verifyHistoricalEffect(workspace, env);
    const migrationOutput = yield* command(workspace, env, "bun", ["x", "nx", "migrate", "--run-migrations"]);
    yield* verifyMigrationExecution(workspace, migrationOutput, expectedMigrations, applications, canonicalInitialApp);
    yield* verifyDependencySlots(workspace, target, before);
    yield* command(workspace, env, "bun", ["install"]);
    yield* assert(
      (yield* fs.readFileString(path.join(workspace, "bunfig.toml"))) === '[install]\nlinker = "isolated"\nhoist = false\n',
      "Upgrade did not retain the canonical isolated linker"
    );
    const lockAfter = yield* fs.readFileString(lockPath);
    yield* assert(lockAfter !== lockBefore, "Bun did not reconcile changed dependency state");
    yield* verifyInstalledSlots(workspace, target, lockAfter);
    yield* command(workspace, env, "bun", ["x", "nx", "sync"]);
    yield* command(workspace, env, "bun", ["run", "codegen"]);
    const initialResolution = yield* verifyResolution(workspace, env);
    yield* verifyBackendTestOwnership(workspace, env);
    yield* command(workspace, env, "env", ["-u", "CI", ...withoutBackendWorkOSEnv, "bun", "run", "check"]);
    yield* verifyReinstalls(workspace, env, initialResolution);
    yield* verifyInstalledSlots(workspace, target, lockAfter);
    const canonical = new Map<string, string>([
      ["bunfig.toml", yield* fs.readFileString(path.join(workspace, "bunfig.toml"))],
      ["packages/backend/vitest.config.ts", yield* fs.readFileString(path.join(workspace, "packages/backend/vitest.config.ts"))],
      [
        "patches/keenko-workos-authkit-0.2.10.patch",
        yield* fs.readFileString(path.join(workspace, "patches/keenko-workos-authkit-0.2.10.patch")),
      ],
    ]);
    for (const relative of manifestPaths) canonical.set(relative, yield* fs.readFileString(path.join(workspace, relative)));
    yield* command(workspace, env, "bun", ["x", "nx", "migrate", "--run-migrations"]);
    for (const [relative, contents] of canonical)
      yield* assert(
        (yield* fs.readFileString(path.join(workspace, relative))) === contents,
        `Canonical migration rerun changed ${relative}`
      );
    yield* assert((yield* fs.readFileString(lockPath)) === lockAfter, "Canonical migration rerun changed bun.lock");
    yield* assert((yield* verifyResolution(workspace, env)) === initialResolution, "Migration rerun changed module resolution");
    yield* completePhase(phase, startedAt);
  }
});

const startShadcnFixtureRegistry = E.fn("product.startShadcnFixtureRegistry")(function* (repository: string, fixtureVersion: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* spawner.spawn(
    ChildProcess.make("bun", ["run", "tests/shadcn-registry-fixture.ts"], {
      cwd: repository,
      env: { SHADCN_FIXTURE_VERSION: fixtureVersion },
      extendEnv: true,
      forceKillAfter: "5 seconds",
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
    WORKOS_COOKIE_PASSWORD: "",
  };
  const preparationStartedAt = yield* startPhase("package preparation and registry setup");
  const { bootstrapEnv, bootstrapExecutable, localLicense, packageVersion, releasedWorkspaces } = yield* preparePackageSource(
    source,
    repository,
    temporary,
    env,
    !shadcnCompatibility && source._tag === "local"
  );
  yield* completePhase("package preparation and registry setup", preparationStartedAt);
  if (!shadcnCompatibility && source._tag === "local") yield* startShadcnFixtureRegistry(repository, packageVersion);

  const identity = "product-acceptance";
  const createArguments = [
    "create-nx-workspace@23.2.1",
    identity,
    source._tag === "local" ? "--preset=keenko" : `--preset=${source.preset}`,
    "--packageManager=bun",
    "--nxCloud=skip",
    "--interactive=false",
    "--trustThirdPartyPreset",
  ];
  const creationStartedAt = yield* startPhase("fresh workspace creation");
  const createOutput = yield* command(temporary, bootstrapEnv, "env", [
    ...withoutBackendWorkOSEnv,
    bootstrapExecutable,
    ...createArguments,
  ]);
  yield* assert(!createOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Creation emitted a module-typeless package warning");
  yield* completePhase("fresh workspace creation", creationStartedAt);

  const workspace = path.join(temporary, identity);
  const initialResolution = yield* verifyResolution(workspace, env);
  const roles = yield* S.decodeEffect(sDependencyBaseline)(
    yield* fs.readFileString(path.join(workspace, "node_modules/keenko/dist/migrations/files/dependency-baseline-1-0-2.json"))
  );
  yield* assert(
    Object.keys(roles).join("|") === "root|application|backend|ui|shared",
    "Packed dependency baseline is not the five-role snapshot"
  );
  yield* assert(roles.root.devDependencies["oxlint-plugin-effect"] === "0.27.0", "Frozen managed plugin baseline is not 0.27.0");
  const consumerLint = yield* fs.readFileString(path.join(workspace, "oxlint.config.ts"));
  yield* assert(
    !consumerLint.includes("effect/noEffectRunInTests"),
    "Repository Bun-test exception leaked into the generated consumer config"
  );
  const target = roleBaseline(roles, ["web"]);
  yield* verifySlotCount(target, 1);
  yield* verifyDependencySlots(workspace, target);
  yield* verifyInstalledSlots(workspace, target, yield* fs.readFileString(path.join(workspace, "bun.lock")));
  yield* verifyBackendTestOwnership(workspace, env);
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
  yield* assert(
    installedPackageManifest["nx-migrations"] === "./migrations.json",
    "Installed Keenko package is missing the expected Nx migration metadata"
  );

  yield* assert(
    yield* fs.exists(path.join(workspace, "node_modules/keenko/migrations.json")),
    "Installed Keenko package is missing migrations.json"
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
    yield* command(path.join(workspace, "apps/web"), env, "node", [
      path.join(workspace, "packages/ui/node_modules/shadcn/dist/index.js"),
      "add",
      "button",
      "input-otp",
      "--yes",
    ]);
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

  const verificationStartedAt = yield* startPhase("first-install canonical verification");
  const intentOutput = yield* command(workspace, env, "bun", ["node_modules/@tanstack/intent/dist/cli.mjs", "list", "--json"]);
  yield* assert(
    intentOutput.includes("@tanstack/react-table"),
    "TanStack Intent did not discover the skill-bearing installed Table package"
  );
  const checkOutput = yield* command(workspace, env, "env", ["-u", "CI", ...withoutBackendWorkOSEnv, "bun", "run", "check"]);
  yield* assert(!checkOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Fresh check emitted a module-typeless package warning");
  yield* completePhase("first-install canonical verification", verificationStartedAt);

  if (source._tag === "local") {
    const shadcnStartedAt = yield* startPhase("deterministic shadcn compatibility");
    const uiPackagePath = path.join(workspace, "packages/ui/package.json");
    const uiPackage = yield* S.decodeEffect(sDependenciesPackage)(yield* fs.readFileString(uiPackagePath));
    const shadcnVersion = uiPackage.dependencies.shadcn;
    yield* assert(exactSemver.test(shadcnVersion), `Generated packages/ui does not pin an exact shadcn version: ${shadcnVersion}`);
    yield* command(path.join(workspace, "apps/web"), { ...bootstrapEnv, REGISTRY_URL: "http://127.0.0.1:4874/r" }, "node", [
      path.join(workspace, "packages/ui/node_modules/shadcn/dist/index.js"),
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
  }

  const reinstallStartedAt = yield* startPhase("fresh frozen and idempotent reinstall verification");
  yield* verifyReinstalls(workspace, bootstrapEnv, initialResolution);
  const reinstalledPackage = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(installedPackagePath));
  yield* assert(reinstalledPackage.version === packageVersion, `The consumer did not reinstall Keenko ${packageVersion}`);
  yield* completePhase("fresh frozen and idempotent reinstall verification", reinstallStartedAt);

  if (source._tag === "published") return;

  yield* verifyForwardUpgrades(roles, releasedWorkspaces, packageVersion, bootstrapEnv);
});

NodeRuntime.runMain(product.pipe(E.scoped, E.provide(NodeServices.layer)));
