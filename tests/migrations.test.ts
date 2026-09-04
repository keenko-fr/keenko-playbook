import type { Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import preset from "../src/generators/preset/generator.ts";
import normalizeCheck from "../src/migrations/normalize-check.ts";

const CURRENT_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_LINT = "oxlint .";
const CURRENT_LINT_FIX = "oxlint --fix .";
const TYPESCRIPT_API = "6.0.2";
const TYPESCRIPT_API_ALIAS = "npm:@typescript/typescript6@6.0.2";
const TYPESCRIPT_NATIVE = "npm:typescript@7.0.2";
const TYPESCRIPT_NATIVE_TSC = "node ../../node_modules/@typescript/native/bin/tsc --noEmit";
const WORKSPACE_MANIFESTS = [
  "apps/web/package.json",
  "packages/backend/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
] as const;

describe("Keenko migrations", () => {
  test("leaves the current generated tooling baseline unchanged", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "current" });
    const before = snapshot(tree);
    await normalizeCheck(tree);
    expect(snapshot(tree)).toEqual(before);
  });

  test("adds the Bun-safe TypeScript compatibility split and Nx boundary bridge to the pre-boundary baseline", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "pre-boundary" });
    downgradeBoundaryBridge(tree);

    const pkg = readJson(tree, "package.json");
    pkg.projectNote = "preserve me";
    tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

    await normalizeCheck(tree);

    const migrated = readJson(tree, "package.json");
    const scripts = record(migrated.scripts, "scripts");
    const devDependencies = record(migrated.devDependencies, "devDependencies");
    expect(scripts.check).toBe(CURRENT_CHECK);
    expect(scripts.lint).toBe(CURRENT_LINT);
    expect(scripts["lint:fix"]).toBe(CURRENT_LINT_FIX);
    expect(devDependencies["@nx/oxlint"]).toBe("23.2.0");
    expect(devDependencies["@typescript/native"]).toBe(TYPESCRIPT_NATIVE);
    expect(devDependencies.typescript).toBe(TYPESCRIPT_API);
    expect(migrated.projectNote).toBe("preserve me");

    for (const file of WORKSPACE_MANIFESTS) {
      const workspace = readJson(tree, file);
      const workspaceDevDependencies = record(workspace.devDependencies, `${file}.devDependencies`);
      const workspaceScripts = record(workspace.scripts, `${file}.scripts`);
      expect(workspaceDevDependencies["@typescript/native"]).toBe(TYPESCRIPT_NATIVE);
      expect(workspaceDevDependencies.typescript).toBe(TYPESCRIPT_API);
      expect(workspaceScripts.typecheck).toBe(TYPESCRIPT_NATIVE_TSC);
      if (file !== "apps/web/package.json") {
        expect(workspaceScripts.build).toBe(TYPESCRIPT_NATIVE_TSC);
      }
    }

    const oxlint = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(oxlint).toContain('"@nx/oxlint/boundaries-plugin"');
    expect(oxlint).toContain('"@nx/enforce-module-boundaries"');
    expect(oxlint).toContain('sourceTag: "scope:shared"');
  }, 15_000);

  test("replaces the Bun-broken TypeScript 6 compatibility alias", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "alias-baseline" });
    setCompatibilityAlias(tree);

    await normalizeCheck(tree);

    const root = readJson(tree, "package.json");
    expect(record(root.devDependencies, "package.json.devDependencies").typescript).toBe(TYPESCRIPT_API);
    for (const file of WORKSPACE_MANIFESTS) {
      const workspace = readJson(tree, file);
      expect(record(workspace.devDependencies, `${file}.devDependencies`).typescript).toBe(TYPESCRIPT_API);
    }
  });

  test("rejects a customized workspace TypeScript compatibility dependency", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-typescript" });
    downgradeBoundaryBridge(tree);

    const pkg = readJson(tree, "packages/shared/package.json");
    const devDependencies = record(pkg.devDependencies, "packages/shared/package.json.devDependencies");
    devDependencies.typescript = "7.0.1";
    pkg.devDependencies = devDependencies;
    tree.write("packages/shared/package.json", `${JSON.stringify(pkg, null, 2)}\n`);

    await expectMigrationFailure(tree, "packages/shared/package.json devDependencies.typescript");
  });

  test("rejects a customized Nx boundary rule", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-boundary" });
    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    const start = source.indexOf('    "@nx/enforce-module-boundaries": [');
    const end = source.indexOf('    "eslint/no-plusplus": "off",');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Could not locate generated boundary rule");
    }
    tree.write(
      "oxlint.config.ts",
      `${source.slice(0, start)}    "@nx/enforce-module-boundaries": ["error", { allow: ["custom/**"] }],\n${source.slice(end)}`
    );

    await expectMigrationFailure(tree, "Keenko-owned rule was customized");
  });

  test("rejects a customized Keenko shadcn wrapper", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-wrapper" });
    const wrapper = tree.read("tools/keenko-ui.ts", "utf-8") ?? "";
    expect(wrapper).toContain("shadcn@4.20.1");
    tree.write("tools/keenko-ui.ts", wrapper.replace("shadcn@4.20.1", "shadcn@4.20.0"));

    await expectMigrationFailure(tree, "Keenko-owned shadcn wrapper was customized");
  });
});

function downgradeBoundaryBridge(tree: Tree) {
  const pkg = readJson(tree, "package.json");
  const scripts = record(pkg.scripts, "scripts");
  scripts.lint = "oxlint .";
  scripts["lint:fix"] = "oxlint --fix .";
  pkg.scripts = scripts;
  const devDependencies = record(pkg.devDependencies, "devDependencies");
  delete devDependencies["@nx/oxlint"];
  delete devDependencies["@typescript/native"];
  devDependencies.typescript = "7.0.2";
  pkg.devDependencies = devDependencies;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  for (const file of WORKSPACE_MANIFESTS) {
    const workspace = readJson(tree, file);
    const workspaceDevDependencies = record(workspace.devDependencies, `${file}.devDependencies`);
    const workspaceScripts = record(workspace.scripts, `${file}.scripts`);
    delete workspaceDevDependencies["@typescript/native"];
    workspaceDevDependencies.typescript = file === "apps/web/package.json" ? "6.0.2" : "7.0.2";
    workspaceScripts.typecheck = "tsc --noEmit";
    if (file !== "apps/web/package.json") {
      workspaceScripts.build = "tsc --noEmit";
    }
    workspace.devDependencies = workspaceDevDependencies;
    workspace.scripts = workspaceScripts;
    tree.write(file, `${JSON.stringify(workspace, null, 2)}\n`);
  }

  const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
  const start = source.indexOf('    "@nx/enforce-module-boundaries": [');
  const end = source.indexOf('    "eslint/no-plusplus": "off",');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate generated boundary rule");
  }
  const withoutBoundary = `${source.slice(0, start)}${source.slice(end)}`;
  tree.write("oxlint.config.ts", withoutBoundary.replace('"@nx/oxlint/boundaries-plugin", ', ""));
}

function setCompatibilityAlias(tree: Tree) {
  const root = readJson(tree, "package.json");
  const rootDevDependencies = record(root.devDependencies, "package.json.devDependencies");
  rootDevDependencies.typescript = TYPESCRIPT_API_ALIAS;
  root.devDependencies = rootDevDependencies;
  tree.write("package.json", `${JSON.stringify(root, null, 2)}\n`);

  for (const file of WORKSPACE_MANIFESTS) {
    const workspace = readJson(tree, file);
    const workspaceDevDependencies = record(workspace.devDependencies, `${file}.devDependencies`);
    workspaceDevDependencies.typescript = TYPESCRIPT_API_ALIAS;
    workspace.devDependencies = workspaceDevDependencies;
    tree.write(file, `${JSON.stringify(workspace, null, 2)}\n`);
  }
}

async function expectMigrationFailure(tree: Tree, message: string) {
  let failure: unknown;
  try {
    await normalizeCheck(tree);
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof Error)) {
    throw new TypeError("Expected migration to fail with an Error");
  }
  expect(failure.message).toContain(message);
}

function snapshot(tree: Tree): Record<string, string> {
  const entries: [string, string][] = [];
  for (const change of tree.listChanges()) {
    if (change.content !== null) {
      entries.push([change.path, change.content.toString("utf-8")]);
    }
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function readJson(tree: Tree, path: string): Record<string, unknown> {
  const source = tree.read(path, "utf-8");
  if (source === null) {
    throw new Error(`Missing ${path}`);
  }
  const value: unknown = JSON.parse(source);
  return record(value, path);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}
