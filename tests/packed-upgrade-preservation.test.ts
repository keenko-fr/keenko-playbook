import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dir, "..");
const PUBLISHED_020_COMMIT = "d817cb22787206dbb2bdd423e77fff1cdbd70e8b";

test("the packed post-0.2 migration upgrades the exact published 0.2 formatter baseline without deleting customized files", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-migration-"));
  try {
    const currentTarball = packCurrent(temp);
    const published020Tarball = packPublished020(temp);
    const currentPackage = extractPackage(currentTarball, path.join(temp, "current"));
    const published020Package = extractPackage(published020Tarball, path.join(temp, "published-020"));
    await symlink(path.join(ROOT, "node_modules"), path.join(published020Package, "node_modules"), process.platform === "win32" ? "junction" : "dir");

    const migrations = JSON.parse(await readFile(path.join(currentPackage, "migrations.json"), "utf-8")) as {
      generators: Record<string, { factory: string; version: string }>;
    };
    expect(Object.keys(migrations.generators)).toEqual(["0.3.0-oxfmt-ownership"]);
    expect(migrations.generators["0.3.0-oxfmt-ownership"]?.version).toBe("0.3.0");
    expect(migrations.generators["0.3.0-oxfmt-ownership"]?.factory).toBe("./dist/src/migrations/remove-editorconfig.js");

    const preset = (await import(pathToFileURL(path.join(published020Package, "dist/src/generators/preset/generator.js")).href)) as {
      default: (tree: ReturnType<typeof createTreeWithEmptyWorkspace>, options: { name: string }) => Promise<unknown>;
    };
    const migration = (await import(pathToFileURL(path.join(currentPackage, "dist/src/migrations/remove-editorconfig.js")).href)) as {
      default: (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => void;
    };

    const tree = createTreeWithEmptyWorkspace();
    await preset.default(tree, { name: "published_020" });
    expect(tree.exists(".editorconfig")).toBe(true);
    const legacyOxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(legacyOxfmt).toContain("endOfLine: _endOfLine");
    expect(legacyOxfmt).toContain("tabWidth: _tabWidth");
    expect(legacyOxfmt).toContain("useTabs: _useTabs");

    migration.default(tree);
    expect(tree.exists(".editorconfig")).toBe(false);
    const currentOxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(currentOxfmt).toContain("...ultracite");
    expect(currentOxfmt).toContain("...(ultracite.ignorePatterns ?? [])");
    expect(currentOxfmt).not.toContain("endOfLine: _endOfLine");
    expect(currentOxfmt).not.toContain("tabWidth: _tabWidth");
    expect(currentOxfmt).not.toContain("useTabs: _useTabs");

    const customized = createTreeWithEmptyWorkspace();
    await preset.default(customized, { name: "customized_020" });
    const editorConfig = customized.read(".editorconfig", "utf-8") ?? "";
    customized.write(".editorconfig", `${editorConfig}\n# project-owned change\n`);
    expect(() => migration.default(customized)).toThrow(".editorconfig was customized");
    expect(customized.exists(".editorconfig")).toBe(true);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}, 120_000);

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
