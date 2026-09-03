import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import normalizeCheck from "../src/migrations/normalize-check.ts";

const oldest = "bun run format:check && bun run lint && bun run typecheck && bun run build";
const firstPass = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";
const wrongOrder = "bun run codegen:check && bun run test && bun run format:check && bun run lint && bun run typecheck && bun run build";
const current = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";

describe("Keenko migrations", () => {
  test.each([
    [oldest, "1.80.0", "0.38.0", "0.11.0", undefined],
    [firstPass, "1.81.0", "0.39.1", "0.12.0", "keenko check --guidance"],
    [wrongOrder, "1.81.0", "0.39.1", "0.12.0", "keenko check --guidance --codegen"],
  ] as const)("supports a pre-v1 baseline", (check, oxlint, effectTsgo, effectPlugin, codegenCheck) => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      "package.json",
      JSON.stringify({
        devDependencies: { "@effect/tsgo": effectTsgo, oxlint, "oxlint-plugin-effect": effectPlugin },
        projectNote: "preserve me",
        scripts: { check, "codegen:check": codegenCheck, custom: "keep me" },
      })
    );
    normalizeCheck(tree);
    const migrated = tree.read("package.json", "utf-8") ?? "";
    expect(migrated).toContain(current);
    expect(migrated).toContain("keenko check --guidance --codegen");
    expect(migrated).toContain("bun test --pass-with-no-tests");
    expect(migrated).toContain('"custom": "keep me"');
    expect(migrated).toContain('"oxlint": "1.81.0"');
    expect(migrated).toContain('"@effect/tsgo": "0.39.1"');
    expect(migrated).toContain('"oxlint-plugin-effect": "0.12.0"');
    expect(migrated).toContain('"projectNote": "preserve me"');
  });

  test("reports an actionable conflict for an ambiguous customization", () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("package.json", JSON.stringify({ devDependencies: { oxlint: "1.81.0" }, scripts: { check: "my custom verifier" } }));
    expect(() => {
      normalizeCheck(tree);
    }).toThrow("customized");
  });
});
