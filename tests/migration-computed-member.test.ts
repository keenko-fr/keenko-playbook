import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { expect, test } from "bun:test";

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

test("preserves a regex literal after contextual of with a computed member assignment target", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const loop = "for (holder[0] of /project-_tabWidth-cache/.source) { void holder[0]; }";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\nconst holder = [""];\n${loop}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain('const holder = [""];');
  expect(oxfmt).toContain(loop);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal after contextual of with a string-key member assignment target", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const loop = 'for (holder["value"] of /project-_tabWidth-cache/.source) { void holder["value"]; }';
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\nconst holder = { value: "" };\n${loop}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain('const holder = { value: "" };');
  expect(oxfmt).toContain(loop);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal after contextual of with an expression-key member assignment target", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const loop = "for (holder[key + 1] of /project-_tabWidth-cache/.source) { void holder[key + 1]; }";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\nconst holder = ["", ""];\nconst key = 0;\n${loop}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain("const key = 0;");
  expect(oxfmt).toContain(loop);
  expect(oxfmt).toContain("const formatting = ultracite;");
});
