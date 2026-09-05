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
  test("the native release flow consumes plans and owns version, changelog, commit, tag, and publication", async () => {
    const root = await releaseFixture();
    const before = git(root, "rev-parse", "HEAD");

    const result = nx(root, ["release", "--yes"]);
    expect(output(result)).not.toContain("A specifier option cannot be provided when using version plans");
    assertNxSuccess(result);

    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("0.2.0");
    expect(await exists(path.join(root, ".nx/version-plans/release.md"))).toBe(false);

    const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("0.2.0");
    expect(changelog).toContain("Exercise native Nx release ownership.");

    const released = git(root, "rev-parse", "HEAD");
    expect(released).not.toBe(before);
    expect(git(root, "log", "-1", "--pretty=%s")).toBe("chore(release): publish 0.2.0");
    expect(git(root, "rev-list", "-n", "1", "v0.2.0")).toBe(released);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(await readFile(path.join(root, ".published"), "utf-8")).toBe("yes\n");
  }, 30_000);

  test("the repository config uses the top-level Nx release contract", async () => {
    const nxJson = JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")) as {
      release: {
        changelog: {
          automaticFromRef: boolean;
          git?: unknown;
          workspaceChangelog: { createRelease: string; file: string };
        };
        projects: string[];
        version: { adjustSemverBumpsForZeroMajorVersion: boolean; git?: unknown };
        versionPlans: boolean;
      };
    };
    expect(nxJson.release.projects).toEqual(["keenko"]);
    expect(nxJson.release.versionPlans).toBe(true);
    expect(nxJson.release.version.adjustSemverBumpsForZeroMajorVersion).toBe(false);
    expect(nxJson.release.version.git).toBeUndefined();
    expect(nxJson.release.changelog.automaticFromRef).toBe(true);
    expect(nxJson.release.changelog.git).toBeUndefined();
    expect(nxJson.release.changelog.workspaceChangelog).toEqual({
      createRelease: "github",
      file: "{workspaceRoot}/CHANGELOG.md",
    });
  });
});

async function releaseFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-nx-release-"));
  tempRoots.push(root);

  await mkdir(path.join(root, ".nx/version-plans"), { recursive: true });
  await writeFile(path.join(root, ".gitignore"), ".nx/cache/\n.nx/workspace-data/\n.published\nnode_modules\n");
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture",
        nx: {
          targets: {
            "nx-release-publish": {
              command: "node -e \"require('node:fs').writeFileSync('.published', 'yes\\n')\" --",
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
            automaticFromRef: true,
            workspaceChangelog: { file: "{workspaceRoot}/CHANGELOG.md" },
          },
          projects: ["fixture"],
          releaseTag: { pattern: "v{version}" },
          version: { adjustSemverBumpsForZeroMajorVersion: false },
          versionPlans: true,
        },
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    path.join(root, ".nx/version-plans/release.md"),
    "---\nfixture: minor\n---\n\nExercise native Nx release ownership.\n"
  );
  await symlink(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Keenko fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@keenko.invalid"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture baseline"], { cwd: root });
  return root;
}

function nx(cwd: string, args: string[]) {
  return spawnSync("node", [NX, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, CI: "true", NX_DAEMON: "false" },
  });
}

function assertNxSuccess(result: ReturnType<typeof nx>) {
  if (result.status !== 0) {
    throw new Error(output(result));
  }
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

async function exists(filePath: string) {
  return await stat(filePath).then(() => true).catch(() => false);
}

function output(result: ReturnType<typeof nx>) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}
