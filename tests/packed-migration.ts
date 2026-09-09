import { isDeepStrictEqual } from "node:util";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { canonicalVscodeSettings, OXC_EXTENSION } from "../src/migrations/baseline-0-4-0.js";

class MigrationFailure extends S.TaggedError<MigrationFailure>()("MigrationFailure", { message: S.String }) {}

const assert = E.fn("migration.assert")(function* (condition: boolean, message: string) {
  if (!condition) return yield* new MigrationFailure({ message });
});

const command = E.fn("migration.command")(
  function* (cwd: string, env: Record<string, string>, executable: string, args: readonly string[]) {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const outputFile = yield* fs.makeTempFileScoped({ prefix: "keenko-migration-output-" });
    const child = yield* spawner.spawn(
      ChildProcess.make(
        "/bin/sh",
        ["-c", 'output=$1; shift; exec "$@" >"$output" 2>&1', "keenko-migration-command", outputFile, executable, ...args],
        { cwd, env, extendEnv: true }
      )
    );
    const exitCode = yield* child.exitCode;
    const output = yield* fs.readFileString(outputFile);
    yield* assert(exitCode === 0, `${executable} ${args.join(" ")} exited ${exitCode} in ${cwd}\n${output.slice(-16_000)}`);
    return output;
  },
  E.scoped,
  E.timeout("10 minutes")
);

const sManifest = S.fromJsonString(S.Record(S.String, S.Unknown));
const sVersionPackage = S.fromJsonString(S.Struct({ version: S.String }));

const migrationProduct = E.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const repository = yield* path.fromFileUrl(new URL("../", import.meta.url));
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-migration-" });
  const publicEnv = {
    CI: "true",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_GLOBAL: path.join(temporary, "gitconfig-global"),
    GIT_CONFIG_KEY_0: "user.useConfigOnly",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_VALUE_0: "true",
    NX_DAEMON: "false",
    NX_INTERACTIVE: "false",
  };

  const registry = "http://127.0.0.1:4874";
  const registryConfig = path.join(temporary, "verdaccio.yml");
  const registryStorage = path.join(temporary, "registry-storage");
  yield* fs.writeFileString(
    registryConfig,
    `storage: ${registryStorage}\nuplinks:\n  npmjs:\n    url: https://registry.npmjs.org/\n    timeout: 1m\npackages:\n  "keenko":\n    access: $all\n    publish: $all\n    unpublish: $all\n  "**":\n    access: $all\n    publish: $all\n    unpublish: $all\n    proxy: npmjs\nlog:\n  type: stdout\n  format: pretty\n  level: warn\npublish:\n  allow_offline: true\n`
  );
  yield* spawner.spawn(
    ChildProcess.make("bun", ["x", "verdaccio", "--config", registryConfig, "--listen", "127.0.0.1:4874"], {
      cwd: repository,
      env: publicEnv,
      extendEnv: true,
      stderr: "inherit",
      stdout: "inherit",
    })
  );
  yield* command(temporary, publicEnv, "bun", [
    "--eval",
    `for (let attempt = 0; attempt < 100; attempt++) { try { const response = await fetch("${registry}/-/ping"); if (response.ok) process.exit(0); } catch {} await Bun.sleep(100); } process.exit(1);`,
  ]);

  const npmrc = path.join(temporary, "npmrc");
  yield* fs.writeFileString(npmrc, `registry=${registry}\n//127.0.0.1:4874/:_authToken=secretVerdaccioToken\n`);
  const candidateEnv = {
    ...publicEnv,
    BUN_CONFIG_REGISTRY: registry,
    BUN_INSTALL_CACHE_DIR: path.join(temporary, "candidate-bun-cache"),
    NPM_CONFIG_CACHE: path.join(temporary, "npm-cache"),
    NPM_CONFIG_REGISTRY: registry,
    NPM_CONFIG_USERCONFIG: npmrc,
  };

  yield* command(repository, publicEnv, "bun", ["run", "build"]);
  const packed = path.join(temporary, "packed");
  const repack = path.join(temporary, "repack");
  yield* fs.makeDirectory(packed);
  yield* fs.makeDirectory(repack);
  yield* command(repository, publicEnv, "bun", ["pm", "pack", "--destination", packed]);
  const sourceManifest = yield* S.decodeEffect(sVersionPackage)(yield* fs.readFileString(path.join(repository, "package.json")));
  const sourceTarball = path.join(packed, `keenko-${sourceManifest.version}.tgz`);
  yield* command(temporary, publicEnv, "tar", ["-xzf", sourceTarball, "-C", repack]);
  const candidateManifestPath = path.join(repack, "package/package.json");
  const candidateManifest = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(candidateManifestPath));
  yield* fs.writeFileString(candidateManifestPath, yield* S.encodeEffect(sManifest)({ ...candidateManifest, version: "0.4.0" }));
  const candidateTarball = path.join(packed, "keenko-0.4.0.tgz");
  yield* command(temporary, publicEnv, "tar", ["-czf", candidateTarball, "-C", repack, "package"]);
  yield* command(temporary, candidateEnv, "npm", [
    "publish",
    candidateTarball,
    "--registry",
    registry,
    "--ignore-scripts",
    "--access",
    "public",
    "--tag",
    "latest",
    "--loglevel=error",
  ]);

  const identity = "migration-acceptance";
  yield* command(temporary, publicEnv, "bunx", [
    "create-nx-workspace@23.2.0",
    identity,
    "--preset=keenko@0.3.0",
    "--packageManager=bun",
    "--nxCloud=skip",
    "--interactive=false",
    "--trustThirdPartyPreset",
  ]);
  const workspace = path.join(temporary, identity);
  const installedBaseline = yield* S.decodeEffect(sVersionPackage)(
    yield* fs.readFileString(path.join(workspace, "node_modules/keenko/package.json"))
  );
  yield* assert(installedBaseline.version === "0.3.0", "The migration fixture did not use published keenko@0.3.0");

  const packagePath = path.join(workspace, "package.json");
  const packageJson = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(packagePath));
  yield* fs.writeFileString(packagePath, yield* S.encodeEffect(sManifest)({ ...packageJson, migrationProof: { retained: true } }));
  const vscode = path.join(workspace, ".vscode");
  yield* fs.makeDirectory(vscode, { recursive: true });
  yield* fs.writeFileString(
    path.join(vscode, "settings.json"),
    yield* S.encodeEffect(sManifest)({
      "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
      "js/ts.tsdk.additionalLocations": ["./vendor/typescript/bin"],
      "project.setting": "retained",
    })
  );
  yield* fs.writeFileString(
    path.join(vscode, "extensions.json"),
    yield* S.encodeEffect(sManifest)({ recommendations: ["project.extension"], unwantedRecommendations: ["project.unwanted"] })
  );

  yield* Console.log("bun x nx migrate keenko@0.4.0");
  yield* command(workspace, candidateEnv, "bun", ["x", "nx", "migrate", "keenko@0.4.0"]);
  yield* Console.log("bun install");
  yield* command(workspace, candidateEnv, "bun", ["install"]);
  yield* Console.log("bun x nx migrate --run-migrations");
  yield* command(workspace, candidateEnv, "bun", ["x", "nx", "migrate", "--run-migrations"]);
  yield* Console.log("bun x nx sync");
  yield* command(workspace, candidateEnv, "bun", ["x", "nx", "sync"]);
  yield* Console.log("bun run codegen");
  yield* command(workspace, candidateEnv, "bun", ["run", "codegen"]);

  const installedCandidate = yield* S.decodeEffect(sVersionPackage)(
    yield* fs.readFileString(path.join(workspace, "node_modules/keenko/package.json"))
  );
  yield* assert(installedCandidate.version === "0.4.0", "The upgraded consumer did not install keenko@0.4.0");
  const migratedPackage = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(packagePath));
  yield* assert(migratedPackage.type === "module", "The migrated root package is not explicitly an ES module");
  yield* assert(isDeepStrictEqual(migratedPackage.migrationProof, { retained: true }), "Migration dropped unrelated package state");
  const settings = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(path.join(vscode, "settings.json")));
  for (const [key, expected] of Object.entries(canonicalVscodeSettings)) {
    if (key === "editor.codeActionsOnSave" || key === "js/ts.tsdk.additionalLocations") continue;
    yield* assert(isDeepStrictEqual(settings[key], expected), `Migrated VS Code setting ${key} is incorrect`);
  }
  yield* assert(settings["project.setting"] === "retained", "Migration dropped an unrelated VS Code setting");
  yield* assert(
    isDeepStrictEqual(settings["editor.codeActionsOnSave"], {
      "source.fixAll.eslint": "explicit",
      ...canonicalVscodeSettings["editor.codeActionsOnSave"],
    }),
    "Migration did not preserve and merge editor code actions"
  );
  yield* assert(
    isDeepStrictEqual(settings["js/ts.tsdk.additionalLocations"], [
      "./vendor/typescript/bin",
      ...canonicalVscodeSettings["js/ts.tsdk.additionalLocations"],
    ]),
    "Migration did not preserve and merge TypeScript SDK locations"
  );
  const extensions = yield* S.decodeEffect(sManifest)(yield* fs.readFileString(path.join(vscode, "extensions.json")));
  yield* assert(
    isDeepStrictEqual(extensions.recommendations, ["project.extension", OXC_EXTENSION]),
    "Migration did not preserve and merge extension recommendations"
  );
  yield* assert(isDeepStrictEqual(extensions.unwantedRecommendations, ["project.unwanted"]), "Migration dropped unrelated extension state");

  const checkOutput = yield* command(workspace, candidateEnv, "env", ["-u", "CI", "bun", "run", "check"]);
  yield* assert(!checkOutput.includes("MODULE_TYPELESS_PACKAGE_JSON"), "Migrated check emitted a module-typeless package warning");
  yield* Console.log("Published 0.3.0 consumer upgraded to the local packed 0.4.0 candidate and passed bun run check.");
});

NodeRuntime.runMain(migrationProduct.pipe(E.scoped, E.provide(NodeServices.layer)));
