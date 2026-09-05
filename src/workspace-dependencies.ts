import type { Tree } from "@nx/devkit";

import { allowedProjectScopes, type ProjectScope } from "./boundaries.ts";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
const SCOPE_TAGS: readonly ProjectScope[] = ["scope:web", "scope:backend", "scope:ui", "scope:shared"];
const WORKSPACE_ROOTS = ["apps", "packages"] as const;

interface WorkspaceManifest {
  manifest: Record<string, unknown>;
  name: string;
  scope: ProjectScope;
  workspacePath: string;
}

export function verifyWorkspaceManifestDependencies(tree: Tree) {
  const workspaces = discoverWorkspaces(tree);
  const scopesByName = new Map<string, ProjectScope>();
  for (const { name, scope } of workspaces) {
    if (scopesByName.has(name)) {
      throw new Error(`Duplicate workspace package name: ${name}`);
    }
    scopesByName.set(name, scope);
  }

  for (const { manifest, name, scope, workspacePath } of workspaces) {
    const allowed = allowedProjectScopes(scope);
    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = objectOrEmpty(manifest[field], `${workspacePath}/package.json.${field}`);
      for (const dependencyName of Object.keys(dependencies)) {
        const targetScope = scopesByName.get(dependencyName);
        if (dependencyName !== name && targetScope !== undefined && !allowed.includes(targetScope)) {
          throw new Error(
            `Forbidden Keenko manifest dependency: ${workspacePath} (${scope}) ${field} -> ${dependencyName} (${targetScope})`
          );
        }
      }
    }
  }
}

function discoverWorkspaces(tree: Tree): WorkspaceManifest[] {
  const workspaces: WorkspaceManifest[] = [];
  for (const root of WORKSPACE_ROOTS) {
    for (const child of tree.children(root)) {
      const workspacePath = `${root}/${child}`;
      const source = tree.read(`${workspacePath}/package.json`, "utf-8");
      if (source === null) {
        continue;
      }
      const manifest = record(JSON.parse(source), `${workspacePath}/package.json`);
      const name = stringValue(manifest.name, `${workspacePath}/package.json.name`);
      const nx = record(manifest.nx, `${workspacePath}/package.json.nx`);
      const tags = stringArray(nx.tags, `${workspacePath}/package.json.nx.tags`);
      const matchingScopes = SCOPE_TAGS.filter((scope) => tags.includes(scope));
      if (matchingScopes.length !== 1) {
        throw new Error(
          `${workspacePath}/package.json must declare exactly one Keenko scope tag; found ${matchingScopes.join(", ") || "none"}`
        );
      }
      workspaces.push({ manifest, name, scope: matchingScopes[0], workspacePath });
    }
  }
  return workspaces;
}

function objectOrEmpty(value: unknown, label: string): Record<string, unknown> {
  return value === undefined ? {} : record(value, label);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError(`${label} must be an array of strings`);
  }
  return value;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}
