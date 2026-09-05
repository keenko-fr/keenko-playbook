import { expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CURRENT_CHECK =
  "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_CODEGEN_CHECK = "bun tools/check-generated.ts";
const CREATE_NX_WORKSPACE_VERSION = "23.2.0";

function createWorkspaceArgs(name: string) {
  return [
    `create-nx-workspace@${CREATE_NX_WORKSPACE_VERSION}`,
    name,
    "--preset=keenko",
    "--packageManager=bun",
    "--nxCloud=skip",
    "--interactive=false",
    "--trustThirdPartyPreset",
  ];
}

test("packed Keenko works through native Nx creation, synchronization, boundaries, and merge-ready verification", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-native-"));
  let registry: TestRegistry | undefined;
  try {
    const tarball = await packCurrent(temp);
    const packageJson = json(await readFile(path.join(ROOT, "package.json"), "utf-8"));
    const currentVersion = string(packageJson.version, "package.json.version");
    registry = await startRegistry(temp, packageJson, { [currentVersion]: tarball });

    const occupied = path.join(temp, "occupied");
    await mkdir(occupied);
    await writeFile(path.join(occupied, "sentinel.txt"), "keep me\n");
    const occupiedFailure = runFailure("bunx", createWorkspaceArgs("occupied"), temp, registry.env);
    expect(occupiedFailure).toContain("already exists");
    expect(await readFile(path.join(occupied, "sentinel.txt"), "utf-8")).toBe("keep me\n");
    const occupiedEntries = await readdir(occupied);
    expect(occupiedEntries.toSorted()).toEqual(["sentinel.txt"]);

    run("bunx", createWorkspaceArgs("my_app"), temp, registry.env);

    const project = path.join(temp, "my_app");
    expect(await exists(path.join(project, ".git"))).toBe(true);
    expect(runOut("git", ["symbolic-ref", "--short", "HEAD"], project).trim()).toBe("main");
    expect(spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: project, encoding: "utf-8" }).status).not.toBe(0);
    const root = json(await readFile(path.join(project, "package.json"), "utf-8"));
    const scripts = record(root.scripts, "root scripts");
    expect(root.name).toBe("my_app");
    expect(record(root.devDependencies, "root devDependencies").keenko).toBe(currentVersion);
    expect(scripts.check).toBe(CURRENT_CHECK);
    expect(scripts["codegen:check"]).toBe(CURRENT_CODEGEN_CHECK);
    expect(json(await readFile(path.join(project, "apps/web/package.json"), "utf-8")).name).toBe("@my_app/web");
    expect(json(await readFile(path.join(project, "packages/backend/package.json"), "utf-8")).name).toBe("@my_app/backend");
    expect(json(await readFile(path.join(project, "packages/ui/package.json"), "utf-8")).name).toBe("@my_app/ui");
    expect(json(await readFile(path.join(project, "packages/shared/package.json"), "utf-8")).name).toBe("@my_app/shared");
    expect(await exists(path.join(project, "node_modules/.bin/keenko"))).toBe(false);

    const nx = json(await readFile(path.join(project, "nx.json"), "utf-8"));
    expect(record(nx.sync, "nx sync").globalGenerators).toEqual(["keenko:sync"]);
    run("bun", ["run", "check"], project, { NX_DAEMON: "false" });

    run("bun", ["run", "ui", "--", "button", "-y"], project, registry.env);
    expect(await exists(path.join(project, "packages/ui/src/components/button.tsx"))).toBe(true);
    expect(await exists(path.join(project, "apps/web/src/components/button.tsx"))).toBe(false);
    run("bun", ["run", "check"], project, { NX_DAEMON: "false" });

    const sharedManifestPath = path.join(project, "packages/shared/package.json");
    const sharedManifestSource = await readFile(sharedManifestPath, "utf-8");
    const sharedManifest = json(sharedManifestSource);
    sharedManifest.dependencies = {
      ...recordOrEmpty(sharedManifest.dependencies, "shared dependencies"),
      "@my_app/web": "workspace:*",
    };
    await writeFile(sharedManifestPath, `${JSON.stringify(sharedManifest, null, 2)}\n`);
    const manifestBoundaryFailure = runFailure("bun", ["run", "check"], project, { NX_DAEMON: "false" });
    expect(manifestBoundaryFailure).toContain(
      "Forbidden Keenko manifest dependency: packages/shared (scope:shared) dependencies -> @my_app/web (scope:web)"
    );
    await writeFile(sharedManifestPath, sharedManifestSource);
    run("bun", ["x", "nx", "reset"], project, registry.env);

    const managedGuidance = path.join(project, ".keenko/docs/core/verification.md");
    await writeFile(managedGuidance, `${await readFile(managedGuidance, "utf-8")}\nStale generated guidance.\n`);
    expect(runFailure("bun", ["x", "nx", "sync:check"], project, registry.env)).toContain("out of sync");
    run("bun", ["x", "nx", "sync"], project, registry.env);
    expect(await readFile(managedGuidance, "utf-8")).not.toContain("Stale generated guidance.");
    run("bun", ["x", "nx", "sync:check"], project, registry.env);

    const forbiddenImport = path.join(project, "packages/shared/src/forbidden.ts");
    await writeFile(forbiddenImport, 'import "@my_app/ui/lib/utils";\n');
    const boundaryFailure = runFailure("bun", ["run", "lint"], project, { NX_DAEMON: "false" });
    expect(boundaryFailure).toContain("enforce-module-boundaries");
    expect(boundaryFailure).not.toContain("No cached ProjectGraph is available. The rule will be skipped.");
    await unlink(forbiddenImport);

    await mkdir(path.join(project, "packages/feature/src"), { recursive: true });
    await writeFile(
      path.join(project, "packages/feature/package.json"),
      `${JSON.stringify(
        {
          name: "@my_app/feature",
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
    run("bun", ["install"], project, registry.env);
    run("bun", ["run", "format"], project);
    run("bun", ["run", "check"], project, { NX_DAEMON: "false" });

    run("git", ["config", "user.name", "Keenko fixture"], project);
    run("git", ["config", "user.email", "fixture@keenko.invalid"], project);
    run("git", ["add", "-A"], project);
    run("git", ["commit", "--quiet", "-m", "native Nx fixture"], project);
    const checkout = path.join(temp, "clean-checkout");
    run("git", ["clone", "--quiet", project, checkout], temp);
    run("bun", ["install", "--frozen-lockfile"], checkout, registry.env);
    run("bun", ["run", "check"], checkout, { NX_DAEMON: "false" });
    expect(runOut("git", ["status", "--porcelain"], checkout)).toBe("");
  } finally {
    registry?.stop();
    await rm(temp, { force: true, recursive: true });
  }
}, 600_000);

async function packCurrent(root: string) {
  const packDir = path.join(root, "pack");
  await mkdir(packDir);
  const name = runOut("npm", ["pack", "--pack-destination", packDir, "--silent"], ROOT).trim().split("\n").at(-1);
  if (name === undefined) {
    throw new Error("npm pack did not return a Keenko tarball name");
  }
  return path.join(packDir, name);
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
  // oxlint-disable-next-line promise/avoid-new -- Test registry startup is exposed through child-process events.
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
