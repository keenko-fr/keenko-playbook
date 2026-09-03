import { expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CURRENT_CHECK = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";
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
    registry = await startRegistry(temp, currentVersion, tarball, packageJson, guidanceVersion);

    const runner = path.join(temp, "runner");
    await mkdir(runner);
    await writeFile(
      path.join(runner, "package.json"),
      JSON.stringify({ dependencies: { keenko: `file:${tarball}` }, private: true }, null, 2)
    );
    run("bun", ["install"], runner);
    const packedPackage = json(await readFile(path.join(runner, "node_modules/keenko/package.json"), "utf-8"));
    expect(packedPackage.version).toBe(currentVersion);
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
    const statusBeforeNoop = runOut("git", ["status", "--porcelain"], project);
    run("node", [path.join(project, "node_modules/keenko/dist/cli/keenko.js"), "upgrade", currentVersion], project);
    expect(runOut("git", ["status", "--porcelain"], project)).toBe(statusBeforeNoop);

    const baselineA = path.join(temp, "baseline-a");
    await makeBaseline(project, baselineA, "0.0.1", OLDEST_CHECK, "1.80.0");
    const lockBefore = await readFile(path.join(baselineA, "bun.lock"));
    run("node", [cli, "upgrade", currentVersion], baselineA, registry.env);
    expect(await readFile(path.join(baselineA, "bun.lock"))).not.toEqual(lockBefore);
    await assertUpgraded(baselineA, registry.env);

    const baselineB = path.join(temp, "baseline-b");
    await makeBaseline(project, baselineB, "0.0.2", FIRST_PASS_CHECK, "1.81.0");
    run("node", [cli, "upgrade", currentVersion], baselineB, registry.env);
    await assertUpgraded(baselineB, registry.env);
    gitCommitAll(baselineB, "upgrade to current");

    const guidanceTarget = await versionedTarball(tarball, path.join(temp, "guidance-target.tgz"), guidanceVersion);
    const targetExtract = path.join(temp, "target-extract");
    await mkdir(targetExtract);
    run("tar", ["-xzf", guidanceTarget, "-C", targetExtract], temp);
    const guidanceFile = path.join(targetExtract, "package/docs/core/verification.md");
    await writeFile(guidanceFile, `${await readFile(guidanceFile, "utf-8")}\nGuidance-only packed fixture marker.\n`);
    run("tar", ["-czf", guidanceTarget, "-C", targetExtract, "package"], temp);
    const contextBefore = await readFile(path.join(baselineB, "CONTEXT.md"), "utf-8");
    await registry.add(guidanceVersion, guidanceTarget);
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
}, 240_000);

async function makeBaseline(source: string, target: string, installedVersion: string, check: string, oxlint: string) {
  await cp(source, target, {
    filter: (entry) => {
      const relative = path.relative(source, entry).replaceAll("\\", "/");
      const [first] = relative.split("/");
      return ![".git", ".nx", "node_modules"].includes(first ?? "");
    },
    recursive: true,
  });
  const pkgPath = path.join(target, "package.json");
  const pkg = json(await readFile(pkgPath, "utf-8"));
  const scripts = record(pkg.scripts, "baseline scripts");
  scripts.check = check;
  scripts["codegen:check"] = check === FIRST_PASS_CHECK ? "keenko check --guidance" : undefined;
  pkg.scripts = withoutUndefined(scripts);
  const devDependencies = record(pkg.devDependencies, "baseline devDependencies");
  devDependencies.oxlint = oxlint;
  pkg.devDependencies = devDependencies;
  if (oxlint === "1.80.0") {
    devDependencies["@effect/tsgo"] = "0.38.0";
    devDependencies["oxlint-plugin-effect"] = "0.11.0";
  }
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  await writeFile(path.join(target, "CONTEXT.md"), "# Project context\n\nPreserve this project-owned baseline customization.\n");
  run("bun", ["install"], target);
  const installedPath = path.join(target, "node_modules/keenko/package.json");
  const installed = json(await readFile(installedPath, "utf-8"));
  installed.version = installedVersion;
  await writeFile(installedPath, `${JSON.stringify(installed, null, 2)}\n`);
  gitCommitAll(target, `fixture ${installedVersion}`);
}

async function assertUpgraded(project: string, registryEnv: Record<string, string>) {
  const pkg = json(await readFile(path.join(project, "package.json"), "utf-8"));
  expect(record(pkg.scripts, "upgraded scripts").check).toBe(CURRENT_CHECK);
  const devDependencies = record(pkg.devDependencies, "upgraded devDependencies");
  expect(devDependencies.oxlint).toBe("1.81.0");
  expect(devDependencies["@effect/tsgo"]).toBe("0.39.1");
  expect(devDependencies["oxlint-plugin-effect"]).toBe("0.12.0");
  expect(await readFile(path.join(project, "CONTEXT.md"), "utf-8")).toContain("Preserve this project-owned baseline customization.");
  expect(await exists(path.join(project, "packages/ui/src/components/button.tsx"))).toBe(true);
  run("bun", ["install", "--frozen-lockfile"], project, registryEnv);
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
  add: (version: string, tarball: string) => Promise<void>;
  env: Record<string, string>;
  stop: () => void;
}

async function startRegistry(
  root: string,
  version: string,
  tarball: string,
  manifest: Record<string, unknown>,
  futureVersion: string
): Promise<TestRegistry> {
  const statePath = path.join(root, "registry-state.json");
  const packages: Record<string, string> = { [futureVersion]: tarball, [version]: tarball };
  const writeState = async () => {
    await writeFile(statePath, JSON.stringify({ manifest, packages }));
  };
  await writeState();

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
    async add(packageVersion, packageTarball) {
      packages[packageVersion] = packageTarball;
      await writeState();
    },
    env: { BUN_CONFIG_REGISTRY: origin, NPM_CONFIG_REGISTRY: origin },
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

function runOut(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, { cwd, encoding: "utf-8" });
}

function runFailure(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8" });
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

function withoutUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
