import { describe, expect, test } from "bun:test";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx migration fixtures exercise promise-returning formatFiles and serialize virtual-tree JSON directly. */
import { readJson, readJsonFile } from "@nx/devkit";
import { findMatchingConfigFiles } from "@nx/devkit/internal";
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
const oldOxlint = `import { defineConfig } from "oxlint";

export default defineConfig({
  overrides: [{ files: ["apps/web/**/*.{ts,tsx}"] }],
  rules: {
    boundaries: [{
      depConstraints: [
        { onlyDependOnLibsWithTags: ["type:package"], sourceTag: "type:package" },
        { onlyDependOnLibsWithTags: ["scope:backend", "scope:ui", "scope:shared"], sourceTag: "scope:web" },
        { onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:backend" },
        { onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:ui" },
        { onlyDependOnLibsWithTags: [], sourceTag: "scope:shared" },
      ],
    }],
  },
});\n`;
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

const snapshotChanges = (tree: ReturnType<typeof makeTree>) => tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

const addInlineConstraint = (tree: ReturnType<typeof makeTree>, constraint: string) => {
  tree.write("oxlint.config.ts", oldOxlint.replace("depConstraints: [", `depConstraints: [${constraint}, `));
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
    const { scripts } = readJson<{ scripts: { "boundaries:check": string; check: string } }>(tree, "package.json");
    expect(scripts.check).toContain(":(glob)apps/*/src/routeTree.gen.ts");
    expect(scripts.check).toContain("bun run boundaries:check");
    expect(scripts["boundaries:check"]).toBe("keenko-verify-boundaries");
    for (const path of ["apps/web/package.json", "apps/admin/package.json", "packages/backend/package.json"])
      expect(readJson<{ nx: { targets: { dev: { continuous: boolean } } } }>(tree, path).nx.targets.dev.continuous).toBe(true);
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/web/package.json").nx.tags).toEqual(["type:app", "scope:web"]);
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/admin/package.json").nx.tags).toEqual(["scope:admin", "type:app"]);
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain("depConstraints: dependencyConstraints");
    expect(tree.read("oxlint.config.ts", "utf-8")).not.toContain("onlyDependOnLibsWithTags");
    expect(tree.read("tools/dependency-boundaries.ts", "utf-8")).toContain("sourceTag: 'type:app'");
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
      options: { testMode: "run", testTargetName: "test" },
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

  test("rejects ambiguous duplicate Keenko-shaped Vitest registrations without mutation", () => {
    const tree = makeTree();
    const plugins = [vitestRegistration(["apps/web/vite.config.ts"]), vitestRegistration(["examples/**", "apps/web/vite.config.ts"])];
    tree.write("nx.json", JSON.stringify({ plugins }));
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
  });

  test("preserves a compliant Vitest exclusion with customized options", async () => {
    const tree = makeTree();
    const plugins = [
      {
        exclude: ["tools/foo/vite.config.ts", "apps/*/vite.config.ts"],
        options: { testMode: "watch", testTargetName: "test" },
        plugin: "@nx/vitest",
      },
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));

    await migration(tree);

    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins).toEqual(plugins);
  });

  test("preserves a Vitest registration whose ordered include scope excludes applications", async () => {
    const tree = makeTree();
    const projectRegistration = {
      exclude: ["tools/legacy/**"],
      include: ["!apps/**", "tools/**"],
      options: { testMode: "watch", testTargetName: "test" },
      plugin: "@nx/vitest",
    };
    const plugins = [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])];
    tree.write("nx.json", JSON.stringify({ plugins }));

    await migration(tree);

    const migrated = readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins;
    expect(migrated[0]).toEqual(projectRegistration);
    expect(migrated[1]?.exclude).toEqual(["apps/*/vite.config.ts"]);
  });

  test("rejects a second Vitest registration that still covers application configs", () => {
    const tree = makeTree();
    const plugins = [
      { options: { testMode: "watch", testTargetName: "other-test" }, plugin: "@nx/vitest" },
      vitestRegistration(["apps/web/vite.config.ts"]),
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
  });

  test("rejects an application-name glob without relying on sampled names", () => {
    const tree = makeTree();
    const plugins = [
      { include: ["apps/pro*/vite.config.ts"], options: { testMode: "watch", testTargetName: "other-test" }, plugin: "@nx/vitest" },
      vitestRegistration(["apps/web/vite.config.ts"]),
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));
    const before = snapshotChanges(tree);

    expect(findMatchingConfigFiles(["apps/pro/vite.config.ts"], ["apps/pro*/vite.config.ts"], [])).toEqual(["apps/pro/vite.config.ts"]);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects a broad application Vitest registration", () => {
    const tree = makeTree();
    const plugins = [
      { include: ["apps/**/vite.config.ts"], options: { testMode: "watch", testTargetName: "other-test" }, plugin: "@nx/vitest" },
      vitestRegistration(["apps/web/vite.config.ts"]),
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));

    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
  });

  test("rejects an ordered Vitest exclusion that re-enables an application config", () => {
    const tree = makeTree();
    const plugins = [
      {
        exclude: ["apps/*/vite.config.ts", "!apps/admin/vite.config.ts"],
        options: { testMode: "watch", testTargetName: "test" },
        plugin: "@nx/vitest",
      },
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
  });

  test("migrates only the complete legacy application boundary after a stricter scope rule", async () => {
    const tree = makeTree();
    tree.write(
      "oxlint.config.ts",
      oldOxlint.replace("depConstraints: [", 'depConstraints: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web" }, ')
    );

    await migration(tree);

    const source = tree.read("tools/dependency-boundaries.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'scope:web'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(1);
  });

  test("migrates the legacy boundary despite an unrelated type:app rule", async () => {
    const tree = makeTree();
    tree.write(
      "oxlint.config.ts",
      oldOxlint.replace("depConstraints: [", 'depConstraints: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "type:app" }, ')
    );

    await migration(tree);

    const source = tree.read("tools/dependency-boundaries.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'type:app'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(2);
  });

  test("preserves unrelated constraints around a compliant application boundary", async () => {
    const tree = makeTree();
    const compliant = oldOxlint
      .replace('"scope:backend", "scope:ui", "scope:shared"', '"scope:shared", "scope:backend", "scope:ui"')
      .replace('sourceTag: "scope:web"', 'sourceTag: "type:app"')
      .replace("depConstraints: [", 'depConstraints: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web" }, ');
    tree.write("oxlint.config.ts", compliant);

    await migration(tree);

    const source = tree.read("tools/dependency-boundaries.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'scope:web'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(1);
  });

  test("leaves an already-shared policy with a valid narrow project constraint unchanged", async () => {
    const tree = makeTree();
    await migration(tree);
    const policy = tree.read("tools/dependency-boundaries.ts", "utf-8") ?? "";
    tree.write(
      "tools/dependency-boundaries.ts",
      policy.replace(
        "export const dependencyConstraints = [",
        "export const dependencyConstraints = [\n  { onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'scope:admin' },"
      )
    );
    const before = snapshotChanges(tree);

    await migration(tree);

    expect(snapshotChanges(tree)).toEqual(before);
    expect(tree.read("tools/dependency-boundaries.ts", "utf-8")).toContain("sourceTag: 'scope:admin'");
  });

  test("rejects allSourceTags policy customization without mutation", () => {
    const tree = makeTree();
    addInlineConstraint(tree, '{ allSourceTags: ["type:app"], onlyDependOnLibsWithTags: ["scope:shared"] }');
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("dependency constraints");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects notDependOnLibsWithTags policy customization without mutation", () => {
    const tree = makeTree();
    addInlineConstraint(
      tree,
      '{ sourceTag: "scope:admin", onlyDependOnLibsWithTags: ["scope:shared"], notDependOnLibsWithTags: ["scope:ui"] }'
    );
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("dependency constraints");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each(["allowedExternalImports", "bannedExternalImports"])("rejects %s policy customization without mutation", (field) => {
    const tree = makeTree();
    addInlineConstraint(tree, `{ sourceTag: "scope:admin", onlyDependOnLibsWithTags: ["scope:shared"], ${field}: ["example"] }`);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("dependency constraints");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects a customized application boundary without mutating Oxlint source", () => {
    const tree = makeTree();
    const customized = oldOxlint.replace('"scope:backend", "scope:ui", "scope:shared"', '"scope:ui", "scope:shared"');
    tree.write("oxlint.config.ts", customized);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("application dependency constraint");
    expect(tree.read("oxlint.config.ts", "utf-8")).toBe(customized);
    expect(snapshotChanges(tree)).toEqual(before);
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

  test("rejects customized provider-hostname AuthKit detection without mutation", () => {
    const tree = makeTree();
    const customizedSmoke = oldSmoke.replaceAll("/(?:authkit|workos)/u", "/login\\.workos\\.com/u");
    tree.write("apps/web/e2e/auth.e2e.ts", customizedSmoke);
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(tree.listChanges().map(({ path, content }) => [path, content?.toString()])).toEqual(before);
  });

  test("recognizes a direct origin-based waitForURL transition", async () => {
    const tree = makeTree();
    const compliantSmoke = `const startUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const localOrigin = new URL(startUrl).origin;
await page.waitForURL((location) => location.origin !== localOrigin);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("page.waitForURL((location) => location.origin !== localOrigin)");
  });

  test("recognizes an origin helper used by the actual waitForRequest transition", async () => {
    const tree = makeTree();
    const compliantSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin;
await page.waitForRequest((request) => request.isNavigationRequest() && isOutsideApp(request.url()));\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("isOutsideApp(request.url())");
  });

  test("rejects a fixed-hostname transition despite unrelated origin markers", () => {
    const tree = makeTree();
    const customizedSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";
const applicationOrigin = new URL(baseUrl).origin;
const unrelated = new URL(otherUrl).origin !== applicationOrigin;
expect(new URL(otherUrl).origin).not.toBe(applicationOrigin);
await page.waitForURL("https://login.acme.example/authorize");\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", customizedSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each(['"https://login.acme.example/authorize"', "/login\\.acme\\.example/u"])(
    "rejects provider-hostname transition %s without mutation",
    (transition) => {
      const tree = makeTree();
      const customizedSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";\nawait page.waitForURL(${transition});\n`;
      tree.write("apps/web/e2e/auth.e2e.ts", customizedSmoke);
      const before = snapshotChanges(tree);

      expect(() => migration(tree)).toThrow("Hosted UI transition detection");
      expect(snapshotChanges(tree)).toEqual(before);
    }
  );

  test("rejects transition logic comparing an origin unrelated to AUTH_E2E_BASE_URL", () => {
    const tree = makeTree();
    const unrelatedOriginSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";
const unrelatedOrigin = new URL("https://example.com").origin;
page.waitForURL((url) => url.origin !== unrelatedOrigin);
expect(new URL(page.url()).origin).not.toBe(unrelatedOrigin);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unrelatedOriginSmoke);
    const before = tree.listChanges().map(({ path, content }) => [path, content?.toString()]);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
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
