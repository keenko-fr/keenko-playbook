import type { Tree } from "@nx/devkit";

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

const CURRENT_OXFMT_CONFIG = `import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
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

export default function removeEditorConfig(tree: Tree) {
  const editorConfig = tree.read(".editorconfig", "utf-8");
  const oxfmtConfig = tree.read("oxfmt.config.ts", "utf-8");

  if (editorConfig !== null && editorConfig !== LEGACY_EDITORCONFIG) {
    throw new Error(
      "Keenko-owned .editorconfig was customized. Reconcile or remove that project-owned file manually, then rerun the Keenko migration."
    );
  }
  if (oxfmtConfig === null) {
    throw new Error(
      "Keenko-owned oxfmt.config.ts is missing. Restore or reconcile the formatter config before rerunning the Keenko migration."
    );
  }
  if (oxfmtConfig !== LEGACY_OXFMT_CONFIG && oxfmtConfig !== CURRENT_OXFMT_CONFIG) {
    throw new Error(
      "Keenko-owned oxfmt.config.ts was customized. Reconcile the project-owned formatter config manually, then rerun the Keenko migration."
    );
  }

  if (oxfmtConfig === LEGACY_OXFMT_CONFIG) {
    tree.write("oxfmt.config.ts", CURRENT_OXFMT_CONFIG);
  }
  if (editorConfig === LEGACY_EDITORCONFIG) {
    tree.delete(".editorconfig");
  }
}
