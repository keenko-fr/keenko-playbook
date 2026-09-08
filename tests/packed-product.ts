import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

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
    BUN_INSTALL_CACHE_DIR: path.join(temporary, "bun-cache"),
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

  return {
    bootstrapEnv,
    bootstrapExecutable: "npx",
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
    GIT_AUTHOR_EMAIL: "product-test@example.invalid",
    GIT_AUTHOR_NAME: "Keenko product test",
    GIT_COMMITTER_EMAIL: "product-test@example.invalid",
    GIT_COMMITTER_NAME: "Keenko product test",
    NX_DAEMON: "false",
    NX_INTERACTIVE: "false",
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
    `--preset=keenko@${packageVersion}`,
    "--packageManager=bun",
    "--nxCloud=skip",
    "--interactive=false",
    ...(source._tag === "local" ? ["--skipGit=true"] : []),
    "--trustThirdPartyPreset",
  ];
  yield* command(temporary, bootstrapEnv, bootstrapExecutable, createArguments);

  const workspace = path.join(temporary, identity);
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
  const installedPackage = yield* S.decodeEffect(sVersionPackage)(
    yield* fs.readFileString(path.join(workspace, "node_modules/keenko/package.json"))
  );
  yield* assert(installedPackage.version === packageVersion, `The consumer did not install Keenko ${packageVersion}`);
  const packedLicense = yield* fs.readFileString(
    path.join(workspace, "node_modules/keenko/dist/generators/sync/files/skills/grilling/LICENSE")
  );
  if (O.isSome(localLicense))
    yield* assert(packedLicense === localLicense.value, "The packed Keenko artifact changed the representative skill license");

  const routeTree = path.join(workspace, "apps/web/src/routeTree.gen.ts");
  const ignoredParaglide = path.join(workspace, "apps/web/src/paraglide/messages.js");
  for (const generated of [
    "apps/web/src/routeTree.gen.ts",
    "apps/web/src/paraglide/messages.js",
    "packages/backend/confect/_generated/schema.ts",
    "packages/backend/convex/schema.ts",
  ])
    yield* assert(yield* fs.exists(path.join(workspace, generated)), `Fresh creation did not materialize ${generated}`);

  yield* source._tag === "local"
    ? E.gen(function* () {
        yield* command(workspace, env, "git", ["init", "-b", "main"]);
        yield* command(workspace, env, "git", ["add", "."]);
        yield* command(workspace, env, "git", ["commit", "-m", "Record fresh generated workspace"]);
      })
    : E.gen(function* () {
        const gitWorkTree = yield* command(workspace, env, "git", ["rev-parse", "--is-inside-work-tree"]);
        yield* assert(
          gitWorkTree.trim() === "true",
          "Published acceptance did not use the Git repository initialized by create-nx-workspace"
        );
        yield* assert(
          (yield* command(workspace, env, "git", ["status", "--porcelain"])).trim() === "",
          "Published creation did not commit its initial generated state"
        );
      });
  yield* command(workspace, env, "git", ["rev-parse", "--verify", "HEAD"]);
  yield* assert(
    (yield* command(workspace, env, "git", ["ls-files", "--error-unmatch", "apps/web/src/routeTree.gen.ts"])).trim() !== "",
    "Fresh route tree is not tracked"
  );
  yield* command(workspace, env, "git", ["check-ignore", "apps/web/src/paraglide/messages.js"]);

  const routeTreeAfterCreation = yield* fs.readFileString(routeTree);
  yield* command(workspace, env, "bun", ["run", "build"]);
  yield* assert(
    (yield* fs.readFileString(routeTree)) === routeTreeAfterCreation,
    "TanStack build changed routeTree.gen.ts after fresh creation"
  );

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

  const projectOwned = path.join(workspace, "packages/shared/src/unrelated.ts");
  yield* fs.writeFileString(projectOwned, "export const unrelated = true;\n");
  yield* fs.writeFileString(ignoredParaglide, "deliberately stale ignored output\n");
  yield* command(workspace, env, "bun", ["run", "check"]);
  yield* assert(
    (yield* command(workspace, env, "git", ["status", "--porcelain"])).includes("packages/shared/src/unrelated.ts"),
    "Canonical check did not preserve unrelated project-owned dirty state"
  );
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
