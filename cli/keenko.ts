#!/usr/bin/env node
import { FsTree } from "@nx/devkit/internal";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { format } from "oxfmt";

import { allowedProjectScopes, type ProjectScope } from "../src/boundaries.ts";
import presetGenerator from "../src/generators/preset/generator.ts";
import { verifyGuidance } from "../src/guidance.ts";

interface SemverApi {
  compare: (left: string, right: string) => number;
  major: (version: string) => number;
  prerelease: (version: string) => (number | string)[] | null;
  valid: (version: string) => string | null;
}

const PACKAGE_ROOT = packageRoot();
const loadedSemver: unknown = createRequire(import.meta.url)("semver");
if (!isSemverApi(loadedSemver)) {
  throw new TypeError("Loaded semver package does not expose the required API");
}
const semver = loadedSemver;

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    printHelp();
    return;
  }
  if (command === "create") {
    await create(args);
    return;
  }
  if (command === "upgrade") {
    await upgrade(args);
    return;
  }
  if (command === "check") {
    await check(args);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

async function create(args: string[]) {
  const destination = positional(args, 0, "project");
  rejectUnknownFlags(args, new Set(["--no-install"]));
  preflightRuntime();
  const target = path.resolve(destination);
  await preflightEmptyTarget(target);
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(path.join(parent, ".keenko-create-"));
  try {
    const tree = new FsTree(stage, false);
    await presetGenerator(tree, { name: path.basename(target) });
    await applyChanges(stage, tree);
    if (!args.includes("--no-install")) {
      await useLocalPackageWhenUnpublished(stage);
      await run("bun", ["install"], stage);
      await run("bun", ["run", "codegen"], stage);
    }
    await run("git", ["init", "--quiet", "--initial-branch=main"], stage);
    await rename(stage, target);
  } catch (error) {
    await rm(stage, { force: true, recursive: true });
    throw error;
  }
  console.log(`Created Keenko project at ${target}`);
}

async function upgrade(args: string[]) {
  rejectUnknownFlags(args, new Set(["--dry-run"]));
  preflightRuntime();
  const requested = explicitUpgradeTarget(args);
  const root = process.cwd();
  const installed = await installedVersion(root);
  const target = requested ?? registryVersionForMajor(installed);
  const comparison = semver.compare(target, installed);
  if (comparison < 0) {
    throw new Error(`Keenko does not support automated downgrades: ${installed} -> ${target}`);
  }
  if (comparison === 0) {
    console.log(`Keenko ${installed} is already installed; no files changed.`);
    return;
  }
  if (args.includes("--dry-run")) {
    console.log(`Would ask Nx to migrate keenko ${installed} -> ${target}; no files changed.`);
    return;
  }
  requireCleanGit(root);
  const spec = `keenko@${target}`;
  await nx(["migrate", spec, `--from=keenko@${installed}`, "--interactive=false", "--no-agentic", "--skip-install"], root);
  await run("bun", ["install", "--ignore-scripts"], root);
  await nx(["migrate", "--run-migrations", "--if-exists", "--no-agentic"], root);
  await rm(path.join(root, "node_modules"), { force: true, recursive: true });
  await run("bun", ["install"], root);
  await run(
    process.execPath,
    [
      "-e",
      'const { createRequire } = require("node:module"); const path = require("node:path"); for (const [label, base] of [["root", "package.json"], ["nx", "node_modules/nx/package.json"]]) { const load = createRequire(path.join(process.cwd(), base)); const ts = load("typescript"); console.log("keenko-ts-resolution:" + label + ":" + load.resolve("typescript") + ":" + String(ts.version) + ":" + typeof ts.readConfigFile); }',
    ],
    root
  );
  await formatUpgradeOwnedFiles(root);
  await nx(["generate", "keenko:sync", "--no-interactive"], root);
  await run("bun", ["run", "codegen"], root);
  await rm(path.join(root, "migrations.json"), { force: true });
  console.log(`Upgraded Keenko to ${target}. Review the Git diff before committing.`);
}

async function formatUpgradeOwnedFiles(root: string) {
  await Promise.all(
    ["package.json", "oxlint.config.ts"].map(async (relative) => {
      const target = path.join(root, relative);
      const source = await readFile(target, "utf-8");
      const result = await format(relative, source, { printWidth: 140, sortImports: true, sortPackageJson: true });
      if (result.errors.length > 0) {
        throw new Error(`Cannot format upgraded ${relative}: ${result.errors.map(({ message }) => message).join(", ")}`);
      }
      if (result.code !== source) {
        await writeFile(target, result.code);
      }
    })
  );
}

async function check(args: string[]) {
  rejectUnknownFlags(args, new Set(["--guidance", "--codegen"]));
  preflightRuntime();
  const root = process.cwd();
  const tree = new FsTree(root, false);
  verifyGuidance(tree);
  await verifyTopology(root);
  await verifyManifestDependencies(root);
  if (args.includes("--codegen")) {
    await verifyGeneratedCode(root);
  }
  console.log("Keenko generated guidance, generated code, workspace topology, and project dependencies are valid.");
}

function printHelp() {
  console.log(
    "Keenko\n\n  keenko create <project> [--no-install]\n  keenko upgrade [exact-version] [--dry-run]\n  keenko check [--guidance] [--codegen]"
  );
}

function preflightRuntime() {
  const nodeMajor = Math.trunc(Number(process.versions.node.split(".")[0] ?? "0"));
  if (nodeMajor !== 24) {
    throw new Error(`Keenko tooling requires Node 24; found ${process.versions.node}`);
  }
  const bun = execFileSync("bun", ["--version"], { encoding: "utf-8" }).trim();
  const [major = 0, minor = 0] = bun.split(".").map(Number);
  if (major !== 1 || minor < 4) {
    throw new Error(`Keenko requires Bun >=1.4.0 <2; found ${bun}`);
  }
}

async function preflightEmptyTarget(target: string) {
  try {
    const info = await stat(target);
    const entries = info.isDirectory() ? await readdir(target) : [];
    if (!info.isDirectory() || entries.length > 0) {
      throw new Error(`Refusing to create into non-empty target: ${target}`);
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

async function applyChanges(root: string, tree: FsTree) {
  await Promise.all(
    tree.listChanges().map(async (change) => {
      const target = path.join(root, change.path);
      if (change.type === "DELETE") {
        await rm(target, { force: true, recursive: true });
        return;
      }
      if (change.content === null) {
        return;
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, change.content, change.options);
    })
  );
}

async function useLocalPackageWhenUnpublished(root: string) {
  const pkgPath = path.join(root, "package.json");
  const pkg = parseObject(await readFile(pkgPath, "utf-8"), pkgPath);
  const devDependencies = objectOrEmpty(pkg.devDependencies, "package.json.devDependencies");
  pkg.devDependencies = devDependencies;
  const override = process.env.KEENKO_PACKAGE_SPEC;
  if (override !== undefined && override.length > 0) {
    devDependencies.keenko = override;
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    return;
  }
  const current = packageVersion();
  try {
    execFileSync("npm", ["view", `keenko@${current}`, "version"], { stdio: "ignore" });
  } catch {
    devDependencies.keenko = `file:${PACKAGE_ROOT}`;
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

async function installedVersion(root: string) {
  const packagePath = path.join(root, "node_modules/keenko/package.json");
  const pkg = parseObject(await readFile(packagePath, "utf-8"), packagePath);
  if (typeof pkg.version !== "string") {
    throw new TypeError(`${packagePath}.version must be a string`);
  }
  if (!isExactVersion(pkg.version)) {
    throw new Error(`Expected an exact installed Keenko version, found ${pkg.version}`);
  }
  return pkg.version;
}

function explicitUpgradeTarget(args: string[]) {
  const targets = args.filter((arg) => !arg.startsWith("--"));
  if (targets.length > 1) {
    throw new Error("keenko upgrade accepts at most one exact target version");
  }
  const [target] = targets;
  if (target !== undefined && !isExactVersion(target)) {
    throw new Error(`Keenko upgrade target must be an exact version such as 0.3.0 or 1.1.0-beta.1; found ${target}`);
  }
  return target;
}

function registryVersionForMajor(installed: string) {
  const installedMajor = semver.major(installed);
  const raw = execFileSync("npm", ["view", `keenko@${installedMajor}`, "version", "--json"], { encoding: "utf-8" }).trim();
  const value: unknown = JSON.parse(raw);
  const candidates = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string" && isExactVersion(item) && semver.prerelease(item) === null)
    .filter((item) => semver.major(item) === installedMajor)
    .toSorted(semver.compare);
  const target = candidates.at(-1);
  if (target === undefined) {
    throw new Error(`No stable Keenko release is available on supported major ${installedMajor}`);
  }
  if (semver.compare(target, installed) < 0) {
    throw new Error(`Registry latest for Keenko major ${installedMajor} is older than installed ${installed}`);
  }
  return target;
}

function isExactVersion(value: string) {
  return semver.valid(value) === value && !value.includes("+");
}

function isSemverApi(value: unknown): value is SemverApi {
  return (
    value !== null &&
    typeof value === "object" &&
    "compare" in value &&
    typeof value.compare === "function" &&
    "major" in value &&
    typeof value.major === "function" &&
    "prerelease" in value &&
    typeof value.prerelease === "function" &&
    "valid" in value &&
    typeof value.valid === "function"
  );
}

function requireCleanGit(root: string) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf-8" });
  if (status.trim().length > 0) {
    throw new Error("keenko upgrade requires a clean Git working tree");
  }
}

async function verifyTopology(root: string) {
  const expected = ["apps/web", "packages/backend", "packages/shared", "packages/ui"];
  await Promise.all(
    expected.map(async (directory) => {
      const info = await stat(path.join(root, directory)).catch(() => null);
      if (info?.isDirectory() !== true) {
        throw new Error(`Missing fixed Keenko workspace: ${directory}`);
      }
    })
  );
  const [apps, packages] = await Promise.all([
    workspaceDirectories(path.join(root, "apps")),
    workspaceDirectories(path.join(root, "packages")),
  ]);
  const actual = [...apps.map((name) => `apps/${name}`), ...packages.map((name) => `packages/${name}`)].toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected Keenko workspace topology: ${actual.join(", ")}`);
  }
}

async function verifyManifestDependencies(root: string) {
  const workspacePaths = ["apps/web", "packages/backend", "packages/ui", "packages/shared"];
  const workspaces = await Promise.all(
    workspacePaths.map(async (workspacePath) => {
      const manifestPath = path.join(root, workspacePath, "package.json");
      const manifest = parseObject(await readFile(manifestPath, "utf-8"), manifestPath);
      const name = stringValue(manifest.name, `${workspacePath}/package.json.name`);
      const nxConfig = objectOrEmpty(manifest.nx, `${workspacePath}/package.json.nx`);
      const tags = stringArray(nxConfig.tags, `${workspacePath}/package.json.nx.tags`);
      const scope = projectScope(tags);
      if (scope === null) {
        throw new Error(`Missing Keenko scope tag in ${workspacePath}/package.json`);
      }
      return { manifest, name, scope, workspacePath };
    })
  );
  const scopesByName = new Map(workspaces.map(({ name, scope }) => [name, scope]));
  for (const { manifest, name, scope, workspacePath } of workspaces) {
    const allowed = allowedProjectScopes(scope);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const) {
      const dependencies = objectOrEmpty(manifest[field], `${workspacePath}/package.json.${field}`);
      for (const dependencyName of Object.keys(dependencies)) {
        const targetScope = scopesByName.get(dependencyName);
        if (dependencyName !== name && targetScope !== undefined && !allowed.includes(targetScope)) {
          throw new Error(
            `Forbidden Keenko manifest dependency: ${workspacePath} (${scope}) ${field} -> ${dependencyName} (${targetScope})`
          );
        }
      }
    }
  }
}

function projectScope(tags: readonly string[]): ProjectScope | null {
  for (const scope of ["scope:web", "scope:backend", "scope:ui", "scope:shared"] as const) {
    if (tags.includes(scope)) {
      return scope;
    }
  }
  return null;
}

async function verifyGeneratedCode(root: string) {
  const tempRoot = await mkdtemp(path.join(path.dirname(root), ".keenko-codegen-check-"));
  const stage = path.join(tempRoot, "project");
  try {
    await cp(root, stage, {
      filter: (source) => {
        const relative = path.relative(root, source).replaceAll("\\", "/");
        if (relative === "") {
          return true;
        }
        const [first] = relative.split("/");
        if ([".git", ".nx", "node_modules", "coverage", "dist"].includes(first ?? "")) {
          return false;
        }
        return !isGeneratedOwned(relative);
      },
      recursive: true,
    });
    await symlink(path.join(root, "node_modules"), path.join(stage, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await run("bun", ["run", "codegen"], stage, { NX_DAEMON: "false" });
    const [expected, actual] = await Promise.all([generatedHashes(root), generatedHashes(stage)]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      const paths = new Set([...Object.keys(expected), ...Object.keys(actual)]);
      const changed = [...paths].filter((entry) => expected[entry] !== actual[entry]).toSorted();
      throw new Error(`Generated source has drifted at: ${changed.join(", ")}. Run 'bun run codegen' and review the generated diff.`);
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function isGeneratedOwned(relative: string) {
  if (relative === "apps/web/src/routeTree.gen.ts" || relative.startsWith("apps/web/src/paraglide/")) {
    return true;
  }
  if (relative.startsWith("packages/backend/confect/") && relative !== "packages/backend/confect/.gitkeep") {
    return true;
  }
  if (relative.startsWith("packages/backend/convex/")) {
    return !["packages/backend/convex/tsconfig.json", "packages/backend/convex/convex.config.ts"].includes(relative);
  }
  return false;
}

// oxlint-disable eslint/no-await-in-loop -- Generated paths are read in stable order before hashing.
async function generatedHashes(root: string) {
  const roots = ["apps/web/src/paraglide", "apps/web/src/routeTree.gen.ts", "packages/backend/confect", "packages/backend/convex"];
  const entries: (readonly [string, string])[] = [];
  for (const relative of roots) {
    const target = path.join(root, relative);
    const info = await stat(target).catch(() => null);
    if (info === null) {
      continue;
    }
    const files = info.isDirectory() ? await walkFiles(target) : [target];
    for (const file of files) {
      const rel = path.relative(root, file).replaceAll("\\", "/");
      if (!isGeneratedOwned(rel)) {
        continue;
      }
      entries.push([
        rel,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ]);
    }
  }
  return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}
// oxlint-enable eslint/no-await-in-loop

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return await walkFiles(target);
      }
      return entry.isFile() ? [target] : [];
    })
  );
  return nested.flat();
}

function parseObject(text: string, label: string) {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function objectOrEmpty(value: unknown, label: string) {
  return value === undefined ? {} : parseObject(JSON.stringify(value), label);
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError(`${label} must be an array of strings`);
  }
  return value;
}

async function workspaceDirectories(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function nx(args: string[], cwd: string) {
  const requireFromProject = createRequire(path.join(cwd, "package.json"));
  const nxCli = requireFromProject.resolve("nx");
  await run(process.execPath, [nxCli, ...args], cwd);
}

async function run(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit" });
  // oxlint-disable-next-line promise/avoid-new -- Node child processes expose completion through events.
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (value) => {
      resolve(value ?? 1);
    });
  });
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${code}`);
  }
}

function positional(args: string[], index: number, label: string) {
  const value = args.filter((arg) => !arg.startsWith("--"))[index];
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function rejectUnknownFlags(args: string[], allowed: Set<string>) {
  const unknown = args.find((arg) => arg.startsWith("--") && !allowed.has(arg));
  if (unknown !== undefined) {
    throw new Error(`Unknown option: ${unknown}`);
  }
}

function packageVersion() {
  return execFileSync(
    process.execPath,
    ["-e", `console.log(require(${JSON.stringify(path.join(PACKAGE_ROOT, "package.json"))}).version)`],
    { encoding: "utf-8" }
  ).trim();
}

function packageRoot() {
  const source = path.resolve(import.meta.dirname, "..");
  return existsSync(path.join(source, "package.json")) ? source : path.resolve(source, "..");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
