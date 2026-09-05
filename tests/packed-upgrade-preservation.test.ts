import { expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const TARGET_VERSION = "0.2.0";
const LEGACY_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_CHECK =
  "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const LEGACY_CODEGEN_CHECK = "keenko check --guidance --codegen";
const CURRENT_CODEGEN_CHECK = "bun tools/check-generated.ts";
const PROJECT_CONTEXT = "# Project context\n\nPreserve this project-owned context.\n";

test("native Nx migration moves an existing generated project off keenko check while preserving project-owned state", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-native-migration-"));
  let registry: TestRegistry | undefined;
  try {
    const currentTarball = await packCurrent(temp);
    const packageJson = json(await readFile(path.join(ROOT, "package.json"), "utf-8"));
    const currentVersion = string(packageJson.version, "package.json.version");
    const targetTarball = await versionedTarball(currentTarball, path.join(temp, `keenko-${TARGET_VERSION}.tgz`), TARGET_VERSION);
    registry = await startRegistry(temp, packageJson, {
      [currentVersion]: currentTarball,
      [TARGET_VERSION]: targetTarball,
    });

    run(
      "bunx",
      [
        "--bun",
        "create-nx-workspace@23.2.0",
        "migration_app",
        "--preset=keenko",
        "--packageManager=bun",
        "--nxCloud=skip",
        "--interactive=false",
        "--skipGit",
        "--trustThirdPartyPreset",
      ],
      temp,
      registry.env
    );

    const project = path.join(temp, "migration_app");
    await downgradeLifecycle(project);
    await addProjectState(project);
    run("bun", ["install"], project, registry.env);

    run("bun", ["x", "nx", "migrate", `keenko@${TARGET_VERSION}`], project, registry.env);
    const prepared = json(await readFile(path.join(project, "package.json"), "utf-8"));
    expect(record(prepared.devDependencies, "prepared devDependencies").keenko).toBe(TARGET_VERSION);
    expect(await readFile(path.join(project, "migrations.json"), "utf-8")).toContain("0.2.0-native-nx-lifecycle");

    run("bun", ["install"], project, registry.env);
    run("bun", ["x", "nx", "migrate", "--run-migrations"], project, registry.env);
    run("bun", ["x", "nx", "sync"], project, registry.env);

    const migrated = json(await readFile(path.join(project, "package.json"), "utf-8"));
    const scripts = record(migrated.scripts, "migrated scripts");
    expect(scripts.check).toBe(CURRENT_CHECK);
    expect(scripts["codegen:check"]).toBe(CURRENT_CODEGEN_CHECK);
    expect(scripts.custom).toBe("node custom-script.js");
    expect(record(migrated.devDependencies, "migrated devDependencies").keenko).toBe(TARGET_VERSION);
    const nx = json(await readFile(path.join(project, "nx.json"), "utf-8"));
    expect(record(nx.sync, "nx sync").globalGenerators).toEqual(["project:sync", "keenko:sync"]);
    expect(await readFile(path.join(project, "tools/check-generated.ts"), "utf-8")).toContain("Generated source has drifted at:");
    expect(await readFile(path.join(project, "CONTEXT.md"), "utf-8")).toBe(PROJECT_CONTEXT);
    expect(await readFile(path.join(project, "AGENTS.md"), "utf-8")).toContain("Human project tail.");
    expect(await readFile(path.join(project, "packages/feature/src/index.ts"), "utf-8")).toBe("export const featureReady = true;\n");

    run("bun", ["run", "format"], project);
    run("bun", ["run", "check"], project, { NX_DAEMON: "false" });
  } finally {
    registry?.stop();
    await rm(temp, { force: true, recursive: true });
  }
}, 600_000);

async function downgradeLifecycle(project: string) {
  const packagePath = path.join(project, "package.json");
  const pkg = json(await readFile(packagePath, "utf-8"));
  const scripts = record(pkg.scripts, "legacy scripts");
  scripts.check = LEGACY_CHECK;
  scripts["codegen:check"] = LEGACY_CODEGEN_CHECK;
  scripts.custom = "node custom-script.js";
  pkg.scripts = scripts;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  const nxPath = path.join(project, "nx.json");
  const nx = json(await readFile(nxPath, "utf-8"));
  nx.sync = { globalGenerators: ["project:sync"] };
  await writeFile(nxPath, `${JSON.stringify(nx, null, 2)}\n`);
  await rm(path.join(project, "tools/check-generated.ts"), { force: true });
}

async function addProjectState(project: string) {
  await writeFile(path.join(project, "CONTEXT.md"), PROJECT_CONTEXT);
  const agentsPath = path.join(project, "AGENTS.md");
  await writeFile(agentsPath, `${await readFile(agentsPath, "utf-8")}\nHuman project tail.\n`);
  await mkdir(path.join(project, "packages/feature/src"), { recursive: true });
  await writeFile(
    path.join(project, "packages/feature/package.json"),
    `${JSON.stringify(
      {
        name: "@migration_app/feature",
        nx: { tags: ["type:lib", "scope:shared"] },
        private: true,
        scripts: {},
        type: "module",
        version: "0.0.0",
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(project, "packages/feature/src/index.ts"), "export const featureReady = true;\n");
  await writeFile(path.join(project, "custom-script.js"), "console.log('project-owned');\n");
}

async function packCurrent(root: string) {
  const packDir = path.join(root, "current-pack");
  await mkdir(packDir);
  const name = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\n").at(-1);
  if (name === undefined) {
    throw new Error("npm pack did not return a Keenko tarball name");
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
  const origin = await new Promise<string>((resolve, reject) => {
    child.once("error", reject);
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

function string(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}
