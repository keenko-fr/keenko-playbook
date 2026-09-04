#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ReleaseClient } from "nx/release";

async function main() {
  const [expectedSha, ...args] = process.argv.slice(2);
  if (expectedSha === undefined || expectedSha.length === 0) {
    throw new Error("Usage: bun cli/release-tag.ts <expected-sha>");
  }
  if (args.length > 0) {
    throw new Error(`Unknown release-tag option: ${args[0]}`);
  }

  const root = process.cwd();
  assertEqual(git(root, "rev-parse", "origin/main"), expectedSha, "origin/main");
  assertEqual(git(root, "rev-parse", "HEAD"), expectedSha, "HEAD");
  assertEqual(git(root, "symbolic-ref", "--short", "HEAD"), "main", "local branch");
  assertClean(root, "before tagging");
  if (await hasVersionPlan(path.join(root, ".nx/version-plans"))) {
    throw new Error("Publish requires all Nx version-plan files to be consumed by the reviewed release commit");
  }

  const packageJson = parseObject(await readFile(path.join(root, "package.json"), "utf-8"), "package.json");
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json.version must contain the reviewed release version");
  }
  const version = packageJson.version;
  const changelogPath = path.join(root, "CHANGELOG.md");
  const changelogBefore = await readFile(changelogPath, "utf-8");
  const tagsBefore = gitTags(root);
  const firstRelease = tagsBefore.size === 0;

  // The CLI changelog command exits before tag/push on a no-diff replay in Nx 23.2.0.
  // The public API lets the publish stage disable changelog file writing while Nx still owns tag creation and push.
  const release = new ReleaseClient({
    changelog: {
      workspaceChangelog: {
        createRelease: false,
        file: false,
      },
    },
  });
  await release.releaseChangelog({
    createRelease: false,
    deleteVersionPlans: false,
    firstRelease,
    forceChangelogGeneration: true,
    gitCommit: false,
    gitPush: true,
    gitTag: true,
    stageChanges: false,
    version,
  });

  assertEqual(await readFile(changelogPath, "utf-8"), changelogBefore, "CHANGELOG.md contents");
  assertClean(root, "after tagging");
  assertEqual(git(root, "rev-parse", "HEAD"), expectedSha, "HEAD after tagging");

  const tagsAfter = gitTags(root);
  const createdTags = [...tagsAfter].filter((tag) => !tagsBefore.has(tag));
  if (createdTags.length !== 1) {
    throw new Error(`Expected Nx to create exactly one release tag, created: ${createdTags.join(", ") || "none"}`);
  }
  const [createdTag] = createdTags;
  if (createdTag === undefined) {
    throw new Error("Nx did not create a release tag");
  }
  assertEqual(git(root, "rev-list", "-n", "1", createdTag), expectedSha, `local tag ${createdTag}`);
  assertEqual(remoteTagCommit(root, createdTag), expectedSha, `remote tag ${createdTag}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput !== undefined && githubOutput.length > 0) {
    await appendFile(githubOutput, `first_release=${String(firstRelease)}\n`);
  }
  console.log(`Nx created and pushed ${createdTag} at reviewed commit ${expectedSha}.`);
}

async function hasVersionPlan(root: string): Promise<boolean> {
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  });
  const matches = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        return await hasVersionPlan(path.join(root, entry.name));
      }
      return entry.isFile() && entry.name.endsWith(".md");
    })
  );
  return matches.some(Boolean);
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function assertClean(root: string, label: string) {
  const status = git(root, "status", "--porcelain");
  if (status !== "") {
    throw new Error(`Git working tree and index must be clean ${label}:\n${status}`);
  }
}

function gitTags(root: string) {
  const output = git(root, "tag", "--list");
  return new Set(output === "" ? [] : output.split("\n"));
}

function remoteTagCommit(root: string, tag: string) {
  const output = git(root, "ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
  const rows = output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
  const peeled =
    rows.find(([, reference]) => reference === `refs/tags/${tag}^{}`) ?? rows.find(([, reference]) => reference === `refs/tags/${tag}`);
  const sha = peeled?.[0];
  if (sha === undefined) {
    throw new Error(`Nx did not push release tag ${tag} to origin`);
  }
  return sha;
}

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}; found ${actual}`);
  }
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
}

function parseObject(text: string, label: string) {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must contain an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
