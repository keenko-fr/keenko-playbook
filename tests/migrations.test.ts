import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import preset from "../src/generators/preset/generator.ts";
import removeEditorConfig from "../src/migrations/remove-editorconfig.ts";

const LEGACY_EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
`;
const LEGACY_OXFMT_CONFIG = `import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const { endOfLine: _endOfLine, tabWidth: _tabWidth, useTabs: _useTabs, ...formatting } = ultracite;

export default defineConfig({
  ...formatting,
  ignorePatterns: [
    ...(formatting.ignorePatterns ?? []),
    ".keenko/**",
    ".agents/skills/**",
    ".claude/skills/**",
    "**/_generated/**",
    "**/routeTree.gen.ts",
    "packages/backend/confect/**",
    "packages/backend/convex/**",
    "!packages/backend/convex/tsconfig.json",
    "!packages/backend/convex/convex.config.ts",
  ],
  printWidth: 140,
});
`;

describe("Keenko migrations", () => {
  test("removes the unmodified 0.2 editor config and restores the full inherited Oxfmt preset", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "migration" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    tree.write("oxfmt.config.ts", LEGACY_OXFMT_CONFIG);

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain("...ultracite");
    expect(oxfmt).toContain("...(ultracite.ignorePatterns ?? [])");
    expect(oxfmt).not.toContain("endOfLine: _endOfLine");
    expect(oxfmt).not.toContain("tabWidth: _tabWidth");
    expect(oxfmt).not.toContain("useTabs: _useTabs");

    removeEditorConfig(tree);
    expect(tree.exists(".editorconfig")).toBe(false);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(oxfmt);
  });

  test("rejects a customized editor config instead of deleting it", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom_editor" });
    tree.write(".editorconfig", `${LEGACY_EDITORCONFIG}\n[*.md]\ntrim_trailing_whitespace = false\n`);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow(".editorconfig was customized");
    expect(tree.exists(".editorconfig")).toBe(true);
  });

  test("rejects a customized Oxfmt config before deleting the known editor config", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom_oxfmt" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    tree.write("oxfmt.config.ts", `${LEGACY_OXFMT_CONFIG}\n// project-owned formatter change\n`);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("oxfmt.config.ts was customized");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
  });
});
