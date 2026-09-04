import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const TYPESCRIPT_API = "6.0.2";
const TYPESCRIPT_NATIVE = "npm:typescript@7.0.2";
const TYPESCRIPT_NATIVE_TSC = "node ../../node_modules/@typescript/native/bin/tsc --noEmit";
const WORKSPACE_MANIFESTS = [
  "apps/web/package.json",
  "packages/backend/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
] as const;
type DependencyField = "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";

test("packed Keenko enforces release-reviewer contracts through the production CLI", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-reviewer-fixes-"));
  try {
    const packDir = path.join(temp, "pack");
    await mkdir(packDir);
    const tarballName = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\n").at(-1);
    if (tarballName === undefined) {
      throw new Error("npm pack did not return a tarball name");
    }
    const tarball = path.join(packDir, tarballName);
    const runner = path.join(temp, "runner");
    await mkdir(runner);
    await writeFile(
      path.join(runner, "package.json"),
      JSON.stringify({ dependencies: { keenko: `file:${tarball}` }, private: true }, null, 2)
    );
    run("bun", ["install"], runner);
    const cli = path.join(runner, "node_modules/keenko/dist/cli/keenko.js");

    const project = path.join(temp, "project");
    run("node", [cli, "create", project], runner, { KEENKO_PACKAGE_SPEC: `file:${tarball}` });
    expect(runOut("git", ["branch", "--show-current"], project).trim()).toBe("main");
    expect(spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: project, encoding: "utf-8" }).status).not.toBe(0);
    expect(object(JSON.parse(await readFile(path.join(project, "nx.json"), "utf-8"))).defaultBase).toBe("main");
    expect(await readFile(path.join(project, ".github/workflows/ci.yml"), "utf-8")).toContain("branches: [main]");

    const rootManifest = object(JSON.parse(await readFile(path.join(project, "package.json"), "utf-8")));
    const rootDevDependencies = object(rootManifest.devDependencies);
    expect(rootDevDependencies.typescript).toBe(TYPESCRIPT_API);
    expect(rootDevDependencies["@typescript/native"]).toBe(TYPESCRIPT_NATIVE);
    for (const file of WORKSPACE_MANIFESTS) {
      const workspace = object(JSON.parse(await readFile(path.join(project, file), "utf-8")));
      const devDependencies = object(workspace.devDependencies);
      const scripts = object(workspace.scripts);
      expect(devDependencies.typescript).toBe(TYPESCRIPT_API);
      expect(devDependencies["@typescript/native"]).toBe(TYPESCRIPT_NATIVE);
      expect(scripts.typecheck).toBe(TYPESCRIPT_NATIVE_TSC);
      if (file !== "apps/web/package.json") {
        expect(scripts.build).toBe(TYPESCRIPT_NATIVE_TSC);
      }
    }

    const projectCli = path.join(project, "node_modules/keenko/dist/cli/keenko.js");
    const installedManifest = path.join(project, "node_modules/keenko/package.json");
    const originalInstalled = await readFile(installedManifest, "utf-8");
    const installedVersion = string(object(JSON.parse(originalInstalled)).version, "installed version");
    expect(runOut("node", [projectCli, "upgrade", installedVersion], project)).toContain("already installed");
    await expectForward(project, projectCli, installedManifest, "1.0.0", "1.0.1");
    await expectForward(project, projectCli, installedManifest, "1.0.0-beta.2", "1.0.0-beta.10");
    await expectForward(project, projectCli, installedManifest, "1.0.0-beta.2", "1.0.0-beta.alpha");
    await expectForward(project, projectCli, installedManifest, "1.0.0-A", "1.0.0-a");
    await expectDowngrade(project, projectCli, installedManifest, "1.0.1", "1.0.0");
    await expectDowngrade(project, projectCli, installedManifest, "1.0.0-a", "1.0.0-A");
    await writeFile(installedManifest, originalInstalled);

    const sharedManifestPath = path.join(project, "packages/shared/package.json");
    const originalShared = await readFile(sharedManifestPath, "utf-8");
    const webName = string(object(JSON.parse(await readFile(path.join(project, "apps/web/package.json"), "utf-8"))).name, "web name");
    await expectManifestBoundary(project, projectCli, sharedManifestPath, originalShared, webName, "dependencies");
    await expectManifestBoundary(project, projectCli, sharedManifestPath, originalShared, webName, "devDependencies");
    await expectManifestBoundary(project, projectCli, sharedManifestPath, originalShared, webName, "optionalDependencies");
    await expectManifestBoundary(project, projectCli, sharedManifestPath, originalShared, webName, "peerDependencies");

    const rootTypeScript = runOut(
      "node",
      [
        "-e",
        'const pkg = require("typescript/package.json"); const ts = require("typescript"); console.log(pkg.name + "|" + pkg.version + "|" + typeof ts.readConfigFile + "|" + ts.version);',
      ],
      project
    );
    expect(rootTypeScript.trim()).toBe("typescript|6.0.2|function|6.0.2");
    const nxTypeScript = runOut(
      "node",
      [
        "-e",
        'const { createRequire } = require("node:module"); const path = require("node:path"); const fromNx = createRequire(path.resolve("node_modules/nx/dist/src/plugins/js/utils/typescript.js")); const ts = fromNx("typescript"); console.log(fromNx.resolve("typescript") + "|" + typeof ts.readConfigFile + "|" + ts.version);',
      ],
      project
    );
    expect(nxTypeScript).toContain("|function|6.0.2");
    expect(runOut("node", ["node_modules/@typescript/native/bin/tsc", "--version"], project).trim()).toBe("Version 7.0.2");

    const uiName = string(object(JSON.parse(await readFile(path.join(project, "packages/ui/package.json"), "utf-8"))).name, "ui name");
    await expectBoundaryLintRecoveryRepeated(project, uiName, 1, 5);

    const agentsPath = path.join(project, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf-8");
    await writeFile(agentsPath, `${agents.trim()}\n\n<!-- keenko:start -->\nstale duplicate\n<!-- keenko:end -->\n`);
    expect(runFailure("node", [projectCli, "check", "--guidance"], project)).toContain("expected exactly one");
    await writeFile(agentsPath, agents);
    run("node", [projectCli, "check", "--guidance"], project);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}, 240_000);

async function expectBoundaryLintRecoveryRepeated(project: string, uiName: string, attempt: number, finalAttempt: number) {
  await expectBoundaryLintRecovery(project, uiName, attempt);
  if (attempt < finalAttempt) {
    await expectBoundaryLintRecoveryRepeated(project, uiName, attempt + 1, finalAttempt);
  }
}

async function expectBoundaryLintRecovery(project: string, uiName: string, attempt: number) {
  const forbiddenImport = path.join(project, "packages/shared/src/forbidden.ts");
  await writeFile(forbiddenImport, `import "${uiName}/lib/utils";\n`);
  expect(runFailure("bun", ["x", "oxlint", "--format", "json", "."], project, { NX_DAEMON: "false" })).toContain(
    "enforce-module-boundaries"
  );
  await unlink(forbiddenImport);
  runCanonicalLint(project, attempt);
}

async function expectManifestBoundary(
  project: string,
  cli: string,
  manifestPath: string,
  originalManifest: string,
  webName: string,
  field: DependencyField
) {
  const shared = object(JSON.parse(originalManifest));
  const dependencies = object(shared[field] ?? {});
  dependencies[webName] = "workspace:*";
  shared[field] = dependencies;
  await writeFile(manifestPath, `${JSON.stringify(shared, null, 2)}\n`);
  expect(runFailure("node", [cli, "check", "--guidance"], project, { NX_DAEMON: "false" })).toContain(
    "Forbidden Keenko manifest dependency"
  );
  await writeFile(manifestPath, originalManifest);
}

async function expectForward(project: string, cli: string, manifest: string, installed: string, target: string) {
  await setInstalledVersion(manifest, installed);
  expect(runOut("node", [cli, "upgrade", target, "--dry-run"], project)).toContain(`${installed} -> ${target}`);
}

async function expectDowngrade(project: string, cli: string, manifest: string, installed: string, target: string) {
  await setInstalledVersion(manifest, installed);
  expect(runFailure("node", [cli, "upgrade", target, "--dry-run"], project)).toContain("does not support automated downgrades");
}

async function setInstalledVersion(manifestPath: string, version: string) {
  const manifest = object(JSON.parse(await readFile(manifestPath, "utf-8")));
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function run(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  execFileSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit" });
}

function runOut(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  return execFileSync(command, args, { cwd, encoding: "utf-8", env: { ...process.env, ...extraEnv } });
}

function runCanonicalLint(project: string, attempt: number) {
  const env = { ...process.env, NX_DAEMON: "false" };
  const result = spawnSync("bun", ["run", "lint"], { cwd: project, encoding: "utf-8", env });
  if (result.status !== 0) {
    const diagnostic = spawnSync("bun", ["x", "oxlint", "--format", "json", "."], {
      cwd: project,
      encoding: "utf-8",
      env,
    });
    throw new Error(
      `boundary cleanup attempt ${attempt}: bun run lint failed with status ${result.status ?? "null"}\n` +
        `lint stdout:\n${result.stdout ?? ""}\n` +
        `lint stderr:\n${result.stderr ?? ""}\n` +
        `diagnostic status: ${diagnostic.status ?? "null"}\n` +
        `diagnostic stdout:\n${diagnostic.stdout ?? ""}\n` +
        `diagnostic stderr:\n${diagnostic.stderr ?? ""}`
    );
  }
}

function runFailure(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8", env: { ...process.env, ...extraEnv } });
  if (result.status === 0) {
    throw new Error(`Expected ${command} ${args.join(" ")} to fail`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}
