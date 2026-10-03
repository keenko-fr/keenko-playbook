import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Native Nx migration fixtures read the packaged release baselines.
import { readFileSync } from "node:fs";

/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- Native Nx migration fixtures exercise promise-returning formatFiles and serialize virtual-tree JSON directly. */
import { formatFiles, readJson, readJsonFile } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";

import { generatedDriftCheck } from "../generators/preset/preset.js";
import migration from "./application-workspaces-1-0-2.js";

const sourceDriftCheck = "git status --porcelain --untracked-files=all -- apps/web/src/routeTree.gen.ts";
const targetDriftCheck = "git status --porcelain --untracked-files=all -- ':(glob)apps/*/src/routeTree.gen.ts'";
const oldCheck = `nx sync:check && ${sourceDriftCheck}`;
const oldOxlint = `import { defineConfig } from "oxlint";

export default defineConfig({
  overrides: [{ files: ["apps/web/**/*.{ts,tsx}"], rules: { "eslint/sort-keys": "off" } }],
  rules: {
    "@nx/enforce-module-boundaries": ["error", {
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
// Copied from the v1.0.1 release, not reconstructed from current generator output.
const releasedOxlint = readFileSync(new URL("__fixtures__/oxlint.1-0-1.ts.template", import.meta.url), "utf-8");
const releasedDriftCheck = readFileSync(new URL("__fixtures__/drift-check.1-0-1.txt", import.meta.url), "utf-8");

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
  test("migrates the frozen released Oxlint baseline to the actual generator target", async () => {
    const tree = makeTree();
    tree.write("oxlint.config.ts", releasedOxlint);
    await migration(tree);
    expect(tree.read("oxlint.config.ts", "utf-8")).toBe(
      readFileSync(new URL("../generators/preset/files/root/oxlint.config.ts.template", import.meta.url), "utf-8")
    );
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

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

    expect(
      plan.migrations
        .filter(({ name }) => name === "1.0.2-application-workspaces")
        .map(({ name, package: packageName, version }) => ({ name, packageName, version }))
    ).toEqual([{ name: "1.0.2-application-workspaces", packageName: "keenko", version: "1.0.2-rc.0" }]);
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
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain('sourceTag: "type:app"');
    expect(tree.exists("tools/dependency-boundaries.ts")).toBe(false);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).not.toContain("authkit|workos");
  });

  test("recognizes the target Vitest registration as a no-op", async () => {
    const tree = makeTree();
    const nxJson = { analytics: false, plugins: [vitestRegistration(["apps/*/vite.config.ts"])] };
    tree.write("nx.json", JSON.stringify(nxJson));
    await migration(tree);
    expect(readJson(tree, "nx.json")).toEqual(nxJson);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each(["apps/web/vite.config.ts", "apps/*/vite.config.ts"])(
    "uses the unique Vitest marker over unrelated same-option registrations: %s",
    async (marker) => {
      const tree = makeTree();
      const unrelated = [vitestRegistration(["tools/**"]), vitestRegistration(["packages/custom/**"])];
      tree.write("nx.json", JSON.stringify({ plugins: [unrelated[0], vitestRegistration([marker]), unrelated[1]] }));
      await migration(tree);
      expect(readJson(tree, "nx.json")).toEqual({
        plugins: [unrelated[0], vitestRegistration(["apps/*/vite.config.ts"]), unrelated[1]],
      });
      const before = snapshotChanges(tree);
      await migration(tree);
      expect(snapshotChanges(tree)).toEqual(before);
    }
  );

  test("conflicts instead of choosing among marker-free plausible Vitest registrations", () => {
    const tree = makeTree();
    tree.write("nx.json", JSON.stringify({ plugins: [vitestRegistration(["tools/**"]), vitestRegistration(["apps/custom/**"])] }));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    { exclude: ["apps/pro*/vite.config.ts"], include: ["apps/pro?/vite.config.ts"], plugin: "@nx/vitest" },
    { include: ["apps/**/vite.config.ts"], plugin: "@nx/vitest" },
    { include: ["apps/**/vite.config.ts"], options: { testMode: "run", testTargetName: "test" }, plugin: "@nx/vitest" },
    { options: { testMode: "watch", testTargetName: "custom-test" }, plugin: "@nx/vitest" },
    { include: ["tools/**"], options: { testMode: "run", testTargetName: "test" }, plugin: "@nx/vitest" },
    {
      exclude: ["project/custom/**"],
      include: ["apps/**"],
      options: { testMode: "run", testTargetName: "custom-test" },
      plugin: "@nx/vitest",
    },
  ])("preserves unrelated Vitest registrations regardless of application coverage: %j", async (projectRegistration) => {
    const tree = makeTree();
    const nxJson = {
      analytics: false,
      plugins: [projectRegistration, vitestRegistration(["apps/web/vite.config.ts"])],
      targetDefaults: { build: { cache: true } },
    };
    tree.write("nx.json", JSON.stringify(nxJson));
    await migration(tree);
    expect(readJson(tree, "nx.json")).toEqual({ ...nxJson, plugins: [projectRegistration, vitestRegistration(["apps/*/vite.config.ts"])] });
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves multiple unrelated registrations and fields outside the owned scope", async () => {
    const tree = makeTree();
    const unrelated = [
      "@nx/js/typescript",
      { exclude: ["apps/pro*/vite.config.ts"], include: ["apps/pro?/vite.config.ts"], plugin: "@nx/vitest" },
      { include: ["apps/**/vite.config.ts"], options: { testMode: "run", testTargetName: "product-test" }, plugin: "@nx/vitest" },
      { include: ["tools/**"], options: { testMode: "run", testTargetName: "test" }, plugin: "@nx/vitest" },
    ];
    const owned = {
      ...vitestRegistration(["apps/web/vite.config.ts"]),
      options: { ciTargetName: "test-ci", testMode: "run", testTargetName: "test" },
    };
    const nxJson = { plugins: [unrelated[0], owned, ...unrelated.slice(1)], sync: { globalGenerators: ["keenko:sync"] } };
    tree.write("nx.json", JSON.stringify(nxJson));
    await migration(tree);
    expect(readJson(tree, "nx.json")).toEqual({
      ...nxJson,
      plugins: [unrelated[0], { ...owned, exclude: ["apps/*/vite.config.ts"] }, ...unrelated.slice(1)],
    });
  });

  test.each([
    { ...vitestRegistration(["apps/custom/vite.config.ts"]) },
    { ...vitestRegistration(["tools/**"]) },
    { ...vitestRegistration(["apps/**/vite.config.ts"]) },
    { options: { testMode: "run", testTargetName: "test" }, plugin: "@nx/vitest" },
    { ...vitestRegistration([]), exclude: "apps/web/vite.config.ts" },
  ])("rejects unrecognized Vitest exclusion markers atomically: %j", (registration) => {
    const tree = makeTree();
    tree.write("nx.json", JSON.stringify({ plugins: [registration] }));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually, then rerun the Keenko migration");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    {
      exclude: ["tools/**", "apps/web/vite.config.ts"],
      include: ["apps/**"],
      options: { testMode: "watch", testTargetName: "custom" },
      plugin: "@nx/vitest",
    },
    { exclude: ["apps/*/vite.config.ts", "!apps/admin/vite.config.ts"], include: [], plugin: "@nx/vitest" },
    { exclude: ["apps/web/vite.config.ts"], options: { testMode: "watch", testTargetName: "test" }, plugin: "@nx/vitest" },
    {
      custom: true,
      exclude: ["tools/**", "apps/*/vite.config.ts"],
      include: ["custom/**"],
      options: { testMode: "watch", testTargetName: "custom" },
      plugin: "@nx/vitest",
    },
  ])("changes only the owned Vitest exclusion element: %j", async (registration) => {
    const tree = makeTree();
    tree.write("nx.json", JSON.stringify({ plugins: [registration] }));
    await migration(tree);
    expect(readJson(tree, "nx.json")).toEqual({
      plugins: [
        {
          ...registration,
          exclude: registration.exclude.map((value) => (value === "apps/web/vite.config.ts" ? "apps/*/vite.config.ts" : value)),
        },
      ],
    });
  });

  test.each([
    ["apps/web/vite.config.ts", "apps/*/vite.config.ts"],
    ["apps/web/vite.config.ts", "apps/web/vite.config.ts"],
    ["apps/*/vite.config.ts", "apps/*/vite.config.ts"],
  ])("rejects ambiguous duplicate Keenko markers without mutation: %s, %s", (first, second) => {
    const tree = makeTree();
    tree.write("nx.json", JSON.stringify({ plugins: [vitestRegistration([first]), vitestRegistration([second])] }));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each(["apps/web/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"])(
    "preserves unrelated overrides with the application glob: %s",
    async (glob) => {
      const tree = makeTree();
      const source = oldOxlint.replace("overrides: [", `overrides: [{ files: ["${glob}"], rules: { "project/custom-rule": "off" } }, `);
      tree.write("oxlint.config.ts", source);
      await migration(tree);
      const migrated = tree.read("oxlint.config.ts", "utf-8") ?? "";
      expect(migrated).toContain(`files: ["${glob}"], rules: { "project/custom-rule": "off" }`);
      expect(migrated).toContain('files: ["apps/**/*.{ts,tsx}"], rules: { "eslint/sort-keys": "off" }');
    }
  );

  test("preserves unrelated depConstraints before the Nx boundary configuration", async () => {
    const tree = makeTree();
    const unrelated = '{ depConstraints: [{ onlyDependOnLibsWithTags: ["project"], sourceTag: "scope:web" }] }';
    tree.write("oxlint.config.ts", oldOxlint.replace("export default", `const project = ${unrelated};\nexport default`));
    await migration(tree);
    const migrated = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(migrated).toContain(unrelated);
    expect(migrated).toContain('sourceTag: "type:app"');
  });

  test("preserves unrelated override properties and spreads before explicit owned fields", async () => {
    const tree = makeTree();
    const unrelated = '{ files: ["tools/**"], rules: projectRules, ...projectOverride }';
    const source = oldOxlint
      .replace("overrides: [", `overrides: [${unrelated}, `)
      .replace('rules: { "eslint/sort-keys"', 'rules: { ...projectRules, "eslint/sort-keys"')
      .replace('"@nx/enforce-module-boundaries":', '...projectRules, "@nx/enforce-module-boundaries":');
    tree.write("oxlint.config.ts", source);
    await migration(tree);
    expect(tree.read("oxlint.config.ts", "utf-8")).toBe(
      source
        .replace('files: ["apps/web/**/*.{ts,tsx}"]', 'files: ["apps/**/*.{ts,tsx}"]')
        .replace('sourceTag: "scope:web"', 'sourceTag: "type:app"')
    );
  });

  test.each([
    oldOxlint.slice(0, -4),
    oldOxlint.replace('files: ["apps/web/**/*.{ts,tsx}"]', 'files: ["apps/web/**/*.{ts,tsx}"], ...projectOverride'),
    oldOxlint.replace('"eslint/sort-keys": "off"', '"eslint/sort-keys": "off", ...projectRules'),
    oldOxlint.replace('sourceTag: "scope:web"', 'sourceTag: "scope:web", ...projectConstraint'),
    oldOxlint.replace('sourceTag: "scope:web"', 'sourceTag: "scope:web", [projectKey]: "custom"'),
    oldOxlint.replace('sourceTag: "scope:web"', 'sourceTag: "scope:web", sourceTag'),
    oldOxlint.replace('sourceTag: "scope:web"', 'sourceTag: "scope:web", get sourceTag() { return "custom"; }'),
  ])("rejects opaque or duplicate properties that can replace owned Oxlint fields atomically", (source) => {
    const tree = makeTree();
    tree.write("oxlint.config.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    oldOxlint.replace("overrides: [", 'overrides: [{ files: ["apps/web/**/*.{ts,tsx}"], rules: { "eslint/sort-keys": "off" } }, '),
    oldOxlint.replace(
      "depConstraints: [",
      'depConstraints: [{ onlyDependOnLibsWithTags: ["scope:backend", "scope:ui", "scope:shared"], sourceTag: "scope:web" }, '
    ),
    oldOxlint.replace('"@nx/enforce-module-boundaries":', '"@nx/enforce-module-boundaries": [], "@nx/enforce-module-boundaries":'),
  ])("rejects ambiguous owned Oxlint nodes atomically", (source) => {
    const tree = makeTree();
    tree.write("oxlint.config.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("rejects duplicate Vitest markers within one exclusion array atomically", () => {
    const tree = makeTree();
    tree.write("nx.json", JSON.stringify({ plugins: [vitestRegistration(["apps/web/vite.config.ts", "apps/*/vite.config.ts"])] }));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("@nx/vitest application scope");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("migrates only the complete legacy application boundary after a stricter scope rule", async () => {
    const tree = makeTree();
    tree.write(
      "oxlint.config.ts",
      oldOxlint.replace("depConstraints: [", 'depConstraints: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web" }, ')
    );

    await migration(tree);

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(source).toContain('onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web"');
    expect([...source.matchAll(/sourceTag: "type:app"/gu)]).toHaveLength(1);
  });

  test("migrates the legacy boundary despite an unrelated type:app rule", async () => {
    const tree = makeTree();
    tree.write(
      "oxlint.config.ts",
      oldOxlint.replace("depConstraints: [", 'depConstraints: [{ onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "type:app" }, ')
    );

    await migration(tree);

    const source = tree.read("oxlint.config.ts", "utf-8") ?? "";
    expect(source).toContain('onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "type:app"');
    expect([...source.matchAll(/sourceTag: "type:app"/gu)]).toHaveLength(2);
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
    expect(source).toContain('onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:web"');
    expect([...source.matchAll(/sourceTag: "type:app"/gu)]).toHaveLength(1);
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
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain(constraint);
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
    const tree = makeTree();
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(targetSmoke);
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
    ["malformed target", targetSmoke.slice(0, -4)],
    ["empty smoke", ""],
  ])("requires manual reconciliation for unrecognized AuthKit state: %s", (_name, source) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually, then rerun the Keenko migration");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([oldSmoke, targetSmoke])("preserves unrelated AuthKit smoke state around recognized transition fields", async (baseline) => {
    const tree = makeTree();
    const custom = baseline
      .replace("/mon-espace", "/dashboard")
      .replace("convex-authenticated", "custom-authenticated")
      .replace("await page.goto", 'const diagnostic = new URL("https://diagnostic.example").hostname;\n  await page.goto')
      .replace('name: "Mon espace"', 'name: "Dashboard"');
    tree.write("apps/web/e2e/auth.e2e.ts", custom);
    await migration(tree);
    const migrated = tree.read("apps/web/e2e/auth.e2e.ts", "utf-8") ?? "";
    expect(migrated).toContain("/dashboard");
    expect(migrated).toContain("custom-authenticated");
    expect(migrated).toContain("diagnostic.example");
    expect(migrated).toContain("Dashboard");
    expect(migrated).not.toContain("authkit|workos");
    if (baseline === targetSmoke) expect(migrated).toBe(custom);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    ["source", "describe", oldSmoke],
    ["target", "describe", targetSmoke],
    ["source", "only", oldSmoke],
    ["target", "only", targetSmoke],
  ])("recognizes %s AuthKit fields independently of test.%s", async (state, wrapper, baseline) => {
    const tree = makeTree();
    const customized = baseline
      .replace("Google auth reaches Convex identity, WorkOS synchronization, and sign-out", "Project-owned auth test")
      .replace("convex-authenticated", "project-identity")
      .replace("await page.goto", 'const diagnostic = "project-owned";\n  await page.goto');
    const start = customized.indexOf("test(");
    const wrapped =
      wrapper === "only"
        ? customized.replace("test(", "test.only(")
        : `${customized.slice(0, start)}test.describe("auth", () => {\n${customized.slice(start)}\n});\n`;
    tree.write("apps/web/e2e/auth.e2e.ts", wrapped);
    await migration(tree);
    const result = tree.read("apps/web/e2e/auth.e2e.ts", "utf-8") ?? "";
    expect(result).toContain(`test.${wrapper}`);
    expect(result).toContain("Project-owned auth test");
    expect(result).toContain("project-identity");
    expect(result).toContain("project-owned");
    expect(result).not.toContain("authkit|workos");
    if (state === "target") expect(result).toBe(wrapped);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([oldSmoke, targetSmoke])("rejects multiple plausible AuthKit field sets atomically", (baseline) => {
    const tree = makeTree();
    const testBody = baseline.slice(baseline.indexOf("test("));
    tree.write("apps/web/e2e/auth.e2e.ts", `${baseline}test.describe("another", () => {\n${testBody}\n});`);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([oldSmoke, targetSmoke])("ignores unrelated AuthKit URL assertions and waits", async (baseline) => {
    const tree = makeTree();
    const source = baseline
      .replace(
        "await page.goto",
        "await expect(page).toHaveURL( /dashboard/u );\n  await page.waitForURL(/project-route/u);\n  await page.goto"
      )
      .replace("hostedUiDocumentRequest,", "hostedUiDocumentRequest,\n    page.waitForURL(/unrelated-route/u),");
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    await migration(tree);
    const result = tree.read("apps/web/e2e/auth.e2e.ts", "utf-8") ?? "";
    expect(result).toContain("await expect(page).toHaveURL( /dashboard/u );");
    expect(result).toContain("await page.waitForURL(/project-route/u);");
    expect(result).toContain("page.waitForURL(/unrelated-route/u)");
    expect(result).not.toContain("authkit|workos");
    if (baseline === targetSmoke) expect(result).toBe(source);
  });

  test.each([oldSmoke, targetSmoke])("ignores project bindings with incidental AuthKit field names", async (baseline) => {
    const tree = makeTree();
    const diagnostic = 'function diagnostic() { const hostedUiDocumentRequest = "project", baseUrl = "unrelated"; return baseUrl; }';
    const source = `${diagnostic}\n${baseline.replace("await page.goto", 'const baseUrlDiagnostic = "project", hostedUiDocumentRequestDiagnostic = "unrelated";\n  await page.goto')}`;
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    await migration(tree);
    const result = tree.read("apps/web/e2e/auth.e2e.ts", "utf-8") ?? "";
    expect(result).toContain(diagnostic);
    expect(result).toContain('const baseUrlDiagnostic = "project", hostedUiDocumentRequestDiagnostic = "unrelated";');
    if (baseline === targetSmoke) expect(result).toBe(source);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    'if (diagnosticsEnabled) { var applicationOrigin = "project"; }',
    'if (diagnosticsEnabled) {} else { var isOutsideApplicationOrigin = "project"; }',
    "if (diagnosticsEnabled) { var { applicationOrigin } = diagnostics; }",
    "if (diagnosticsEnabled) { var [isOutsideApplicationOrigin] = diagnostics; }",
    "for (var applicationOrigin of diagnostics) {}",
    'while (diagnosticsEnabled) { var isOutsideApplicationOrigin = "project"; }',
    'try { var applicationOrigin = "project"; } catch (error) {}',
    'try {} catch (error) { var isOutsideApplicationOrigin = "project"; }',
    'try {} finally { var applicationOrigin = "project"; }',
    'switch (diagnostic) { case 1: var applicationOrigin = "project"; }',
    "{ { var { nested: { applicationOrigin } } = diagnostics; } }",
  ])("conflicts atomically with nested function-scoped AuthKit bindings: %s", (statement) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", oldSmoke.replace("await page.goto", `${statement}\n  await page.goto`));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection function-scoped binding");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("checks the whole containing function when owned AuthKit fields are in a nested block", () => {
    const tree = makeTree();
    const source = oldSmoke
      .replace("async ({ page }) => {", 'async ({ page }) => { if (diagnosticsEnabled) { var applicationOrigin = "project"; } {')
      .replace("\n});", "\n} });");
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection function-scoped binding");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    'function diagnostic() { var applicationOrigin = "local"; }',
    'const diagnostic = function () { var isOutsideApplicationOrigin = "local"; };',
    'const diagnostic = () => { var applicationOrigin = "local"; };',
    'const diagnostic = { run() { var applicationOrigin = "local"; } };',
    'class Diagnostic { static { var applicationOrigin = "local"; } run() { var isOutsideApplicationOrigin = "local"; } }',
    'if (diagnosticsEnabled) { const applicationOrigin = "local"; let isOutsideApplicationOrigin = "local"; }',
  ])("preserves safe nested AuthKit bindings and remains idempotent: %s", async (statement) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", oldSmoke.replace("await page.goto", `${statement}\n  await page.goto`));
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(targetSmoke.replace("await page.goto", `${statement}\n  await page.goto`));
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "applicationOrigin",
    "isOutsideApplicationOrigin",
    "{ applicationOrigin }",
    "[applicationOrigin]",
    "{ nested: { isOutsideApplicationOrigin } }",
  ])("conflicts atomically with an inserted AuthKit name in callback parameters: %s", (parameter) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", oldSmoke.replace("async ({ page })", `async ({ page }, ${parameter})`));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection parameter binding");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each(["function", "arrow"])("preflights parameters of a %s containing a nested owned block", (wrapper) => {
    const tree = makeTree();
    const source = oldSmoke
      .replace(
        "async ({ page }) => {",
        wrapper === "function"
          ? "async function ({ page }, { nested: { applicationOrigin } }) { {"
          : "async ({ page }, { nested: { applicationOrigin } }) => { {"
      )
      .replace("\n});", "\n} });");
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection parameter binding");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([oldSmoke, targetSmoke])("preserves unrelated AuthKit callback parameter bindings", async (baseline) => {
    const tree = makeTree();
    const parameters = "async ({ page }, { applicationOrigin: origin }, [diagnostic])";
    tree.write("apps/web/e2e/auth.e2e.ts", baseline.replace("async ({ page })", parameters));
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(targetSmoke.replace("async ({ page })", parameters));
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "enum applicationOrigin { ProjectOwned }",
    "const enum isOutsideApplicationOrigin { ProjectOwned }",
    "class applicationOrigin {}",
  ])("rejects direct AuthKit runtime-value binding collisions atomically: %s", (declaration) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", oldSmoke.replace("await page.goto", `${declaration}\n  await page.goto`));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "enum ProjectOwned { Diagnostic }",
    "type applicationOrigin = string; interface isOutsideApplicationOrigin { diagnostic: string }",
    "if (diagnosticsEnabled) { enum applicationOrigin { ProjectOwned } const enum isOutsideApplicationOrigin { ProjectOwned } }",
  ])("preserves unrelated, type-only, and nested enum AuthKit declarations: %s", async (declaration) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", oldSmoke.replace("await page.goto", `${declaration}\n  await page.goto`));
    await migration(tree);
    expect(tree.read("apps/web/e2e/auth.e2e.ts", "utf-8")).toBe(
      targetSmoke.replace("await page.goto", `${declaration}\n  await page.goto`)
    );
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    oldSmoke.replace("await page.goto", 'const applicationOrigin = "project-owned";\n  await page.goto'),
    oldSmoke.replace("await page.goto", "function isOutsideApplicationOrigin() { return true; }\n  await page.goto"),
    oldSmoke.replace("await page.goto", "const { applicationOrigin } = diagnostics;\n  await page.goto"),
    oldSmoke
      .replace('  const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";\n', "")
      .replace(
        "  await expect(page).toHaveURL(/(?:authkit|workos)/u);",
        '  await expect(page).toHaveURL(/(?:authkit|workos)/u);\n  const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";'
      ),
  ])("conflicts before inserting colliding or reordered owned AuthKit fields", (source) => {
    const tree = makeTree();
    tree.write("apps/web/e2e/auth.e2e.ts", source);
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([oldSmoke, targetSmoke])("rejects duplicate exact AuthKit assertions atomically", (baseline) => {
    const tree = makeTree();
    const assertion =
      baseline === oldSmoke
        ? "await expect(page).toHaveURL(/(?:authkit|workos)/u);"
        : "expect(new URL(page.url()).origin).not.toBe(applicationOrigin);";
    tree.write("apps/web/e2e/auth.e2e.ts", baseline.replace(assertion, `${assertion}\n  ${assertion}`));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Hosted UI transition detection");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves unrelated pending caller files without formatting them", async () => {
    const tree = makeTree();
    const source = "const   untouched={value:1}\n";
    tree.write("tools/custom.ts", source);
    await migration(tree);
    expect(tree.read("tools/custom.ts", "utf-8")).toBe(source);
  });

  test("preserves package constraints outside the owned application policy", async () => {
    const tree = makeTree();
    tree.write("oxlint.config.ts", oldOxlint.replace('sourceTag: "scope:backend"', 'sourceTag: "scope:custom-backend"'));
    await migration(tree);
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain("scope:custom-backend");
    expect(tree.read("oxlint.config.ts", "utf-8")).toContain("type:app");
  });

  test.each(
    [
      "",
      "echo preparing; ",
      "echo preparing\n",
      "echo preparing && ",
      "printf '' & ",
      "printf '' &",
      "printf '&' >&1 & ",
      "echo preparing || ",
      "printf '' | ",
      "printf '' |",
      `echo preparing # ${sourceDriftCheck}\n`,
      `echo "\${PROJECT_LABEL}"; `,
    ].flatMap((prefix) => [sourceDriftCheck, targetDriftCheck].map((fragment) => [prefix, fragment]))
  )("recognizes canonical commands after ordinary boundaries: %j, %s", async (prefix, fragment) => {
    const tree = makeTree();
    const suffix = " packages/backend/convex";
    tree.write("package.json", JSON.stringify({ scripts: { check: `${prefix}${fragment}${suffix}` } }));
    await migration(tree);
    expect(readJson<{ scripts: { check: string } }>(tree, "package.json").scripts.check).toBe(`${prefix}${targetDriftCheck}${suffix}`);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([sourceDriftCheck, targetDriftCheck])("ignores unrelated quoted fragments and pathnames: %s", async (fragment) => {
    const tree = makeTree();
    const unrelated = `echo '; | ${sourceDriftCheck}' && echo "; | ${targetDriftCheck}" && echo 'apps/web/src/routeTree.gen.ts' && echo ':(glob)apps/*/src/routeTree.gen.ts'`;
    const check = `${unrelated}; ${fragment} packages/backend/convex`;
    tree.write("package.json", JSON.stringify({ scripts: { check } }));
    await migration(tree);
    expect(readJson<{ scripts: { check: string } }>(tree, "package.json").scripts.check).toBe(
      `${unrelated}; ${targetDriftCheck} packages/backend/convex`
    );
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("migrates the actual generated drift-check command without changing its surrounding shell", async () => {
    const tree = makeTree();
    const target = `nx sync:check && bun run codegen && ${generatedDriftCheck} && custom-validation`;
    const source = `nx sync:check && bun run codegen && ${releasedDriftCheck} && custom-validation`;
    tree.write("package.json", JSON.stringify({ scripts: { check: source } }));
    await migration(tree);
    expect(readJson<{ scripts: { check: string } }>(tree, "package.json").scripts.check).toBe(target);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    "echo ':(glob)apps/*/src/routeTree.gen.ts'",
    "echo apps/web/src/routeTree.gen.ts",
    "git status --porcelain -- apps/web/src/routeTree.gen.ts",
    "git status --porcelain -- :(glob)apps/*/src/routeTree.gen.ts",
    "git status --porcelain --untracked-files=all -- :(glob)apps/*/src/routeTree.gen.ts",
    `echo '; ${sourceDriftCheck}'`,
    `echo "; ${sourceDriftCheck}"`,
    `echo '${sourceDriftCheck}'`,
    `echo ${sourceDriftCheck}`,
    `echo preparing # ; ${sourceDriftCheck}`,
    String.raw`echo \; ${sourceDriftCheck}`,
    `echo '| ${sourceDriftCheck}'`,
    `echo "| ${sourceDriftCheck}"`,
    String.raw`echo \| ${sourceDriftCheck}`,
    `echo preparing # | ${sourceDriftCheck}`,
    `echo '& ${sourceDriftCheck}'`,
    `echo "& ${sourceDriftCheck}"`,
    `echo '&' ${sourceDriftCheck}`,
    `echo "&" ${sourceDriftCheck}`,
    String.raw`echo \& ${sourceDriftCheck}`,
    `echo >& ${sourceDriftCheck}`,
    `echo <& ${sourceDriftCheck}`,
    `echo &> ${sourceDriftCheck}`,
    `echo &>> ${sourceDriftCheck}`,
    `echo |& ${sourceDriftCheck}`,
    `echo ;& ${sourceDriftCheck}`,
    `echo ;;& ${sourceDriftCheck}`,
    `${sourceDriftCheck} & ${sourceDriftCheck}`,
    `${sourceDriftCheck} & ${targetDriftCheck}`,
    `${targetDriftCheck} & ${targetDriftCheck}`,
    String.raw`echo "say \"; ${sourceDriftCheck}"`,
    "custom check",
    "git status --short -- apps/web/src/routeTree.gen.ts",
    `${sourceDriftCheck}.backup`,
    `${oldCheck} && ${targetDriftCheck}`,
    `${oldCheck}; ${oldCheck}`,
    `${targetDriftCheck}\n${targetDriftCheck}`,
    `${sourceDriftCheck} | ${sourceDriftCheck}`,
    `${sourceDriftCheck} | ${targetDriftCheck}`,
    `${targetDriftCheck} | ${targetDriftCheck}`,
    `cat <<EOF\n${sourceDriftCheck}\nEOF`,
    `echo \${value:-; ${sourceDriftCheck}}`,
    `echo $((1; ${sourceDriftCheck}))`,
    `echo \`echo '; ${sourceDriftCheck}'\``,
    `${sourceDriftCheck} && echo "unterminated`,
  ])("conflicts atomically without a unique supported drift-check command: %s", (check) => {
    const tree = makeTree();
    tree.write("package.json", JSON.stringify({ scripts: { check } }));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("scripts.check generated route-tree command");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves unrelated scripts, scope tags, and target configuration", async () => {
    const tree = makeTree();
    tree.write("package.json", JSON.stringify({ scripts: { check: `${oldCheck} && custom-validation`, custom: "project-owned" } }));
    tree.write(
      "apps/admin/package.json",
      JSON.stringify({
        nx: { tags: ["scope:admin"], targets: { custom: { cache: true }, dev: { options: { port: 9001 } } } },
        scripts: { custom: "project-owned", dev: "vite dev" },
      })
    );
    await migration(tree);
    expect(readJson<{ scripts: Record<string, string> }>(tree, "package.json").scripts).toEqual({
      check: `nx sync:check && ${targetDriftCheck} && custom-validation`,
      custom: "project-owned",
    });
    expect(readJson(tree, "apps/admin/package.json")).toEqual({
      nx: { tags: ["scope:admin", "type:app"], targets: { custom: { cache: true }, dev: { continuous: true, options: { port: 9001 } } } },
      scripts: { custom: "project-owned", dev: "vite dev" },
    });
  });

  test.each([{}, { continuous: true }])("adds or retains explicit Nx dev continuity without a package script: %j", async (metadata) => {
    const tree = makeTree();
    const packageJson = {
      nx: {
        tags: ["type:app", "scope:admin", "project:extra"],
        targets: { dev: { command: "vite dev", ...metadata, options: { cwd: "project" } }, unrelated: { cache: true } },
      },
      scripts: { custom: "project-owned" },
    };
    tree.write("apps/admin/package.json", JSON.stringify(packageJson));
    await migration(tree);
    expect(readJson(tree, "apps/admin/package.json")).toEqual({
      ...packageJson,
      nx: { ...packageJson.nx, targets: { ...packageJson.nx.targets, dev: { ...packageJson.nx.targets.dev, continuous: true } } },
    });
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("conflicts atomically when the canonical backend package is missing", () => {
    const tree = makeTree();
    tree.delete("packages/backend/package.json");
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("canonical backend package in packages/backend/package.json");
    expect(snapshotChanges(tree)).toEqual(before);
    expect(tree.exists("packages/backend/package.json")).toBe(false);
  });

  test("ignores absent unrelated package and discovered application package files", async () => {
    const tree = makeTree();
    tree.write("packages/worker/package.json", '{"scripts":{"dev":"project-owned"}}');
    tree.delete("packages/worker/package.json");
    tree.delete("apps/admin/package.json");
    tree.write("apps/project-owned/README.md", "No package workspace here.");
    await migration(tree);
    expect(tree.exists("packages/worker/package.json")).toBe(false);
    expect(tree.exists("apps/admin/package.json")).toBe(false);
    expect(tree.exists("apps/project-owned/package.json")).toBe(false);
    expect(tree.read("apps/project-owned/README.md", "utf-8")).toBe("No package workspace here.");
    expect(
      readJson<{ nx: { targets: { dev: { continuous: boolean } } } }>(tree, "packages/backend/package.json").nx.targets.dev.continuous
    ).toBe(true);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    { nx: { tags: ["type:package", "scope:backend"], targets: {} }, scripts: { dev: "project-owned-command" } },
    { nx: { tags: ["type:package", "scope:backend"], targets: { dev: { command: "project-owned-command" } } } },
    { nx: { tags: ["type:app", "scope:backend"], targets: { dev: { continuous: false } } } },
  ])("preserves unrelated package dev surfaces byte-for-byte despite tags: %j", async (packageJson) => {
    const tree = makeTree();
    const source = JSON.stringify({ name: "@acme/worker", ...packageJson });
    tree.write("packages/worker/package.json", source);
    await migration(tree);
    expect(tree.read("packages/worker/package.json", "utf-8")).toBe(source);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each(
    ["apps/admin", "packages/backend"].flatMap((workspace) =>
      [[], ["scope:custom"], ["scope:backend"], ["project:extra"]].flatMap((tags) =>
        [{}, { continuous: true }].map((metadata) => ({ metadata, tags, workspace }))
      )
    )
  )("owns continuity by physical workspace path: %j", async ({ metadata, tags, workspace }) => {
    const tree = makeTree();
    const path = `${workspace}/package.json`;
    const packageJson = {
      nx: { tags, targets: { dev: { ...metadata, command: "custom-command", options: { port: 9001 } }, unrelated: { cache: true } } },
      scripts: { custom: "project-owned", dev: "custom-dev" },
    };
    tree.write(path, JSON.stringify(packageJson));
    await migration(tree);
    expect(readJson(tree, path)).toEqual({
      ...packageJson,
      nx: {
        ...packageJson.nx,
        tags: workspace.startsWith("apps/") ? [...tags, "type:app"] : tags,
        targets: { ...packageJson.nx.targets, dev: { ...packageJson.nx.targets.dev, continuous: true } },
      },
    });
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    { scripts: { dev: "custom-backend-dev" } },
    { nx: { tags: ["scope:custom"] }, scripts: { dev: "custom-backend-dev" } },
    { nx: { targets: { dev: { command: "custom-backend-dev", options: { cwd: "custom" } } } } },
  ])("migrates identifiable backend dev without baseline tags or command: %j", async (packageJson) => {
    const tree = makeTree();
    tree.write("packages/backend/package.json", JSON.stringify(packageJson));
    await migration(tree);
    expect(
      readJson<{ nx: { targets: { dev: { continuous: boolean } } } }>(tree, "packages/backend/package.json").nx.targets.dev.continuous
    ).toBe(true);
    const before = snapshotChanges(tree);
    await migration(tree);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("leaves a recognized canonical backend target byte-for-byte unchanged", async () => {
    const tree = makeTree();
    const source = JSON.stringify({
      nx: { tags: ["scope:custom"], targets: { dev: { continuous: true } } },
      scripts: { dev: "custom-dev" },
    });
    tree.write("packages/backend/package.json", source);
    await migration(tree);
    expect(tree.read("packages/backend/package.json", "utf-8")).toBe(source);
  });

  test.each([
    { nx: { tags: ["scope:custom"], targets: { dev: { continuous: false } } } },
    { nx: { targets: { dev: { continuous: "true" } } } },
    { nx: { targets: { dev: "custom" } } },
    { nx: { targets: "custom" }, scripts: { dev: "custom-dev" } },
    { nx: "custom", scripts: { dev: "custom-dev" } },
    { nx: { tags: ["type:package", "scope:backend"], targets: {} }, scripts: { test: "project-test" } },
    { scripts: { dev: false } },
  ])("conflicts atomically on malformed or unrecognizable canonical backend dev: %j", (packageJson) => {
    const tree = makeTree();
    tree.write("packages/backend/package.json", JSON.stringify(packageJson));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test("preserves workspaces with no actual dev target", async () => {
    const tree = makeTree();
    const packageJson = { nx: { tags: ["type:app", "scope:admin"], targets: { test: { cache: true } } }, scripts: { test: "vitest" } };
    tree.write("apps/admin/package.json", JSON.stringify(packageJson));
    await migration(tree);
    expect(readJson(tree, "apps/admin/package.json")).toEqual(packageJson);
  });

  test.each([
    { nx: { tags: ["type:app", "type:app", "scope:admin"] } },
    { nx: { tags: ["type:app", "scope:admin"], targets: { dev: { continuous: false } } } },
    { nx: { tags: ["type:app", "scope:admin"], targets: { dev: "custom" } } },
    { nx: { tags: ["type:app", "scope:admin"], targets: { dev: { continuous: "true" } } } },
  ])("rejects ambiguous classification or invalid explicit dev metadata atomically: %j", (packageJson) => {
    const tree = makeTree();
    tree.write("apps/admin/package.json", JSON.stringify(packageJson));
    const before = snapshotChanges(tree);
    expect(() => migration(tree)).toThrow("Reconcile the customization manually");
    expect(snapshotChanges(tree)).toEqual(before);
  });

  test.each([
    ["nx.json", JSON.stringify({ plugins: [vitestRegistration(["apps/custom/vite.config.ts"])] }), "nx.json"],
    ["package.json", JSON.stringify({ scripts: { check: "custom check" } }), "scripts.check generated route-tree command"],
    [
      "package.json",
      JSON.stringify({ scripts: { check: "echo ':(glob)apps/*/src/routeTree.gen.ts'" } }),
      "scripts.check generated route-tree command",
    ],
    [
      "apps/admin/package.json",
      JSON.stringify({ nx: { tags: ["scope:admin"], targets: "custom" }, scripts: { dev: "vite dev" } }),
      "nx.targets",
    ],
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
