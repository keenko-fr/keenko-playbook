import type { Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import preset from "../src/generators/preset/generator.ts";
import nativeNxLifecycle from "../src/migrations/native-nx-lifecycle.ts";
import normalizeCheck from "../src/migrations/normalize-check.ts";

const LEGACY_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_CHECK =
  "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const LEGACY_CODEGEN_CHECK = "keenko check --guidance --codegen";
const CURRENT_CODEGEN_CHECK = "bun tools/check-generated.ts";
const CURRENT_LINT = "nx show projects && oxlint .";
const CURRENT_LINT_FIX = "oxlint --fix .";
const CURRENT_POSTINSTALL = "effect-tsgo patch --oxlint && bun tools/keenko-patch-nx-typescript.ts";
const CURRENT_START_CALL = "tanstackStart({ router: { routeTreeFileFooter: [] } })";
const START_ROUTE_TREE_FOOTER = `import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}`;
const TYPESCRIPT_API = "6.0.2";
const TYPESCRIPT_API_ALIAS = "npm:@typescript/typescript6@6.0.2";
const TYPESCRIPT_API_BRIDGE = "npm:typescript@6.0.2";
const TYPESCRIPT_NATIVE = "npm:typescript@7.0.2";
const TYPESCRIPT_NATIVE_TSC = "node ../../node_modules/@typescript/native/bin/tsc --noEmit";
const WORKSPACE_MANIFESTS = [
  "apps/web/package.json",
  "packages/backend/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
] as const;

describe("Keenko migrations", () => {
  test("leaves the current 0.1 generated tooling baseline unchanged", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "current" });
    setLegacyLifecycle(tree);
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
    expect(scripts.check).toBe(LEGACY_CHECK);
    expect(scripts.lint).toBe(CURRENT_LINT);
    expect(scripts["lint:fix"]).toBe(CURRENT_LINT_FIX);
    expect(scripts.postinstall).toBe(CURRENT_POSTINSTALL);
    expect(devDependencies["@nx/oxlint"]).toBe("23.2.0");
    expect(devDependencies["@typescript/native"]).toBe(TYPESCRIPT_NATIVE);
    expect(devDependencies.typescript).toBe(TYPESCRIPT_API);
    expect(devDependencies["typescript-api"]).toBe(TYPESCRIPT_API_BRIDGE);
    expect(migrated.projectNote).toBe("preserve me");
    expect(readJson(tree, "apps/web/tsr.config.json").routeTreeFileFooter).toEqual([START_ROUTE_TREE_FOOTER]);
    expect(tree.read("apps/web/vite.config.ts", "utf-8")).toContain(CURRENT_START_CALL);
    const nxPatchTool = tree.read("tools/keenko-patch-nx-typescript.ts", "utf-8") ?? "";
    expect(nxPatchTool).toContain('path.join("node_modules", "nx", "dist", "src", "plugins", "js", "utils", "typescript.js")');
    expect(nxPatchTool).toContain("typescript-api");

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
    setLegacyLifecycle(tree);
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

    await expectNormalizeFailure(tree, "packages/shared/package.json devDependencies.typescript");
  });

  test("rejects a customized Router footer", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-router-footer" });
    setLegacyLifecycle(tree);
    const config = readJson(tree, "apps/web/tsr.config.json");
    config.routeTreeFileFooter = ["// custom footer"];
    tree.write("apps/web/tsr.config.json", `${JSON.stringify(config, null, 2)}\n`);

    await expectNormalizeFailure(tree, "Keenko-owned Router footer was customized");
  });

  test("rejects a customized TanStack Start Router integration", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-start-router" });
    setLegacyLifecycle(tree);
    const vite = tree.read("apps/web/vite.config.ts", "utf-8") ?? "";
    tree.write("apps/web/vite.config.ts", vite.replace(CURRENT_START_CALL, "tanstackStart({ router: { autoCodeSplitting: false } })"));

    await expectNormalizeFailure(tree, "Keenko-owned Router integration was customized");
  });

  test("rejects a customized Nx boundary rule", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-boundary" });
    setLegacyLifecycle(tree);
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

    await expectNormalizeFailure(tree, "Keenko-owned rule was customized");
  });

  test("rejects a customized Keenko shadcn wrapper", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-wrapper" });
    setLegacyLifecycle(tree);
    const wrapper = tree.read("tools/keenko-ui.ts", "utf-8") ?? "";
    expect(wrapper).toContain("shadcn@4.20.1");
    tree.write("tools/keenko-ui.ts", wrapper.replace("shadcn@4.20.1", "shadcn@4.20.0"));

    await expectNormalizeFailure(tree, "Keenko-owned shadcn wrapper was customized");
  });

  test("moves 0.1 generated projects onto native Nx sync without removing project workspaces", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "native_migration" });
    setLegacyLifecycle(tree);

    const pkg = readJson(tree, "package.json");
    const scripts = record(pkg.scripts, "package.json.scripts");
    scripts.custom = "node custom-script.js";
    pkg.scripts = scripts;
    tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

    const nx = readJson(tree, "nx.json");
    nx.sync = { globalGenerators: ["project:sync"] };
    tree.write("nx.json", `${JSON.stringify(nx, null, 2)}\n`);
    tree.write(
      "packages/feature/package.json",
      `${JSON.stringify({ name: "@native_migration/feature", nx: { tags: ["type:lib", "scope:shared"] }, private: true, version: "0.0.0" }, null, 2)}\n`
    );
    tree.write("packages/feature/src/index.ts", "export const feature = true;\n");

    await nativeNxLifecycle(tree);

    const migrated = readJson(tree, "package.json");
    const migratedScripts = record(migrated.scripts, "package.json.scripts");
    expect(migratedScripts.check).toBe(CURRENT_CHECK);
    expect(migratedScripts["codegen:check"]).toBe(CURRENT_CODEGEN_CHECK);
    expect(migratedScripts.custom).toBe("node custom-script.js");
    expect(record(readJson(tree, "nx.json").sync, "nx.json.sync").globalGenerators).toEqual(["project:sync", "keenko:sync"]);
    expect(tree.read("tools/check-generated.ts", "utf-8")).toContain("Generated source has drifted at:");
    expect(tree.exists("packages/feature/package.json")).toBe(true);

    const beforeReplay = snapshot(tree);
    await nativeNxLifecycle(tree);
    expect(snapshot(tree)).toEqual(beforeReplay);
  });

  test("rejects a customized legacy merge-ready script", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom_check" });
    setLegacyLifecycle(tree);
    const pkg = readJson(tree, "package.json");
    const scripts = record(pkg.scripts, "package.json.scripts");
    scripts.check = `${LEGACY_CHECK} && bun run security`;
    pkg.scripts = scripts;
    tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

    await expectNativeLifecycleFailure(tree, "scripts.check");
  });

  test("rejects a conflicting project-owned generated-code helper path", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom_helper" });
    setLegacyLifecycle(tree);
    tree.write("tools/check-generated.ts", "console.log('project-owned');\n");

    await expectNativeLifecycleFailure(tree, "project already owns a different file");
  });
});

function setLegacyLifecycle(tree: Tree) {
  const pkg = readJson(tree, "package.json");
  const scripts = record(pkg.scripts, "package.json.scripts");
  scripts.check = LEGACY_CHECK;
  scripts["codegen:check"] = LEGACY_CODEGEN_CHECK;
  pkg.scripts = scripts;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  const nx = readJson(tree, "nx.json");
  delete nx.sync;
  tree.write("nx.json", `${JSON.stringify(nx, null, 2)}\n`);
  tree.delete("tools/check-generated.ts");
}

function downgradeBoundaryBridge(tree: Tree) {
  setLegacyLifecycle(tree);
  const pkg = readJson(tree, "package.json");
  const scripts = record(pkg.scripts, "scripts");
  scripts.lint = "oxlint .";
  scripts["lint:fix"] = "oxlint --fix .";
  scripts.postinstall = "effect-tsgo patch --oxlint";
  pkg.scripts = scripts;
  const devDependencies = record(pkg.devDependencies, "devDependencies");
  delete devDependencies["@nx/oxlint"];
  delete devDependencies["@typescript/native"];
  delete devDependencies["typescript-api"];
  devDependencies.typescript = "7.0.2";
  pkg.devDependencies = devDependencies;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  tree.delete("tools/keenko-patch-nx-typescript.ts");

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

  const routerConfig = readJson(tree, "apps/web/tsr.config.json");
  delete routerConfig.routeTreeFileFooter;
  tree.write("apps/web/tsr.config.json", `${JSON.stringify(routerConfig, null, 2)}\n`);
  const vite = tree.read("apps/web/vite.config.ts", "utf-8") ?? "";
  tree.write("apps/web/vite.config.ts", vite.replace(CURRENT_START_CALL, "tanstackStart()"));

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

async function expectNormalizeFailure(tree: Tree, message: string) {
  await expectFailure(() => normalizeCheck(tree), message);
}

async function expectNativeLifecycleFailure(tree: Tree, message: string) {
  await expectFailure(() => nativeNxLifecycle(tree), message);
}

async function expectFailure(run: () => Promise<unknown>, message: string) {
  let failure: unknown;
  try {
    await run();
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
  return record(JSON.parse(source), path);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}
