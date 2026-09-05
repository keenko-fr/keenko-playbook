import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import { verifyWorkspaceManifestDependencies } from "../src/workspace-dependencies.ts";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

describe("workspace manifest dependencies", () => {
  test("accepts allowed edges across additional tagged workspaces", () => {
    const tree = fixture();
    writeWorkspace(tree, "packages/feature", "@fixture/feature", "scope:shared");

    expect(() => verifyWorkspaceManifestDependencies(tree)).not.toThrow();
  });

  for (const field of DEPENDENCY_FIELDS) {
    test(`rejects forbidden ${field} edges without a source import`, () => {
      const tree = fixture();
      writeWorkspace(tree, "packages/feature", "@fixture/feature", "scope:shared", {
        [field]: { "@fixture/web": "workspace:*" },
      });

      expect(() => verifyWorkspaceManifestDependencies(tree)).toThrow(
        `Forbidden Keenko manifest dependency: packages/feature (scope:shared) ${field} -> @fixture/web (scope:web)`
      );
    });
  }

  test("requires one Keenko scope tag for every workspace package", () => {
    const tree = fixture();
    writeWorkspace(tree, "packages/feature", "@fixture/feature", "scope:shared");
    const manifest = readJson(tree, "packages/feature/package.json");
    manifest.nx = { tags: ["type:lib"] };
    tree.write("packages/feature/package.json", json(manifest));

    expect(() => verifyWorkspaceManifestDependencies(tree)).toThrow("must declare exactly one Keenko scope tag");
  });
});

function fixture() {
  const tree = createTreeWithEmptyWorkspace();
  writeWorkspace(tree, "apps/web", "@fixture/web", "scope:web", {
    dependencies: {
      "@fixture/backend": "workspace:*",
      "@fixture/shared": "workspace:*",
      "@fixture/ui": "workspace:*",
    },
  });
  writeWorkspace(tree, "packages/backend", "@fixture/backend", "scope:backend", {
    dependencies: { "@fixture/shared": "workspace:*" },
  });
  writeWorkspace(tree, "packages/ui", "@fixture/ui", "scope:ui", {
    dependencies: { "@fixture/shared": "workspace:*" },
  });
  writeWorkspace(tree, "packages/shared", "@fixture/shared", "scope:shared");
  return tree;
}

function writeWorkspace(
  tree: ReturnType<typeof createTreeWithEmptyWorkspace>,
  workspacePath: string,
  name: string,
  scope: "scope:web" | "scope:backend" | "scope:ui" | "scope:shared",
  extra: Record<string, unknown> = {}
) {
  tree.write(
    `${workspacePath}/package.json`,
    json({
      name,
      nx: { tags: [workspacePath.startsWith("apps/") ? "type:app" : "type:lib", scope] },
      private: true,
      version: "0.0.0",
      ...extra,
    })
  );
}

function readJson(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, file: string): Record<string, unknown> {
  const source = tree.read(file, "utf-8");
  if (source === null) {
    throw new Error(`Missing ${file}`);
  }
  const value: unknown = JSON.parse(source);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${file} must contain an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
