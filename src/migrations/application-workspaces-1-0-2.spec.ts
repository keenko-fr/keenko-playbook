import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Native Nx migration fixtures read the packaged release baselines.
import { readFileSync } from "node:fs";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx migration fixtures exercise promise-returning formatFiles and serialize virtual-tree JSON directly. */
import { formatFiles, readJson, readJsonFile } from "@nx/devkit";
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
const oldSmoke = readFileSync(new URL("files/application-workspaces-1-0-2/auth.e2e.1-0-1.ts.template", import.meta.url), "utf-8");
const targetSmoke = readFileSync(new URL("files/application-workspaces-1-0-2/auth.e2e.1-0-2.ts.template", import.meta.url), "utf-8");

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

  test("migrates the complete 1.0.1 smoke to the current generated 1.0.2 baseline", async () => {
    const generated = readFileSync(new URL("../generators/preset/files/web/e2e/auth.e2e.ts.template", import.meta.url), "utf-8");
    expect(targetSmoke).toBe(generated);
    const expected = makeTree();
    expected.write("apps/web/e2e/auth.e2e.ts", targetSmoke);
    await formatFiles(expected);
    const tree = makeTree();
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(expected.read("apps/web/e2e/auth.e2e.ts", "utf-8"));
  });

  test("recognizes the formatted 1.0.1 smoke without semantic interpretation", async () => {
    const tree = makeTree();
    await formatFiles(tree);
    await migration(tree);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("leaves the recognized 1.0.2 target smoke unchanged", async () => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", targetSmoke);
    await formatFiles(tree);
    const original = tree.read("apps/web/e2e/auth.e2e.ts", "utf-8");
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(original);
  });

  test("supports a repository without the optional AuthKit smoke", async () => {
    const tree = makeTree();
    tree.delete("apps/web/e2e/auth.e2e.ts");
    await migration(tree);
    expect(tree.exists("apps/web/e2e/auth.e2e.ts")).toBe(false);
  });

  test.each([
    ["customized old base URL", oldSmoke.replace("http://localhost:3210", "http://localhost:4173")],
    ["partial old baseline", oldSmoke.replace("await expect(page).toHaveURL(/(?:authkit|workos)/u);", "")],
    [
      "mixed old and target detection",
      oldSmoke.replace("page.waitForURL(/(?:authkit|workos)/u)", "page.waitForURL(url => url.origin !== applicationOrigin)"),
    ],
    ["customized return-route assertion", targetSmoke.replace("/mon-espace", "/dashboard")],
    ["customized identity assertion", targetSmoke.replace("convex-authenticated", "custom-authenticated")],
    [
      "behaviorally compatible callback",
      targetSmoke.replace(
        "(url) => url.origin !== applicationOrigin",
        "url => { if (url.origin !== applicationOrigin) return true; return false; }"
      ),
    ],
    [
      "behaviorally compatible multi-return helper",
      targetSmoke.replace(
        "(url) => url.origin !== applicationOrigin",
        "url => { if (ready) return url.origin !== applicationOrigin; return url.origin !== applicationOrigin; }"
      ),
    ],
    ["custom helper graph", targetSmoke.replace("(url) => url.origin !== applicationOrigin", "isOutsideApp")],
    [
      "dynamic provider configuration",
      targetSmoke.replace(
        "(url) => url.origin !== applicationOrigin",
        "url => url.origin !== applicationOrigin && url.hostname === process.env.WORKOS_HOST"
      ),
    ],
    ["added diagnostics", `${oldSmoke}const diagnosticHost = new URL(baseUrl).hostname;\n`],
    ["malformed target", targetSmoke.slice(0, -4)],
    ["empty smoke", ""],
  ])("requires manual reconciliation for unrecognized AuthKit state: %s", (_name, source) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually, then rerun the Keenko migration");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    ["nx.json", JSON.stringify({ plugins: [vitestRegistration(["apps/custom/vite.config.ts"])] }), "nx.json"],
    ["package.json", JSON.stringify({ scripts: { check: "custom check" } }), "scripts.check generated route-tree path"],
    [
      "oxlint.config.ts",
      oldOxlint.replace('"scope:backend", "scope:ui", "scope:shared"', '"scope:ui", "scope:shared"'),
      "application dependency constraint",
    ],
    [
      "apps/admin/package.json",
      JSON.stringify({ nx: { tags: ["type:package", "scope:admin"] }, scripts: { dev: "vite dev" } }),
      "nx.tags application classification",
    ],
    [
      "packages/backend/package.json",
      JSON.stringify({ nx: { tags: ["scope:backend"], targets: { dev: { continuous: false } } }, scripts: { dev: "confect dev" } }),
      "nx.targets.dev.continuous",
    ],
  ])("fails atomically when a later surface conflicts: %s", (path, source, message) => {
    const tree = makeTree();
    tree.write(path, source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow(message);
    expect(snapshotChanges(tree)).toEqual(before);
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
