export const GENERATED_CODE_CHECK = `import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";

const IGNORED_GENERATED_ROOTS = ["apps/web/src/paraglide"] as const;
const TRACKED_GENERATED_ROOTS = ["apps/web/src/routeTree.gen.ts", "packages/backend/confect", "packages/backend/convex"] as const;

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

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return await walkFiles(target);
      }
      return entry.isFile() ? [target] : [];
    })
  );
  return nested.flat();
}

// oxlint-disable eslint/no-await-in-loop -- Generated paths are read in stable order before hashing.
async function generatedHashes(projectRoot: string) {
  const entries: (readonly [string, string])[] = [];
  for (const relative of TRACKED_GENERATED_ROOTS) {
    const target = path.join(projectRoot, relative);
    const info = await stat(target).catch(() => null);
    if (info === null) {
      continue;
    }
    const files = info.isDirectory() ? await walkFiles(target) : [target];
    for (const file of files) {
      const rel = path.relative(projectRoot, file).split(path.sep).join("/");
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

async function materializeIgnoredGenerated(stageRoot: string, projectRoot: string) {
  await Promise.all(
    IGNORED_GENERATED_ROOTS.map(async (relative) => {
      const source = path.join(stageRoot, relative);
      const sourceInfo = await stat(source).catch(() => null);
      if (sourceInfo?.isDirectory() !== true) {
        throw new Error(\`Codegen did not materialize ignored compiler output: \${relative}\`);
      }
      const target = path.join(projectRoot, relative);
      await rm(target, { force: true, recursive: true });
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true });
    })
  );
}

async function runCodegen(cwd: string) {
  const child = spawn("bun", ["run", "codegen"], { cwd, env: { ...process.env, NX_DAEMON: "false" }, stdio: "inherit" });
  // oxlint-disable-next-line promise/avoid-new -- Child processes expose completion through events.
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (value) => {
      resolve(value ?? 1);
    });
  });
  if (code !== 0) {
    throw new Error(\`bun run codegen failed with exit code \${code}\`);
  }
}

const root = process.cwd();
const tempRoot = await mkdtemp(path.join(path.dirname(root), ".keenko-codegen-check-"));
const stage = path.join(tempRoot, "project");

try {
  await cp(root, stage, {
    filter: (source) => {
      const relative = path.relative(root, source).split(path.sep).join("/");
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
  await runCodegen(stage);
  const [expected, actual] = await Promise.all([generatedHashes(root), generatedHashes(stage)]);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const paths = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    const changed = [...paths].filter((entry) => expected[entry] !== actual[entry]).toSorted();
    throw new Error(\`Generated source has drifted at: \${changed.join(", ")}. Run 'bun run codegen' and review the generated diff.\`);
  }
  await materializeIgnoredGenerated(stage, root);
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}
`;
