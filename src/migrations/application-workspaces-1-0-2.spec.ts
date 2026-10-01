import { describe, expect, test } from "bun:test";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx migration fixtures exercise promise-returning formatFiles and serialize virtual-tree JSON directly. */
import { readJson, readJsonFile } from "@nx/devkit";
import { findMatchingConfigFiles } from "@nx/devkit/internal";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import migration from "./application-workspaces-1-0-2.js";

interface VitestPluginRegistration {
  exclude?: string[];
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
    const { scripts } = readJson<{ scripts: { "boundaries:check"?: string; check: string } }>(tree, "package.json");
    expect(scripts.check).toContain(":(glob)apps/*/src/routeTree.gen.ts");
    expect(scripts.check).not.toContain("bun run boundaries:check");
    expect(scripts["boundaries:check"]).toBeUndefined();
    for (const path of ["apps/web/package.json", "apps/admin/package.json", "packages/backend/package.json"])
      expect(readJson<{ nx: { targets: { dev: { continuous: boolean } } } }>(tree, path).nx.targets.dev.continuous).toBe(true);
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/web/package.json").nx.tags).toEqual(["type:app", "scope:web"]);
    expect(readJson<{ nx: { tags: string[] } }>(tree, "apps/admin/package.json").nx.tags).toEqual(["scope:admin", "type:app"]);
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain("depConstraints: [");
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain("sourceTag: 'type:app'");
    expect(tree.exists("tools/dependency-boundaries.ts")).toBe(false);
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

  test("treats an identical ordered partial inclusion and negation as harmless", async () => {
    const tree = makeTree();
    const projectRegistration = {
      include: ["apps/pro*/vite.config.ts", "!apps/pro*/vite.config.ts"],
      options: { testMode: "watch", testTargetName: "other-test" },
      plugin: "@nx/vitest",
    };
    tree.write("nx.json", JSON.stringify({ plugins: [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])] }));

    expect(findMatchingConfigFiles(["apps/pro/vite.config.ts"], projectRegistration.include, [])).toEqual([]);
    await migration(tree);

    const { plugins } = readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json");
    expect(plugins[0]).toEqual(projectRegistration);
    expect(plugins[1]?.exclude).toEqual(["apps/*/vite.config.ts"]);
  });

  test("treats identical partial include and exclude scopes as harmless", async () => {
    const tree = makeTree();
    const projectRegistration = {
      exclude: ["apps/pro*/vite.config.ts"],
      include: ["apps/pro*/vite.config.ts"],
      options: { testMode: "watch", testTargetName: "other-test" },
      plugin: "@nx/vitest",
    };
    tree.write("nx.json", JSON.stringify({ plugins: [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])] }));

    expect(findMatchingConfigFiles(["apps/pro/vite.config.ts"], projectRegistration.include, projectRegistration.exclude)).toEqual([]);
    await migration(tree);

    const { plugins } = readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json");
    expect(plugins[0]).toEqual(projectRegistration);
    expect(plugins[1]?.exclude).toEqual(["apps/*/vite.config.ts"]);
  });

  test("leaves an already-compliant registration with cancelled partial scope unchanged", async () => {
    const tree = makeTree();
    await migration(tree);
    const plugins = [
      {
        exclude: ["apps/pro*/vite.config.ts"],
        include: ["apps/pro*/vite.config.ts"],
        options: { testMode: "watch", testTargetName: "other-test" },
        plugin: "@nx/vitest",
      },
      vitestRegistration(["apps/*/vite.config.ts"]),
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));

    await migration(tree);

    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins).toEqual(plugins);
  });

  test("keeps coverage when the exclude removes only part of the include", () => {
    const tree = makeTree();
    const include = ["apps/pro*/vite.config.ts"];
    const exclude = ["apps/pro-admin/vite.config.ts"];
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [
          { exclude, include, options: { testMode: "watch", testTargetName: "other-test" }, plugin: "@nx/vitest" },
          vitestRegistration(["apps/web/vite.config.ts"]),
        ],
      })
    );
    const before = snapshotChanges(tree);

    expect(findMatchingConfigFiles(["apps/pro/vite.config.ts"], include, exclude)).toEqual(["apps/pro/vite.config.ts"]);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("treats whole-class include and exclude scopes as harmless", async () => {
    const tree = makeTree();
    const projectRegistration = {
      exclude: ["apps/*/vite.config.ts"],
      include: ["apps/*/vite.config.ts"],
      options: { testMode: "watch", testTargetName: "other-test" },
      plugin: "@nx/vitest",
    };
    tree.write("nx.json", JSON.stringify({ plugins: [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])] }));

    await migration(tree);

    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins[0]).toEqual(projectRegistration);
  });

  test.each([
    { patterns: ["apps/pro*/vite.config.ts", "!apps/pro-admin/vite.config.ts"] },
    { patterns: ["!apps/pro-admin/vite.config.ts", "apps/pro*/vite.config.ts"] },
    { patterns: ["apps/pro*/vite.config.ts", "!apps/pro*/vite.config.ts", "apps/pro-admin/vite.config.ts"] },
  ])("treats identical ordered include/exclude matchers as harmless: %j", async ({ patterns: orderedPatterns }) => {
    const patterns = [...orderedPatterns];
    const tree = makeTree();
    const projectRegistration = {
      exclude: patterns,
      include: patterns,
      options: { testMode: "watch", testTargetName: "other-test" },
      plugin: "@nx/vitest",
    };
    const configs = ["apps/pro/vite.config.ts", "apps/pro-admin/vite.config.ts", "apps/web/vite.config.ts"];
    expect(findMatchingConfigFiles(configs, patterns, patterns)).toEqual([]);
    tree.write("nx.json", JSON.stringify({ plugins: [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])] }));
    await migration(tree);
    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins[0]).toEqual(projectRegistration);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    { exclude: ["apps/pr[o]/vite.config.ts"], include: ["apps/pro/vite.config.ts"] },
    { exclude: ["apps/pr[o]*/vite.config.ts"], include: ["apps/pro*/vite.config.ts"] },
    { exclude: ["apps/pro**/vite.config.ts"], include: ["apps/pro*/vite.config.ts"] },
    { exclude: ["apps/pro/vite.config.ts"], include: ["apps/pr[o]/vite.config.ts"] },
    { exclude: ["apps/@(pro|admin)/vite.config.ts"], include: ["apps/{pro,admin}/vite.config.ts"] },
    { exclude: ["apps/{admin,pro}/vite.config.ts"], include: ["apps/{pro,admin}/vite.config.ts"] },
    { exclude: ["apps/pr[o]/vite.config.ts", "!apps/admin/vite.config.ts"], include: ["apps/pro/vite.config.ts"] },
  ])("uses Nx matching for equivalent finite scopes and compiled patterns: %j", async ({ exclude, include }) => {
    const tree = makeTree();
    const registration = {
      exclude: [...exclude],
      include: [...include],
      options: { testMode: "watch", testTargetName: "custom-test" },
      plugin: "@nx/vitest",
    };
    expect(
      findMatchingConfigFiles(["apps/pro/vite.config.ts", "apps/admin/vite.config.ts"], registration.include, registration.exclude)
    ).toEqual([]);
    tree.write("nx.json", JSON.stringify({ plugins: [registration, vitestRegistration(["apps/web/vite.config.ts"])] }));
    await migration(tree);
    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins[0]).toEqual(registration);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects a finite include scope when Nx still matches one application", () => {
    const tree = makeTree();
    const registration = {
      exclude: ["apps/pr[o]/vite.config.ts"],
      include: ["apps/{pro,admin}/vite.config.ts"],
      options: { testMode: "watch", testTargetName: "custom-test" },
      plugin: "@nx/vitest",
    };
    tree.write("nx.json", JSON.stringify({ plugins: [registration, vitestRegistration(["apps/web/vite.config.ts"])] }));
    expect(
      findMatchingConfigFiles(["apps/pro/vite.config.ts", "apps/admin/vite.config.ts"], registration.include, registration.exclude)
    ).toEqual(["apps/admin/vite.config.ts"]);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("keeps coverage when a broad include has a narrower exclude", () => {
    const tree = makeTree();
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [
          {
            exclude: ["apps/pro*/vite.config.ts"],
            include: ["apps/**/vite.config.ts"],
            options: { testMode: "watch", testTargetName: "other-test" },
            plugin: "@nx/vitest",
          },
          vitestRegistration(["apps/web/vite.config.ts"]),
        ],
      })
    );

    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
  });

  test("keeps coverage when an ordered exclusion re-enables a partial region", () => {
    const tree = makeTree();
    const exclude = ["apps/pro*/vite.config.ts", "!apps/pro*/vite.config.ts"];
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [
          {
            exclude,
            include: ["apps/pro*/vite.config.ts"],
            options: { testMode: "watch", testTargetName: "other-test" },
            plugin: "@nx/vitest",
          },
          vitestRegistration(["apps/web/vite.config.ts"]),
        ],
      })
    );

    expect(findMatchingConfigFiles(["apps/pro/vite.config.ts"], ["apps/pro*/vite.config.ts"], exclude)).toEqual([
      "apps/pro/vite.config.ts",
    ]);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
  });

  test("leaves compliant state with a cancelled partial application scope semantically unchanged", async () => {
    const tree = makeTree();
    await migration(tree);
    const plugins = [
      {
        include: ["apps/pro*/vite.config.ts", "!apps/pro*/vite.config.ts"],
        options: { testMode: "watch", testTargetName: "other-test" },
        plugin: "@nx/vitest",
      },
      vitestRegistration(["apps/*/vite.config.ts"]),
    ];
    tree.write("nx.json", JSON.stringify({ plugins }));

    await migration(tree);

    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins).toEqual(plugins);
  });

  test("treats the reversed partial negation as covering", () => {
    const tree = makeTree();
    const include = ["!apps/pro*/vite.config.ts", "apps/pro*/vite.config.ts"];
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [
          { include, options: { testMode: "watch", testTargetName: "other-test" }, plugin: "@nx/vitest" },
          vitestRegistration(["apps/web/vite.config.ts"]),
        ],
      })
    );

    expect(findMatchingConfigFiles(["apps/pro/vite.config.ts"], include, [])).toEqual(["apps/pro/vite.config.ts"]);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
  });

  test("treats an exact class inclusion followed by exclusion as harmless", async () => {
    const tree = makeTree();
    const projectRegistration = {
      include: ["apps/*/vite.config.ts", "!apps/*/vite.config.ts"],
      options: { testMode: "watch", testTargetName: "other-test" },
      plugin: "@nx/vitest",
    };
    tree.write("nx.json", JSON.stringify({ plugins: [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])] }));

    await migration(tree);

    expect(readJson<{ plugins: VitestPluginRegistration[] }>(tree, "nx.json").plugins[0]).toEqual(projectRegistration);
  });

  test("keeps covering when a different partial negation cannot prove cancellation", () => {
    const tree = makeTree();
    tree.write(
      "nx.json",
      JSON.stringify({
        plugins: [
          {
            include: ["apps/pro*/vite.config.ts", "!apps/pro-admin/vite.config.ts"],
            options: { testMode: "watch", testTargetName: "other-test" },
            plugin: "@nx/vitest",
          },
          vitestRegistration(["apps/web/vite.config.ts"]),
        ],
      })
    );

    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
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

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
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

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
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

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(source).toContain("onlyDependOnLibsWithTags: ['scope:shared'], sourceTag: 'scope:web'");
    expect([...source.matchAll(/sourceTag: 'type:app'/gu)]).toHaveLength(1);
  });

  test.each([
    '{ allSourceTags: ["type:app"], onlyDependOnLibsWithTags: ["scope:shared"] }',
    '{ sourceTag: "scope:admin", notDependOnLibsWithTags: ["scope:ui"] }',
    '{ sourceTag: "scope:admin", allowedExternalImports: ["example"] }',
    '{ sourceTag: "scope:admin", bannedExternalImports: ["example"] }',
  ])("preserves native Nx constraint customization: %s", async (constraint) => {
    const tree = makeTree();
    addInlineConstraint(tree, constraint);
    await migration(tree);
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain(constraint.replaceAll('"', "'"));
    const before = snapshotChanges(tree);
    await migration(tree);
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

  test.each([
    'url.hostname === "login.workos.com"',
    'url.origin === "https://login.workos.com"',
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- Literal fixture source tests a dynamic provider hostname.
    "url.origin === `https://login.${providerName}.example`",
    '"https://login.acme.example" === url.origin',
    'url["origin"] === "https://login.authkit.com"',
    'url.origin.startsWith("https://login.acme.example")',
    'url.origin === new URL("https://login.acme.example").origin',
    'url.toString().startsWith("https://login.workos.com")',
    'url["toString"]() === "https://login.acme.example/"',
    'url.toJSON().includes("login.authkit.com")',
    'String(url).startsWith("https://login.acme.example")',
    "/login\\.workos\\.com/u.test(url.toString())",

    '"login.workos.com" === url.hostname',
    'url.hostname !== "login.workos.com"',
    'url.host == "login.authkit.com"',
    'url["hostname"] === "login.acme.example"',
    "url.hostname === providerHost",
    "isAllowedHost(url.hostname)",
  ])("rejects hostname-coupled URL predicates regardless of comparison: %s", (condition) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const providerHost = "login.acme.example";
const isAllowedHost = (hostname) => hostname === providerHost;
await page.waitForURL((url) => url.origin !== appOrigin && ${condition});\n`
    );
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "url.hostname.length > 0",
    'url.host !== ""',
    "/\\S/u.test(url.hostname)",
    'url.toString().includes("/authorize")',
    'diagnostic.toString() === "https://login.workos.com"',
    "hasHostname(url.hostname)",
  ])("preserves provider-independent transition conditions: %s", async (condition) => {
    const tree = makeTree();
    const source = `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const diagnostic = { toString: () => "https://login.workos.com" };
const hasHostname = (hostname) => hostname.length > 0;
await page.waitForURL((url) => url.origin !== appOrigin && ${condition});\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("url.origin !== appOrigin");
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects hostname coupling inside a request helper", () => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const isHostedUi = (request) => request.isNavigationRequest() && new URL(request.url()).origin !== appOrigin && new URL(request.url()).hostname === "login.acme.example";
await page.waitForRequest(isHostedUi);\n`
    );
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects additional hostname coupling in the legacy smoke without mutation", () => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", `${oldSmoke}await page.waitForURL((url) => url.hostname === "login.workos.com");\n`);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "const diagnosticHost = new URL(baseUrl).hostname;",
    "const diagnosticHost = new URL(baseUrl).host;",
    'const providerDocumentation = "https://login.workos.com";',
    'const unusedHostPredicate = (url) => url.hostname === "login.workos.com";',
    'const unusedOriginPredicate = (url) => url.origin === "https://login.workos.com";',
    "const unusedHostPattern = /login\\.workos\\.com/u;",
  ])("preserves unrelated hostname diagnostics and unused provider references: %s", async (diagnostic) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
${diagnostic}
await page.waitForURL((url) => url.origin !== appOrigin);\n`
    );
    await migration(tree);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("url.origin !== appOrigin");
  });

  test.each([
    '(process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173")',
    'process.env["AUTH_E2E_BASE_URL"] ?? "http://localhost:4173"',
    '(process.env.AUTH_E2E_BASE_URL) ?? "http://localhost:4173"',
  ])("preserves application-derived origin authority: %s", async (authority) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = ${authority};
const appOrigin = new URL(baseUrl).origin;
await page.waitForURL((url) => url.origin !== appOrigin);\n`
    );
    await migration(tree);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves diagnostic statements inside a called helper", async () => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
function isReady(url) {
  console.log(url.hostname);
  const diagnosticHost = url.host;
  return true;
}
await page.waitForURL((url) => url.origin !== appOrigin && isReady(url));\n`
    );
    await migration(tree);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("resolves helper names in the transition's lexical scope", async () => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const isReady = (url) => url.hostname === "login.workos.com";
{
  const isReady = (url) => true;
  await page.waitForURL((url) => url.origin !== appOrigin && isReady(url));
}\n`
    );
    await migration(tree);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    'const providerOrigin = "https://login.workos.com";\nawait page.waitForURL((url) => url.origin !== appOrigin && url.origin === providerOrigin);',
    'const isProvider = (url) => url.origin === "https://login.workos.com" && process.env.AUTH_E2E_BASE_URL;\nawait page.waitForURL((url) => url.origin !== appOrigin && isProvider(url));',
    'const expectedOrigin = new URL("https://login.acme.example").origin;\nconst isProvider = (url) => url.origin === expectedOrigin;\nawait page.waitForURL((url) => url.origin !== appOrigin && isProvider(url));',
    'function isProvider(url) { return url.origin === "https://login.workos.com"; }\nawait page.waitForURL((url) => url.origin !== appOrigin && isProvider(url));',
    'function isProvider(url) { const origin = url.origin; return origin === "https://login.acme.example"; }\nawait page.waitForURL((url) => url.origin !== appOrigin && isProvider(url));',
    'await page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).origin !== appOrigin && request.url().startsWith("https://login.acme.example"));',
  ])("rejects provider origins through actual predicate bindings without mutation: %s", (transition) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
${transition}\n`
    );
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves unrelated hostname diagnostics while migrating the legacy smoke", async () => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", `${oldSmoke}const diagnosticHost = new URL(baseUrl).hostname;\n`);
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("new URL(baseUrl).hostname");
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("url.origin !== applicationOrigin");
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

  test.each([
    "await page.waitForURL(url => url.origin !== appOrigin);",
    "await page.waitForURL((url: URL) => url.origin !== appOrigin);",
    "await page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).origin !== appOrigin);",
    "const isOutsideApp = url => url.origin !== appOrigin;\nawait page.waitForURL(isOutsideApp);",
    "const isOutsideApp = url => url.origin !== appOrigin;\nawait page.waitForURL(url => isOutsideApp(url) && !isBlocked(url));",
    "const isHostedUi = request => request.isNavigationRequest() && new URL(request.url()).origin !== appOrigin;\nawait page.waitForRequest(isHostedUi);",
    "const isNavigation = request => request.isNavigationRequest();\nconst isOutsideApp = url => new URL(url).origin !== appOrigin;\nawait page.waitForRequest(request => isNavigation(request) && isOutsideApp(request.url()));",
  ])("preserves AST-recognized callbacks and directly used helpers: %s", async (transition) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
${transition}\n`
    );
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("appOrigin");
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "await page.waitForURL(url => url.origin !== appOrigin || true);",
    "await page.waitForRequest(request => new URL(request.url()).origin !== appOrigin);",
    "await page.waitForRequest(request => request.isNavigationRequest() || new URL(request.url()).origin !== appOrigin);",
    "const isOutsideApp = url => url.origin !== appOrigin || true;\nawait page.waitForURL(isOutsideApp);",
  ])("rejects bypassable parenthesis-free predicates without mutation: %s", (transition) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
${transition}\n`
    );
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    'url.toString().toLowerCase().includes("login.workos.com")',
    'url.toString().toUpperCase().startsWith("HTTPS://LOGIN.WORKOS.COM")',
    'url.href.toLowerCase().endsWith("login.authkit.com")',
    "String(url).toLowerCase().match(/login\\.workos\\.com/u)",
    'url.href.toUpperCase().search("LOGIN.AUTHKIT.COM") >= 0',
    'url.toString().trim().indexOf("login.workos.com") >= 0',
    'url.toString().normalize().lastIndexOf("login.authkit.com") >= 0',
    'url.toString().customTransform().includes("login.workos.com")',
    "isProvider(url)",
  ])("rejects transformed navigation URL coupling without mutation: %s", (condition) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const providerHost = "login.workos.com";
const isProvider = url => {
  const address = url.toString();
  const normalized = address.toLowerCase();
  return normalized.includes(providerHost);
};
await page.waitForURL(url => url.origin !== appOrigin && ${condition});\n`
    );
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "url.origin !== appOrigin",
    'url.origin !== appOrigin && url.toString().toLowerCase().includes("/authorize")',
    'url.origin !== appOrigin && diagnostic.toLowerCase().includes("login.workos.com")',
  ])("preserves provider-independent predicates with unrelated transformations: %s", async (predicate) => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const diagnostic = "LOGIN.WORKOS.COM".toUpperCase();
const unusedProvider = "LOGIN.AUTHKIT.COM".toLowerCase();
await page.waitForURL(url => ${predicate});\n`
    );
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("url.origin !== appOrigin");
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("recognizes origin departure in a required URL conjunction", async () => {
    const tree = makeTree();
    const compliantSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
await page.waitForURL((url) => url.origin !== appOrigin && anotherRequiredCondition);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("url.origin !== appOrigin && anotherRequiredCondition");
  });

  test.each([
    "url.origin !== appOrigin && !isBlocked(url)",
    "!isBlocked(url) && (url.origin !== appOrigin)",
    "(url.origin !== appOrigin && !isBlocked(url))",
    "((url.origin !== appOrigin) && !(isBlocked(url)))",
  ])("preserves required origin departure with unrelated negation: %s", async (predicate) => {
    const tree = makeTree();
    const smoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
await page.waitForURL((url) => ${predicate});\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", smoke);
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("url.origin !== appOrigin");
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("!isBlocked(url)");
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves unrelated negation in origin and navigation helpers", async () => {
    const tree = makeTree();
    tree.write(
      "apps/web/e2e/auth.e2e.ts",
      `const baseUrl = process.env.AUTH_E2E_BASE_URL;
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin && !isBlocked(url);
const isNavigation = (request) => request.isNavigationRequest() && !isBlocked(request);
await page.waitForRequest((request) => isNavigation(request) && isOutsideApp(request.url()) && !isBlocked(request));\n`
    );
    await migration(tree);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("recognizes a directly passed helper that requires origin departure", async () => {
    const tree = makeTree();
    const compliantSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: URL) => url.origin !== appOrigin;
await page.waitForURL(isOutsideApp);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("page.waitForURL(isOutsideApp)");
  });

  test("recognizes an origin helper in a required URL conjunction", async () => {
    const tree = makeTree();
    const compliantSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: URL) => url.origin !== appOrigin;
await page.waitForURL((url) => isOutsideApp(url) && anotherRequiredCondition);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("isOutsideApp(url) && anotherRequiredCondition");
  });

  test.each([
    "url.origin !== appOrigin || true",
    "otherCondition || url.origin !== appOrigin",
    "condition ? url.origin !== appOrigin : true",
    "!(url.origin !== appOrigin) && anotherCondition",
    "!(url.origin !== appOrigin && anotherCondition)",
  ])("rejects optional or negated URL origin departure: %s", (predicate) => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
await page.waitForURL((url) => ${predicate});\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects a directly passed helper with optional origin departure", () => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: URL) => url.origin !== appOrigin || true;
await page.waitForURL(isOutsideApp);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
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

  test("recognizes reordered navigation and origin checks in the request predicate", async () => {
    const tree = makeTree();
    const compliantSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin;
await page.waitForRequest((request) => isOutsideApp(request.url()) && request.isNavigationRequest());\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("request.isNavigationRequest()");
  });

  test("rejects waitForRequest with origin departure but no navigation check", () => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin;
await page.waitForRequest((request) => isOutsideApp(request.url()));\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects waitForRequest with navigation but no origin departure", () => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
await page.waitForRequest((request) => request.isNavigationRequest());\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects ambiguous request logic that does not require both navigation and origin departure", () => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin;
await page.waitForRequest((request) => request.isNavigationRequest() || (isOutsideApp(request.url()) && otherCondition));\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects a negated navigation check even when origin departure is required", () => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin;
await page.waitForRequest((request) => !request.isNavigationRequest() && isOutsideApp(request.url()));\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("recognizes a helper that enforces navigation and origin departure", async () => {
    const tree = makeTree();
    const compliantSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isHostedUiNavigation = (request) =>
  request.isNavigationRequest() && new URL(request.url()).origin !== appOrigin;
await page.waitForRequest(isHostedUiNavigation);\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", compliantSmoke);

    await migration(tree);

    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toContain("page.waitForRequest(isHostedUiNavigation)");
  });

  test("does not borrow an unrelated navigation check for an unsafe request wait", () => {
    const tree = makeTree();
    const unsafeSmoke = `const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:4173";
const appOrigin = new URL(baseUrl).origin;
const isOutsideApp = (url: string) => new URL(url).origin !== appOrigin;
const unrelatedNavigation = (request) => request.isNavigationRequest();
await page.waitForRequest((request) => isOutsideApp(request.url()));\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", unsafeSmoke);
    const before = snapshotChanges(tree);

    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
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
