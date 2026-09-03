import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import preset from "../src/generators/preset/generator.ts";
import sync from "../src/generators/sync/generator.ts";

const CURRENT_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";

describe("Keenko Nx preset", () => {
  test("creates the fixed package-based workspace through first-party TanStack output", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "Example App" });

    expect(workspaces(tree)).toEqual(["apps/web", "packages/backend", "packages/shared", "packages/ui"]);
    expect(tree.exists("project.json")).toBe(false);
    expect(tree.exists("apps/web/vite.config.ts")).toBe(true);
    expect(tree.read("apps/web/package.json", "utf-8")).toContain('"@tanstack/react-start"');
    expect(tree.read("packages/ui/components.json", "utf-8")).toContain('"style": "base-nova"');
    expect(tree.read("packages/ui/components.json", "utf-8")).not.toContain('"base":');
    expect(tree.read("packages/backend/package.json", "utf-8")).toContain('"@confect/server": "10.0.0-next.21"');
    const rootPackage = tree.read("package.json", "utf-8") ?? "";
    expect(rootPackage).not.toContain('"latest"');
    expect(rootPackage).toContain('"@nx/oxlint": "23.2.0"');
    expect(rootPackage).toContain('"@typescript/native": "npm:typescript@7.0.2"');
    expect(rootPackage).toContain('"typescript": "npm:@typescript/typescript6@6.0.2"');
    expect(rootPackage).toContain('"codegen:check": "keenko check --guidance --codegen"');
    expect(rootPackage).toContain(`"check": "${CURRENT_CHECK}"`);
    const oxlint = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(oxlint).toContain('"@nx/oxlint/boundaries-plugin"');
    expect(oxlint).toContain('"@nx/enforce-module-boundaries"');
    expect(oxlint).toContain('sourceTag: "scope:shared"');
    expect(tree.exists(".playbook/config.json")).toBe(false);
  });

  test("is deterministic and preserves project-owned guidance surfaces", async () => {
    const first = createTreeWithEmptyWorkspace();
    const second = createTreeWithEmptyWorkspace();
    await Promise.all([preset(first, { name: "demo" }), preset(second, { name: "demo" })]);
    expect(hashChanges(first)).toEqual(hashChanges(second));

    first.write("CONTEXT.md", "# Product context\n\nKeep me.\n");
    first.write("AGENTS.md", `${first.read("AGENTS.md", "utf-8")}\nHuman-owned tail.\n`);
    sync(first);
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
  });
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
