import { describe, expect, test } from "bun:test";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx migration fixtures exercise promise-returning formatFiles and serialize virtual-tree JSON directly. */
import { readJson, readJsonFile } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import migration from "./application-workspaces-1-0-2.js";

const oldCheck = "nx sync:check && git status --porcelain -- apps/web/src/routeTree.gen.ts";
const oldOxlint = `export default {
  overrides: [{ files: ["apps/web/**/*.{ts,tsx}"] }],
  rules: [{ sourceTag: "scope:web" }],
};\n`;
const oldSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";
const request = (request: { isNavigationRequest(): boolean; url(): string }) => request.isNavigationRequest() && /(?:authkit|workos)/u.test(request.url());
page.waitForURL(/(?:authkit|workos)/u);
await expect(page).toHaveURL(/(?:authkit|workos)/u);\n`;

const makeTree = () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write("nx.json", JSON.stringify({ plugins: [{ exclude: ["apps/web/vite.config.ts"], plugin: "@nx/vitest" }] }));
  tree.write("package.json", JSON.stringify({ scripts: { check: oldCheck } }));
  tree.write("oxlint.config.ts", oldOxlint);
  tree.write(
    "apps/web/package.json",
    JSON.stringify({ nx: { tags: ["type:app", "scope:web"], targets: {} }, scripts: { dev: "vite dev" } })
  );
  tree.write(
    "apps/admin/package.json",
    JSON.stringify({
      dependencies: { "@acme/backend": "workspace:*" },
      nx: { tags: ["scope:admin"], targets: {} },
      scripts: { dev: "vite dev" },
    })
  );
  tree.write(
    "packages/backend/package.json",
    JSON.stringify({ nx: { tags: ["type:package", "scope:backend"], targets: {} }, scripts: { dev: "confect dev" } })
  );
  tree.write("apps/web/e2e/auth.e2e.ts", oldSmoke);
  return tree;
};

describe("1.0.2 application-workspace migration", () => {
  test("is selected by native Nx for a 1.0.1 to 1.0.2 release-candidate plan", async () => {
    const migrationConfig = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
    const migrator = new Migrator({
      fetch: async (_packageName, targetVersion) => ({ ...migrationConfig, version: targetVersion }),
      from: {},
      getInstalledPackageVersion: () => "1.0.1",
      interactive: false,
      packageJson: { dependencies: { keenko: "1.0.1" }, name: "migration-fixture", version: "0.0.0" },
      to: {},
    });

    const plan = await migrator.migrate("keenko", "1.0.2-rc.2");

    expect(plan.migrations.map(({ name, package: packageName, version }) => ({ name, packageName, version }))).toEqual([
      { name: "1.0.2-application-workspaces", packageName: "keenko", version: "1.0.2-rc.0" },
    ]);
  });

  test("transforms untouched 1.0.1 state for two applications sharing one backend", async () => {
    const tree = makeTree();
    await migration(tree);

    expect(readJson<{ plugins: { exclude: string[] }[] }>(tree, "nx.json").plugins[0]?.exclude).toEqual(["apps/*/vite.config.ts"]);
    expect(readJson<{ scripts: { check: string } }>(tree, "package.json").scripts.check).toContain(":(glob)apps/*/src/routeTree.gen.ts");
    for (const path of ["apps/web/package.json", "apps/admin/package.json", "packages/backend/package.json"])
      expect(readJson<{ nx: { targets: { dev: { continuous: boolean } } } }>(tree, path).nx.targets.dev.continuous).toBe(true);
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/web/package.json").nx.tags).toEqual(["type:app", "scope:web"]);
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/admin/package.json").nx.tags).toEqual(["scope:admin", "type:app"]);
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain("sourceTag: 'type:app'");
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).not.toContain("authkit|workos");
  });

  test("leaves already compliant state unchanged", async () => {
    const tree = makeTree();
    await migration(tree);
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    await migration(tree);

    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
  });

  test("rejects conflicting project-owned customization", async () => {
    const tree = makeTree();
    tree.write("nx.json", JSON.stringify({ plugins: [{ exclude: ["apps/custom/vite.config.ts"], plugin: "@nx/vitest" }] }));

    expect(() => migration(tree)).toThrow("nx.json");
    expect(readJson<{ plugins: { exclude: string[] }[] }>(tree, "nx.json").plugins[0]?.exclude).toEqual(["apps/custom/vite.config.ts"]);
  });

  test("rejects a conflicting application type without removing project scopes", () => {
    const tree = makeTree();
    tree.write(
      "apps/admin/package.json",
      JSON.stringify({ nx: { tags: ["type:package", "scope:admin"], targets: {} }, scripts: { dev: "vite dev" } })
    );

    expect(() => migration(tree)).toThrow("nx.tags application classification");
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/admin/package.json").nx.tags).toEqual(["type:package", "scope:admin"]);
  });
});
