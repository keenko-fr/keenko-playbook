import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { runtimeVersions } from "../src/generators/versions.js";

class ReleaseVersionFailure extends S.TaggedError<ReleaseVersionFailure>()("ReleaseVersionFailure", { message: S.String }) {}

const runVersionDryRun = E.fn("keenko.releaseVersion.dryRun")(function* (executable: string, cwd: string, arguments_: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(
    ChildProcess.make(executable, ["release", "version", ...arguments_, "--dry-run"], { cwd, forceKillAfter: "5 seconds" }),
    {
      includeStderr: true,
    }
  );
});

const runReleaseDryRun = E.fn("keenko.release.dryRun")(function* (executable: string, cwd: string, arguments_: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(
    ChildProcess.make(executable, ["release", ...arguments_, "--skip-publish", "--dry-run"], { cwd, forceKillAfter: "5 seconds" }),
    {
      includeStderr: true,
    }
  );
});

const runPublishDryRun = E.fn("keenko.releasePublish.dryRun")(function* (executable: string, cwd: string, tag: "latest" | "rc") {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(
    ChildProcess.make(executable, ["release", "publish", "--tag", tag, "--dry-run", "--outputStyle=static"], {
      cwd,
      forceKillAfter: "5 seconds",
    }),
    { includeStderr: true }
  );
});

const makeReleaseFixture = E.fn("keenko.releaseVersion.fixture")(function* (
  nodeModules: string,
  packageManager: string,
  version: string,
  bump: "none" | "patch" | "premajor" | "prepatch" | "prerelease"
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
    yield* spawner.string(ChildProcess.make("git", arguments_, { cwd: root, forceKillAfter: "5 seconds" }), { includeStderr: true });

  yield* fs.symlink(nodeModules, path.join(root, "node_modules"));

  return root;
});

const assertContains = (output: string, expected: string, context: string) =>
  output.includes(expected) ? E.void : E.fail(new ReleaseVersionFailure({ message: `${context}:\n${output}` }));

const runFixtureCommand = E.fn("keenko.release.fixtureCommand")(function* (executable: string, cwd: string, args: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(ChildProcess.make(executable, args, { cwd, forceKillAfter: "5 seconds" }), { includeStderr: true });
});

const verifyStableWorkflow = E.fn("keenko.release.stableWorkflow")(function* (repository: string, release: string) {
  const step = release.split("      - name: Release with Nx\n")[1]?.split("      - name:")[0] ?? "";
  const script = (step.split("        run: |\n")[1] ?? "").replaceAll(/^ {10}/gmu, "");
  const nativeChangelog = /node --input-type=module -e '(?<code>[\s\S]+?)'/u.exec(script)?.groups?.code ?? "";
  if (nativeChangelog === "") return yield* new ReleaseVersionFailure({ message: "Stable workflow has no native Nx changelog call" });

  yield* assertContains(
    step,
    // oxlint-disable-next-line no-template-curly-in-string -- Literal GitHub Actions snapshot wiring.
    "PREVIOUS_LATEST: ${{ steps.registry-before.outputs.latest }}",
    "Stable changelog does not receive the original registry snapshot"
  );
  yield* assertContains(script, '\' "$STABLE_TARGET" "v$PREVIOUS_LATEST"', "Stable changelog does not receive the previous stable ref");
  const versionCommand = script.indexOf('bun x nx release version "$STABLE_TARGET"');
  const changelogCommand = script.indexOf("node --input-type=module -e");
  const publishCommand = script.indexOf("bun x nx release publish --tag latest");
  if (versionCommand === -1 || changelogCommand <= versionCommand || publishCommand <= changelogCommand)
    return yield* new ReleaseVersionFailure({ message: "Stable workflow must version, generate its changelog, then publish" });
  if (/git (?:commit|tag|push)\b|gh release\b|api\.github\.com|generate-notes/gu.test(script))
    return yield* new ReleaseVersionFailure({ message: "Release actions must remain Nx-owned" });
  if (release.match(/npm view keenko dist-tags/gu)?.length !== 1)
    return yield* new ReleaseVersionFailure({ message: "Release must share one pre-publication registry snapshot" });

  // Inspect native defaults with the actual stable override, without contacting GitHub.
  const ownershipOutput = yield* runFixtureCommand("node", repository, [
    "--input-type=module",
    "-e",
    nativeChangelog.replace(
      ".releaseChangelog({ version: process.argv[1], from: process.argv[2] })",
      '.releaseChangelog({ version: process.argv[1], printConfig: "debug" })'
    ),
    "1.0.2",
    "v1.0.1",
  ]);
  const ownershipJson =
    ownershipOutput.split("START FINAL INTERNAL CONFIG\n")[1]?.split("=============================================================")[0] ??
    "";
  if (ownershipJson === "") return yield* new ReleaseVersionFailure({ message: "Nx did not print resolved stable ownership" });
  yield* S.decodeEffect(
    S.fromJsonString(
      S.Struct({
        changelog: S.Struct({
          git: S.Struct({ commit: S.Literal(true), push: S.Literal(true), tag: S.Literal(true) }),
          projectChangelogs: S.Struct({ createRelease: S.Struct({ provider: S.Literal("github") }) }),
        }),
        version: S.Struct({
          git: S.Struct({ commit: S.Literal(false), push: S.Literal(false), stageChanges: S.Literal(true), tag: S.Literal(false) }),
        }),
      })
    )
  )(ownershipJson);
  return script;
});

const makeStablePromotionFixture = E.fn("keenko.release.stableFixture")(function* (
  nx: string,
  nodeModules: string,
  packageManager: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.1", "none");
  // GitHub is disabled only in this offline fixture. Push uses a disposable local remote.
  const config = {
    release: {
      changelog: { projectChangelogs: true, workspaceChangelog: false },
      projects: ["keenko"],
      version: { adjustSemverBumpsForZeroMajorVersion: false },
      versionPlans: true,
    },
  };
  yield* fs.writeFileString(path.join(fixture, "nx.json"), yield* S.encodeEffect(S.fromJsonString(S.Unknown))(config));
  yield* runFixtureCommand("git", fixture, ["add", "nx.json"]);
  yield* runFixtureCommand("git", fixture, ["commit", "--quiet", "-m", "chore: configure offline release"]);
  yield* runFixtureCommand("git", fixture, ["tag", "v1.0.1"]);
  const remote = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-release-remote-" });
  yield* runFixtureCommand("git", remote, ["init", "--bare", "--quiet"]);
  yield* runFixtureCommand("git", fixture, ["remote", "add", "origin", remote]);
  yield* runFixtureCommand("git", fixture, ["push", "--quiet", "--set-upstream", "origin", "HEAD"]);
  const plans = path.join(fixture, ".nx/version-plans");
  yield* fs.makeDirectory(plans, { recursive: true });
  const materialChanges = ["KEE-44: preserve early RC material change", "include material change before the final RC"];
  for (const [index, message] of materialChanges.entries()) {
    yield* fs.writeFileString(path.join(fixture, "material.txt"), `${message}\n`);
    yield* fs.writeFileString(
      path.join(plans, `change-${index}.md`),
      `---\n__default__: ${index === 0 ? "prepatch" : "prerelease"}\n---\n\n${message}\n`
    );
    yield* runFixtureCommand("git", fixture, ["add", "material.txt", ".nx/version-plans"]);
    yield* runFixtureCommand("git", fixture, ["commit", "--quiet", "-m", message]);
    const rc = yield* runFixtureCommand(nx, fixture, ["release", "--skip-publish", "--preid", "rc"]);
    yield* assertContains(rc, `new version 1.0.2-rc.${index}`, "Native RC history did not resolve the expected candidate");
  }
  if ((yield* fs.readDirectory(plans)).length !== 0)
    return yield* new ReleaseVersionFailure({ message: "RC releases did not consume their plans" });
  // Top-level RC release rejects granular Git config; enable local push only for stable promotion.
  yield* fs.writeFileString(
    path.join(fixture, "nx.json"),
    yield* S.encodeEffect(S.fromJsonString(S.Unknown))({
      release: { ...config.release, changelog: { ...config.release.changelog, git: { push: true } } },
    })
  );
  yield* runFixtureCommand("git", fixture, ["add", "nx.json"]);
  yield* runFixtureCommand("git", fixture, ["commit", "--quiet", "-m", "chore: configure local stable push"]);
  return { fixture, remote };
});

const verifyStablePromotion = E.fn("keenko.release.stablePromotion")(function* (
  repository: string,
  nx: string,
  nodeModules: string,
  packageManager: string,
  release: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const script = yield* verifyStableWorkflow(repository, release);
  const { fixture, remote } = yield* makeStablePromotionFixture(nx, nodeModules, packageManager);
  // A native final-RC-only range omits both changes. Test the entry itself, not older entries in the file.
  const finalRcOnly = yield* runFixtureCommand("node", fixture, [
    "--input-type=module",
    "-e",
    `import { ReleaseClient } from "nx/release";
     const result = await new ReleaseClient({ versionPlans: false, changelog: { workspaceChangelog: false } })
       .releaseChangelog({ version: "1.0.2", from: "v1.0.2-rc.1", dryRun: true });
     console.log("NATIVE_ENTRY", result.projectChangelogs.keenko.contents);`,
  ]);
  const finalRcEntry = finalRcOnly.split("NATIVE_ENTRY")[1] ?? "";
  yield* assertContains(finalRcEntry, "version bump only", "Final-RC control did not isolate the mechanical promotion");
  if (finalRcEntry.includes("material change"))
    return yield* new ReleaseVersionFailure({ message: "Final-RC control unexpectedly included earlier material changes" });

  // Replay the canonical workflow. All version/changelog/Git actions are real Nx;
  // only publication is changed to Nx's native dry run, so no registry is contacted.
  const bin = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-release-bin-" });
  yield* fs.writeFileString(
    path.join(bin, "bun"),
    '#!/bin/sh\nif [ "$1" != x ] || [ "$2" != nx ]; then exec "$REAL_BUN" "$@"; fi\nshift 2\nif [ "$2" = publish ]; then exec "$REAL_NX" "$@" --dry-run --outputStyle=static; fi\nexec "$REAL_NX" "$@"\n'
  );
  yield* fs.chmod(path.join(bin, "bun"), 0o755);
  const environment = {
    PATH: `${bin}:${yield* Config.String("PATH")}`,
    PREVIOUS_LATEST: "1.0.1",
    REAL_BUN: (yield* runFixtureCommand("bun", fixture, ["-e", "console.log(process.execPath)"])).trim(),
    REAL_NX: nx,
    RELEASE_MODE: "stable",
  };
  const headBefore = (yield* runFixtureCommand("git", fixture, ["rev-parse", "HEAD"])).trim();
  const manifestBefore = yield* fs.readFileString(path.join(fixture, "package.json"));
  for (const previousLatest of ["", "latest", "1.0.1-rc.0", "9.0.0"]) {
    const rejected = yield* spawner.spawn(
      ChildProcess.make("/bin/bash", ["-e", "-c", script], {
        cwd: fixture,
        env: { ...environment, PREVIOUS_LATEST: previousLatest },
        extendEnv: true,
        forceKillAfter: "5 seconds",
        stderr: "ignore",
        stdout: "ignore",
      })
    );
    if (Number(yield* rejected.exitCode) === 0 || (yield* fs.readFileString(path.join(fixture, "package.json"))) !== manifestBefore)
      return yield* new ReleaseVersionFailure({ message: `Invalid previous latest ${previousLatest} was not rejected before versioning` });
  }
  const promotion = yield* spawner.string(
    ChildProcess.make("/bin/bash", ["-e", "-c", script], { cwd: fixture, env: environment, extendEnv: true, forceKillAfter: "5 seconds" }),
    { includeStderr: true }
  );
  yield* assertContains(promotion, "Staging changed files with git", "Nx version did not stage its transition");
  yield* assertContains(promotion, 'with tag "latest"', "Stable publish did not use latest");
  const stableEntry = (yield* fs.readFileString(path.join(fixture, "CHANGELOG.md"))).split("\n## 1.0.2-rc.1")[0] ?? "";
  for (const material of ["preserve early RC material change", "include material change before the final RC"])
    yield* assertContains(stableEntry, material, "Stable notes omitted material changes from the RC line");
  if (stableEntry.includes("version bump only"))
    return yield* new ReleaseVersionFailure({ message: "Stable entry collapsed to mechanical promotion notes" });
  if (stableEntry.match(/^## 1\.0\.2 /gmu)?.length !== 1)
    return yield* new ReleaseVersionFailure({ message: "Stable promotion must produce one stable changelog entry" });
  const headAfter = (yield* runFixtureCommand("git", fixture, ["rev-parse", "HEAD"])).trim();
  const parent = (yield* runFixtureCommand("git", fixture, ["rev-parse", "HEAD^"])).trim();
  const tag = (yield* runFixtureCommand("git", fixture, ["rev-parse", "v1.0.2^{commit}"])).trim();
  const pushedTag = (yield* runFixtureCommand("git", remote, ["rev-parse", "v1.0.2^{commit}"])).trim();
  const pushedHead = (yield* runFixtureCommand("git", remote, ["rev-parse", "HEAD"])).trim();
  const status = (yield* runFixtureCommand("git", fixture, ["status", "--porcelain", "--untracked-files=no"])).trim();
  if (
    headAfter === headBefore ||
    parent !== headBefore ||
    tag !== headAfter ||
    pushedTag !== headAfter ||
    pushedHead !== headAfter ||
    status !== ""
  )
    return yield* new ReleaseVersionFailure({ message: "Nx changelog must own one release commit, tag, push, and all staged changes" });
  yield* assertContains(
    yield* runFixtureCommand("git", fixture, ["show", "v1.0.2:package.json"]),
    '"version": "1.0.2"',
    "Nx release commit did not contain the stable version"
  );
  const alreadyStable = yield* spawner.spawn(
    ChildProcess.make("/bin/bash", ["-e", "-c", script], {
      cwd: fixture,
      env: environment,
      extendEnv: true,
      forceKillAfter: "5 seconds",
      stderr: "ignore",
      stdout: "ignore",
    })
  );
  if (Number(yield* alreadyStable.exitCode) === 0)
    return yield* new ReleaseVersionFailure({ message: "Stable workflow accepted an already-stable version" });
});

const program = E.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repository = yield* path.fromFileUrl(new URL("../", import.meta.url));
  const nx = path.join(repository, "node_modules/.bin/nx");
  const nodeModules = path.join(repository, "node_modules");
  const packageManager = `bun@${runtimeVersions.bun}`;
  const release = yield* fs.readFileString(path.join(repository, ".github/workflows/release.yml"));
  yield* verifyStablePromotion(repository, nx, nodeModules, packageManager, release);
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

  const policyFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.2-rc.1", "prerelease");
  yield* fs.writeFileString(
    path.join(policyFixture, ".nx/version-plans/publication-registry-convergence.md"),
    "---\n__default__: prerelease\n---\n\nWait for publication registry convergence.\n"
  );
  yield* fs.writeFileString(
    path.join(policyFixture, ".nx/version-plans/stable-release-notes.md"),
    "---\n__default__: prerelease\n---\n\nGenerate full stable promotion notes.\n"
  );
  const policyRc = yield* runVersionDryRun(nx, policyFixture, ["--preid", "rc"]);
  yield* assertContains(policyRc, "new version 1.0.2-rc.2", "Combined prerelease plans did not select one post-rc.1 candidate");

  const nextPatchRcFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0", "prepatch");
  const nextPatchRc = yield* runReleaseDryRun(nx, nextPatchRcFixture, ["--preid", "rc"]);

  yield* assertContains(nextPatchRc, 'Applied semver relative bump "prepatch"', "Nx did not apply the next patch RC prepatch plan");

  yield* assertContains(nextPatchRc, "new version 1.0.1-rc.0", "Nx did not start the next patch RC line from stable 1.0.0");

  yield* assertContains(nextPatchRc, "Skipped publishing packages.", "The next patch RC dry run did not skip implicit publication");

  const stableFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0-rc.7", "none");
  const stable = yield* runVersionDryRun(nx, stableFixture, ["1.0.0"]);
  yield* assertContains(stable, 'Applied explicit semver value "1.0.0"', "Nx did not apply the explicit stable version");
  yield* assertContains(stable, "new version 1.0.0", "Nx did not promote the accepted RC to stable 1.0.0");

  const rcPublishFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0-rc.0", "none");
  const rcPublishManifest = path.join(rcPublishFixture, "package.json");
  const rcPublishManifestBefore = yield* fs.readFileString(rcPublishManifest);
  const rcPublish = yield* runPublishDryRun(nx, rcPublishFixture, "rc");
  yield* assertContains(rcPublish, 'with tag "rc"', "Nx did not resolve RC publication to the rc dist-tag");
  if ((yield* fs.readFileString(rcPublishManifest)) !== rcPublishManifestBefore)
    return yield* new ReleaseVersionFailure({ message: "RC publish dry-run changed the already-versioned package manifest" });

  const stablePublishFixture = yield* makeReleaseFixture(nodeModules, packageManager, "1.0.0", "none");
  const stablePublishManifest = path.join(stablePublishFixture, "package.json");
  const stablePublishManifestBefore = yield* fs.readFileString(stablePublishManifest);
  const stablePublish = yield* runPublishDryRun(nx, stablePublishFixture, "latest");
  yield* assertContains(stablePublish, 'with tag "latest"', "Nx did not resolve stable publication to the latest dist-tag");
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

  yield* assertContains(
    release,
    "bun x nx release --skip-publish --preid rc",
    "RC mode does not use the verified Nx prerelease command without implicit publication"
  );
  yield* assertContains(release, "bun x nx release publish --tag rc", "RC mode does not publish through Nx with the rc dist-tag");
  yield* assertContains(
    release,
    // oxlint-disable-next-line no-template-curly-in-string -- This assertion checks literal shell parameter expansion in the release workflow.
    'STABLE_TARGET="${VERSION%%-*}"',
    "Stable mode does not derive the stable target from the current RC version"
  );

  yield* assertContains(
    release,
    'bun x nx release version "$STABLE_TARGET"',
    "Stable mode does not version the derived stable target through Nx"
  );
  yield* assertContains(
    release,
    "bun x nx release publish --tag latest",
    "Stable mode does not publish through Nx with the latest dist-tag"
  );
  yield* assertContains(
    release,
    'if [[ "$RELEASE_MODE" == "rc" && "$VERSION" == *-* ]]; then',
    "RC mode does not guard continuation of an existing prerelease"
  );

  yield* assertContains(
    release,
    'if [[ "$RELEASE_MODE" == "rc" && "$VERSION" != *-* ]]; then',
    "RC mode does not guard creation of a new prerelease line from stable"
  );

  yield* assertContains(
    release,
    "^__default__: pre(patch|minor|major)$",
    "Starting an RC from stable does not require a prepatch, preminor, or premajor version plan"
  );

  yield* assertContains(release, "^__default__: prerelease$", "RC continuation does not require prerelease version plans");

  yield* assertContains(release, 'if [[ "$VERSION" != *-rc.* ]]; then', "RC mode does not reject a non-RC version before publication");

  yield* assertContains(
    release,
    // oxlint-disable-next-line no-template-curly-in-string -- This assertion checks literal shell parameter expansion in the release workflow.
    'STABLE_TARGET="${VERSION%%-*}"',
    "Stable mode does not derive its target from the accepted RC"
  );

  yield* assertContains(release, "id: registry-before", "Release workflow does not capture npm dist-tags before publication");

  yield* assertContains(
    release,
    'bun run release:wait-for-published -- "$PUBLISHED_VERSION" "$RELEASE_MODE" "$PREVIOUS_LATEST" "$PREVIOUS_RC"',
    "Release workflow does not wait for exact installation and both mode-specific dist-tags"
  );
  if (release.includes("CURRENT_RC=") || release.includes("CURRENT_LATEST="))
    return yield* new ReleaseVersionFailure({ message: "Release workflow still uses immediate post-publication tag assertions" });
  const convergence = release.indexOf("- name: Wait for published package and npm dist-tags");
  if (
    convergence < release.indexOf("- name: Read Nx-published version") ||
    convergence > release.indexOf("- name: Verify published product") ||
    convergence > release.indexOf("- name: Verify published preset selector")
  )
    return yield* new ReleaseVersionFailure({ message: "Published acceptance must follow successful registry convergence" });
  if (
    release.match(/bun x nx release publish --tag rc/gu)?.length !== 1 ||
    release.match(/bun x nx release publish --tag latest/gu)?.length !== 1
  )
    return yield* new ReleaseVersionFailure({ message: "Each release mode must publish exactly once" });

  yield* assertContains(
    release,
    'bun run test:published -- "$PUBLISHED_VERSION" "keenko@rc"',
    "RC release does not verify the public keenko@rc preset selector"
  );

  yield* assertContains(
    release,
    'bun run test:published -- "$PUBLISHED_VERSION" "keenko"',
    "Stable release does not verify the public keenko preset selector"
  );

  yield* assertContains(
    release,
    // oxlint-disable-next-line no-template-curly-in-string -- This assertion checks the literal GitHub Actions version expression passed to published verification.
    'bun run test:published -- "${{ steps.published.outputs.version }}"',
    "Release workflow does not verify the exact published version"
  );
}).pipe(E.scoped);

NodeRuntime.runMain(program.pipe(E.provide(NodeServices.layer)));
