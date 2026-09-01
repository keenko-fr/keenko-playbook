import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

describe("release publication", () => {
  test("creates the tag only while remote main still equals the reviewed commit", async () => {
    const unchanged = await gitFixture();
    const ok = await publishTag(unchanged.work, unchanged.candidate, "v1.0.0");
    expect(ok.code).toBe(0);
    expect((await git(unchanged.root, `--git-dir=${unchanged.remote}`, "rev-parse", "refs/tags/v1.0.0")).stdout.trim()).toBe(
      unchanged.candidate
    );

    const advanced = await gitFixture();
    await advanceMain(advanced);
    const stale = await publishTag(advanced.work, advanced.candidate, "v1.0.0");
    expect(stale.code).not.toBe(0);
    expect(stale.stderr).toContain("stale info");
    expect((await git(advanced.root, `--git-dir=${advanced.remote}`, "rev-parse", "refs/heads/main")).stdout.trim()).not.toBe(
      advanced.candidate
    );
    expect((await git(advanced.root, `--git-dir=${advanced.remote}`, "rev-parse", "--verify", "refs/tags/v1.0.0")).code).not.toBe(0);
  });

  test("workflow uses the leased atomic push contract", async () => {
    const workflow = await Bun.file(join(ROOT, ".github", "workflows", "release.yml")).text();
    expect(workflow).toContain("git push --atomic");
    // oxlint-disable-next-line no-template-curly-in-string -- This asserts literal GitHub Actions shell expansion syntax.
    expect(workflow).toContain('--force-with-lease="refs/heads/main:${GITHUB_SHA}"');
    expect(workflow).toContain("HEAD:refs/heads/main");
    // oxlint-disable-next-line no-template-curly-in-string -- This asserts literal GitHub Actions shell expansion syntax.
    expect(workflow).toContain('"refs/tags/v${VERSION}:refs/tags/v${VERSION}"');
  });
});

type GitFixture = {
  root: string;
  remote: string;
  work: string;
  candidate: string;
};

async function gitFixture(): Promise<GitFixture> {
  const root = await mkdtemp(join(tmpdir(), "keenko-release-publish-test-"));
  tempRoots.push(root);
  const remote = join(root, "remote.git");
  const work = join(root, "work");

  expect((await git(root, "init", "--bare", remote)).code).toBe(0);
  expect((await git(root, "init", work)).code).toBe(0);
  expect((await git(work, "config", "user.email", "test@keenko.dev")).code).toBe(0);
  expect((await git(work, "config", "user.name", "Keenko Test")).code).toBe(0);
  await writeFile(join(work, "file.txt"), "candidate\n");
  expect((await git(work, "add", "file.txt")).code).toBe(0);
  expect((await git(work, "commit", "-m", "candidate")).code).toBe(0);
  expect((await git(work, "branch", "-M", "main")).code).toBe(0);
  expect((await git(work, "remote", "add", "origin", remote)).code).toBe(0);
  expect((await git(work, "push", "-u", "origin", "main")).code).toBe(0);

  return {
    root,
    remote,
    work,
    candidate: (await git(work, "rev-parse", "HEAD")).stdout.trim(),
  };
}

async function advanceMain(fixture: GitFixture) {
  const other = join(fixture.root, "other");
  expect((await git(fixture.root, "clone", "--branch", "main", fixture.remote, other)).code).toBe(0);
  expect((await git(other, "config", "user.email", "other@keenko.dev")).code).toBe(0);
  expect((await git(other, "config", "user.name", "Keenko Other")).code).toBe(0);
  await writeFile(join(other, "file.txt"), "advanced\n");
  expect((await git(other, "add", "file.txt")).code).toBe(0);
  expect((await git(other, "commit", "-m", "advance main")).code).toBe(0);
  expect((await git(other, "push", "origin", "HEAD:main")).code).toBe(0);
}

async function publishTag(work: string, candidate: string, tag: string) {
  expect((await git(work, "tag", tag, candidate)).code).toBe(0);
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

async function git(cwd: string, ...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}
