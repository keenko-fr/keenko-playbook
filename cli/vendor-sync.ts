#!/usr/bin/env bun
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesPath = join(ROOT, "vendor", "sources.json");
const update = process.argv.includes("--update");

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

async function main() {
  const manifest = JSON.parse(await readFile(sourcesPath, "utf8")) as { schemaVersion: number; sources: Source[] };
  for (const source of manifest.sources) {
    if (update) await updatePin(source);
    if (source.mode === "external") {
      console.log(`skip ${source.id}: external first-party source (not redistributed)`);
      continue;
    }
    if (!source.license) throw new Error(`Refusing to vendor ${source.id} without a declared license`);
    await sync(source);
  }
  if (update) await writeFile(sourcesPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

async function updatePin(source: Source) {
  const commit = await apiJson<any>(`https://api.github.com/repos/${source.repository}/commits/${source.upstreamRef}`);
  source.commit = commit.sha;
  let tree = commit.commit.tree.sha as string;
  if (source.rootPath) tree = await subtreeSha(source.repository, tree, source.rootPath);
  source.tree = tree;
}

async function subtreeSha(repo: string, rootTree: string, path: string) {
  let tree = rootTree;
  for (const part of path.split("/").filter(Boolean)) {
    const data = await apiJson<any>(`https://api.github.com/repos/${repo}/git/trees/${tree}`);
    const entry = data.tree.find((item: any) => item.type === "tree" && item.path === part);
    if (!entry) throw new Error(`Could not resolve ${path} in ${repo}`);
    tree = entry.sha;
  }
  return tree;
}

async function sync(source: Source) {
  const target = join(ROOT, "vendor", source.id);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const tree = await apiJson<any>(`https://api.github.com/repos/${source.repository}/git/trees/${source.tree}?recursive=1`);
  const blobs = tree.tree.filter((entry: any) => entry.type === "blob" && included(entry.path, source.includes));
  for (const entry of blobs) {
    const blob = await apiJson<any>(`https://api.github.com/repos/${source.repository}/git/blobs/${entry.sha}`);
    if (blob.encoding !== "base64") throw new Error(`Unsupported blob encoding for ${source.id}:${entry.path}`);
    const path = join(target, entry.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(blob.content.replaceAll("\n", ""), "base64"));
  }
  await writeFile(join(target, "VENDORED.json"), JSON.stringify({ repository: source.repository, commit: source.commit, tree: source.tree, license: source.license }, null, 2) + "\n");
  console.log(`synced ${source.id}: ${blobs.length} files`);
}

function included(path: string, patterns: string[]) {
  return patterns.some((pattern) => pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern);
}

async function apiJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "keenko-playbook" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return await response.json() as T;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
