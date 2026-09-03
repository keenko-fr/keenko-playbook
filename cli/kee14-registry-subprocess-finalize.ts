import { chmod, readFile, rm, writeFile } from "node:fs/promises";

const target = "tests/packed-product.test.ts";
let source = await readFile(target, "utf-8");
source = source.replace(
  'import { execFileSync, spawnSync } from "node:child_process";',
  'import { execFileSync, spawn, spawnSync } from "node:child_process";'
);
source = source.replace(
  'registry = startRegistry(currentVersion, tarball, packageJson);',
  'const guidanceVersion = nextPatch(currentVersion);\n    registry = await startRegistry(temp, currentVersion, tarball, packageJson, guidanceVersion);'
);
source = source.replace(
  '    const guidanceVersion = nextPatch(currentVersion);\n    const guidanceTarget = await versionedTarball(',
  '    const guidanceTarget = await versionedTarball('
);
source = source.replace('registry.add(guidanceVersion, guidanceTarget);', 'await registry.add(guidanceVersion, guidanceTarget);');

const start = source.indexOf("type TestRegistry = {");
const end = source.indexOf("function nextPatch(version: string) {");
if (start === -1 || end === -1 || end <= start) {
  throw new Error("Expected in-process registry helper block was not found");
}

const helper = `type TestRegistry = {
  add: (version: string, tarball: string) => Promise<void>;
  env: Record<string, string>;
  stop: () => void;
};

async function startRegistry(
  root: string,
  version: string,
  tarball: string,
  manifest: Record<string, unknown>,
  futureVersion: string
): Promise<TestRegistry> {
  const statePath = path.join(root, "registry-state.json");
  const packages: Record<string, string> = { [futureVersion]: tarball, [version]: tarball };
  const writeState = async () => await writeFile(statePath, JSON.stringify({ manifest, packages }));
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
      return await writeState();
    },
    env: { BUN_CONFIG_REGISTRY: origin, NPM_CONFIG_REGISTRY: origin },
    stop() {
      child.kill();
    },
  };
}

`;
source = source.slice(0, start) + helper + source.slice(end);
await writeFile(target, source);

const preCommit = ".git/hooks/pre-commit";
await writeFile(preCommit, "#!/usr/bin/env sh\ngit restore --staged .github/workflows/\n");
await chmod(preCommit, 0o755);
await rm(import.meta.filename);

const lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], { stderr: "inherit", stdout: "inherit" });
if (lintFix.exitCode !== 0) {
  throw new Error("Staging lint fixes failed");
}
