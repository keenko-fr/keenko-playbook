import { describe, expect, test } from "bun:test";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx migration fixtures exercise promise-returning formatFiles and serialize virtual-tree JSON directly. */
import { readJson, readJsonFile } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import migration from "./application-workspaces-1-0-2.js";

interface VitestPluginRegistration {
  exclude: string[];
  include?: string[];
  options: { testMode: string; testTargetName: string };
  plugin: string;
}

const oldCheck = "nx sync:check && git status --porcelain -- apps/web/src/routeTree.gen.ts";
const oldOxlint = `export default {
  overrides: [{ files: ["apps/web/**/*.{ts,tsx}"] }],
  rules: [{ onlyDependOnLibsWithTags: ["scope:backend", "scope:ui", "scope:shared"], sourceTag: "scope:web" }],
};\n`;
const oldSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";
const request = (request: { isNavigationRequest(): boolean; url(): string }) => request.isNavigationRequest() && /(?:authkit|workos)/u.test(request.url());
page.waitForURL(/(?:authkit|workos)/u);
await expect(page).toHaveURL(/(?:authkit|workos)/u);\n`;

const vitestRegistration = (exclude: string[]) => ({
  exclude,
  options: { testMode: "run", testTargetName: "test" },
  plugin: "@nx/vitest",
});

const makeTree = () => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write("nx.json", JSON.stringify({ plugins: [vitestRegistration(["apps/web/vite.config.ts"])] }));
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

  test("preserves unrelated exclusions while replacing the legacy application exclusion", async () => {
    const tree = makeTree();
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [vitestRegistration(["tools/foo/vite.config.ts", "apps/web/vite.config.ts", "examples/**"])],
      })
    );

    await migration(tree);

    expect(readJson<{ plugins: { exclude: string[] }[] }>(tree, "nx.json").plugins[0]?.exclude).toEqual([
      "tools/foo/vite.config.ts",
      "apps/*/vite.config.ts",
      "examples/**",
    ]);
  });

  test("preserves an already-compliant customized exclusion list", async () => {
    const tree = makeTree();
    const exclusions = ["tools/foo/vite.config.ts", "apps/*/vite.config.ts", "examples/**"];
    tree.write("nx.json", JSON.stringify({ plugins: [vitestRegistration(exclusions)] }));

    await migration(tree);

    expect(readJson<{ plugins: { exclude: string[] }[] }>(tree, "nx.json").plugins[0]?.exclude).toEqual(exclusions);
  });

  test("migrates the generated Vitest registration independently of project-owned registration order", async () => {
    const tree = makeTree();
    const projectRegistration = {
      exclude: ["tools/**"],
      include: ["tools/*/vite.config.ts"],
      options: { testMode: "watch", testTargetName: "test:tools" },
      plugin: "@nx/vitest",
    };
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [projectRegistration, vitestRegistration(["examples/**", "apps/web/vite.config.ts"])],
      })
    );

    await migration(tree);

    const { plugins } = readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json");
    expect(plugins[0]).toEqual(projectRegistration);
    expect(plugins[1]?.exclude).toEqual(["examples/**", "apps/*/vite.config.ts"]);
  });

  test("rejects a Vitest registration with customized owned options without mutating it", () => {
    const tree = makeTree();
    const plugins = [
      {
        exclude: ["apps/web/vite.config.ts"],
        options: { testMode: "watch", testTargetName: "test" },
        plugin: "@nx/vitest",
      },
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));

    expect(() => migration(tree)).toThrow("@nx/vitest plugin configuration");
    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins).toEqual(plugins);
  });

  test("migrates only the complete legacy application boundary after a stricter scope rule", async () => {
    const tree = makeTree();
    tree.write(
      "oxlint.config.ts",
      oldOxlint.replace("rules: [", 'rules: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web" }, ')
    );

    await migration(tree);

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'scope:web'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(1);
  });

  test("migrates the legacy boundary despite an unrelated type:app rule", async () => {
    const tree = makeTree();
    tree.write(
      "oxlint.config.ts",
      oldOxlint.replace("rules: [", 'rules: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "type:app" }, ')
    );

    await migration(tree);

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'type:app'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(2);
  });

  test("preserves unrelated constraints around a compliant application boundary", async () => {
    const tree = makeTree();
    const compliant = oldOxlint
      .replace('"scope:backend", "scope:ui", "scope:shared"', '"scope:shared", "scope:backend", "scope:ui"')
      .replace('sourceTag: "scope:web"', 'sourceTag: "type:app"')
      .replace("rules: [", 'rules: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web" }, ');
    tree.write("oxlint.config.ts", compliant);

    await migration(tree);

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'scope:web'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(1);
  });

  test("rejects a customized application boundary without mutating Oxlint source", () => {
    const tree = makeTree();
    const customized = oldOxlint.replace('"scope:backend", "scope:ui", "scope:shared"', '"scope:ui", "scope:shared"');
    tree.write("oxlint.config.ts", customized);
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("application dependency boundary");
    expect(tree.read("oxlint.config.ts", "utf-8")).toBe(customized);
    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
  });

  test("rejects a customized old auth smoke without partially rewriting it", () => {
    const tree = makeTree();
    const customizedSmoke = oldSmoke.replace("http://localhost:3210", "http://localhost:4173");
    tree.write("apps/web/e2e/auth.e2e.ts", customizedSmoke);
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(customizedSmoke);
    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
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
    tree.write("nx.json", JSON.stringify({ plugins: [vitestRegistration(["apps/custom/vite.config.ts"])] }));

    expect(() => migration(tree)).toThrow("nx.json");
    expect(readJson<{ plugins: { exclude: string[] }[] }>(tree, "nx.json").plugins[0]?.exclude).toEqual(["apps/custom/vite.config.ts"]);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(oldSmoke);
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
