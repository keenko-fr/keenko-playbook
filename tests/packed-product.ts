import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { parseJson, serializeJson } from "@nx/devkit";
import { Clock, Console, Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

class ProductFailure extends S.TaggedError<ProductFailure>()("ProductFailure", { message: S.String }) {}

type PackageSource = { readonly _tag: "local" } | { readonly _tag: "published"; readonly version: string; readonly preset: string };
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
    if (relative === "apps/web/package.json") {
      delete devDependencies.vite;
      dependencies.vite = "8.0.0";
      // Already canonical.
      devDependencies.typescript = "6.0.2";
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
    for (const selector of ["keenko@1.0.1", "@effect/platform-node-shared@4.0.0-rc.115"])
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
    for (const identity of ["upgrade-untouched", "upgrade-divergent"]) {
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
  }

  yield* command(repository, env, "bun", ["run", "build"]);
  const packed = path.join(temporary, "packed");
  yield* fs.makeDirectory(packed);
  yield* command(repository, env, "bun", ["pm", "pack", "--destination", packed]);

  const localPackage = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(path.join(repository, "package.json")));
  const tarball = path.join(packed, `keenko-${localPackage.version}.tgz`);
  yield* assert(yield* fs.exists(tarball), `Packed Keenko artifact is missing: ${tarball}`);

  const runId = `run-${path.basename(temporary).replaceAll(/[^0-9A-Za-z-]/gu, "-")}`;
  const packageVersion = `${localPackage.version === "1.0.1" ? "1.0.2-rc.0" : localPackage.version}-product.${runId}`;
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
  }).pipe(
    E.ensuring(
      E.forEach([nodeTest, integrationTest, generatedTest], (file) => fs.remove(file, { force: true }), { discard: true }).pipe(E.orDie)
    )
  );
});

const verifyIsolatedBackendTestOwnership = E.fn("product.verifyIsolatedBackendTestOwnership")(function* (
  workspace: string,
  env: Record<string, string>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const phase = `disposable isolated backend ownership: ${path.basename(workspace)}`;
  const startedAt = yield* startPhase(phase);
  const proof = yield* fs.makeTempDirectoryScoped({ prefix: `keenko-isolated-${path.basename(workspace)}-` });
  const archive = yield* fs.makeTempFileScoped({ prefix: "keenko-isolated-source-" });
  const config = yield* fs.readFileString(path.join(workspace, "bunfig.toml"));
  const lock = yield* fs.readFileString(path.join(workspace, "bun.lock"));
  yield* assert(config.includes('linker = "hoisted"'), "Canonical workspace must retain the hoisted linker");
  // Copy authored/generated state, never the previous installation or Nx/Git caches.
  yield* command(workspace, env, "tar", ["--exclude=node_modules", "--exclude=.nx", "--exclude=.git", "-cf", archive, "."]);
  yield* command(proof, env, "tar", ["-xf", archive]);
  for (const directory of ["", "apps/web", "packages/backend", "packages/ui", "packages/shared"])
    yield* assert(!(yield* fs.exists(path.join(proof, directory, "node_modules"))), "Isolated proof copied hoisted installation state");
  const isolatedConfig = config.replace('linker = "hoisted"', 'linker = "isolated"');
  yield* fs.writeFileString(path.join(proof, "bunfig.toml"), isolatedConfig);
  yield* assert((yield* command(proof, env, "bun", ["--version"])).trim() === "1.4.2", "Isolated backend proof requires Bun 1.4.2");
  yield* command(proof, env, "bun", ["install", "--frozen-lockfile"]);
  yield* assert(
    (yield* fs.readFileString(path.join(proof, "bunfig.toml"))) === isolatedConfig,
    "Isolated install changed its linker config"
  );
  yield* assert((yield* fs.readFileString(path.join(proof, "bun.lock"))) === lock, "Isolated install changed the reconciled lockfile");
  const dependency = path.join(proof, "packages/backend/node_modules/@convex-dev/workos-authkit");
  const installedDependency = yield* fs.realPath(dependency);
  yield* assert(
    path.relative(yield* fs.realPath(proof), installedDependency).split(path.sep)[0] !== "..",
    "Backend dependency resolved outside the isolated proof copy"
  );
  const dependencyTests = (yield* fs.readDirectory(dependency, { recursive: true })).filter((file) =>
    /\.test\.(?:ts|tsx|js|jsx)$/u.test(file)
  );
  yield* assert(dependencyTests.length > 0, "Isolated backend has no reachable dependency-owned test files");
  yield* Console.log(`Isolated backend proof copy: ${proof}; reachable dependency test files: ${dependencyTests.length}`);
  yield* verifyBackendTestOwnership(proof, env);
  yield* assert(
    (yield* fs.readFileString(path.join(workspace, "bunfig.toml"))) === config,
    "Isolated proof changed canonical linker state"
  );
  yield* assert((yield* fs.readFileString(path.join(workspace, "bun.lock"))) === lock, "Isolated proof changed canonical lockfile state");
  yield* completePhase(phase, startedAt);
}, E.scoped);

const verifyForwardUpgrades = E.fn("product.verifyForwardUpgrades")(function* (
  fresh: string,
  releasedWorkspaces: readonly string[],
  packageVersion: string,
  env: Record<string, string>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = yield* S.decodeEffect(sDependencyBaseline)(
    yield* fs.readFileString(path.join(fresh, "node_modules/keenko/dist/migrations/files/dependency-baseline-1-0-2.json"))
  );
  const manifestPaths = Object.keys(target);
  const sSections = S.decodeEffect(sDependencySections);
  yield* verifyDependencySlots(fresh, target);

  for (const workspace of releasedWorkspaces) {
    const phase = `controlled 1.0.1 forward upgrade: ${path.basename(workspace)}`;
    const startedAt = yield* startPhase(phase);
    const divergent = path.basename(workspace) === "upgrade-divergent";
    if (divergent) yield* customizeDependencySlots(workspace, manifestPaths);
    const before = new Map<string, S.Schema.Type<typeof sDependencySections>>();
    for (const relative of manifestPaths) before.set(relative, yield* sSections(yield* fs.readFileString(path.join(workspace, relative))));

    yield* command(workspace, env, "bun", ["x", "nx", "migrate", `keenko@${packageVersion}`]);
    const plan = yield* S.decodeEffect(sMigrations)(yield* fs.readFileString(path.join(workspace, "migrations.json")));
    yield* assert(
      plan.migrations.length === 3 &&
        plan.migrations[0]?.name === "1.0.2-application-workspaces" &&
        plan.migrations[1]?.name === "1.0.2-backend-vitest-exclusions" &&
        plan.migrations[2]?.name === "1.0.2-dependency-baseline" &&
        plan.migrations.every((migration) => migration.package === "keenko" && migration.version === "1.0.2-rc.0"),
      `Native Nx did not discover and order the separate KEE-45, KEE-51, and KEE-47 migrations: ${serializeJson(plan)}`
    );
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
      "dist/migrations/files/dependency-baseline-1-0-2.json",
    ])
      yield* assert(
        yield* fs.exists(path.join(workspace, "node_modules/keenko", artifact)),
        `Missing packed migration artifact: ${artifact}`
      );
    const lockPath = path.join(workspace, "bun.lock");
    const lockBefore = yield* fs.readFileString(lockPath);
    const migrationOutput = yield* command(workspace, env, "bun", ["x", "nx", "migrate", "--run-migrations"]);
    const applicationMigrationIndex = migrationOutput.indexOf("1.0.2-application-workspaces");
    yield* assert(
      applicationMigrationIndex !== -1 &&
        migrationOutput.indexOf("1.0.2-backend-vitest-exclusions") > applicationMigrationIndex &&
        migrationOutput.indexOf("1.0.2-dependency-baseline") > migrationOutput.indexOf("1.0.2-backend-vitest-exclusions"),
      "Native Nx ran migrations in an unexpected order"
    );
    yield* verifyDependencySlots(workspace, target, before);
    yield* command(workspace, env, "bun", ["install"]);
    const lockAfter = yield* fs.readFileString(lockPath);
    yield* assert(lockAfter !== lockBefore, "Bun did not reconcile changed dependency state");
    yield* verifyIsolatedBackendTestOwnership(workspace, env);
    yield* verifyInstalledSlots(workspace, target, lockAfter);
    yield* command(workspace, env, "bun", ["x", "nx", "sync"]);
    yield* command(workspace, env, "bun", ["run", "codegen"]);
    yield* verifyBackendTestOwnership(workspace, env);
    yield* command(workspace, env, "env", ["-u", "CI", ...withoutBackendWorkOSEnv, "bun", "run", "check"]);
    yield* command(workspace, env, "bun", ["install", "--frozen-lockfile"]);
    yield* assert((yield* fs.readFileString(lockPath)) === lockAfter, "Frozen reinstall changed the reconciled lockfile");
    yield* verifyInstalledSlots(workspace, target, lockAfter);
    const canonical = new Map<string, string>([
      ["packages/backend/vitest.config.ts", yield* fs.readFileString(path.join(workspace, "packages/backend/vitest.config.ts"))],
    ]);
    for (const relative of manifestPaths) canonical.set(relative, yield* fs.readFileString(path.join(workspace, relative)));
    yield* command(workspace, env, "bun", ["x", "nx", "migrate", "--run-migrations"]);
    for (const [relative, contents] of canonical)
      yield* assert(
        (yield* fs.readFileString(path.join(workspace, relative))) === contents,
        `Canonical migration rerun changed ${relative}`
      );
    yield* assert((yield* fs.readFileString(lockPath)) === lockAfter, "Canonical migration rerun changed bun.lock");
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
  yield* verifyBackendTestOwnership(workspace, env);
  if (!shadcnCompatibility && source._tag === "local") yield* verifyIsolatedBackendTestOwnership(workspace, bootstrapEnv);
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
  const intentOutput = yield* command(workspace, env, "bun", ["node_modules/@tanstack/intent/dist/cli.mjs", "list", "--json"]);
  yield* assert(
    intentOutput.includes("@tanstack/react-table"),
    "TanStack Intent did not discover the skill-bearing installed Table package"
  );
  const checkOutput = yield* command(workspace, env, "env", ["-u", "CI", ...withoutBackendWorkOSEnv, "bun", "run", "check"]);
  yield* assert(!checkOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Fresh check emitted a module-typeless package warning");
  yield* completePhase("clean frozen install and generated consumer canonical verification", verificationStartedAt);

  if (source._tag === "published") return;

  yield* verifyForwardUpgrades(workspace, releasedWorkspaces, packageVersion, bootstrapEnv);

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
