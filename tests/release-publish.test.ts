import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { force: true, recursive: true });
    })
  );
});

describe("release publication", () => {
  test("creates the tag only while remote main still equals the reviewed commit", async () => {
    const unchanged = await gitFixture();
    const ok = await publishTag(unchanged.work, unchanged.candidate, "v1.0.0");
    expect(ok.code).toBe(0);
    const tag = await git(unchanged.root, `--git-dir=${unchanged.remote}`, "rev-parse", "refs/tags/v1.0.0");
    expect(tag.stdout.trim()).toBe(unchanged.candidate);

    const advanced = await gitFixture();
    await advanceMain(advanced);
    const stale = await publishTag(advanced.work, advanced.candidate, "v1.0.0");
    expect(stale.code).not.toBe(0);
    expect(stale.stderr).toContain("stale info");
    const remoteMain = await git(advanced.root, `--git-dir=${advanced.remote}`, "rev-parse", "refs/heads/main");
    expect(remoteMain.stdout.trim()).not.toBe(advanced.candidate);
    const staleTag = await git(advanced.root, `--git-dir=${advanced.remote}`, "rev-parse", "--verify", "refs/tags/v1.0.0");
    expect(staleTag.code).not.toBe(0);
  });

  test("workflow uses the leased atomic push contract", async () => {
    const workflow = await Bun.file(path.join(ROOT, ".github", "workflows", "release.yml")).text();
    expect(workflow).toContain("git push --atomic");
    // oxlint-disable-next-line no-template-curly-in-string -- This asserts literal GitHub Actions shell expansion syntax.
    expect(workflow).toContain('--force-with-lease="refs/heads/main:${GITHUB_SHA}"');
    expect(workflow).toContain("HEAD:refs/heads/main");
    // oxlint-disable-next-line no-template-curly-in-string -- This asserts literal GitHub Actions shell expansion syntax.
    expect(workflow).toContain('"refs/tags/v${VERSION}:refs/tags/v${VERSION}"');
  });
});

interface GitFixture {
  candidate: string;
  remote: string;
  root: string;
  work: string;
}

async function gitFixture(): Promise<GitFixture> {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-release-publish-test-"));
  tempRoots.push(root);
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");

  await expectGit(root, "init", "--bare", remote);
  await expectGit(root, "init", work);
  await expectGit(work, "config", "user.email", "test@keenko.dev");
  await expectGit(work, "config", "user.name", "Keenko Test");
  await writeFile(path.join(work, "file.txt"), "candidate\n");
  await expectGit(work, "add", "file.txt");
  await expectGit(work, "commit", "-m", "candidate");
  await expectGit(work, "branch", "-M", "main");
  await expectGit(work, "remote", "add", "origin", remote);
  await expectGit(work, "push", "-u", "origin", "main");

  const head = await git(work, "rev-parse", "HEAD");
  return {
    candidate: head.stdout.trim(),
    remote,
    root,
    work,
  };
}

async function advanceMain(fixture: GitFixture) {
  const other = path.join(fixture.root, "other");
  await expectGit(fixture.root, "clone", "--branch", "main", fixture.remote, other);
  await expectGit(other, "config", "user.email", "other@keenko.dev");
  await expectGit(other, "config", "user.name", "Keenko Other");
  await writeFile(path.join(other, "file.txt"), "advanced\n");
  await expectGit(other, "add", "file.txt");
  await expectGit(other, "commit", "-m", "advance main");
  await expectGit(other, "push", "origin", "HEAD:main");
}

async function publishTag(work: string, candidate: string, tag: string) {
  await expectGit(work, "tag", tag, candidate);
  return await git(
    work,
    "push",
    "--atomic",
    `--force-with-lease=refs/heads/main:${candidate}`,
    "origin",
    "HEAD:refs/heads/main",
    `refs/tags/${tag}:refs/tags/${tag}`
  );
}

async function expectGit(cwd: string, ...args: string[]) {
  const result = await git(cwd, ...args);
  expect(result.code).toBe(0);
  return result;
}

async function git(cwd: string, ...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { cwd, stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stderr, stdout };
}
