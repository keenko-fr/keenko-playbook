import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import preset from "../src/generators/preset/generator.ts";
import normalizeCheck from "../src/migrations/normalize-check.ts";

const CURRENT_CHECK = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build";

describe("Keenko migrations", () => {
  test("leaves the current generated tooling baseline unchanged", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "current" });
    const before = snapshot(tree);
    await normalizeCheck(tree);
    expect(snapshot(tree)).toEqual(before);
  });

  test("adds the TypeScript compatibility aliases and Nx boundary bridge to the pre-boundary baseline", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "pre-boundary" });
    downgradeBoundaryBridge(tree);

    const pkg = readJson(tree, "package.json");
    pkg.projectNote = "preserve me";
    tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

    await normalizeCheck(tree);

    const migrated = readJson(tree, "package.json");
    const devDependencies = record(migrated.devDependencies, "devDependencies");
    expect(record(migrated.scripts, "scripts").check).toBe(CURRENT_CHECK);
    expect(devDependencies["@nx/oxlint"]).toBe("23.2.0");
    expect(devDependencies["@typescript/native"]).toBe("npm:typescript@7.0.2");
    expect(devDependencies.typescript).toBe("npm:@typescript/typescript6@6.0.2");
    expect(migrated.projectNote).toBe("preserve me");

    const oxlint = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(oxlint).toContain('"@nx/oxlint/boundaries-plugin"');
    expect(oxlint).toContain('"@nx/enforce-module-boundaries"');
    expect(oxlint).toContain('sourceTag: "scope:shared"');
  });

  test("rejects a customized Nx boundary rule", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-boundary" });
    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    const start = source.indexOf('    "@nx/enforce-module-boundaries": [');
    const end = source.indexOf('    "eslint/no-plusplus": "off",');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Could not locate generated boundary rule");
    }
    tree.write(
      "oxlint.config.ts",
      `${source.slice(0, start)}    "@nx/enforce-module-boundaries": ["error", { allow: ["custom/**"] }],\n${source.slice(end)}`
    );

    await expect(normalizeCheck(tree)).rejects.toThrow("Keenko-owned rule was customized");
  });

  test("rejects a customized Keenko shadcn wrapper", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await preset(tree, { name: "custom-wrapper" });
    const wrapper = tree.read("tools/keenko-ui.ts", "utf-8") ?? "";
    expect(wrapper).toContain("shadcn@4.20.1");
    tree.write("tools/keenko-ui.ts", wrapper.replace("shadcn@4.20.1", "shadcn@4.20.0"));

    await expect(normalizeCheck(tree)).rejects.toThrow("Keenko-owned shadcn wrapper was customized");
  });
});

function downgradeBoundaryBridge(tree: ReturnType<typeof createTreeWithEmptyWorkspace>) {
  const pkg = readJson(tree, "package.json");
  const devDependencies = record(pkg.devDependencies, "devDependencies");
  delete devDependencies["@nx/oxlint"];
  delete devDependencies["@typescript/native"];
  devDependencies.typescript = "7.0.2";
  pkg.devDependencies = devDependencies;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
  const start = source.indexOf('    "@nx/enforce-module-boundaries": [');
  const end = source.indexOf('    "eslint/no-plusplus": "off",');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate generated boundary rule");
  }
  const withoutBoundary = `${source.slice(0, start)}${source.slice(end)}`;
  tree.write("oxlint.config.ts", withoutBoundary.replace('"@nx/oxlint/boundaries-plugin", ', ""));
}

function snapshot(tree: ReturnType<typeof createTreeWithEmptyWorkspace>) {
  return Object.fromEntries(
    tree
      .listChanges()
      .filter((change) => change.content !== null)
      .map((change) => [change.path, change.content?.toString("utf-8")])
      .toSorted(([left], [right]) => left.localeCompare(right))
  );
}

function readJson(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): Record<string, unknown> {
  const source = tree.read(path, "utf-8");
  if (source === null) {
    throw new Error(`Missing ${path}`);
  }
  return record(JSON.parse(source), path);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}
