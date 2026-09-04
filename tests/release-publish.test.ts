import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const NX = path.join(ROOT, "node_modules/nx/dist/bin/nx.js");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { force: true, recursive: true });
    })
  );
});

describe("Nx release publication", () => {
  test("pinned Nx prepares one reviewable commit and does not tag a no-diff changelog replay", async () => {
    const fixture = await nxReleaseFixture();
    const initial = git(fixture.root, "rev-parse", "HEAD");

    assertNxSuccess(nx(fixture.root, ["release", "version", "--first-release"]));
    expect(json(await readFile(path.join(fixture.root, "package.json"), "utf-8")).version).toBe("0.1.1");
    expect(git(fixture.root, "rev-parse", "HEAD")).toBe(initial);
    expect(git(fixture.root, "diff", "--cached", "--name-only")).toContain("package.json");
    expect(git(fixture.root, "tag", "--list", "v0.1.1")).toBe("");

    assertNxSuccess(nx(fixture.root, ["release", "changelog", "0.1.1", "--first-release"]));
    const prepared = git(fixture.root, "rev-parse", "HEAD");
    expect(prepared).not.toBe(initial);
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
    expect(await exists(path.join(fixture.root, ".nx/version-plans/fixture.md"))).toBe(false);
    expect(await exists(path.join(fixture.root, "CHANGELOG.md"))).toBe(true);
    expect(git(fixture.root, "tag", "--list", "v0.1.1")).toBe("");
    expect(gitDir(fixture.remote, "rev-parse", "refs/heads/main")).toBe(initial);

    git(fixture.root, "push", "origin", "HEAD:main");
    expect(gitDir(fixture.remote, "rev-parse", "refs/heads/main")).toBe(prepared);

    assertNxSuccess(
      nx(fixture.root, [
        "release",
        "changelog",
        "0.1.1",
        "--git-commit=false",
        "--git-tag=true",
        "--stage-changes=false",
        "--git-push=true",
        "--first-release",
      ])
    );
    expect(git(fixture.root, "rev-parse", "HEAD")).toBe(prepared);
    expect(git(fixture.root, "tag", "--list", "v0.1.1")).toBe("");
    expect(gitDir(fixture.remote, "tag", "--list", "v0.1.1")).toBe("");
    expect(git(fixture.root, "status", "--porcelain")).toBe("");
  }, 30_000);

  test("the workflow keeps reviewed-SHA guards and gives Nx a release task for exact tagging", async () => {
    const workflow = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(workflow).toContain(`test "$(git rev-parse origin/main)" = "\${{ inputs.expected_sha }}"`);
    expect(workflow).toContain(`git checkout -B main "\${{ inputs.expected_sha }}"`);
    expect(workflow).toContain('test "$(git symbolic-ref --short HEAD)" = "main"');
    expect(workflow).toContain("bunx nx release version $first_release");
    expect(workflow).toContain('bunx nx release changelog "$version" $first_release');
    expect(workflow).toContain("--git-commit=false --git-tag=true --stage-changes=false --git-push=true --create-release=github");
    expect(workflow).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("git diff --cached --exit-code");
    expect(workflow).toContain(`test "$(git rev-list -n 1 "v\${version}")" = "\${{ inputs.expected_sha }}"`);
    expect(workflow).not.toContain("bunx nx release --skip-publish");
  });
});

async function nxReleaseFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-nx-release-"));
  const remote = `${root}-remote.git`;
  tempRoots.push(root, remote);

  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", nx: {}, private: false, version: "0.1.0" }, null, 2)}\n`
  );
  await writeFile(
    path.join(root, "nx.json"),
    `${JSON.stringify(
      {
        release: {
          changelog: {
            git: { commit: true, push: false, stageChanges: true, tag: false },
            workspaceChangelog: true,
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

function output(result: ReturnType<typeof nx>) {
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
