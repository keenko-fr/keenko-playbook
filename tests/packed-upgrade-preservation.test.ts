import { expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const BASELINE_A_COMMIT = "f983654297acb84c1e4005ef72a646c7b33ddcfe";
const BASELINE_B_COMMIT = "6303870d1ad0e10a7ef9894ddf6f8e717f467ad3";
const PROJECT_DEPENDENCY = "keenko-project-fixture";
const START = "<!-- keenko:start -->";
const END = "<!-- keenko:end -->";
const PROJECT_SOURCE = "export interface ProjectOwnedMarker {\n  readonly preserved: true;\n}\n";
const PROJECT_DOCUMENTS = {
  "CONTEXT.md": "# Project context\n\nProject-owned context must survive a Keenko upgrade byte-for-byte.\n",
  "docs/project/architecture.md": "# Project architecture\n\nProject-owned architecture decision: preserve-this-architecture.\n",
  "docs/project/overrides.md": "# Project overrides\n\nProject-owned override: preserve-this-override.\n",
  "docs/project/ui.md": "# Project UI\n\nProject-owned UI decision: preserve-this-ui-guidance.\n",
} as const;

test("packed historical upgrades preserve project customizations and unrelated locked resolutions", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-upgrade-preservation-"));
  let registry: TestRegistry | undefined;
  try {
    const currentTarball = await packCurrent(temp);
    const currentManifest = json(await readFile(path.join(ROOT, "package.json"), "utf-8"));
    const currentVersion = string(currentManifest.version, "current version");
    const baselineATarball = await historicalTarball(temp, BASELINE_A_COMMIT, "0.0.1", "baseline-a");
    const baselineBTarball = await historicalTarball(temp, BASELINE_B_COMMIT, "0.0.2", "baseline-b");
    const projectDependency101 = await projectDependencyTarball(temp, "1.0.1");
    const projectDependency102 = await projectDependencyTarball(temp, "1.0.2");

    registry = await startRegistry(temp, {
      packages: {
        keenko: {
          manifest: currentManifest,
          versions: {
            "0.0.1": baselineATarball,
            "0.0.2": baselineBTarball,
            [currentVersion]: currentTarball,
          },
        },
        [PROJECT_DEPENDENCY]: {
          manifest: { main: "index.js", name: PROJECT_DEPENDENCY },
          versions: { "1.0.1": projectDependency101 },
        },
      },
    });

    const baselineACli = await installPackedCli(temp, baselineATarball, "baseline-a");
    const baselineBCli = await installPackedCli(temp, baselineBTarball, "baseline-b");
    const currentCli = await installPackedCli(temp, currentTarball, "current");

    const currentReference = path.join(temp, "current-reference");
    run("node", [currentCli, "create", currentReference, "--no-install"], ROOT);
    const canonicalRouting = {
      agents: managedParts(await readFile(path.join(currentReference, "AGENTS.md"), "utf-8")).block,
      claude: managedParts(await readFile(path.join(currentReference, "CLAUDE.md"), "utf-8")).block,
    };

    const baselineA = path.join(temp, "baseline-a-project");
    await makeBaseline(baselineACli, baselineA, "0.0.1", baselineATarball, registry.env, false);
    const baselineB = path.join(temp, "baseline-b-project");
    const baselineBCustomizations = await makeBaseline(baselineBCli, baselineB, "0.0.2", baselineBTarball, registry.env, true);
    if (baselineBCustomizations === null) {
      throw new Error("Expected baseline B customization snapshot");
    }

    const beforeA = await baselineSnapshot(baselineA);
    const beforeB = await baselineSnapshot(baselineB);
    expect(beforeA.projectDependencyVersion).toBe("1.0.1");
    expect(beforeB.projectDependencyVersion).toBe("1.0.1");
    expect(beforeA.projectDependencyRange).toBe("^1.0.0");
    expect(beforeB.projectDependencyRange).toBe("^1.0.0");

    await writeRegistryState(registry.statePath, {
      packages: {
        keenko: {
          manifest: currentManifest,
          versions: {
            "0.0.1": baselineATarball,
            "0.0.2": baselineBTarball,
            [currentVersion]: currentTarball,
          },
        },
        [PROJECT_DEPENDENCY]: {
          manifest: { main: "index.js", name: PROJECT_DEPENDENCY },
          versions: { "1.0.1": projectDependency101, "1.0.2": projectDependency102 },
        },
      },
    });
    const fixtureResponse = await fetch(`${registry.origin}/${PROJECT_DEPENDENCY}`);
    const visibleFixture = object(await fixtureResponse.json(), "project dependency packument");
    expect(Object.keys(object(visibleFixture.versions, "project dependency versions"))).toEqual(["1.0.1", "1.0.2"]);

    const upgradeEnv = { ...registry.env, BUN_INSTALL_CACHE_DIR: path.join(temp, "bun-cache-upgrade") };
    run("node", [currentCli, "upgrade", currentVersion], baselineA, upgradeEnv);
    await assertUpgradedBaseline(baselineA, beforeA, currentVersion, upgradeEnv);

    run("node", [currentCli, "upgrade", currentVersion], baselineB, upgradeEnv);
    await assertUpgradedBaseline(baselineB, beforeB, currentVersion, upgradeEnv);
    await assertCustomizationMatrix(baselineB, baselineBCustomizations, canonicalRouting);
  } finally {
    registry?.stop();
    await rm(temp, { force: true, recursive: true });
  }
}, 600_000);

interface RoutingExpectation {
  after: string;
  before: string;
}

interface CustomizationSnapshot {
  agents: RoutingExpectation;
  claude: RoutingExpectation;
}

interface BaselineSnapshot {
  lockfile: Buffer;
  projectDependencyRange: string;
  projectDependencyVersion: string;
}

interface RegistryState {
  packages: Record<
    string,
    {
      manifest: Record<string, unknown>;
      versions: Record<string, string>;
    }
  >;
}

interface TestRegistry {
  env: Record<string, string>;
  origin: string;
  statePath: string;
  stop: () => void;
}

async function makeBaseline(
  cli: string,
  target: string,
  expectedVersion: string,
  packageTarball: string,
  registryEnv: Record<string, string>,
  customize: boolean
): Promise<CustomizationSnapshot | null> {
  run("node", [cli, "create", target, "--no-install"], ROOT);

  const packagePath = path.join(target, "package.json");
  const pkg = json(await readFile(packagePath, "utf-8"));
  const scripts = recordOrEmpty(pkg.scripts, "baseline scripts");
  scripts.custom = "node -e \"console.log('preserved')\"";
  pkg.scripts = scripts;
  const dependencies = recordOrEmpty(pkg.dependencies, "baseline dependencies");
  dependencies[PROJECT_DEPENDENCY] = "^1.0.0";
  pkg.dependencies = dependencies;
  const devDependencies = recordOrEmpty(pkg.devDependencies, "baseline devDependencies");
  devDependencies.keenko = `file:${packageTarball}`;
  pkg.devDependencies = devDependencies;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  let customizations: CustomizationSnapshot | null = null;
  if (customize) {
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
    await writeFile(path.join(target, "packages/shared/src/project-owned.ts"), PROJECT_SOURCE);
    await Promise.all(
      Object.entries(PROJECT_DOCUMENTS).map(async ([relative, content]) => {
        await writeFile(path.join(target, relative), content);
      })
    );
    customizations = {
      agents: await customizeRoutingFile(target, "AGENTS.md", "AGENTS"),
      claude: await customizeRoutingFile(target, "CLAUDE.md", "CLAUDE"),
    };
  }

  run("bun", ["install"], target, registryEnv);
  run("bun", ["run", "codegen"], target);
  expect(await installedVersion(target, "keenko")).toBe(expectedVersion);
  expect(await installedVersion(target, PROJECT_DEPENDENCY)).toBe("1.0.1");
  gitCommitAll(target, `fixture ${expectedVersion}`);
  return customizations;
}

async function customizeRoutingFile(root: string, file: string, label: string): Promise<RoutingExpectation> {
  const target = path.join(root, file);
  const original = await readFile(target, "utf-8");
  const originalParts = managedParts(original);
  const customized = `# Human ${label} preface\n\n${originalParts.before}${originalParts.block}${originalParts.after}\nHuman ${label} suffix must survive.\n`;
  await writeFile(target, customized);
  const parts = managedParts(customized);
  return { after: parts.after, before: parts.before };
}

async function baselineSnapshot(root: string): Promise<BaselineSnapshot> {
  const pkg = json(await readFile(path.join(root, "package.json"), "utf-8"));
  const dependencies = recordOrEmpty(pkg.dependencies, "baseline dependencies");
  return {
    lockfile: await readFile(path.join(root, "bun.lock")),
    projectDependencyRange: string(dependencies[PROJECT_DEPENDENCY], "project dependency range"),
    projectDependencyVersion: await installedVersion(root, PROJECT_DEPENDENCY),
  };
}

async function assertUpgradedBaseline(root: string, before: BaselineSnapshot, currentVersion: string, registryEnv: Record<string, string>) {
  const pkg = json(await readFile(path.join(root, "package.json"), "utf-8"));
  const dependencies = recordOrEmpty(pkg.dependencies, "upgraded dependencies");
  const devDependencies = recordOrEmpty(pkg.devDependencies, "upgraded devDependencies");
  const scripts = recordOrEmpty(pkg.scripts, "upgraded scripts");

  expect(string(dependencies[PROJECT_DEPENDENCY], "upgraded project dependency range")).toBe(before.projectDependencyRange);
  expect(scripts.custom).toBe("node -e \"console.log('preserved')\"");
  expect(devDependencies.typescript).toBe("npm:@typescript/typescript6@6.0.2");
  expect(devDependencies["@typescript/native"]).toBe("npm:typescript@7.0.2");
  expect(devDependencies["@nx/oxlint"]).toBe("23.2.0");
  expect(await readFile(path.join(root, "bun.lock"))).not.toEqual(before.lockfile);
  expect(await installedVersion(root, PROJECT_DEPENDENCY)).toBe(before.projectDependencyVersion);
  expect(await installedVersion(root, "keenko")).toBe(currentVersion);

  run("bun", ["install", "--frozen-lockfile"], root, registryEnv);
  expect(await installedVersion(root, PROJECT_DEPENDENCY)).toBe("1.0.1");
  expect(await installedVersion(root, "keenko")).toBe(currentVersion);
  run("bun", ["run", "check"], root);
}

async function assertCustomizationMatrix(root: string, expected: CustomizationSnapshot, canonical: { agents: string; claude: string }) {
  const oxlint = await readFile(path.join(root, "oxlint.config.ts"), "utf-8");
  expect(oxlint).toContain('"eslint/no-console": "off"');
  expect(oxlint).toContain('"@nx/enforce-module-boundaries"');
  expect(await readFile(path.join(root, "packages/shared/src/project-owned.ts"), "utf-8")).toBe(PROJECT_SOURCE);
  await Promise.all(
    Object.entries(PROJECT_DOCUMENTS).map(async ([relative, content]) => {
      expect(await readFile(path.join(root, relative), "utf-8")).toBe(content);
    })
  );

  await assertRoutingFile(root, "AGENTS.md", expected.agents, canonical.agents);
  await assertRoutingFile(root, "CLAUDE.md", expected.claude, canonical.claude);
}

async function assertRoutingFile(root: string, file: string, expected: RoutingExpectation, canonicalBlock: string) {
  const source = await readFile(path.join(root, file), "utf-8");
  expect(occurrences(source, START)).toBe(1);
  expect(occurrences(source, END)).toBe(1);
  const parts = managedParts(source);
  expect(parts.before).toBe(expected.before);
  expect(parts.after).toBe(expected.after);
  expect(parts.block).toBe(canonicalBlock);
}

function managedParts(source: string) {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 || end === -1 || end < start || occurrences(source, START) !== 1 || occurrences(source, END) !== 1) {
    throw new Error("Expected exactly one Keenko managed block");
  }
  const blockEnd = end + END.length;
  return { after: source.slice(blockEnd), before: source.slice(0, start), block: source.slice(start, blockEnd) };
}

function occurrences(source: string, marker: string) {
  return source.split(marker).length - 1;
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
    const name = runOut("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir, "--silent"], worktree).trim().split("\n").at(-1);
    if (name === undefined) {
      throw new Error(`npm pack did not return a tarball name for ${commit}`);
    }
    return await versionedTarball(path.join(packDir, name), target, version);
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], ROOT);
  }
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

async function projectDependencyTarball(root: string, version: string) {
  const source = path.join(root, `project-dependency-${version}`);
  const packDir = path.join(root, `project-dependency-${version}-pack`);
  await mkdir(source);
  await mkdir(packDir);
  await writeFile(
    path.join(source, "package.json"),
    `${JSON.stringify({ main: "index.js", name: PROJECT_DEPENDENCY, version }, null, 2)}\n`
  );
  await writeFile(path.join(source, "index.js"), `module.exports = ${JSON.stringify(version)};\n`);
  const name = runOut("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir, "--silent"], source).trim().split("\n").at(-1);
  if (name === undefined) {
    throw new Error(`npm pack did not return the project dependency ${version} tarball name`);
  }
  return path.join(packDir, name);
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

async function startRegistry(root: string, state: RegistryState): Promise<TestRegistry> {
  const statePath = path.join(root, "upgrade-registry-state.json");
  await writeRegistryState(statePath, state);
  const child = spawn("bun", [path.join(ROOT, "tests/upgrade-registry-server.ts"), statePath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  // oxlint-disable-next-line promise/avoid-new -- Child-process startup is exposed through events.
  const origin = await new Promise<string>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      reject(new Error(`Upgrade test registry exited before startup with code ${code ?? 1}`));
    });
    child.stdout.once("data", (chunk) => {
      resolve(String(chunk).trim());
    });
  });
  return {
    env: {
      BUN_CONFIG_REGISTRY: origin,
      BUN_INSTALL_CACHE_DIR: path.join(root, "bun-cache-initial"),
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
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function installedVersion(root: string, packageName: string) {
  const pkg = json(await readFile(path.join(root, "node_modules", packageName, "package.json"), "utf-8"));
  return string(pkg.version, `${packageName} installed version`);
}

function gitCommitAll(cwd: string, message: string) {
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

function json(text: string): Record<string, unknown> {
  return object(JSON.parse(text), "JSON object");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function recordOrEmpty(value: unknown, label: string): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  const record = object(value, label);
  if (!Object.values(record).every((entry) => typeof entry === "string")) {
    throw new TypeError(`${label} must contain only strings`);
  }
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, String(entry)]));
}

function string(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}
