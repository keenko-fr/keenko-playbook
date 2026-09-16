import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

class ReleaseVersionFailure extends S.TaggedError<ReleaseVersionFailure>()("ReleaseVersionFailure", { message: S.String }) {}

const runVersionDryRun = E.fn("keenko.releaseVersion.dryRun")(function* (executable: string, cwd: string, arguments_: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(ChildProcess.make(executable, ["release", "version", ...arguments_, "--dry-run"], { cwd }), {
    includeStderr: true,
  });
});

const makeReleaseFixture = E.fn("keenko.releaseVersion.fixture")(function* (
  nodeModules: string,
  version: string,
  bump: "none" | "premajor" | "prerelease"
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-release-version-" });

  yield* fs.writeFileString(
    path.join(root, "package.json"),
    `{\n  "name": "keenko",\n  "version": "${version}",\n  "private": false,\n  "nx": {}\n}\n`
  );
  yield* fs.writeFileString(
    path.join(root, "nx.json"),
    `{\n  "release": {\n    "projects": ["keenko"],\n    "versionPlans": true,\n    "version": {\n      "adjustSemverBumpsForZeroMajorVersion": false\n    }\n  }\n}\n`
  );
  yield* fs.symlink(nodeModules, path.join(root, "node_modules"));

  if (bump !== "none") {
    const plans = path.join(root, ".nx/version-plans");
    yield* fs.makeDirectory(plans, { recursive: true });
    yield* fs.writeFileString(path.join(plans, "version-plan-test.md"), `---\n__default__: ${bump}\n---\n\nTest release transition.\n`);
  }

  return root;
});

const assertContains = (output: string, expected: string, context: string) =>
  output.includes(expected) ? E.void : E.fail(new ReleaseVersionFailure({ message: `${context}:\n${output}` }));

const program = E.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repository = yield* path.fromFileUrl(new URL("../", import.meta.url));
  const nx = path.join(repository, "node_modules/.bin/nx");
  const nodeModules = path.join(repository, "node_modules");
  const firstRcFixture = yield* makeReleaseFixture(nodeModules, "0.9.0", "premajor");
  const firstRc = yield* runVersionDryRun(nx, firstRcFixture, ["--preid", "rc"]);
  yield* assertContains(firstRc, 'Applied semver relative bump "premajor"', "Nx did not apply the first-RC fixture's premajor plan");
  yield* assertContains(firstRc, "new version 1.0.0-rc.0", "Nx did not resolve the first RC to 1.0.0-rc.0");

  const continuationFixture = yield* makeReleaseFixture(nodeModules, "1.0.0-rc.0", "prerelease");
  const nextRc = yield* runVersionDryRun(nx, continuationFixture, ["--preid", "rc"]);
  yield* assertContains(nextRc, 'Applied semver relative bump "prerelease"', "Nx did not apply a later-RC prerelease plan");
  yield* assertContains(nextRc, "new version 1.0.0-rc.1", "Nx did not increment a later RC");

  const stableFixture = yield* makeReleaseFixture(nodeModules, "1.0.0-rc.7", "none");
  const stable = yield* runVersionDryRun(nx, stableFixture, ["1.0.0"]);
  yield* assertContains(stable, 'Applied explicit semver value "1.0.0"', "Nx did not apply the explicit stable version");
  yield* assertContains(stable, "new version 1.0.0", "Nx did not promote the accepted RC to stable 1.0.0");

  const ci = yield* fs.readFileString(path.join(repository, ".github/workflows/ci.yml"));
  const pullRequestBase = `\${{ github.event.pull_request.base.sha }}`;
  const pullRequestHead = `\${{ github.event.pull_request.head.sha }}`;
  yield* assertContains(ci, "fetch-depth: 0", "PR CI does not fetch the comparison commits");
  yield* assertContains(
    ci,
    `release plan:check --base="${pullRequestBase}" --head="${pullRequestHead}"`,
    "PR CI does not compare the exact pull-request base and head SHAs"
  );

  const release = yield* fs.readFileString(path.join(repository, ".github/workflows/release.yml"));
  yield* assertContains(release, "bun x nx release --yes --preid rc", "RC mode does not use the verified Nx prerelease command");
  yield* assertContains(release, "bun x nx release 1.0.0 --yes", "Stable mode does not use the verified explicit stable version");
}).pipe(E.scoped);

NodeRuntime.runMain(program.pipe(E.provide(NodeServices.layer)));
