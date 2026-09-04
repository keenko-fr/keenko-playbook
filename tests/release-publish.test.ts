import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const NX = path.join(ROOT, "node_modules/nx/dist/bin/nx.js");
const RELEASE_TAG = path.join(ROOT, "cli/release-tag.ts");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { force: true, recursive: true });
    })
  );
});

describe("Nx release publication", () => {
  test("the publish helper reuses the first-ever release tag without changing first-release semantics", async () => {
    const fixture = await reviewedReleaseFixture({ currentVersion: "0.1.0" });
    const expectedTag = "v0.1.0";
    const changelogBefore = await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8");

    const first = await runReleaseTag(fixture.root, fixture.reviewed, "first-release-first-output");
    expect(first.result.status).toBe(0);
    expect(first.githubOutput).toBe("first_release=true\n");
    expect(output(first.result)).toContain(`Nx created and pushed ${expectedTag} at reviewed commit ${fixture.reviewed}.`);
    assertReleaseTag(fixture, expectedTag, fixture.reviewed);
    const localAfterFirst = git(fixture.root, "rev-list", "-n", "1", expectedTag);
    const remoteAfterFirst = gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${expectedTag}`);

    const second = await runReleaseTag(fixture.root, fixture.reviewed, "first-release-second-output");
    expect(second.result.status).toBe(0);
    expect(second.githubOutput).toBe("first_release=true\n");
    expect(output(second.result)).toContain(
      `Release tag ${expectedTag} already exists at reviewed commit ${fixture.reviewed}; reusing it.`
    );
    expect(git(fixture.root, "rev-list", "-n", "1", expectedTag)).toBe(localAfterFirst);
    expect(gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${expectedTag}`)).toBe(remoteAfterFirst);
    expect(tagCount(fixture.root, expectedTag)).toBe(1);
    expect(remoteTagCount(fixture.remote, expectedTag)).toBe(1);
    expect(await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8")).toBe(changelogBefore);
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
    expect(await exists(path.join(fixture.root, ".published"))).toBe(false);

    assertNxSuccess(nx(fixture.root, ["release", "publish", "--first-release"]));
    expect(await readFile(path.join(fixture.root, ".published"), "utf-8")).toBe("yes\n");
    assertReleaseTag(fixture, expectedTag, fixture.reviewed);
  }, 30_000);

  test("the publish helper reuses a later release tag without changing non-first-release semantics", async () => {
    const fixture = await reviewedReleaseFixture({ currentVersion: "0.1.1", priorVersion: "0.1.0" });
    const expectedTag = "v0.1.1";
    const priorTag = "v0.1.0";
    const priorTagCommit = gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${priorTag}`);
    const changelogBefore = await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8");

    const first = await runReleaseTag(fixture.root, fixture.reviewed, "later-release-first-output");
    expect(first.result.status).toBe(0);
    expect(first.githubOutput).toBe("first_release=false\n");
    expect(output(first.result)).toContain(`Nx created and pushed ${expectedTag} at reviewed commit ${fixture.reviewed}.`);
    assertReleaseTag(fixture, expectedTag, fixture.reviewed);
    const localAfterFirst = git(fixture.root, "rev-list", "-n", "1", expectedTag);
    const remoteAfterFirst = gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${expectedTag}`);

    const second = await runReleaseTag(fixture.root, fixture.reviewed, "later-release-second-output");
    expect(second.result.status).toBe(0);
    expect(second.githubOutput).toBe("first_release=false\n");
    expect(output(second.result)).toContain(
      `Release tag ${expectedTag} already exists at reviewed commit ${fixture.reviewed}; reusing it.`
    );
    expect(git(fixture.root, "rev-list", "-n", "1", expectedTag)).toBe(localAfterFirst);
    expect(gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${expectedTag}`)).toBe(remoteAfterFirst);
    expect(gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${priorTag}`)).toBe(priorTagCommit);
    expect(tagCount(fixture.root, expectedTag)).toBe(1);
    expect(remoteTagCount(fixture.remote, expectedTag)).toBe(1);
    expect(await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8")).toBe(changelogBefore);
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
    expect(await exists(path.join(fixture.root, ".published"))).toBe(false);

    assertNxSuccess(nx(fixture.root, ["release", "publish"]));
    expect(await readFile(path.join(fixture.root, ".published"), "utf-8")).toBe("yes\n");
    assertReleaseTag(fixture, expectedTag, fixture.reviewed);
  }, 30_000);

  test("the publish helper rejects an expected release tag that points to another commit", async () => {
    const fixture = await reviewedReleaseFixture({ conflictingCurrentTag: true, currentVersion: "0.1.1", priorVersion: "0.1.0" });
    const expectedTag = "v0.1.1";
    const remoteBefore = gitDir(fixture.remote, "show-ref");
    const conflictingCommit = gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${expectedTag}`);
    expect(conflictingCommit).not.toBe(fixture.reviewed);
    const changelogBefore = await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8");

    const result = await runReleaseTag(fixture.root, fixture.reviewed, "conflicting-release-output");
    expect(result.result.status).not.toBe(0);
    expect(output(result.result)).toContain(
      `Existing release tag ${expectedTag} on origin does not point to reviewed SHA ${fixture.reviewed}; found ${conflictingCommit}.`
    );
    expect(result.githubOutput).toBe("");
    expect(gitDir(fixture.remote, "show-ref")).toBe(remoteBefore);
    expect(gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${expectedTag}`)).toBe(conflictingCommit);
    expect(gitDir(fixture.remote, "rev-parse", "refs/heads/main")).toBe(fixture.reviewed);
    expect(await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8")).toBe(changelogBefore);
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
    expect(await exists(path.join(fixture.root, ".published"))).toBe(false);
  }, 30_000);

  test("the workflow keeps Nx responsible for missing-tag creation and consumes the helper first-release output", async () => {
    const workflow = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    const helper = await readFile(RELEASE_TAG, "utf-8");
    const expectedShaExpression = `\${{ inputs.expected_sha }}`;
    expect(workflow).toContain(`test "$(git rev-parse origin/main)" = "${expectedShaExpression}"`);
    expect(workflow).toContain(`git checkout -B main "${expectedShaExpression}"`);
    expect(workflow).toContain('test "$(git symbolic-ref --short HEAD)" = "main"');
    expect(workflow).toContain("bunx nx release version $first_release");
    expect(workflow).toContain('bunx nx release changelog "$version" $first_release');
    expect(workflow).toContain(`run: bun cli/release-tag.ts "${expectedShaExpression}"`);
    expect(workflow).toContain(
      'if [ "${{ steps.release_tag.outputs.first_release }}" = "true" ]; then first_release="--first-release"; fi'
    );
    expect(workflow).toContain("bunx nx release publish $first_release");
    expect(workflow).not.toContain("--create-release=github");
    expect(workflow).not.toContain('release changelog "$version" --git-commit=false');
    expect(workflow).not.toContain("git tag -d");
    expect(workflow).not.toContain("git push --delete");
    expect(helper).toContain('import { ReleaseClient } from "nx/release";');
    expect(helper).toContain("file: false");
    expect(helper).toContain("forceChangelogGeneration: true");
    expect(helper).toContain("gitPush: true");
    expect(helper).toContain("gitTag: true");
  });
});

interface ReleaseFixtureOptions {
  conflictingCurrentTag?: boolean;
  currentVersion: string;
  priorVersion?: string;
}

async function reviewedReleaseFixture({ conflictingCurrentTag = false, currentVersion, priorVersion }: ReleaseFixtureOptions) {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-nx-release-"));
  const remote = `${root}-remote.git`;
  tempRoots.push(root, remote);

  const initialVersion = priorVersion ?? "0.0.0";
  await writeFixturePackage(root, initialVersion);
  await writeFile(
    path.join(root, "nx.json"),
    `${JSON.stringify(
      {
        release: {
          changelog: {
            git: { commit: true, push: false, stageChanges: true, tag: false },
            workspaceChangelog: { file: "{workspaceRoot}/CHANGELOG.md" },
          },
          projects: ["fixture"],
          releaseTag: { pattern: "v{version}" },
          version: {
            git: { commit: false, push: false, stageChanges: true, tag: false },
          },
          versionPlans: true,
        },
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(root, ".gitignore"), ".nx/cache/\n.nx/workspace-data/\n.published\nnode_modules\n");
  await writeFile(path.join(root, "CHANGELOG.md"), changelog(initialVersion));
  await symlink(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  execFileSync("git", ["init", "--bare", "--quiet", remote]);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Keenko fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@keenko.invalid"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
  execFileSync("git", ["add", ".gitignore", "CHANGELOG.md", "package.json", "nx.json"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture baseline"], { cwd: root });
  const baseline = git(root, "rev-parse", "HEAD");

  if (priorVersion !== undefined) {
    git(root, "tag", `v${priorVersion}`, baseline);
  }
  if (conflictingCurrentTag) {
    git(root, "tag", `v${currentVersion}`, baseline);
  }
  execFileSync("git", ["push", "--quiet", "-u", "origin", "main", "--tags"], { cwd: root });

  await writeFixturePackage(root, currentVersion);
  await writeFile(path.join(root, "CHANGELOG.md"), changelog(currentVersion, priorVersion));
  execFileSync("git", ["add", "CHANGELOG.md", "package.json"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", `reviewed release ${currentVersion}`], { cwd: root });
  execFileSync("git", ["push", "--quiet", "origin", "HEAD:main"], { cwd: root });
  const reviewed = git(root, "rev-parse", "HEAD");
  expect(git(root, "rev-parse", "origin/main")).toBe(reviewed);
  return { remote, reviewed, root };
}

async function writeFixturePackage(root: string, version: string) {
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture",
        nx: {
          targets: {
            "nx-release-publish": {
              command: "node -e \"require('node:fs').writeFileSync('.published', 'yes\\n')\"",
            },
          },
        },
        private: false,
        version,
      },
      null,
      2
    )}\n`
  );
}

function changelog(currentVersion: string, priorVersion?: string) {
  const current = `# Changelog\n\n## ${currentVersion}\n\nReviewed fixture release.\n`;
  return priorVersion === undefined ? current : `${current}\n## ${priorVersion}\n\nPrior fixture release.\n`;
}

async function runReleaseTag(root: string, reviewed: string, outputName: string) {
  const outputPath = path.join(root, ".git", outputName);
  const result = spawnSync("bun", [RELEASE_TAG, reviewed], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_OUTPUT: outputPath,
      NX_DAEMON: "false",
    },
  });
  return {
    githubOutput: await readFile(outputPath, "utf-8").catch(() => ""),
    result,
  };
}

function assertReleaseTag(fixture: { remote: string; root: string }, tag: string, reviewed: string) {
  expect(git(fixture.root, "tag", "--list", tag)).toBe(tag);
  expect(git(fixture.root, "rev-list", "-n", "1", tag)).toBe(reviewed);
  expect(gitDir(fixture.remote, "rev-list", "-n", "1", `refs/tags/${tag}`)).toBe(reviewed);
}

function tagCount(root: string, tag: string) {
  const output = git(root, "for-each-ref", "--format=%(refname)", `refs/tags/${tag}`);
  return output === "" ? 0 : output.split("\n").length;
}

function remoteTagCount(remote: string, tag: string) {
  const output = gitDir(remote, "for-each-ref", "--format=%(refname)", `refs/tags/${tag}`);
  return output === "" ? 0 : output.split("\n").length;
}

function nx(cwd: string, args: string[]) {
  return spawnSync("node", [NX, ...args], { cwd, encoding: "utf-8", env: { ...process.env, NX_DAEMON: "false" } });
}

function assertNxSuccess(result: ReturnType<typeof nx>) {
  if (result.status !== 0) {
    throw new Error(output(result));
  }
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function gitDir(gitDirPath: string, ...args: string[]) {
  return execFileSync("git", [`--git-dir=${gitDirPath}`, ...args], { encoding: "utf-8" }).trim();
}

function output(result: ReturnType<typeof nx> | ReturnType<typeof spawnSync>) {
  return `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`;
}

async function exists(target: string) {
  return (await stat(target).catch(() => null)) !== null;
}
