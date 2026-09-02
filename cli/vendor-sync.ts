#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";

const { dirname, join, relative, resolve } = path;

const ROOT = resolve(import.meta.dirname, "..");
const vendorRoot = join(ROOT, "vendor");
const sourcesPath = join(vendorRoot, "sources.json");
const update = process.argv.includes("--update");
const checkOnly = process.argv.includes("--check");

interface Source {
  id: string;
  repository: string;
  upstreamRef: string;
  commit: string | null;
  tree: string;
  rootPath: string;
  mode: "vendor" | "external";
  license: string | null;
  includes: string[];
}
interface Manifest {
  schemaVersion: number;
  sources: Source[];
}
interface GitCommitResponse {
  sha: string;
  commit: { tree: { sha: string } };
}
interface GitTreeEntry {
  path: string;
  type: string;
  sha: string;
}
interface GitTreeResponse {
  tree: GitTreeEntry[];
}
interface GitBlobResponse {
  encoding: string;
  content: string;
}

async function main() {
  const manifest = parseManifest(JSON.parse(await readFile(sourcesPath, "utf-8")));
  if (update) {
    await Promise.all(
      manifest.sources.map(async (source) => {
        await updatePin(source);
      })
    );
  }

  const stageRoot = await mkdtemp(join(vendorRoot, ".sync-"));
  try {
    const vendorSources = manifest.sources.filter(({ mode }) => mode === "vendor");
    await Promise.all(
      vendorSources.map(async (source) => {
        if (source.commit === null) {
          throw new Error(`Refusing to vendor ${source.id} without a pinned commit`);
        }
        if (source.license === null) {
          throw new Error(`Refusing to vendor ${source.id} without a declared license`);
        }
        await materialize(source, join(stageRoot, source.id));
      })
    );
    for (const source of manifest.sources.filter(({ mode }) => mode === "external")) {
      console.log(`skip ${source.id}: external first-party source (not redistributed)`);
    }

    if (checkOnly) {
      await Promise.all(
        vendorSources.map(async (source) => {
          const current = join(vendorRoot, source.id);
          const staged = join(stageRoot, source.id);
          if (!(await exists(current))) {
            throw new Error(`Missing committed vendor snapshot ${source.id}`);
          }
          const [currentHashes, stagedHashes] = await Promise.all([hashTree(current), hashTree(staged)]);
          if (JSON.stringify(currentHashes) !== JSON.stringify(stagedHashes)) {
            throw new Error(`Committed vendor snapshot differs from pinned upstream source: ${source.id}`);
          }
        })
      );
      console.log(`Vendor snapshots match pinned upstream sources.`);
      return;
    }

    await replaceAll(manifest, stageRoot);
  } finally {
    await rm(stageRoot, { force: true, recursive: true });
  }
}

async function updatePin(source: Source) {
  const commit = await apiJson<GitCommitResponse>(`https://api.github.com/repos/${source.repository}/commits/${source.upstreamRef}`);
  source.commit = commit.sha;
  let tree = commit.commit.tree.sha;
  if (source.rootPath) {
    tree = await subtreeSha(source.repository, tree, source.rootPath);
  }
  source.tree = tree;
}

async function subtreeSha(repo: string, rootTree: string, path: string) {
  let tree = rootTree;
  for (const part of path.split("/").filter(Boolean)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each tree lookup depends on the SHA resolved by the previous path segment.
    const data = await apiJson<GitTreeResponse>(`https://api.github.com/repos/${repo}/git/trees/${tree}`);
    const entry = data.tree.find((item) => item.type === "tree" && item.path === part);
    if (!entry) {
      throw new Error(`Could not resolve ${path} in ${repo}`);
    }
    tree = entry.sha;
  }
  return tree;
}

async function materialize(source: Source, target: string) {
  await mkdir(target, { recursive: true });
  const tree = await apiJson<GitTreeResponse>(`https://api.github.com/repos/${source.repository}/git/trees/${source.tree}?recursive=1`);
  const blobs = tree.tree.filter((entry) => entry.type === "blob" && included(entry.path, source.includes));
  await Promise.all(
    blobs.map(async (entry) => {
      const blob = await apiJson<GitBlobResponse>(`https://api.github.com/repos/${source.repository}/git/blobs/${entry.sha}`);
      if (blob.encoding !== "base64") {
        throw new Error(`Unsupported blob encoding for ${source.id}:${entry.path}`);
      }
      const filePath = join(target, entry.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, Buffer.from(blob.content.replaceAll("\n", ""), "base64"));
    })
  );
  const files = await hashTree(target, new Set(["VENDORED.json"]));
  await writeFile(
    join(target, "VENDORED.json"),
    `${JSON.stringify(
      {
        commit: source.commit,
        files,
        license: source.license,
        repository: source.repository,
        tree: source.tree,
      },
      null,
      2
    )}\n`
  );
  console.log(`staged ${source.id}: ${blobs.length} upstream files`);
}

// oxlint-disable eslint/no-await-in-loop -- The replacement transaction and rollback deliberately mutate vendor paths in deterministic sequence.
async function replaceAll(manifest: Manifest, stageRoot: string) {
  const backupRoot = await mkdtemp(join(vendorRoot, ".backup-"));
  const vendorSources = manifest.sources.filter(({ mode }) => mode === "vendor");
  try {
    for (const source of vendorSources) {
      const current = join(vendorRoot, source.id);
      if (await exists(current)) {
        await rename(current, join(backupRoot, source.id));
      }
    }
    for (const source of vendorSources) {
      await rename(join(stageRoot, source.id), join(vendorRoot, source.id));
    }
    if (update) {
      await writeFile(sourcesPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    }
    for (const source of vendorSources) {
      console.log(`synced ${source.id}`);
    }
  } catch (error) {
    for (const source of vendorSources) {
      await rm(join(vendorRoot, source.id), { force: true, recursive: true });
      const backup = join(backupRoot, source.id);
      if (await exists(backup)) {
        await rename(backup, join(vendorRoot, source.id));
      }
    }
    throw error;
  } finally {
    await rm(backupRoot, { force: true, recursive: true });
  }
}
// oxlint-enable eslint/no-await-in-loop

function included(path: string, patterns: string[]) {
  return patterns.some((pattern) => (pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern));
}

async function hashTree(root: string, ignore = new Set<string>()) {
  const files = await findAllFiles(root);
  const hashes = await Promise.all(
    files.map(async (file) => {
      const rel = relative(root, file).replaceAll("\\", "/");
      if (ignore.has(rel)) {
        return null;
      }
      return [
        rel,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ] as const;
    })
  );
  return Object.fromEntries(
    hashes.filter((entry): entry is readonly [string, string] => entry !== null).toSorted(([a], [b]) => a.localeCompare(b))
  );
}

async function findAllFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(root, entry.name);
      if (entry.isDirectory()) {
        return await findAllFiles(entryPath);
      }
      return entry.isFile() ? [entryPath] : [];
    })
  );
  return paths.flat().toSorted();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function apiJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "keenko-playbook" };
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken !== undefined && githubToken.length > 0) {
    headers.Authorization = `Bearer ${githubToken}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GitHub REST payloads are typed at this dedicated interop boundary.
  return (await response.json()) as T;
}

function parseManifest(value: unknown): Manifest {
  const manifest = asObject(value, "vendor/sources.json");
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported vendor manifest schemaVersion: ${String(manifest.schemaVersion)}`);
  }
  if (!Array.isArray(manifest.sources)) {
    throw new TypeError("vendor/sources.json.sources must be an array");
  }
  return { schemaVersion: 1, sources: manifest.sources.map(parseSource) };
}

function parseSource(value: unknown, index: number): Source {
  const source = asObject(value, `vendor source ${index}`);
  const mode = asString(source.mode, `vendor source ${index}.mode`);
  if (mode !== "vendor" && mode !== "external") {
    throw new Error(`Invalid vendor mode: ${mode}`);
  }
  return {
    commit: asNullableString(source.commit, `vendor source ${index}.commit`),
    id: asString(source.id, `vendor source ${index}.id`),
    includes: asStringArray(source.includes, `vendor source ${index}.includes`),
    license: asNullableString(source.license, `vendor source ${index}.license`),
    mode,
    repository: asString(source.repository, `vendor source ${index}.repository`),
    rootPath: asStringAllowEmpty(source.rootPath, `vendor source ${index}.rootPath`),
    tree: asString(source.tree, `vendor source ${index}.tree`),
    upstreamRef: asString(source.upstreamRef, `vendor source ${index}.upstreamRef`),
  };
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function asStringAllowEmpty(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function asNullableString(value: unknown, label: string): string | null {
  return value === null ? null : asString(value, label);
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value.map((item, index) => asString(item, `${label}[${index}]`));
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
