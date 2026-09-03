import { expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CURRENT_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const FIRST_PASS_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";
const OLDEST_CHECK = "bun run format:check && bun run lint && bun run typecheck && bun run build";

test("packed Keenko creates and upgrades real consumer fixtures", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-"));
  let registry: TestRegistry | undefined;
  try {
    const packDir = path.join(temp, "pack");
    await mkdir(packDir);
    const tarballName = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\n").at(-1);
    if (tarballName === undefined) {
      throw new Error("npm pack did not return a tarball name");
    }
    const tarball = path.join(packDir, tarballName);
    const packageJson = json(await readFile(path.join(ROOT, "package.json"), "utf-8"));
    const currentVersion = string(packageJson.version, "package.json.version");
    const guidanceVersion = nextPatch(currentVersion);
    const prereleaseVersion = `${guidanceVersion}-beta.1`;
    const nextMajorVersion = nextMajor(currentVersion);
    const baselineATarball = await versionedTarball(tarball, path.join(temp, "baseline-a.tgz"), "0.0.1");
    const baselineBTarball = await versionedTarball(tarball, path.join(temp, "baseline-b.tgz"), "0.0.2");
    const guidanceTarget = await versionedTarball(tarball, path.join(temp, "guidance-target.tgz"), guidanceVersion);
    const targetExtract = path.join(temp, "target-extract");
    await mkdir(targetExtract);
    run("tar", ["-xzf", guidanceTarget, "-C", targetExtract], temp);
    const guidanceFile = path.join(targetExtract, "package/docs/core/verification.md");
    await writeFile(guidanceFile, `${await readFile(guidanceFile, "utf-8")}\nGuidance-only packed fixture marker.\n`);
    run("tar", ["-czf", guidanceTarget, "-C", targetExtract, "package"], temp);
    registry = await startRegistry(temp, packageJson, {
      "0.0.1": baselineATarball,
      "0.0.2": baselineBTarball,
      [currentVersion]: tarball,
      [guidanceVersion]: guidanceTarget,
      [prereleaseVersion]: await versionedTarball(tarball, path.join(temp, "prerelease.tgz"), prereleaseVersion),
      [nextMajorVersion]: await versionedTarball(tarball, path.join(temp, "next-major.tgz"), nextMajorVersion),
    });

    const runner = path.join(temp, "runner");
    await mkdir(runner);
    await writeFile(
      path.join(runner, "package.json"),
      JSON.stringify({ dependencies: { keenko: `file:${tarball}` }, private: true }, null, 2)
    );
    run("bun", ["install"], runner);
    const packedPackage = json(await readFile(path.join(runner, "node_modules/keenko/package.json"), "utf-8"));
    expect(packedPackage.version).toBe(currentVersion);
    expect(record(packedPackage.repository, "packed repository")).toEqual({
      type: "git",
      url: "git+https://github.com/keenko-fr/keenko-playbook.git",
    });
    const cli = path.join(runner, "node_modules/keenko/dist/cli/keenko.js");

    const identity = path.join(temp, "identity");
    run("node", [cli, "create", identity, "--no-install"], runner);
    const identityPackage = json(await readFile(path.join(identity, "package.json"), "utf-8"));
    expect(record(identityPackage.devDependencies, "identity devDependencies").keenko).toBe(currentVersion);

    const occupied = path.join(temp, "occupied");
    await mkdir(occupied);
    await writeFile(path.join(occupied, "sentinel.txt"), "keep me\n");
    const refused = spawnSync("node", [cli, "create", occupied], { cwd: runner, encoding: "utf-8" });
    expect(refused.status).not.toBe(0);
    expect(await readFile(path.join(occupied, "sentinel.txt"), "utf-8")).toBe("keep me\n");
    const occupiedEntries = await readdir(occupied);
    expect(occupiedEntries.toSorted()).toEqual(["sentinel.txt"]);

    const project = path.join(temp, "project");
    run("node", [cli, "create", project], runner, { KEENKO_PACKAGE_SPEC: `file:${tarball}` });
    run("bun", ["install", "--frozen-lockfile"], project);

    await mkdir(path.join(project, "tests"), { recursive: true });
    await writeFile(
      path.join(project, "tests/merge-gate.test.ts"),
      'import { test } from "bun:test";\nimport { writeFileSync } from "node:fs";\n\ntest("merge gate runs tests", () => {\n  writeFileSync(".merge-gate-test-ran", "yes\\n");\n});\n'
    );
    run("bun", ["run", "codegen:check"], project);
    run("bun", ["run", "format"], project);
    run("bun", ["run", "check"], project);
    expect(await readFile(path.join(project, ".merge-gate-test-ran"), "utf-8")).toBe("yes\n");
    await rm(path.join(project, ".merge-gate-test-ran"));

    const agents = await readFile(path.join(project, "AGENTS.md"), "utf-8");
    await writeFile(path.join(project, "AGENTS.md"), agents.replace("<!-- keenko:start -->", "<!-- keenko:broken -->"));
    expect(runFailure("node", [path.join(project, "node_modules/keenko/dist/cli/keenko.js"), "check", "--guidance"], project)).toContain(
      "managed block"
    );
    await writeFile(path.join(project, "AGENTS.md"), agents);

    const routeTree = path.join(project, "apps/web/src/routeTree.gen.ts");
    const routeTreeSource = await readFile(routeTree, "utf-8");
    await writeFile(routeTree, `${routeTreeSource}\n// stale fixture\n`);
    expect(runFailure("bun", ["run", "codegen:check"], project)).toContain("Generated source has drifted");
    await writeFile(routeTree, routeTreeSource);

    run("bun", ["run", "ui", "--", "button", "-y"], project);
    expect(await exists(path.join(project, "packages/ui/src/components/button.tsx"))).toBe(true);
    expect(await exists(path.join(project, "apps/web/src/components/button.tsx"))).toBe(false);
    run("bun", ["run", "codegen:check"], project);
    run("bun", ["run", "format"], project);
    run("bun", ["run", "check"], project);

    gitCommitAll(project, "baseline");
    const projectCli = path.join(project, "node_modules/keenko/dist/cli/keenko.js");
    const statusBeforeNoop = runOut("git", ["status", "--porcelain"], project);
    run("node", [projectCli, "upgrade", currentVersion], project);
    expect(runOut("git", ["status", "--porcelain"], project)).toBe(statusBeforeNoop);

    expect(runFailure("node", [projectCli, "upgrade", "0.0.0", "--dry-run"], project)).toContain("does not support automated downgrades");
    expect(runOut("node", [projectCli, "upgrade", guidanceVersion, "--dry-run"], project)).toContain(`-> ${guidanceVersion}`);
    expect(runOut("node", [projectCli, "upgrade", prereleaseVersion, "--dry-run"], project)).toContain(`-> ${prereleaseVersion}`);
    expect(runOut("node", [projectCli, "upgrade", nextMajorVersion, "--dry-run"], project)).toContain(`-> ${nextMajorVersion}`);
    for (const invalid of [
      "keenko@0.0.0",
      "latest",
      "next",
      `^${guidanceVersion}`,
      `~${guidanceVersion}`,
      "file:../keenko.tgz",
      "../keenko.tgz",
      "github:keenko-fr/keenko-playbook",
    ]) {
      expect(runFailure("node", [projectCli, "upgrade", invalid, "--dry-run"], project)).toContain("must be an exact version");
    }
    expect(runOut("node", [projectCli, "upgrade", "--dry-run"], project, registry.env)).toContain(`-> ${guidanceVersion}`);

    const baselineA = path.join(temp, "baseline-a");
    await makeBaseline(project, baselineA, "baseline-a", "0.0.1", baselineATarball);
    await assertHistoricalBaseline(baselineA, "0.0.1", OLDEST_CHECK, "1.80.0", false);
    const lockBefore = await readFile(path.join(baselineA, "bun.lock"));
    run("node", [cli, "upgrade", currentVersion], baselineA, registry.env);
    expect(await readFile(path.join(baselineA, "bun.lock"))).not.toEqual(lockBefore);
    await assertUpgraded(baselineA, registry.env);

    const baselineB = path.join(temp, "baseline-b");
    await makeBaseline(project, baselineB, "baseline-b", "0.0.2", baselineBTarball);
    await assertHistoricalBaseline(baselineB, "0.0.2", FIRST_PASS_CHECK, "1.81.0", true);
    run("node", [cli, "upgrade", currentVersion], baselineB, registry.env);
    await assertUpgraded(baselineB, registry.env);
    gitCommitAll(baselineB, "upgrade to current");

    const conflict = path.join(temp, "baseline-conflict");
    await makeBaseline(project, conflict, "baseline-b", "0.0.2", baselineBTarball);
    const conflictConfigPath = path.join(conflict, "oxlint.config.ts");
    const conflictConfig = await readFile(conflictConfigPath, "utf-8");
    await writeFile(
      conflictConfigPath,
      conflictConfig.replace(
        '    "eslint/no-console": "off",',
        '    "@nx/enforce-module-boundaries": ["error", { allow: ["custom/**"] }],\n    "eslint/no-console": "off",'
      )
    );
    gitCommitAll(conflict, "customize owned boundary rule");
    expect(runFailure("node", [cli, "upgrade", currentVersion], conflict, registry.env)).toContain("Keenko-owned rule was customized");
    expect(await readFile(conflictConfigPath, "utf-8")).toContain('allow: ["custom/**"]');

    const contextBefore = await readFile(path.join(baselineB, "CONTEXT.md"), "utf-8");
    run("node", [path.join(baselineB, "node_modules/keenko/dist/cli/keenko.js"), "upgrade", guidanceVersion], baselineB, registry.env);
    expect(await readFile(path.join(baselineB, ".keenko/docs/core/verification.md"), "utf-8")).toContain(
      "Guidance-only packed fixture marker."
    );
    expect(await readFile(path.join(baselineB, "CONTEXT.md"), "utf-8")).toBe(contextBefore);
    expect(await exists(path.join(baselineB, "migrations.json"))).toBe(false);
    run("bun", ["install", "--frozen-lockfile"], baselineB, registry.env);
    run("bun", ["run", "check"], baselineB);
  } finally {
    registry?.stop();
    await rm(temp, { force: true, recursive: true });
  }
}, 480_000);

async function makeBaseline(
  source: string,
  target: string,
  fixture: "baseline-a" | "baseline-b",
  installedVersion: string,
  packageTarball: string
) {
  await cp(source, target, {
    filter: (entry) => {
      const relative = path.relative(source, entry).replaceAll("\\", "/");
      const [first] = relative.split("/");
      return ![".git", ".nx", "node_modules"].includes(first ?? "");
    },
    recursive: true,
  });
  const fixtureRoot = path.join(ROOT, "tests/fixtures/pre-v1", fixture);
  await Promise.all([
    cp(path.join(fixtureRoot, "package.json"), path.join(target, "package.json")),
    cp(path.join(fixtureRoot, "oxlint.config.ts.fixture"), path.join(target, "oxlint.config.ts")),
  ]);
  const pkgPath = path.join(target, "package.json");
  const pkg = json(await readFile(pkgPath, "utf-8"));
  const devDependencies = record(pkg.devDependencies, "historical devDependencies");
  expect(devDependencies.keenko).toBe(installedVersion);
  devDependencies.keenko = `file:${packageTarball}`;
  pkg.devDependencies = devDependencies;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  await writeFile(path.join(target, "CONTEXT.md"), "# Project context\n\nPreserve this project-owned baseline customization.\n");
  run("bun", ["install", "--ignore-scripts"], target);
  const installed = json(await readFile(path.join(target, "node_modules/keenko/package.json"), "utf-8"));
  expect(string(installed.version, "installed version")).toBe(installedVersion);
  gitCommitAll(target, `fixture ${installedVersion}`);
}

async function assertHistoricalBaseline(project: string, version: string, check: string, oxlintVersion: string, hasUiOverride: boolean) {
  const pkg = json(await readFile(path.join(project, "package.json"), "utf-8"));
  const scripts = record(pkg.scripts, "historical scripts");
  const devDependencies = record(pkg.devDependencies, "historical devDependencies");
  const oxlint = await readFile(path.join(project, "oxlint.config.ts"), "utf-8");
  expect(devDependencies.keenko).toContain(`${version === "0.0.1" ? "baseline-a" : "baseline-b"}.tgz`);
  expect(scripts.check).toBe(check);
  expect(scripts.custom).toBe("node -e \"console.log('preserved')\"");
  expect(devDependencies.oxlint).toBe(oxlintVersion);
  expect(devDependencies.typescript).toBe("7.0.2");
  expect(devDependencies["@nx/oxlint"]).toBeUndefined();
  expect(devDependencies["@typescript/native"]).toBeUndefined();
  expect(oxlint).not.toContain("@nx/oxlint/boundaries-plugin");
  expect(oxlint).not.toContain("@nx/enforce-module-boundaries");
  expect(oxlint).toContain('"eslint/no-console": "off"');
  expect(oxlint.includes('files: ["packages/ui/**/*"]')).toBe(hasUiOverride);
}

async function assertUpgraded(project: string, registryEnv: Record<string, string>) {
  const pkg = json(await readFile(path.join(project, "package.json"), "utf-8"));
  expect(record(pkg.scripts, "upgraded scripts").check).toBe(CURRENT_CHECK);
  const devDependencies = record(pkg.devDependencies, "upgraded devDependencies");
  expect(devDependencies.oxlint).toBe("1.81.0");
  expect(devDependencies["@effect/tsgo"]).toBe("0.39.1");
  expect(devDependencies["oxlint-plugin-effect"]).toBe("0.12.0");
  expect(devDependencies["@nx/oxlint"]).toBe("23.2.0");
  expect(devDependencies["@typescript/native"]).toBe("npm:typescript@7.0.2");
  expect(devDependencies.typescript).toBe("npm:@typescript/typescript6@6.0.2");
  expect(record(pkg.scripts, "upgraded scripts").custom).toBe("node -e \"console.log('preserved')\"");
  const oxlint = await readFile(path.join(project, "oxlint.config.ts"), "utf-8");
  expect(oxlint).toContain('"@nx/oxlint/boundaries-plugin"');
  expect(oxlint).toContain('"@nx/enforce-module-boundaries"');
  expect(oxlint).toContain('files: ["packages/ui/**/*"]');
  expect(oxlint).toContain('"eslint/sort-keys": "off"');
  expect(oxlint).toContain('"eslint/no-console": "off"');
  expect(await readFile(path.join(project, "CONTEXT.md"), "utf-8")).toContain("Preserve this project-owned baseline customization.");
  expect(await exists(path.join(project, "packages/ui/src/components/button.tsx"))).toBe(true);
  run("bun", ["install", "--frozen-lockfile"], project, registryEnv);
  expect(runOut("bun", ["x", "tsc", "--version"], path.join(project, "packages/shared"))).toContain("7.0.2");
  run("bun", ["run", "check"], project);
}

async function versionedTarball(source: string, target: string, version: string) {
  const unpack = await mkdtemp(path.join(path.dirname(target), "versioned-"));
  run("tar", ["-xzf", source, "-C", unpack], path.dirname(target));
  const packagePath = path.join(unpack, "package/package.json");
  const pkg = json(await readFile(packagePath, "utf-8"));
  pkg.version = version;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  run("tar", ["-czf", target, "-C", unpack, "package"], path.dirname(target));
  await rm(unpack, { force: true, recursive: true });
  return target;
}

interface TestRegistry {
  env: Record<string, string>;
  stop: () => void;
}

async function startRegistry(root: string, manifest: Record<string, unknown>, packages: Record<string, string>): Promise<TestRegistry> {
  const statePath = path.join(root, "registry-state.json");
  await writeFile(statePath, JSON.stringify({ manifest, packages }));

  const child = spawn("bun", [path.join(ROOT, "tests/registry-server.ts"), statePath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  // oxlint-disable-next-line promise/avoid-new -- Child-process startup is exposed through events.
  const origin = await new Promise<string>((resolve, reject) => {
    child.once("error", (error) => {
      reject(error);
    });
    child.once("exit", (code) => {
      reject(new Error(`Test registry exited before startup with code ${code ?? 1}`));
    });
    child.stdout.once("data", (chunk) => {
      resolve(String(chunk).trim());
    });
  });

  return {
    env: {
      BUN_CONFIG_REGISTRY: origin,
      BUN_INSTALL_CACHE_DIR: path.join(root, "bun-cache"),
      NPM_CONFIG_REGISTRY: origin,
    },
    stop() {
      child.kill();
    },
  };
}

function nextPatch(version: string) {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u.exec(version);
  if (match?.groups === undefined) {
    throw new Error(`Expected stable package version, found ${version}`);
  }
  return `${match.groups.major}.${match.groups.minor}.${Number(match.groups.patch) + 1}`;
}

function nextMajor(version: string) {
  const match = /^(?<major>\d+)\.\d+\.\d+$/u.exec(version);
  if (match?.groups === undefined) {
    throw new Error(`Expected stable package version, found ${version}`);
  }
  return `${Number(match.groups.major) + 1}.0.0`;
}

function gitCommitAll(cwd: string, message: string) {
  if (!existsSyncSync(path.join(cwd, ".git"))) {
    run("git", ["init", "--quiet"], cwd);
  }
  run("git", ["config", "user.name", "Keenko fixture"], cwd);
  run("git", ["config", "user.email", "fixture@keenko.invalid"], cwd);
  run("git", ["add", "-A"], cwd);
  run("git", ["commit", "--quiet", "-m", message, "--allow-empty"], cwd);
}

function run(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  execFileSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit" });
}

function runOut(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  return execFileSync(command, args, { cwd, encoding: "utf-8", env: { ...process.env, ...extraEnv } });
}

function runFailure(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8", env: { ...process.env, ...extraEnv } });
  if (result.status === 0) {
    throw new Error(`Expected ${command} ${args.join(" ")} to fail`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function exists(target: string) {
  return (await stat(target).catch(() => null)) !== null;
}

function existsSyncSync(target: string) {
  try {
    execFileSync("test", ["-e", target]);
    return true;
  } catch {
    return false;
  }
}

function json(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  return record(value, "JSON object");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}
