import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import normalizeCheck from "../src/migrations/normalize-check.ts";

const previous = "bun run format:check && bun run lint && bun run typecheck && bun run build";
const current = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";

describe("Keenko migrations", () => {
  test.each([previous, current])("supports the known pre-v1 baseline %s", (check) => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("package.json", JSON.stringify({ projectNote: "preserve me", scripts: { check } }));
    normalizeCheck(tree);
    const migrated = tree.read("package.json", "utf-8") ?? "";
    expect(migrated).toContain(current);
    expect(migrated).toContain("preserve me");
  });

  test("reports an actionable conflict for an ambiguous customization", () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("package.json", JSON.stringify({ scripts: { check: "my custom verifier" } }));
    expect(() => {
      normalizeCheck(tree);
    }).toThrow("customized");
  });
});
