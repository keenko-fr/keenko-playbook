import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { runtimeVersions } from "../src/generators/versions.js";

class ReleaseVersionFailure extends S.TaggedError<ReleaseVersionFailure>()("ReleaseVersionFailure", { message: S.String }) {}

const runVersionDryRun = E.fn("keenko.releaseVersion.dryRun")(function* (executable: string, cwd: string, arguments_: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(ChildProcess.make(executable, ["release", "version", ...arguments_, "--dry-run"], { cwd }), {
    includeStderr: true,
  });
});

const runReleaseDryRun = E.fn("keenko.release.dryRun")(function* (executable: string, cwd: string, arguments_: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(ChildProcess.make(executable, ["release", ...arguments_, "--skip-publish", "--dry-run"], { cwd }), {
    includeStderr: true,
  });
});

const runPublishDryRun = E.fn("keenko.releasePublish.dryRun")(function* (executable: string, cwd: string, tag: "latest" | "rc") {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(
    ChildProcess.make(executable, ["release", "publish", "--tag", tag, "--dry-run", "--outputStyle=static"], { cwd }),
    { includeStderr: true }
  );
});

const makeReleaseFixture = E.fn("keenko.releaseVersion.fixture")(function* (
  nodeModules: string,
  packageManager: string,
  version: string,
  bump: "none" | "premajor" | "prerelease"
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-release-version-" });

  yield* fs.writeFileString(
    path.join(root, "package.json"),
    `{\n  "name": "keenko",\n  "version": "${version}",\n  "private": false,\n  "packageManager": "${packageManager}",\n  "nx": {}\n}\n`
  );
  yield* fs.writeFileString(
    path.join(root, "nx.json"),
    `{\n  "release": {\n    "projects": ["keenko"],\n    "versionPlans": true,\n    "version": {\n      "adjustSemverBumpsForZeroMajorVersion": false\n    }\n  }\n}\n`
  );
  if (bump !== "none") {
    const plans = path.join(root, ".nx/version-plans");
    yield* fs.makeDirectory(plans, { recursive: true });
    yield* fs.writeFileString(path.join(plans, "version-plan-test.md"), `---\n__default__: ${bump}\n---\n\nTest release transition.\n`);
  }

  for (const arguments_ of [
    ["init", "--quiet"],
    ["config", "user.name", "Keenko Release Fixture"],
    ["config", "user.email", "release-fixture@keenko.invalid"],
    ["add", "package.json", "nx.json", ...(bump === "none" ? [] : [".nx/version-plans"])],
    ["commit", "--quiet", "-m", "Initialize release fixture"],
  ])
    yield* spawner.string(ChildProcess.make("git", arguments_, { cwd: root }), { includeStderr: true });

  yield* fs.symlink(nodeModules, path.join(root, "node_modules"));

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
  const packageManager = `bun@${runtimeVersions.bun}`;
  const firstRcFixture = yield* makeReleaseFixture(nodeModules, packageManager, "0.9.0", "premajor");
  const firstRcRelease = yield* runReleaseDryRun(nx, firstRcFixture, ["--preid", "rc"]);
  yield* assertContains(firstRcRelease, "new version 1.0.0-rc.0", "The top-level RC release command did not resolve the first RC");
  yield* assertContains(
    firstRcRelease,
    "Skipped publishing packages.",
    "The top-level RC release command did not skip implicit publication"
  );

  const firstRc = yield* runVersionDryRun(nx, firstRcFixture, ["--preid", "rc"]);
  yield* assertContains(firstRc, 'Applied semver relative bump "premajor"', "Nx did not apply the first-RC fixture's premajor plan");
  yield* assertContains(firstRc, "new version 1.0.0-rc.0", "Nx did not resolve the first RC to 1.0.0-rc.0");

  const continuationFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0-rc.0", "prerelease");
  const nextRc = yield* runVersionDryRun(nx, continuationFixture, ["--preid", "rc"]);
  yield* assertContains(nextRc, 'Applied semver relative bump "prerelease"', "Nx did not apply a later-RC prerelease plan");
  yield* assertContains(nextRc, "new version 1.0.0-rc.1", "Nx did not increment a later RC");

  const stableFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0-rc.7", "none");
  const stableRelease = yield* runReleaseDryRun(nx, stableFixture, ["1.0.0"]);
  yield* assertContains(stableRelease, "new version 1.0.0", "The top-level stable release command did not resolve stable 1.0.0");
  yield* assertContains(
    stableRelease,
    "Skipped publishing packages.",
    "The top-level stable release command did not skip implicit publication"
  );

  const stable = yield* runVersionDryRun(nx, stableFixture, ["1.0.0"]);
  yield* assertContains(stable, 'Applied explicit semver value "1.0.0"', "Nx did not apply the explicit stable version");
  yield* assertContains(stable, "new version 1.0.0", "Nx did not promote the accepted RC to stable 1.0.0");

  const rcPublishFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0-rc.0", "none");
  const rcPublishManifest = path.join(rcPublishFixture, "package.json");
  const rcPublishManifestBefore = yield* fs.readFileString(rcPublishManifest);
  const rcPublish = yield* runPublishDryRun(nx, rcPublishFixture, "rc");
  yield* assertContains(rcPublish, 'with tag "rc"', "Nx did not resolve RC publication to the rc dist-tag");
  yield* assertContains(rcPublish, "[dry-run]", "RC publication verification was not a dry run");
  if ((yield* fs.readFileString(rcPublishManifest)) !== rcPublishManifestBefore)
    return yield* new ReleaseVersionFailure({ message: "RC publish dry-run changed the already-versioned package manifest" });

  const stablePublishFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0", "none");
  const stablePublishManifest = path.join(stablePublishFixture, "package.json");
  const stablePublishManifestBefore = yield* fs.readFileString(stablePublishManifest);
  const stablePublish = yield* runPublishDryRun(nx, stablePublishFixture, "latest");
  yield* assertContains(stablePublish, 'with tag "latest"', "Nx did not resolve stable publication to the latest dist-tag");
  yield* assertContains(stablePublish, "[dry-run]", "Stable publication verification was not a dry run");
  if ((yield* fs.readFileString(stablePublishManifest)) !== stablePublishManifestBefore)
    return yield* new ReleaseVersionFailure({ message: "Stable publish dry-run changed the already-versioned package manifest" });

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
  yield* assertContains(
    release,
    "bun x nx release --skip-publish --preid rc",
    "RC mode does not use the verified Nx prerelease command without implicit publication"
  );
  yield* assertContains(release, "bun x nx release publish --tag rc", "RC mode does not publish through Nx with the rc dist-tag");
  yield* assertContains(
    release,
    "bun x nx release 1.0.0 --skip-publish",
    "Stable mode does not use the verified explicit stable version without implicit publication"
  );
  yield* assertContains(
    release,
    "bun x nx release publish --tag latest",
    "Stable mode does not publish through Nx with the latest dist-tag"
  );
}).pipe(E.scoped);

NodeRuntime.runMain(program.pipe(E.provide(NodeServices.layer)));
