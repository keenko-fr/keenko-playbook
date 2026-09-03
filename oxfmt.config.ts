import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const ultraciteFormatting = stripEditorConfigFields(ultracite);
const ultraciteSortImports = typeof ultraciteFormatting.sortImports === "object" ? ultraciteFormatting.sortImports : {};

export default defineConfig({
  ...ultraciteFormatting,
  ignorePatterns: [
    ...(ultraciteFormatting.ignorePatterns ?? []),
    ".agents/skills/**",
    ".claude/skills/**",
    ".keenko/**",
    ".tmp/**",
    ".output/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "vendor/**",
  ],
  printWidth: 140,
  sortImports: {
    ...ultraciteSortImports,
    groups: [
      ["type-builtin", "type-external", "value-builtin", "value-external"],
      [
        "type-internal",
        "type-subpath",
        "type-parent",
        "type-sibling",
        "type-index",
        "value-internal",
        "value-subpath",
        "value-parent",
        "value-sibling",
        "value-index",
        "style",
        "unknown",
      ],
    ],
    sortSideEffects: false,
  },
});

function stripEditorConfigFields({ endOfLine: _endOfLine, tabWidth: _tabWidth, useTabs: _useTabs, ...formatting }: typeof ultracite) {
  return formatting;
}
