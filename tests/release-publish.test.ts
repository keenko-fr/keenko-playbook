import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const NX = path.join(ROOT, "node_modules/nx/dist/bin/nx.js");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Nx release publication", () => {
  test("the changelog subcommand resolves every top-level Git option before tagging", async () => {
    const fixture = await nxReleaseFixture();
    const incomplete = nxChangelog(fixture, false);
    expect(incomplete.status).not.toBe(0);
    expect(output(incomplete)).toContain('The "release.git" property in nx.json may not be used');
    expect(git(fixture, "tag", "--list", "v0.1.0")).toBe("");

    const head = git(fixture, "rev-parse", "HEAD");
    const corrected = nxChangelog(fixture, true);
    expect(output(corrected)).not.toContain('The "release.git" property in nx.json may not be used');
    if (corrected.status !== 0) {
      throw new Error(output(corrected));
    }
    expect(git(fixture, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(git(fixture, "rev-list", "-n", "1", "v0.1.0")).toBe(head);
    expect(git(fixture, "diff", "--cached", "--exit-code")).toBe("");
  }, 30_000);

  test("the workflow keeps reviewed-SHA, attached-main, clean-tree, and exact-tag guards", async () => {
    const workflow = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "${{ inputs.expected_sha }}"');
    expect(workflow).toContain('git checkout -B main "${{ inputs.expected_sha }}"');
    expect(workflow).toContain('test "$(git symbolic-ref --short HEAD)" = "main"');
    expect(workflow).toContain("--git-commit=false --git-tag=true --stage-changes=false --git-push=true");
    expect(workflow).toContain("git diff --exit-code");
    expect(workflow).toContain('test "$(git rev-list -n 1 "v${version}")" = "${{ inputs.expected_sha }}"');
  });
});

async function nxReleaseFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-nx-release-"));
  tempRoots.push(root);
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", nx: {}, private: false, version: "0.1.0" }, null, 2)}\n`
  );
  await writeFile(
    path.join(root, "nx.json"),
    `${JSON.stringify(
      {
        release: {
          changelog: { workspaceChangelog: true },
          git: { commit: true, tag: true },
          projects: ["fixture"],
          releaseTag: { pattern: "v{version}" },
        },
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(root, ".gitignore"), ".nx/\nnode_modules\n");
  await symlink(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Keenko fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@keenko.invalid"], { cwd: root });
  execFileSync("git", ["add", ".gitignore", "package.json", "nx.json"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "reviewed release"], { cwd: root });
  return root;
}

function nxChangelog(cwd: string, complete: boolean) {
  const args = [NX, "release", "changelog", "0.1.0", "--git-commit=false", "--git-tag=true"];
  if (complete) {
    args.push("--stage-changes=false");
  }
  args.push("--git-push=false", "--first-release");
  return spawnSync("node", args, { cwd, encoding: "utf-8", env: { ...process.env, NX_DAEMON: "false" } });
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function output(result: ReturnType<typeof spawnSync>) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}
