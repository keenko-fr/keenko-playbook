import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import preset from "../src/generators/preset/generator.ts";
import sync from "../src/generators/sync/generator.ts";

const CURRENT_CHECK =
  "nx sync:check && bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const CURRENT_CODEGEN_CHECK = "bun tools/check-generated.ts";
const CURRENT_LINT = "nx show projects && oxlint .";
const CURRENT_START_CALL = "tanstackStart({ router: { routeTreeFileFooter: [] } })";
const START_ROUTE_TREE_FOOTER = `import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}`;
const TYPESCRIPT_API = '"typescript": "6.0.2"';
const TYPESCRIPT_API_BRIDGE = '"typescript-api": "npm:typescript@6.0.2"';
const TYPESCRIPT_NATIVE = '"@typescript/native": "npm:typescript@7.0.2"';
const TYPESCRIPT_NATIVE_TSC = "node ../../node_modules/@typescript/native/bin/tsc --noEmit";
const WORKSPACE_MANIFESTS = [
  "apps/web/package.json",
  "packages/backend/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
] as const;

describe("Keenko Nx preset", () => {
  test("creates the initial package workspace and registers native Nx sync", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "example_app" });

    expect(workspaces(tree)).toEqual(["apps/web", "packages/backend", "packages/shared", "packages/ui"]);
    expect(tree.exists("project.json")).toBe(false);
    expect(tree.exists("apps/web/vite.config.ts")).toBe(true);
    expect(tree.read("apps/web/package.json", "utf-8")).toContain('"@tanstack/react-start"');
    const routerConfig = object(JSON.parse(tree.read("apps/web/tsr.config.json", "utf-8") ?? "{}"));
    expect(routerConfig.routeTreeFileFooter).toEqual([START_ROUTE_TREE_FOOTER]);
    expect(tree.read("apps/web/vite.config.ts", "utf-8")).toContain(CURRENT_START_CALL);
    expect(tree.read("packages/ui/components.json", "utf-8")).toContain('"style": "base-nova"');
    expect(tree.read("packages/ui/components.json", "utf-8")).not.toContain('"base":');
    expect(tree.read("packages/backend/package.json", "utf-8")).toContain('"@confect/server": "10.0.0-next.21"');

    const root = readJson(tree, "package.json");
    expect(root.name).toBe("example_app");
    const scripts = object(root.scripts);
    expect(scripts.check).toBe(CURRENT_CHECK);
    expect(scripts["codegen:check"]).toBe(CURRENT_CODEGEN_CHECK);
    expect(scripts.lint).toBe(CURRENT_LINT);
    expect(scripts["lint:fix"]).toBe("oxlint --fix .");
    const rootPackage = tree.read("package.json", "utf-8") ?? "";
    expect(rootPackage).not.toContain('"latest"');
    expect(rootPackage).toContain('"@nx/oxlint": "23.2.0"');
    expect(rootPackage).toContain(TYPESCRIPT_NATIVE);
    expect(rootPackage).toContain(TYPESCRIPT_API);
    expect(rootPackage).toContain(TYPESCRIPT_API_BRIDGE);
    expect(rootPackage).toContain('"postinstall": "effect-tsgo patch --oxlint && bun tools/keenko-patch-nx-typescript.ts"');
    expect(tree.read("tools/check-generated.ts", "utf-8")).toContain("Generated source has drifted at:");

    const nx = readJson(tree, "nx.json");
    expect(object(nx.sync).globalGenerators).toEqual(["keenko:sync"]);
    expect(readJson(tree, "apps/web/package.json").name).toBe("@example_app/web");
    expect(readJson(tree, "packages/backend/package.json").name).toBe("@example_app/backend");
    expect(readJson(tree, "packages/ui/package.json").name).toBe("@example_app/ui");
    expect(readJson(tree, "packages/shared/package.json").name).toBe("@example_app/shared");

    const nxPatchTool = tree.read("tools/keenko-patch-nx-typescript.ts", "utf-8") ?? "";
    expect(nxPatchTool).toContain('path.join("node_modules", "nx", "dist", "src", "plugins", "js", "utils", "typescript.js")');
    expect(nxPatchTool).toContain("typescript-api");
    for (const file of WORKSPACE_MANIFESTS) {
      const manifest = tree.read(file, "utf-8") ?? "";
      expect(manifest).toContain(TYPESCRIPT_NATIVE);
      expect(manifest).toContain(TYPESCRIPT_API);
      expect(manifest).toContain(`"typecheck": "${TYPESCRIPT_NATIVE_TSC}"`);
      if (file !== "apps/web/package.json") {
        expect(manifest).toContain(`"build": "${TYPESCRIPT_NATIVE_TSC}"`);
      }
    }
    const oxlint = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(oxlint).toContain('"@nx/oxlint/boundaries-plugin"');
    expect(oxlint).toContain('"@nx/enforce-module-boundaries"');
    expect(oxlint).toContain('sourceTag: "scope:shared"');
  });

  test("preserves the Nx workspace name instead of normalizing it", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "my_app.v2" });
    expect(readJson(tree, "package.json").name).toBe("my_app.v2");
    expect(readJson(tree, "apps/web/package.json").name).toBe("@my_app.v2/web");
  });

  test.each(["Example App", "Example", "my app", "-demo", "demo@scope", " demo", "demo/"])(
    "rejects invalid shared identity %s",
    async (name) => {
      const tree = createTreeWithEmptyWorkspace();
      await expect(preset(tree, { name })).rejects.toThrow("Keenko workspace name");
    }
  );

  test("rejects an identity that makes a scoped package exceed the npm name limit", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await expect(preset(tree, { name: `a${"b".repeat(205)}` })).rejects.toThrow("too long");
  });

  test("is deterministic and preserves project-owned guidance surfaces", async () => {
    const first = createTreeWithEmptyWorkspace();
    const second = createTreeWithEmptyWorkspace();
    await Promise.all([preset(first, { name: "demo" }), preset(second, { name: "demo" })]);
    expect(hashChanges(first)).toEqual(hashChanges(second));

    first.write("CONTEXT.md", "# Product context\n\nKeep me.\n");
    first.write("AGENTS.md", `${first.read("AGENTS.md", "utf-8")}\nHuman-owned tail.\n`);
    expect(sync(first).outOfSyncMessage).toContain("nx sync");
    expect(first.read("CONTEXT.md", "utf-8")).toBe("# Product context\n\nKeep me.\n");
    expect(first.read("AGENTS.md", "utf-8")).toContain("Human-owned tail.");
  });

  test("ships canonical and native skill copies with provenance", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "demo" });
    for (const root of [".keenko/skills", ".agents/skills", ".claude/skills"]) {
      expect(tree.exists(`${root}/confect/SKILL.md`)).toBe(true);
      expect(tree.exists(`${root}/effect-ts/UPSTREAM_LICENSE`)).toBe(true);
      expect(tree.exists(`${root}/unslop/UPSTREAM_PROVENANCE.json`)).toBe(true);
    }
  }, 15_000);
});

function workspaces(tree: ReturnType<typeof createTreeWithEmptyWorkspace>) {
  return tree
    .listChanges()
    .map(({ path }) => /^(?<workspace>apps\/[^/]+|packages\/[^/]+)\/package\.json$/u.exec(path)?.groups?.workspace)
    .filter((value): value is string => value !== undefined)
    .toSorted();
}

function hashChanges(tree: ReturnType<typeof createTreeWithEmptyWorkspace>) {
  const hashes: Record<string, string> = {};
  for (const change of tree.listChanges().toSorted((left, right) => left.path.localeCompare(right.path))) {
    if (change.content !== null) {
      hashes[change.path] = createHash("sha256").update(change.content).digest("hex");
    }
  }
  return hashes;
}

function readJson(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, file: string): Record<string, unknown> {
  return object(JSON.parse(tree.read(file, "utf-8") ?? "{}"));
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  return Object.fromEntries(Object.entries(value));
}
