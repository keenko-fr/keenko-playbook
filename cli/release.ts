#!/usr/bin/env bun
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const changesetDir = path.join(ROOT, ".changeset");
const gatePath = path.join(ROOT, "release", "v1-gate.json");

type Bump = "patch" | "minor" | "major";
const rank: Record<Bump, number> = { major: 3, minor: 2, patch: 1 };

type JsonObject = Record<string, unknown>;

async function main() {
  const command = process.argv[2] ?? "prepare";
  if (command === "prepare") {
    await prepare();
    return;
  }
  if (command === "verify-gate") {
    await verifyGate();
    return;
  }
  throw new Error(`Unknown release command: ${command}`);
}

async function prepare() {
  const directoryEntries = await readdir(changesetDir);
  const files = directoryEntries.filter((name) => name.endsWith(".md") && name !== "README.md");
  if (files.length === 0) {
    throw new Error("No changesets to release");
  }

  const changesets = await Promise.all(
    files.map(async (name) => ({
      name,
      text: await readFile(path.join(changesetDir, name), "utf-8"),
    }))
  );
  let bump: Bump = "patch";
  const notes: string[] = [];
  for (const { name, text } of changesets) {
    const match = /^---\s*\nbump:\s*(?<bump>patch|minor|major)\s*\n---\s*\n(?<notes>[\s\S]*)$/u.exec(text);
    if (match === null || match.groups === undefined) {
      throw new Error(`Invalid changeset: ${name}`);
    }
    const next = asBump(match.groups.bump, name);
    if (rank[next] > rank[bump]) {
      bump = next;
    }
    notes.push(asString(match.groups.notes, `${name}.notes`).trim());
  }

  const pkgPath = path.join(ROOT, "package.json");
  const pkg = parseJsonObject(await readFile(pkgPath, "utf-8"), "package.json");
  const version = bumpVersion(asString(pkg.version, "package.json.version"), bump);
  pkg.version = version;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const changelogPath = path.join(ROOT, "CHANGELOG.md");
  const current = await readFile(changelogPath, "utf-8");
  const body = `## ${version}\n\n${notes.map((note) => `- ${note}`).join("\n")}\n\n`;
  await writeFile(changelogPath, current.replace(/^# Changelog\s*\n+/mu, `# Changelog\n\n${body}`));
  await Promise.all(files.map((name) => rm(path.join(changesetDir, name))));
  console.log(version);
}

async function verifyGate() {
  const gate = parseJsonObject(await readFile(gatePath, "utf-8"), "release/v1-gate.json");
  if (gate.schemaVersion !== 1 || gate.release !== "v1.0.0") {
    throw new Error("Invalid v1 release gate schema");
  }
  const checks = asObject(gate.checks, "release/v1-gate.json.checks");
  const required = ["freshContextReview", "cleanFixture", "codexDogfood", "claudeDogfood", "anoulaDogfood", "conventionReconciliation"];
  for (const name of required) {
    const check = asObject(checks[name], `release/v1-gate.json.checks.${name}`);
    const evidence = asString(check.evidence, `release/v1-gate.json.checks.${name}.evidence`);
    if (check.status !== "passed" || evidence.trim().length === 0) {
      throw new Error(`Release gate not satisfied: ${name}`);
    }
  }
  console.log("v1 release gate passed");
}

function parseJsonObject(text: string, label: string): JsonObject {
  const value: unknown = JSON.parse(text);
  return asObject(value, label);
}

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object at ${label}`);
  }
  return Object.fromEntries(Object.entries(value));
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected string at ${label}`);
  }
  return value;
}

function asBump(value: string | undefined, label: string): Bump {
  if (value === "patch" || value === "minor" || value === "major") {
    return value;
  }
  throw new Error(`Invalid bump in changeset: ${label}`);
}

function bumpVersion(version: string, bump: Bump) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid version: ${version}`);
  }
  const [major = 0, minor = 0, patch = 0] = parts;
  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
