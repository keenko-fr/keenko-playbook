import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".agents/skills/**",
    ".claude/skills/**",
    ".keenko/**",
    ".tmp/**",
    "**/*.template",
    "**/.output/**",
    "**/build/**",
    "**/coverage/**",
    "**/dist/**",
    "**/vendor/**",
  ],
  printWidth: 140,
});
