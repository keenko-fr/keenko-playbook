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

  test("migrates the exact 0.2 formatter baseline with CRLF line endings", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "crlf_migration" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG.replaceAll("\n", "\r\n"));
    tree.write("oxfmt.config.ts", LEGACY_OXFMT_CONFIG.replaceAll("\n", "\r\n"));

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain("...ultracite");
    expect(oxfmt).toContain("...(ultracite.ignorePatterns ?? [])");
    expect(oxfmt).not.toContain("endOfLine: _endOfLine");
    expect(oxfmt).not.toContain("tabWidth: _tabWidth");
    expect(oxfmt).not.toContain("useTabs: _useTabs");
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

  test("preserves unrelated Oxfmt customization while restoring formatter ownership", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom_oxfmt" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    tree.write("oxfmt.config.ts", LEGACY_OXFMT_CONFIG.replace('    ".keenko/**",', '    ".keenko/**",\n    "project-cache/**",'));

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain('    "project-cache/**",');
    expect(oxfmt).toContain("const formatting = ultracite;");
    expect(oxfmt).toContain("...formatting");
    expect(oxfmt).toContain("...(formatting.ignorePatterns ?? [])");
    expect(oxfmt).not.toContain("endOfLine: _endOfLine");
    expect(oxfmt).not.toContain("tabWidth: _tabWidth");
    expect(oxfmt).not.toContain("useTabs: _useTabs");
  });

  test("does not mistake a comment for the current formatting declaration", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "commented_current_declaration" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({",
      "// const formatting = ultracite;\n\nexport default defineConfig({"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain("const formatting = ultracite;\n\n// const formatting = ultracite;");
    expect(oxfmt).not.toContain("endOfLine: _endOfLine");
  });

  test("rejects an overlapping formatter ownership customization before deleting the known editor config", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "conflicting_oxfmt" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    tree.write(
      "oxfmt.config.ts",
      LEGACY_OXFMT_CONFIG.replace("export default defineConfig({\n", "export default defineConfig({\n  tabWidth: 4,\n")
    );

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
  });

  test("rejects an owned formatter getter before a formatting spread", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "getter_conflict" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({\n  ...formatting,",
      "export default defineConfig({\n  get tabWidth() { return 4; },\n  ...formatting,"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects shorthand formatter ownership before a formatting spread", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "shorthand_conflict" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      'import ultracite from "ultracite/oxfmt";\n',
      'import ultracite from "ultracite/oxfmt";\n\nconst tabWidth = 4;\n'
    ).replace("export default defineConfig({\n  ...formatting,", "export default defineConfig({\n  tabWidth,\n  ...formatting,");
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects a static computed formatter ownership property", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "computed_conflict" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({\n  ...formatting,",
      'export default defineConfig({\n  ["useTabs"]: false,\n  ...formatting,'
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects a const-derived computed formatter ownership property", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "computed_identifier_conflict" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      'import ultracite from "ultracite/oxfmt";\n',
      'import ultracite from "ultracite/oxfmt";\n\nconst field = "tabWidth" as const;\n'
    ).replace("export default defineConfig({\n  ...formatting,", "export default defineConfig({\n  [field]: 4,\n  ...formatting,");
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects an unproven object spread before formatting ownership changes", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "spread_conflict" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      'import ultracite from "ultracite/oxfmt";\n',
      'import ultracite from "ultracite/oxfmt";\n\nconst overrides = { tabWidth: 4 };\n'
    ).replace("export default defineConfig({\n  ...formatting,", "export default defineConfig({\n  ...overrides,\n  ...formatting,");
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects an unproven spread between repeated formatting spreads", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "repeated_spread_conflict" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      'import ultracite from "ultracite/oxfmt";\n',
      'import ultracite from "ultracite/oxfmt";\n\nconst overrides = { tabWidth: 4 };\n'
    ).replace(
      "export default defineConfig({\n  ...formatting,",
      "export default defineConfig({\n  ...formatting,\n  ...overrides,\n  ...formatting,"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("preserves removed formatter binding text inside comments and strings", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "binding_text" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({",
      "// previous _tabWidth behavior\n\nexport default defineConfig({"
    ).replace('    ".keenko/**",', '    ".keenko/**",\n    "project-_tabWidth-cache/**",');
    tree.write("oxfmt.config.ts", customizedOxfmt);

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain("// previous _tabWidth behavior");
    expect(oxfmt).toContain('    "project-_tabWidth-cache/**",');
    expect(oxfmt).toContain("const formatting = ultracite;");
  });

  test("preserves removed formatter binding text inside a regex literal", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "binding_regex_text" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      'import ultracite from "ultracite/oxfmt";\n',
      'import ultracite from "ultracite/oxfmt";\n\nconst ignoredName = /project-_tabWidth-cache/;\n'
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain("const ignoredName = /project-_tabWidth-cache/;");
    expect(oxfmt).toContain("const formatting = ultracite;");
  });

  test("preserves a regex literal after contextual of in a for-of header", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "for_of_regex_text" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      'import ultracite from "ultracite/oxfmt";\n',
      'import ultracite from "ultracite/oxfmt";\n\nfor (const ignored of /project-_tabWidth-cache/.source) { void ignored; }\n'
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    removeEditorConfig(tree);

    expect(tree.exists(".editorconfig")).toBe(false);
    const oxfmt = tree.read("oxfmt.config.ts", "utf-8") ?? "";
    expect(oxfmt).toContain("for (const ignored of /project-_tabWidth-cache/.source) { void ignored; }");
    expect(oxfmt).toContain("const formatting = ultracite;");
  });

  test("rejects a removed formatter binding inside a template interpolation", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "template_binding_reference" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      '    ".keenko/**",',
      `    ".keenko/**",
    \`cache-\${_tabWidth}\`,`
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects a removed formatter binding after a regex literal in a template interpolation", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "template_regex_binding_reference" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      '    ".keenko/**",',
      `    ".keenko/**",
    \`cache-\${/}/.test("}") ? _tabWidth : 80}\`,`
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects a removed formatter binding after a postfix non-null assertion", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "non_null_binding_reference" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({\n",
      "const customWidth = formatting.printWidth! / _tabWidth / 2;\n\nexport default defineConfig({\n"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects a removed formatter binding after a keyword-shaped member access", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "keyword_member_binding_reference" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({\n",
      "const custom = { in: 8 };\nconst customWidth = custom.in / _tabWidth / 2;\n\nexport default defineConfig({\n"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("does not treat an ordinary identifier named of as the for-of keyword", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "of_identifier_binding_reference" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({\n",
      "const of = 8;\nconst customWidth = of / _tabWidth / 2;\n\nexport default defineConfig({\n"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });

  test("rejects a reference to a removed formatter binding before mutating formatter state", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "binding_reference" });
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    const customizedOxfmt = LEGACY_OXFMT_CONFIG.replace(
      "export default defineConfig({\n",
      "const customWidth = _tabWidth * 2;\n\nexport default defineConfig({\n"
    );
    tree.write("oxfmt.config.ts", customizedOxfmt);

    expect(() => {
      removeEditorConfig(tree);
    }).toThrow("formatter ownership fields");
    expect(tree.read(".editorconfig", "utf-8")).toBe(LEGACY_EDITORCONFIG);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(customizedOxfmt);
  });
});
