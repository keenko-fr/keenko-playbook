import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

class ReleaseVersionFailure extends S.TaggedError<ReleaseVersionFailure>()("ReleaseVersionFailure", { message: S.String }) {}

const sManifest = S.fromJsonString(S.Struct({ version: S.String }));

const program = E.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const repository = yield* path.fromFileUrl(new URL("../", import.meta.url));
  const planPath = path.join(repository, ".nx/version-plans/version-plan-1788839431622.md");
  if (!(yield* fs.exists(planPath))) return;

  const manifestPath = path.join(repository, "package.json");
  const before = yield* fs.readFileString(manifestPath);
  const current = yield* S.decodeEffect(sManifest)(before);

  if (current.version !== "0.2.0")
    return yield* new ReleaseVersionFailure({ message: `Expected the current Keenko version to be 0.2.0, got ${current.version}` });

  const output = yield* spawner.string(ChildProcess.make("bun", ["x", "nx", "release", "version", "--dry-run"], { cwd: repository }), {
    includeStderr: true,
  });

  if (!output.includes('Applied semver relative bump "minor"') || !output.includes("new version 0.3.0"))
    return yield* new ReleaseVersionFailure({ message: `Nx did not resolve the current minor plan from 0.2.0 to 0.3.0:\n${output}` });

  if ((yield* fs.readFileString(manifestPath)) !== before)
    return yield* new ReleaseVersionFailure({ message: "Nx release dry-run changed package.json" });
});

NodeRuntime.runMain(program.pipe(E.provide(NodeServices.layer)));
