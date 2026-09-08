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

test("preserves a regex literal after contextual of with a template-key member assignment target", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const loop = "for (holder[`value`] of /project-_tabWidth-cache/.source) { void holder[`value`]; }";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\nconst holder = { value: "" };\n${loop}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(loop);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal after contextual of with an escaped identifier binding", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const loop = "for (const \\u0061 of /project-_tabWidth-cache/.source) { void \\u0061; }";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${loop}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(loop);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal used as an if statement body", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statement = 'if (true) /project-_tabWidth-cache/.test("");';
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statement}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(statement);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal after a completed if block", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statement = 'if (true) {} /project-_tabWidth-cache/.test("");';
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statement}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(statement);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("rejects a removed formatter binding after a Unicode identifier ending in if", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statements = "const πif = () => 8;\nconst width = πif(true) / _tabWidth / 2;";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statements}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  expect(() => {
    removeEditorConfig(tree);
  }).toThrow("formatter ownership fields");
  expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
  expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
});

test("rejects a removed formatter binding after a Unicode identifier ending in a regex-prefix keyword", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statements = "const πreturn = 8; const width = πreturn / _tabWidth / 2;";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statements}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  expect(() => {
    removeEditorConfig(tree);
  }).toThrow("formatter ownership fields");
  expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
  expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
});

test("rejects a removed formatter binding after a keyword-shaped private member", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statement = "class C { #return = 8; width() { return this.#return / _tabWidth / 2; } }";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statement}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  expect(() => {
    removeEditorConfig(tree);
  }).toThrow("formatter ownership fields");
  expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
  expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
});

test("rejects a removed formatter binding after spaced keyword-shaped member access", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statements = "const obj = { if: () => 8 };\nconst width = obj . if(true) / _tabWidth / 2;";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statements}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  expect(() => {
    removeEditorConfig(tree);
  }).toThrow("formatter ownership fields");
  expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
  expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
});

test("preserves a regex literal used as a while statement body", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statement = 'while (true) /project-_tabWidth-cache/.test("");';
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statement}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(statement);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal used as an ordinary for statement body", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statement = 'for (; false; ) /project-_tabWidth-cache/.test("");';
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statement}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(statement);
  expect(oxfmt).toContain("const formatting = ultracite;");
});

test("preserves a regex literal used as a for await statement body", () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(".editorconfig", LEGACY_EDITORCONFIG);
  const statement = "async function scan(xs) { for await (const x of xs) /project-_tabWidth-cache/.test(x); }";
  const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
    'import ultracite from "ultracite/oxfmt";\n',
    `import ultracite from "ultracite/oxfmt";\n\n${statement}\n`
  );
  tree.write("oxfmt.config.ts", customizedOxfmt);

  removeEditorConfig(tree);

  expect(tree.exists(".editorconfig")).toBe(false);
  const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
  expect(oxfmt).toContain(statement);
  expect(oxfmt).toContain("const formatting = ultracite;");
});
