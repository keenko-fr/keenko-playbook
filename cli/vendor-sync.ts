#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const vendorRoot = join(ROOT, "vendor");
const sourcesPath = join(vendorRoot, "sources.json");
const update = process.argv.includes("--update");
const checkOnly = process.argv.includes("--check");

type Hashes = Record<string, string>;
type Source = {
  id: string;
  repository: string;
  upstreamRef: string;
  commit: string | null;
  tree: string;
  rootPath: string;
  mode: "vendor" | "external";
  license: string | null;
  includes: string[];
};
type Manifest = { schemaVersion: number; sources: Source[] };
type GitCommitResponse = { sha: string; commit: { tree: { sha: string } } };
type GitTreeEntry = { path: string; type: string; sha: string };
type GitTreeResponse = { tree: GitTreeEntry[] };
type GitBlobResponse = { encoding: string; content: string };

async function main() {
  const manifest = JSON.parse(await readFile(sourcesPath, "utf-8")) as Manifest;
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported vendor manifest schemaVersion: ${manifest.schemaVersion}`);
  if (update) for (const source of manifest.sources) await updatePin(source);

  const stageRoot = await mkdtemp(join(vendorRoot, ".sync-"));
  try {
    for (const source of manifest.sources) {
      if (source.mode === "external") {
        console.log(`skip ${source.id}: external first-party source (not redistributed)`);
        continue;
      }
      if (!source.commit) throw new Error(`Refusing to vendor ${source.id} without a pinned commit`);
      if (!source.license) throw new Error(`Refusing to vendor ${source.id} without a declared license`);
      await materialize(source, join(stageRoot, source.id));
    }

    if (checkOnly) {
      for (const source of manifest.sources.filter(({ mode }) => mode === "vendor")) {
        const current = join(vendorRoot, source.id);
        const staged = join(stageRoot, source.id);
        if (!(await exists(current))) throw new Error(`Missing committed vendor snapshot ${source.id}`);
        const [a, b] = await Promise.all([hashTree(current), hashTree(staged)]);
        if (JSON.stringify(a) !== JSON.stringify(b))
          throw new Error(`Committed vendor snapshot differs from pinned upstream source: ${source.id}`);
      }
      console.log(`Vendor snapshots match pinned upstream sources.`);
      return;
    }

    await replaceAll(manifest, stageRoot);
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

async function updatePin(source: Source) {
  const commit = await apiJson<GitCommitResponse>(`https://api.github.com/repos/${source.repository}/commits/${source.upstreamRef}`);
  source.commit = commit.sha;
  let tree = commit.commit.tree.sha;
  if (source.rootPath) tree = await subtreeSha(source.repository, tree, source.rootPath);
  source.tree = tree;
}

async function subtreeSha(repo: string, rootTree: string, path: string) {
  let tree = rootTree;
  for (const part of path.split("/").filter(Boolean)) {
    const data = await apiJson<GitTreeResponse>(`https://api.github.com/repos/${repo}/git/trees/${tree}`);
    const entry = data.tree.find((item) => item.type === "tree" && item.path === part);
    if (!entry) throw new Error(`Could not resolve ${path} in ${repo}`);
    tree = entry.sha;
  }
  return tree;
}

async function materialize(source: Source, target: string) {
  await mkdir(target, { recursive: true });
  const tree = await apiJson<GitTreeResponse>(`https://api.github.com/repos/${source.repository}/git/trees/${source.tree}?recursive=1`);
  const blobs = tree.tree.filter((entry) => entry.type === "blob" && included(entry.path, source.includes));
  for (const entry of blobs) {
    const blob = await apiJson<GitBlobResponse>(`https://api.github.com/repos/${source.repository}/git/blobs/${entry.sha}`);
    if (blob.encoding !== "base64") throw new Error(`Unsupported blob encoding for ${source.id}:${entry.path}`);
    const path = join(target, entry.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(blob.content.replaceAll("\n", ""), "base64"));
  }
  const files = await hashTree(target, new Set(["VENDORED.json"]));
  await writeFile(
    join(target, "VENDORED.json"),
    JSON.stringify(
      {
        repository: source.repository,
        commit: source.commit,
        tree: source.tree,
        license: source.license,
        files,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`staged ${source.id}: ${blobs.length} upstream files`);
}

async function replaceAll(manifest: Manifest, stageRoot: string) {
  const backupRoot = await mkdtemp(join(vendorRoot, ".backup-"));
  const vendorSources = manifest.sources.filter(({ mode }) => mode === "vendor");
  try {
    for (const source of vendorSources) {
      const current = join(vendorRoot, source.id);
      if (await exists(current)) await rename(current, join(backupRoot, source.id));
    }
    for (const source of vendorSources) await rename(join(stageRoot, source.id), join(vendorRoot, source.id));
    if (update) await writeFile(sourcesPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    for (const source of vendorSources) console.log(`synced ${source.id}`);
  } catch (error) {
    for (const source of vendorSources) {
      await rm(join(vendorRoot, source.id), { recursive: true, force: true });
      const backup = join(backupRoot, source.id);
      if (await exists(backup)) await rename(backup, join(vendorRoot, source.id));
    }
    throw error;
  } finally {
    await rm(backupRoot, { recursive: true, force: true });
  }
}

function included(path: string, patterns: string[]) {
  return patterns.some((pattern) => (pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern));
}

async function hashTree(root: string, ignore = new Set<string>()) {
  const out: Hashes = {};
  for (const file of await findAllFiles(root)) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (ignore.has(rel)) continue;
    out[rel] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function findAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(root))) return out;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await findAllFiles(path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
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
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return (await response.json()) as T;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
