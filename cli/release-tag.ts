#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ReleaseClient } from "nx/release";

interface SemverApi {
  compare: (left: string, right: string) => number;
  valid: (version: string) => string | null;
}

const SUPPORTED_RELEASE_TAG_PATTERN = "v{version}";
const loadedSemver: unknown = createRequire(import.meta.url)("semver");
if (!isSemverApi(loadedSemver)) {
  throw new TypeError("Loaded semver package does not expose the required API");
}
const semver = loadedSemver;

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

  const { expectedTag, version } = await releaseIdentity(root);
  const changelogPath = path.join(root, "CHANGELOG.md");
  const changelogBefore = await readFile(changelogPath, "utf-8");
  const remoteTagsBefore = remoteTagCommits(root);
  const firstRelease = !hasPriorRelease(remoteTagsBefore, version);
  let localTag = localTagCommit(root, expectedTag);
  const remoteTag = remoteTagsBefore.get(expectedTag) ?? null;

  if (remoteTag !== null && remoteTag !== expectedSha) {
    throw conflictingTagError("on origin", expectedTag, expectedSha, remoteTag);
  }
  if (localTag !== null && localTag !== expectedSha) {
    throw conflictingTagError("locally", expectedTag, expectedSha, localTag);
  }

  let message: string;
  if (remoteTag === expectedSha) {
    if (localTag === null) {
      git(root, "fetch", "--no-tags", "origin", `refs/tags/${expectedTag}:refs/tags/${expectedTag}`);
      localTag = localTagCommit(root, expectedTag);
    }
    assertEqual(localTag ?? "missing", expectedSha, `local tag ${expectedTag}`);
    message = `Release tag ${expectedTag} already exists at reviewed commit ${expectedSha}; reusing it.`;
  } else {
    if (localTag !== null) {
      throw new Error(
        `Release tag ${expectedTag} exists locally at reviewed SHA ${expectedSha} but is missing from origin. Refusing to recreate, move, or push it outside Nx.`
      );
    }

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
    message = `Nx created and pushed ${expectedTag} at reviewed commit ${expectedSha}.`;
  }

  assertEqual(await readFile(changelogPath, "utf-8"), changelogBefore, "CHANGELOG.md contents");
  assertClean(root, "after tagging");
  assertEqual(git(root, "rev-parse", "HEAD"), expectedSha, "HEAD after tagging");
  assertEqual(localTagCommit(root, expectedTag) ?? "missing", expectedSha, `local tag ${expectedTag}`);
  assertEqual(remoteTagCommits(root).get(expectedTag) ?? "missing", expectedSha, `remote tag ${expectedTag}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput !== undefined && githubOutput.length > 0) {
    await appendFile(githubOutput, `first_release=${String(firstRelease)}\n`);
  }
  console.log(message);
}

async function releaseIdentity(root: string) {
  const packageJson = parseObject(await readFile(path.join(root, "package.json"), "utf-8"), "package.json");
  const version = stringValue(packageJson.version, "package.json.version");
  if (semver.valid(version) !== version) {
    throw new Error(`package.json.version must contain an exact SemVer release version; found ${version}`);
  }

  const nxJson = parseObject(await readFile(path.join(root, "nx.json"), "utf-8"), "nx.json");
  const release = objectValue(nxJson.release, "nx.json.release");
  const releaseTag = objectValue(release.releaseTag, "nx.json.release.releaseTag");
  const pattern = stringValue(releaseTag.pattern, "nx.json.release.releaseTag.pattern");
  if (pattern !== SUPPORTED_RELEASE_TAG_PATTERN) {
    throw new Error(
      `release-tag helper supports the canonical Nx releaseTag.pattern ${JSON.stringify(SUPPORTED_RELEASE_TAG_PATTERN)}; found ${JSON.stringify(pattern)}`
    );
  }
  return { expectedTag: pattern.replace("{version}", version), version };
}

function hasPriorRelease(remoteTags: ReadonlyMap<string, string>, currentVersion: string) {
  return [...remoteTags.keys()].some((tag) => {
    const version = releaseVersionFromTag(tag);
    return version !== null && semver.compare(version, currentVersion) < 0;
  });
}

function releaseVersionFromTag(tag: string) {
  if (!tag.startsWith("v")) {
    return null;
  }
  const version = tag.slice(1);
  return semver.valid(version) === version ? version : null;
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

function localTagCommit(root: string, tag: string) {
  const reference = `refs/tags/${tag}`;
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", reference], { cwd: root, encoding: "utf-8" });
  if (result.status === 1) {
    return null;
  }
  if (result.status !== 0) {
    throw new Error(`git show-ref failed while inspecting ${reference}: ${(result.stderr ?? "").trim()}`);
  }
  return git(root, "rev-list", "-n", "1", tag);
}

function remoteTagCommits(root: string) {
  const output = git(root, "ls-remote", "--tags", "origin");
  const direct = new Map<string, string>();
  const peeled = new Map<string, string>();
  for (const line of output.split("\n").filter((entry) => entry.length > 0)) {
    const [sha, reference] = line.split("\t");
    if (sha === undefined || reference === undefined || !reference.startsWith("refs/tags/")) {
      continue;
    }
    const rawTag = reference.slice("refs/tags/".length);
    if (rawTag.endsWith("^{}")) {
      peeled.set(rawTag.slice(0, -3), sha);
    } else {
      direct.set(rawTag, sha);
    }
  }
  return new Map([...direct.entries()].map(([tag, sha]) => [tag, peeled.get(tag) ?? sha]));
}

function conflictingTagError(location: string, tag: string, expectedSha: string, actualSha: string) {
  return new Error(
    `Existing release tag ${tag} ${location} does not point to reviewed SHA ${expectedSha}; found ${actualSha}. Refusing to move or recreate the tag.`
  );
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

function objectValue(value: unknown, label: string) {
  return parseObject(JSON.stringify(value), label);
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function isSemverApi(value: unknown): value is SemverApi {
  return (
    value !== null &&
    typeof value === "object" &&
    "compare" in value &&
    typeof value.compare === "function" &&
    "valid" in value &&
    typeof value.valid === "function"
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
