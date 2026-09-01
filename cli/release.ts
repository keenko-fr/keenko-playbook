#!/usr/bin/env bun
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const changesetDir = join(ROOT, ".changeset");
const gatePath = join(ROOT, "release", "v1-gate.json");

type Bump = "patch" | "minor" | "major";
const rank: Record<Bump, number> = { patch: 1, minor: 2, major: 3 };

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
  const files = (await readdir(changesetDir)).filter((name) => name.endsWith(".md") && name !== "README.md");
  if (!files.length) throw new Error("No changesets to release");
  let bump: Bump = "patch";
  const notes: string[] = [];
  for (const name of files) {
    const text = await readFile(join(changesetDir, name), "utf-8");
    const match = /^---\s*\nbump:\s*(patch|minor|major)\s*\n---\s*\n([\s\S]*)$/u.exec(text);
    if (!match) throw new Error(`Invalid changeset: ${name}`);
    const next = match[1] as Bump;
    if (rank[next] > rank[bump]) bump = next;
    notes.push(match[2].trim());
  }
  const pkgPath = join(ROOT, "package.json");
  const pkg = parseJsonObject(await readFile(pkgPath, "utf-8"), "package.json");
  const version = bumpVersion(asString(pkg.version, "package.json.version"), bump);
  pkg.version = version;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  const changelogPath = join(ROOT, "CHANGELOG.md");
  const current = await readFile(changelogPath, "utf-8");
  const body = `## ${version}\n\n${notes.map((note) => `- ${note}`).join("\n")}\n\n`;
  await writeFile(changelogPath, current.replace(/^# Changelog\s*\n+/mu, `# Changelog\n\n${body}`));
  for (const name of files) await rm(join(changesetDir, name));
  console.log(version);
}

async function verifyGate() {
  const gate = parseJsonObject(await readFile(gatePath, "utf-8"), "release/v1-gate.json");
  if (gate.schemaVersion !== 1 || gate.release !== "v1.0.0") throw new Error("Invalid v1 release gate schema");
  const checks = asObject(gate.checks, "release/v1-gate.json.checks");
  const required = ["freshContextReview", "cleanFixture", "codexDogfood", "claudeDogfood", "anoulaDogfood", "conventionReconciliation"];
  for (const name of required) {
    const check = asObject(checks[name], `release/v1-gate.json.checks.${name}`);
    if (check.status !== "passed" || typeof check.evidence !== "string" || !check.evidence.trim()) {
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
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected object at ${label}`);
  return value as JsonObject;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Expected string at ${label}`);
  return value;
}

function bumpVersion(version: string, bump: Bump) {
  const [major, minor, patch] = version.split(".").map(Number);
  if ([major, minor, patch].some((n) => Number.isNaN(n))) throw new Error(`Invalid version: ${version}`);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
