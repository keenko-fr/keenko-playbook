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
  test("the publish helper tags and pushes the exact reviewed commit under CI semantics", async () => {
    const fixture = await nxReleaseFixture();
    const initial = git(fixture.root, "rev-parse", "HEAD");

    assertNxSuccess(nx(fixture.root, ["release", "version", "--first-release"]));
    expect(json(await readFile(path.join(fixture.root, "package.json"), "utf-8")).version).toBe("0.1.1");
    expect(git(fixture.root, "rev-parse", "HEAD")).toBe(initial);
    expect(git(fixture.root, "diff", "--cached", "--name-only")).toContain("package.json");
    expect(git(fixture.root, "tag", "--list", "v0.1.1")).toBe("");

    assertNxSuccess(nx(fixture.root, ["release", "changelog", "0.1.1", "--first-release"]));
    const reviewed = git(fixture.root, "rev-parse", "HEAD");
    expect(reviewed).not.toBe(initial);
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
    expect(await exists(path.join(fixture.root, ".nx/version-plans/fixture.md"))).toBe(false);
    const changelogBefore = await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8");
    expect(changelogBefore).toContain("0.1.1");
    expect(git(fixture.root, "tag", "--list", "v0.1.1")).toBe("");

    git(fixture.root, "push", "origin", "HEAD:main");
    expect(gitDir(fixture.remote, "rev-parse", "refs/heads/main")).toBe(reviewed);
    expect(git(fixture.root, "rev-parse", "origin/main")).toBe(reviewed);
    expect(git(fixture.root, "symbolic-ref", "--short", "HEAD")).toBe("main");

    const result = spawnSync("bun", [RELEASE_TAG, reviewed], {
      cwd: fixture.root,
      encoding: "utf-8",
      env: { ...process.env, CI: "true", GITHUB_ACTIONS: "true", NX_DAEMON: "false" },
    });
    if (result.status !== 0) {
      throw new Error(output(result));
    }

    expect(await readFile(path.join(fixture.root, "CHANGELOG.md"), "utf-8")).toBe(changelogBefore);
    expect(git(fixture.root, "rev-parse", "HEAD")).toBe(reviewed);
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
    expect(git(fixture.root, "tag", "--list", "v0.1.1")).toBe("v0.1.1");
    expect(git(fixture.root, "rev-list", "-n", "1", "v0.1.1")).toBe(reviewed);
    expect(gitDir(fixture.remote, "rev-list", "-n", "1", "refs/tags/v0.1.1")).toBe(reviewed);
    expect(await exists(path.join(fixture.root, ".published"))).toBe(false);
    expect(output(result)).toContain(`Nx created and pushed v0.1.1 at reviewed commit ${reviewed}.`);
  }, 30_000);

  test("the workflow uses the programmatic tag helper instead of a no-diff changelog replay", async () => {
    const workflow = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    const helper = await readFile(RELEASE_TAG, "utf-8");
    expect(workflow).toContain(`test "$(git rev-parse origin/main)" = "\${{ inputs.expected_sha }}"`);
    expect(workflow).toContain(`git checkout -B main "\${{ inputs.expected_sha }}"`);
    expect(workflow).toContain('test "$(git symbolic-ref --short HEAD)" = "main"');
    expect(workflow).toContain("bunx nx release version $first_release");
    expect(workflow).toContain('bunx nx release changelog "$version" $first_release');
    expect(workflow).toContain('run: bun cli/release-tag.ts "\${{ inputs.expected_sha }}"');
    expect(workflow).toContain("bunx nx release publish $first_release");
    expect(workflow).not.toContain("--create-release=github");
    expect(workflow).not.toContain('release changelog "$version" --git-commit=false');
    expect(helper).toContain('import { ReleaseClient } from "nx/release";');
    expect(helper).toContain("file: false");
    expect(helper).toContain("forceChangelogGeneration: true");
    expect(helper).toContain("gitPush: true");
    expect(helper).toContain("gitTag: true");
  });
});

async function nxReleaseFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-nx-release-"));
  const remote = `${root}-remote.git`;
  tempRoots.push(root, remote);

  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture",
        nx: {
          targets: {
            "nx-release-publish": {
              command: "node -e \"require('node:fs').writeFileSync('.published', 'yes')\"",
            },
          },
        },
        private: false,
        version: "0.1.0",
      },
      null,
      2
    )}\n`
  );
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
  await writeFile(path.join(root, ".gitignore"), ".nx/cache/\n.nx/workspace-data/\nnode_modules\n");
  await mkdir(path.join(root, ".nx/version-plans"), { recursive: true });
  await writeFile(path.join(root, ".nx/version-plans/fixture.md"), "---\nfixture: patch\n---\n\nPrepare fixture release.\n");
  await symlink(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  execFileSync("git", ["init", "--bare", "--quiet", remote]);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Keenko fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@keenko.invalid"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
  execFileSync("git", ["add", ".gitignore", ".nx/version-plans/fixture.md", "package.json", "nx.json"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "reviewed release"], { cwd: root });
  execFileSync("git", ["push", "--quiet", "-u", "origin", "main"], { cwd: root });
  return { remote, root };
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
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function exists(target: string) {
  return (await stat(target).catch(() => null)) !== null;
}

function json(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}
