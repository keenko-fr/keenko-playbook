import { expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const BASELINE_A_COMMIT = "f983654297acb84c1e4005ef72a646c7b33ddcfe";
const BASELINE_B_COMMIT = "6303870d1ad0e10a7ef9894ddf6f8e717f467ad3";
const TARGET_VERSION = "0.2.0";
const PROJECT_DEPENDENCY = "keenko-project-fixture";
const CURRENT_CHECK =
  "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_CODEGEN_CHECK = "bun tools/check-generated.ts";
const PROJECT_CONTEXT = "# Project context\n\nPreserve this project-owned context byte-for-byte.\n";
const PROJECT_SOURCE = "export const projectOwned = true;\n";

interface BaselineSnapshot {
  agentsTail: string;
  context: string;
  dependencyRange: string;
  dependencyVersion: string;
  featureSource: string;
}

interface RegistryPackage {
  manifest: Record<string, unknown>;
  versions: Record<string, string>;
}

interface RegistryState {
  packages: Record<string, RegistryPackage>;
}

interface TestRegistry {
  env: Record<string, string>;
  origin: string;
  statePath: string;
  stop: () => void;
}

test("native Nx migrations upgrade both supported historical baselines while preserving project-owned state", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-native-historical-"));
  let registry: TestRegistry | undefined;
  try {
    const currentTarball = await packCurrent(temp);
    const currentManifest = json(await readFile(path.join(ROOT, "package.json"), "utf-8"));
    const targetTarball = await versionedTarball(currentTarball, path.join(temp, `keenko-${TARGET_VERSION}.tgz`), TARGET_VERSION);
    const baselineATarball = await historicalTarball(temp, BASELINE_A_COMMIT, "0.0.1", "baseline-a");
    const baselineBTarball = await historicalTarball(temp, BASELINE_B_COMMIT, "0.0.2", "baseline-b");
    const projectDependency101 = await projectDependencyTarball(temp, "1.0.1");
    const projectDependency102 = await projectDependencyTarball(temp, "1.0.2");

    const state: RegistryState = {
      packages: {
        keenko: {
          manifest: currentManifest,
          versions: {
            "0.0.1": baselineATarball,
            "0.0.2": baselineBTarball,
            [TARGET_VERSION]: targetTarball,
          },
        },
        [PROJECT_DEPENDENCY]: {
          manifest: { main: "index.js", name: PROJECT_DEPENDENCY },
          versions: { "1.0.1": projectDependency101 },
        },
      },
    };
    registry = await startRegistry(temp, state);

    const baselineACli = await installPackedCli(temp, baselineATarball, "baseline-a");
    const baselineBCli = await installPackedCli(temp, baselineBTarball, "baseline-b");

    const baselineA = path.join(temp, "baseline-a-project");
    const beforeA = await makeBaseline(baselineACli, baselineA, "0.0.1", baselineATarball, registry.env);
    const baselineB = path.join(temp, "baseline-b-project");
    const beforeB = await makeBaseline(baselineBCli, baselineB, "0.0.2", baselineBTarball, registry.env);

    state.packages[PROJECT_DEPENDENCY].versions["1.0.2"] = projectDependency102;
    await writeRegistryState(registry.statePath, state);
    const fixtureResponse = await fetch(`${registry.origin}/${PROJECT_DEPENDENCY}`);
    const visibleFixture = record(await fixtureResponse.json(), "project dependency packument");
    expect(Object.keys(record(visibleFixture.versions, "project dependency versions"))).toEqual(["1.0.1", "1.0.2"]);

    await migrateBaseline(baselineA, beforeA, registry.env);
    await migrateBaseline(baselineB, beforeB, registry.env);
  } finally {
    registry?.stop();
    await rm(temp, { force: true, recursive: true });
  }
}, 600_000);

async function makeBaseline(
  cli: string,
  target: string,
  expectedVersion: string,
  packageTarball: string,
  registryEnv: Record<string, string>
): Promise<BaselineSnapshot> {
  run("node", [cli, "create", target, "--no-install"], ROOT);

  const packagePath = path.join(target, "package.json");
  const pkg = json(await readFile(packagePath, "utf-8"));
  const scripts = recordOrEmpty(pkg.scripts, "baseline scripts");
  scripts.custom = "node custom-script.js";
  pkg.scripts = scripts;
  const dependencies = recordOrEmpty(pkg.dependencies, "baseline dependencies");
  dependencies[PROJECT_DEPENDENCY] = "^1.0.0";
  pkg.dependencies = dependencies;
  const devDependencies = recordOrEmpty(pkg.devDependencies, "baseline devDependencies");
  devDependencies.keenko = `file:${packageTarball}`;
  pkg.devDependencies = devDependencies;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  await writeFile(path.join(target, "CONTEXT.md"), PROJECT_CONTEXT);
  const agentsPath = path.join(target, "AGENTS.md");
  const agentsTail = "\nHuman project tail must survive.\n";
  await writeFile(agentsPath, `${await readFile(agentsPath, "utf-8")}${agentsTail}`);
  await writeFile(path.join(target, "custom-script.js"), 'console.log("project-owned");\n');
  await mkdir(path.join(target, "packages/feature/src"), { recursive: true });
  await writeFile(
    path.join(target, "packages/feature/package.json"),
    `${JSON.stringify(
      {
        name: `@historical_${expectedVersion.replaceAll(".", "_")}/feature`,
        nx: { tags: ["type:lib", "scope:shared"] },
        private: true,
        type: "module",
        version: "0.0.0",
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(target, "packages/feature/src/index.ts"), PROJECT_SOURCE);

  const oxlintPath = path.join(target, "oxlint.config.ts");
  const oxlint = await readFile(oxlintPath, "utf-8");
  const customizedOxlint = oxlint.replace(
    '    "eslint/no-plusplus": "off",',
    '    "eslint/no-console": "off",\n    "eslint/no-plusplus": "off",'
  );
  if (customizedOxlint === oxlint) {
    throw new Error("Historical Oxlint fixture is missing the expected project-rule anchor");
  }
  await writeFile(oxlintPath, customizedOxlint);

  run("bun", ["install"], target, registryEnv);
  run("bun", ["x", "oxfmt", "packages/feature/package.json"], target);
  run("bun", ["run", "codegen"], target);
  expect(await installedVersion(target, "keenko")).toBe(expectedVersion);
  expect(await installedVersion(target, PROJECT_DEPENDENCY)).toBe("1.0.1");
  gitCommitAll(target, `historical fixture ${expectedVersion}`);

  return {
    agentsTail,
    context: await readFile(path.join(target, "CONTEXT.md"), "utf-8"),
    dependencyRange: string(
      recordOrEmpty(json(await readFile(packagePath, "utf-8")).dependencies, "baseline dependencies")[PROJECT_DEPENDENCY],
      "dependency range"
    ),
    dependencyVersion: await installedVersion(target, PROJECT_DEPENDENCY),
    featureSource: await readFile(path.join(target, "packages/feature/src/index.ts"), "utf-8"),
  };
}

async function migrateBaseline(root: string, before: BaselineSnapshot, registryEnv: Record<string, string>) {
  run("bun", ["x", "nx", "migrate", `keenko@${TARGET_VERSION}`], root, registryEnv);
  const prepared = json(await readFile(path.join(root, "package.json"), "utf-8"));
  expect(record(prepared.devDependencies, "prepared devDependencies").keenko).toBe(TARGET_VERSION);
  const migrations = await readFile(path.join(root, "migrations.json"), "utf-8");
  expect(migrations).toContain("0.2.0-native-nx-lifecycle");

  run("bun", ["install"], root, registryEnv);
  run("bun", ["x", "nx", "migrate", "--run-migrations"], root, registryEnv);
  run("bun", ["x", "nx", "sync"], root, registryEnv);
  run("bun", ["run", "codegen"], root, registryEnv);

  const migrated = json(await readFile(path.join(root, "package.json"), "utf-8"));
  const scripts = record(migrated.scripts, "migrated scripts");
  expect(scripts.check).toBe(CURRENT_CHECK);
  expect(scripts["codegen:check"]).toBe(CURRENT_CODEGEN_CHECK);
  expect(scripts.custom).toBe("node custom-script.js");
  expect(string(recordOrEmpty(migrated.dependencies, "migrated dependencies")[PROJECT_DEPENDENCY], "migrated dependency range")).toBe(
    before.dependencyRange
  );
  expect(record(migrated.devDependencies, "migrated devDependencies").keenko).toBe(TARGET_VERSION);

  const nx = json(await readFile(path.join(root, "nx.json"), "utf-8"));
  expect(record(nx.sync, "nx sync").globalGenerators).toContain("keenko:sync");
  expect(await readFile(path.join(root, "tools/check-generated.ts"), "utf-8")).toContain("Generated source has drifted at:");
  expect(await readFile(path.join(root, "CONTEXT.md"), "utf-8")).toBe(before.context);
  expect(await readFile(path.join(root, "AGENTS.md"), "utf-8")).toContain(before.agentsTail.trim());
  expect(await readFile(path.join(root, "packages/feature/src/index.ts"), "utf-8")).toBe(before.featureSource);
  expect(await readFile(path.join(root, "custom-script.js"), "utf-8")).toBe('console.log("project-owned");\n');
  expect(await readFile(path.join(root, "oxlint.config.ts"), "utf-8")).toContain('"eslint/no-console": "off"');
  expect(await installedVersion(root, PROJECT_DEPENDENCY)).toBe(before.dependencyVersion);

  run("bun", ["install", "--frozen-lockfile"], root, registryEnv);
  expect(await installedVersion(root, PROJECT_DEPENDENCY)).toBe("1.0.1");
  expect(await installedVersion(root, "keenko")).toBe(TARGET_VERSION);
  run("bun", ["run", "check"], root, { ...registryEnv, NX_DAEMON: "false" });
}

async function packCurrent(root: string) {
  const packDir = path.join(root, "current-pack");
  await mkdir(packDir);
  const name = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\n").at(-1);
  if (name === undefined) {
    throw new Error("npm pack did not return the current Keenko tarball name");
  }
  return path.join(packDir, name);
}

async function historicalTarball(root: string, commit: string, version: string, label: string) {
  const worktree = path.join(root, `${label}-source`);
  const packDir = path.join(root, `${label}-pack`);
  const target = path.join(root, `${label}.tgz`);
  await mkdir(packDir);
  run("git", ["worktree", "add", "--detach", worktree, commit], ROOT);
  try {
    await symlink(path.join(ROOT, "node_modules"), path.join(worktree, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    run("bun", ["run", "build"], worktree);
    const packedName = runOut("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir, "--silent"], worktree)
      .trim()
      .split("\n")
      .at(-1);
    if (packedName === undefined) {
      throw new Error(`npm pack did not return a tarball name for ${commit}`);
    }
    return await versionedTarball(path.join(packDir, packedName), target, version);
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], ROOT);
  }
}

async function installPackedCli(root: string, tarball: string, label: string) {
  const runner = path.join(root, `${label}-runner`);
  await mkdir(runner);
  await writeFile(
    path.join(runner, "package.json"),
    `${JSON.stringify({ dependencies: { keenko: `file:${tarball}` }, private: true }, null, 2)}\n`
  );
  run("bun", ["install"], runner);
  return path.join(runner, "node_modules/keenko/dist/cli/keenko.js");
}

async function projectDependencyTarball(root: string, version: string) {
  const source = path.join(root, `project-dependency-${version}`);
  const packDir = path.join(root, `project-dependency-${version}-pack`);
  await mkdir(source);
  await mkdir(packDir);
  await writeFile(
    path.join(source, "package.json"),
    `${JSON.stringify({ main: "index.js", name: PROJECT_DEPENDENCY, version }, null, 2)}\n`
  );
  await writeFile(path.join(source, "index.js"), `export const version = ${JSON.stringify(version)};\n`);
  const name = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], source).trim().split("\n").at(-1);
  if (name === undefined) {
    throw new Error(`npm pack did not return ${PROJECT_DEPENDENCY}@${version}`);
  }
  return path.join(packDir, name);
}

async function versionedTarball(source: string, target: string, version: string) {
  const unpack = await mkdtemp(path.join(path.dirname(target), "versioned-"));
  try {
    run("tar", ["-xzf", source, "-C", unpack], path.dirname(target));
    const packagePath = path.join(unpack, "package/package.json");
    const pkg = json(await readFile(packagePath, "utf-8"));
    pkg.version = version;
    await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    run("tar", ["-czf", target, "-C", unpack, "package"], path.dirname(target));
    return target;
  } finally {
    await rm(unpack, { force: true, recursive: true });
  }
}

async function startRegistry(root: string, state: RegistryState): Promise<TestRegistry> {
  const statePath = path.join(root, "upgrade-registry-state.json");
  await writeRegistryState(statePath, state);
  const child = spawn("bun", [path.join(ROOT, "tests/upgrade-registry-server.ts"), statePath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  // oxlint-disable-next-line promise/avoid-new -- Test registry startup is exposed through child-process events.
  const origin = await new Promise<string>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      reject(new Error(`Upgrade registry exited before startup with code ${code ?? 1}`));
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
    origin,
    statePath,
    stop() {
      child.kill();
    },
  };
}

async function writeRegistryState(statePath: string, state: RegistryState) {
  await writeFile(statePath, JSON.stringify(state));
}

async function installedVersion(root: string, packageName: string) {
  const pkg = json(await readFile(path.join(root, "node_modules", packageName, "package.json"), "utf-8"));
  return string(pkg.version, `${packageName} installed version`);
}

function gitCommitAll(root: string, message: string) {
  run("git", ["init", "--quiet", "--initial-branch=main"], root);
  run("git", ["config", "user.name", "Keenko fixture"], root);
  run("git", ["config", "user.email", "fixture@keenko.invalid"], root);
  run("git", ["add", "-A"], root);
  run("git", ["commit", "--quiet", "-m", message], root);
}

function run(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  execFileSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit" });
}

function runOut(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  return execFileSync(command, args, { cwd, encoding: "utf-8", env: { ...process.env, ...extraEnv } });
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

function recordOrEmpty(value: unknown, label: string) {
  return value === undefined ? {} : record(value, label);
}

function string(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}
