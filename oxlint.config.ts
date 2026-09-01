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
    curly: "off",
    "eslint/no-await-in-loop": "off",
    "eslint/no-plusplus": "off",
    "eslint/prefer-named-capture-group": "off",
    "eslint/prefer-destructuring": "off",
    "eslint/prefer-template": "off",
    "eslint/require-await": "off",
    "eslint/sort-keys": "off",
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
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/no-non-null-assertion": "off",
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/strict-boolean-expressions": "off",
    "typescript/strict-void-return": "off",
    "unicorn/import-style": "off",
    "unicorn/no-array-reverse": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-await-expression-member": "off",
  },
});
