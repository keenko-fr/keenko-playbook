import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import preset from "../src/generators/preset/generator.ts";
import normalizeCheck from "../src/migrations/normalize-check.ts";

const oldest = "bun run format:check && bun run lint && bun run typecheck && bun run build";
const firstPass = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";
const wrongOrder = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";
const current = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";
const oldOxlint = `import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [".keenko/**"],
  jsPlugins: ["oxlint-plugin-effect/plugin"],
  overrides: [
    {
      files: ["packages/backend/**/*.ts"],
      rules: {},
    },
  ],
  rules: {
    "eslint/no-plusplus": "off",
  },
});
`;

describe("Keenko migrations", () => {
  test("leaves the current generated tooling baseline unchanged", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "current" });
    const packageBefore = tree.read("package.json", "utf-8");
    const oxlintBefore = tree.read("oxlint.config.ts", "utf-8");
    await normalizeCheck(tree);
    expect(tree.read("package.json", "utf-8")).toBe(packageBefore);
    expect(tree.read("oxlint.config.ts", "utf-8")).toBe(oxlintBefore);
  });

  test.each([
    [oldest, "1.80.0", "0.38.0", "0.11.0", undefined],
    [firstPass, "1.81.0", "0.39.1", "0.12.0", "keenko check --guidance"],
    [wrongOrder, "1.81.0", "0.39.1", "0.12.0", "keenko check --guidance --codegen"],
  ] as const)("supports a pre-v1 baseline", async (check, oxlint, effectTsgo, effectPlugin, codegenCheck) => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      "package.json",
      JSON.stringify({
        devDependencies: { "@effect/tsgo": effectTsgo, oxlint, "oxlint-plugin-effect": effectPlugin, typescript: "7.0.2" },
        projectNote: "preserve me",
        scripts: { check, "codegen:check": codegenCheck, custom: "keep me" },
      })
    );
    tree.write("oxlint.config.ts", oldOxlint);
    expect(tree.read("package.json", "utf-8")).not.toContain("@nx/oxlint");
    expect(tree.read("package.json", "utf-8")).not.toContain("@typescript/native");
    expect(tree.read("oxlint.config.ts", "utf-8")).not.toContain("@nx/enforce-module-boundaries");
    await normalizeCheck(tree);
    const migrated = tree.read("package.json", "utf-8") ?? "";
    expect(migrated).toContain(current);
    expect(migrated).toContain("keenko check --guidance --codegen");
    expect(migrated).toContain("bun test --pass-with-no-tests");
    expect(migrated).toContain('"custom": "keep me"');
    expect(migrated).toContain('"oxlint": "1.81.0"');
    expect(migrated).toContain('"@effect/tsgo": "0.39.1"');
    expect(migrated).toContain('"oxlint-plugin-effect": "0.12.0"');
    expect(migrated).toContain('"@nx/oxlint": "23.2.0"');
    expect(migrated).toContain('"@typescript/native": "npm:typescript@7.0.2"');
    expect(migrated).toContain('"typescript": "npm:@typescript/typescript6@6.0.2"');
    expect(migrated).toContain('"projectNote": "preserve me"');
    const migratedOxlint = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(migratedOxlint).toContain("@nx/enforce-module-boundaries");
    expect(migratedOxlint).toContain("packages/backend/confect/**");
    expect(migratedOxlint).toContain("packages/ui/**/*");
  });

  test("reports an actionable conflict for an ambiguous customization", async () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      "package.json",
      JSON.stringify({
        devDependencies: {
          "@effect/tsgo": "0.39.1",
          oxlint: "1.81.0",
          "oxlint-plugin-effect": "0.12.0",
          typescript: "7.0.2",
        },
        scripts: { check: "my custom verifier" },
      })
    );
    tree.write("oxlint.config.ts", oldOxlint);
    await expect(normalizeCheck(tree)).rejects.toThrow("customized");
  });

  test("preserves unrelated Oxlint plugins and rules", async () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      "package.json",
      JSON.stringify({
        devDependencies: {
          "@effect/tsgo": "0.39.1",
          oxlint: "1.81.0",
          "oxlint-plugin-effect": "0.12.0",
          typescript: "7.0.2",
        },
        scripts: { check: current, "codegen:check": "keenko check --guidance --codegen", test: "bun test --pass-with-no-tests" },
      })
    );
    tree.write(
      "oxlint.config.ts",
      oldOxlint
        .replace('"oxlint-plugin-effect/plugin"', '"project-plugin", "oxlint-plugin-effect/plugin"')
        .replace('"eslint/no-plusplus": "off",', '"project/custom-rule": "warn",\n    "eslint/no-plusplus": "off",')
    );
    await normalizeCheck(tree);
    const oxlint = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(oxlint).toContain("project-plugin");
    expect(oxlint).toContain("project/custom-rule");
  });

  test("rejects a customized Nx boundary rule", async () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      "package.json",
      JSON.stringify({
        devDependencies: {
          "@effect/tsgo": "0.39.1",
          "@nx/oxlint": "23.2.0",
          "@typescript/native": "npm:typescript@7.0.2",
          oxlint: "1.81.0",
          "oxlint-plugin-effect": "0.12.0",
          typescript: "npm:@typescript/typescript6@6.0.2",
        },
        scripts: { check: current, "codegen:check": "keenko check --guidance --codegen", test: "bun test --pass-with-no-tests" },
      })
    );
    tree.write(
      "oxlint.config.ts",
      oldOxlint
        .replace('"oxlint-plugin-effect/plugin"', '"@nx/oxlint/boundaries-plugin", "oxlint-plugin-effect/plugin"')
        .replace('"eslint/no-plusplus": "off",', '"@nx/enforce-module-boundaries": ["error", {}],\n    "eslint/no-plusplus": "off",')
    );
    await expect(normalizeCheck(tree)).rejects.toThrow("Keenko-owned rule was customized");
  });
});
