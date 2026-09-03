import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
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
  options: {
    typeAware: true,
  },
  rules: {
    "eslint/no-plusplus": "off",
    "eslint/no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        fix: {
          imports: "safe-fix",
          variables: "off",
        },
      },
    ],
    "func-style": "off",
    "import/consistent-type-specifier-style": ["error", "prefer-top-level-if-only-type-imports"],
    "no-use-before-define": [
      "error",
      {
        functions: false,
        typedefs: false,
      },
    ],
  },
});
