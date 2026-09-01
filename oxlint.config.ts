import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ".agents/skills/**",
    ".claude/skills/**",
    ".playbook/**",
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
    "consistent-return": "off",
    "eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        fix: {
          imports: "safe-fix",
          variables: "off",
        },
        varsIgnorePattern: "^_",
      },
    ],
    "func-style": "off",
    "import/consistent-type-specifier-style": "off",
    "no-use-before-define": [
      "error",
      {
        functions: false,
        typedefs: false,
      },
    ],
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/strict-boolean-expressions": "off",
    "typescript/strict-void-return": "off",
  },
});
