import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const ultraciteSortImports = typeof ultracite.sortImports === "object" ? ultracite.sortImports : {};

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
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
