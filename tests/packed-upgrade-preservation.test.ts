import { readJsonFile } from "@nx/devkit";
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dir, "..");
const PUBLISHED_020_COMMIT = "d817cb22787206dbb2bdd423e77fff1cdbd70e8b";

interface MigrationManifest {
  generators: Record<string, { factory: string; version: string }>;
}

interface PackedMigrationResult {
  afterEditorConfig: boolean;
  beforeEditorConfig: boolean;
  currentOxfmt: string;
  customConflict: string;
  customEditorConfig: boolean;
  legacyOxfmt: string;
}

test("the packed post-0.2 migration upgrades the exact published 0.2 formatter baseline without deleting customized files", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-migration-"));
  try {
    const currentTarball = packCurrent(temp);
    const published020Tarball = packPublished020(temp);
    const currentPackage = extractPackage(currentTarball, path.join(temp, "current"));
    const published020Package = extractPackage(published020Tarball, path.join(temp, "published-020"));
    await Promise.all([
      symlink(path.join(ROOT, "node_modules"), path.join(currentPackage, "node_modules"), process.platform === "win32" ? "junction" : "dir"),
      symlink(
        path.join(ROOT, "node_modules"),
        path.join(published020Package, "node_modules"),
        process.platform === "win32" ? "junction" : "dir"
      ),
    ]);

    const migrations = readJsonFile<MigrationManifest>(path.join(currentPackage, "migrations.json"));
    expect(Object.keys(migrations.generators)).toEqual(["0.3.0-oxfmt-ownership"]);
    expect(migrations.generators["0.3.0-oxfmt-ownership"]?.version).toBe("0.3.0");
    expect(migrations.generators["0.3.0-oxfmt-ownership"]?.factory).toBe("./dist/src/migrations/remove-editorconfig.js");

    const result = runPackedMigration(currentPackage, published020Package);
    expect(result.beforeEditorConfig).toBe(true);
    expect(result.legacyOxfmt).toContain("endOfLine: _endOfLine");
    expect(result.legacyOxfmt).toContain("tabWidth: _tabWidth");
    expect(result.legacyOxfmt).toContain("useTabs: _useTabs");
    expect(result.afterEditorConfig).toBe(false);
    expect(result.currentOxfmt).toContain("...ultracite");
    expect(result.currentOxfmt).toContain("...(ultracite.ignorePatterns ?? [])");
    expect(result.currentOxfmt).not.toContain("endOfLine: _endOfLine");
    expect(result.currentOxfmt).not.toContain("tabWidth: _tabWidth");
    expect(result.currentOxfmt).not.toContain("useTabs: _useTabs");
    expect(result.customConflict).toContain(".editorconfig was customized");
    expect(result.customEditorConfig).toBe(true);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}, 120_000);

function runPackedMigration(currentPackage: string, published020Package: string) {
  const presetUrl = pathToFileURL(path.join(published020Package, "dist/src/generators/preset/generator.js")).href;
  const migrationUrl = pathToFileURL(path.join(currentPackage, "dist/src/migrations/remove-editorconfig.js")).href;
  const script = `
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import preset from ${JSON.stringify(presetUrl)};
import migrate from ${JSON.stringify(migrationUrl)};

const tree = createTreeWithEmptyWorkspace();
await preset(tree, { name: "published_020" });
const beforeEditorConfig = tree.exists(".editorconfig");
const legacyOxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
migrate(tree);
const afterEditorConfig = tree.exists(".editorconfig");
const currentOxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";

const customized = createTreeWithEmptyWorkspace();
await preset(customized, { name: "customized_020" });
const editorConfig = customized.read(".editorconfig", "utf-8") ?? "";
customized.write(".editorconfig", editorConfig + "\\n# project-owned change\\n");
let customConflict = "";
try {
  migrate(customized);
} catch (error) {
  customConflict = error instanceof Error ? error.message : String(error);
}

process.stdout.write(JSON.stringify({
  afterEditorConfig,
  beforeEditorConfig,
  currentOxfmt,
  customConflict,
  customEditorConfig: customized.exists(".editorconfig"),
  legacyOxfmt,
}));
`;
  const output = execFileSync("bun", ["-e", script], { cwd: currentPackage, encoding: "utf-8" });
  const parsed: unknown = JSON.parse(output);
  return packedMigrationResult(parsed);
}

function packedMigrationResult(value: unknown): PackedMigrationResult {
  if (!isRecord(value)) {
    throw new TypeError("Packed migration result must be an object");
  }
  const { afterEditorConfig, beforeEditorConfig, currentOxfmt, customConflict, customEditorConfig, legacyOxfmt } = value;
  if (
    typeof afterEditorConfig !== "boolean" ||
    typeof beforeEditorConfig !== "boolean" ||
    typeof currentOxfmt !== "string" ||
    typeof customConflict !== "string" ||
    typeof customEditorConfig !== "boolean" ||
    typeof legacyOxfmt !== "string"
  ) {
    throw new TypeError("Packed migration result has an unexpected shape");
  }
  return { afterEditorConfig, beforeEditorConfig, currentOxfmt, customConflict, customEditorConfig, legacyOxfmt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function packCurrent(root: string) {
  const packDir = path.join(root, "current-pack");
  mkdirSync(packDir, { recursive: true });
  const name = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\n").at(-1);
  if (name === undefined) {
    throw new Error("npm pack did not return the current Keenko tarball name");
  }
  return path.join(packDir, name);
}

function packPublished020(root: string) {
  const worktree = path.join(root, "published-020-source");
  const packDir = path.join(root, "published-020-pack");
  mkdirSync(packDir, { recursive: true });
  run("git", ["worktree", "add", "--detach", worktree, PUBLISHED_020_COMMIT], ROOT);
  try {
    symlinkSync(path.join(ROOT, "node_modules"), path.join(worktree, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    run("bun", ["run", "build"], worktree);
    const name = runOut("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir, "--silent"], worktree).trim().split("\n").at(-1);
    if (name === undefined) {
      throw new Error("npm pack did not return the published 0.2.0 tarball name");
    }
    return path.join(packDir, name);
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], ROOT);
  }
}

function extractPackage(tarball: string, destination: string) {
  mkdirSync(destination, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", destination], ROOT);
  return path.join(destination, "package");
}

function run(command: string, args: string[], cwd: string) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function runOut(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, { cwd, encoding: "utf-8" });
}
