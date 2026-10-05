/* oxlint-disable effect/noAsyncFunction -- Native Nx migrations and its Migrator return promises. */
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Inspect the immutable release snapshots.
import { readFileSync } from "node:fs";

import { NodeFileSystem, NodePath, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { parseJson, readJson, readJsonFile, serializeJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, FileSystem, Layer, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Migrator, type ResolvedMigrationConfiguration } from "nx/src/command-line/migrate/migrate";
import { FsTree } from "nx/src/generators/tree";
import { describe, expect, test } from "vitest";

import { presetProgram } from "../generators/preset/preset.js";
import { packageVersions } from "../generators/versions.js";
import historicalMigration from "./dependency-baseline-1-0-2.js";
import migration from "./effect-testing-baseline-1-0-2.js";

type Slots = Record<"dependencies" | "devDependencies", Record<string, string>>;
const roles = parseJson<Record<string, Slots>>(readFileSync(new URL("files/effect-testing-baseline-1-0-2.json", import.meta.url), "utf-8"));
const historical = parseJson<Record<string, Slots>>(
  readFileSync(new URL("files/dependency-baseline-1-0-2.json", import.meta.url), "utf-8")
);
const sections = ["dependencies", "devDependencies"] as const;
const fixed = {
  backend: "packages/backend/package.json",
  root: "package.json",
  shared: "packages/shared/package.json",
  ui: "packages/ui/package.json",
};

const formatter = readFileSync(new URL("../generators/preset/files/root/oxfmt.config.ts.template", import.meta.url), "utf-8").replace(
  '    "tools/ai-migrations/**",\n',
  ""
);

const fixture = (applications: readonly string[]) => {
  const tree = createTreeWithEmptyWorkspace();
  for (const [role, path] of Object.entries(fixed)) tree.write(path, serializeJson(historical[role]));
  for (const app of applications)
    tree.write(`apps/${app}/package.json`, serializeJson({ ...historical.application, nx: { tags: ["type:app"] } }));
  tree.write("oxfmt.config.ts", formatter);
  tree.write("bun.lock", "Bun owns this file\n");
  return tree;
};

describe("KEE-54 rc.4 testing boundary", () => {
  it.live("derives the 76-slot frozen target from fresh manifests and keeps tooling root-owned", () =>
    E.gen(function* () {
      const tree = createTreeWithEmptyWorkspace();
      yield* presetProgram(tree, { name: "testing-tuple" });
      const manifests = { ...fixed, application: "apps/web/package.json" };
      let count = 0;
      for (const [role, path] of Object.entries(manifests)) {
        const manifest = readJson<Slots>(tree, path);
        for (const section of sections) {
          const managed = Object.fromEntries(Object.keys(roles[role][section]).map((name) => [name, manifest[section]?.[name]]));
          expect(managed).toEqual(roles[role][section]);
          count += Object.keys(managed).length;
        }
        if (role !== "root") {
          expect(manifest.dependencies?.["@effect/vitest"]).toBeUndefined();
          expect(manifest.devDependencies?.["@effect/vitest"]).toBeUndefined();
          expect(manifest.devDependencies?.vitest).toBeUndefined();
        }
      }
      expect(count).toBe(76);
      expect(readJson<Slots>(tree, fixed.backend).devDependencies["@confect/test"]).toBe(packageVersions["@confect/test"]);
    }).pipe(E.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)))
  );

  test.each([["portal"], ["portal", "console"], ["portal", "console", "studio"]])(
    "converges %j through history and preserves consumer slots",
    async (...applications) => {
      const tree = fixture(applications);
      const root = readJson<Slots>(tree, "package.json");
      root.dependencies["@effect/vitest"] = "custom";
      root.dependencies["consumer-owned"] = "^7.0.0";
      tree.write("package.json", serializeJson(root));
      await historicalMigration(tree);
      expect(readJson<Slots>(tree, "package.json").devDependencies.vitest).toBe("4.0.18");
      await migration(tree);
      let count = 0;
      for (const [role, path] of [...Object.entries(fixed), ...applications.map((app) => ["application", `apps/${app}/package.json`])]) {
        const manifest = readJson<Slots>(tree, path);
        for (const section of sections) {
          for (const [name, version] of Object.entries(roles[role][section])) expect(manifest[section][name]).toBe(version);
          count += Object.keys(roles[role][section]).length;
        }
      }
      expect(count).toBe(44 + 32 * applications.length);
      expect(readJson<Slots>(tree, "package.json").dependencies).toEqual({ "consumer-owned": "^7.0.0" });
      expect(tree.read("bun.lock", "utf-8")).toBe("Bun owns this file\n");
      const before = tree.listChanges();
      await migration(tree);
      expect(tree.listChanges()).toEqual(before);
    }
  );

  it.live("formats converged app manifests with the on-disk config before changing that config", () =>
    E.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "kee-54-formatter-" });
      const historicalTree = fixture(["portal"]);
      historicalTree.delete(".oxfmtrc.json");
      const manifest = readJson<Slots>(historicalTree, "apps/portal/package.json");
      delete manifest.devDependencies.vite;
      manifest.dependencies.vite = "8.0.0";
      manifest.dependencies["is-number"] = "^7.0.0";
      historicalTree.write("apps/portal/package.json", serializeJson(manifest));
      for (const change of historicalTree.listChanges()) {
        if (!change.content) continue;
        const destination = path.join(root, change.path);
        yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
        yield* fs.writeFile(destination, change.content);
      }
      const repository = yield* path.fromFileUrl(new URL("../../", import.meta.url));
      yield* fs.symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"));
      const tree = new FsTree(root, false);
      yield* E.promise(async () => {
        await migration(tree);
      });
      for (const change of tree.listChanges()) if (change.content) yield* fs.writeFile(path.join(root, change.path), change.content);
      const output = yield* spawner.string(
        ChildProcess.make(path.join(root, "node_modules/.bin/oxfmt"), ["--check", "apps/portal/package.json", "oxfmt.config.ts"], {
          cwd: root,
          forceKillAfter: "5 seconds",
        }),
        { includeStderr: true }
      );
      expect(output).toContain("All matched files use the correct format");
      expect(readJson<Slots>(tree, "apps/portal/package.json").dependencies["is-number"]).toBe("^7.0.0");
    }).pipe(E.scoped, E.provide(NodeServices.layer))
  );

  test("preserves project formatter settings and excludes native instructions without changing their bytes", async () => {
    const tree = fixture(["portal"]);
    const customized = formatter
      .replace("printWidth: 140", "printWidth: 100")
      .replace('    "**/vendor/**",', '    "**/vendor/**",\n    "project-owned/**",');
    tree.write("oxfmt.config.ts", customized);
    tree.write("tools/ai-migrations/@nx/vitest/23.3/guide.md", "Upstream   instructions\n");
    await migration(tree);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toBe(
      customized.replace('    "project-owned/**",', '    "project-owned/**",\n    "tools/ai-migrations/**",')
    );
    expect(tree.read("oxfmt.config.ts", "utf-8")).toContain('"project-owned/**"');
    expect(tree.read("oxfmt.config.ts", "utf-8")).toContain("printWidth: 100");
    expect(tree.read("tools/ai-migrations/@nx/vitest/23.3/guide.md", "utf-8")).toBe("Upstream   instructions\n");
    const before = tree.listChanges();
    await migration(tree);
    expect(tree.listChanges()).toEqual(before);
  });

  test.each([
    formatter.replace("defineConfig({", "projectWrapper({"),
    formatter.replace("ignorePatterns: [", "ignorePatterns: ownedPatterns, inherited: ["),
    formatter.replace("printWidth: 140", "...projectOwned, printWidth: 140"),
    formatter.replace("printWidth: 140", "ignorePatterns: [], printWidth: 140"),
  ])("conflicts atomically on ambiguous formatter ownership", (source) => {
    const tree = fixture(["portal"]);
    tree.write("oxfmt.config.ts", source);
    const before = tree.listChanges();
    expect(() => {
      void migration(tree);
    }).toThrow("literal ignorePatterns");
    expect(tree.listChanges()).toEqual(before);
  });

  test("validates all manifests before writes", () => {
    const tree = fixture(["portal"]);
    tree.write("packages/shared/package.json", '{"dependencies":[]}');
    const before = tree.listChanges();
    expect(() => {
      void migration(tree);
    }).toThrow("packages/shared/package.json");
    expect(tree.listChanges()).toEqual(before);
  });

  test.each(["1.0.1", "1.0.2-rc.0", "1.0.2-rc.1", "1.0.2-rc.2", "1.0.2-rc.3"])(
    "native preparation cascades from %s into Nx's Vitest 5 migration",
    async (sourceVersion) => {
      const config = readJsonFile<ResolvedMigrationConfiguration>("migrations.json");
      const versions = Object.fromEntries([...Object.entries(historical.root.devDependencies), ["keenko", sourceVersion]]);
      const migrator = new Migrator({
        fetch: async (name, version) => {
          if (name === "keenko") return { ...config, version };
          if (name === "nx" || name.startsWith("@nx/")) {
            const manifest = parseJson<{ "nx-migrations"?: { packageGroup?: string[] } }>(
              readFileSync(import.meta.resolve(`${name}/package.json`).replace("file://", ""), "utf-8")
            );
            const metadata = parseJson<ResolvedMigrationConfiguration>(
              readFileSync(new URL("migrations.json", import.meta.resolve(`${name}/package.json`)), "utf-8")
            );
            return {
              ...metadata,
              packageGroup: manifest["nx-migrations"]?.packageGroup?.map((pkg) => ({ package: pkg, version: "*" })),
              version,
            };
          }
          return { version };
        },
        from: {},
        getInstalledPackageVersion: (name) => versions[name],
        interactive: false,
        packageJson: { devDependencies: versions, name: "native-testing-proof", version: "0.0.0" },
        to: {},
      });
      const plan = await migrator.migrate("keenko", "1.0.2-rc.4");
      expect(plan.migrations.filter((entry) => entry.package === "@nx/vitest").map(({ name, version }) => ({ name, version }))).toEqual([
        { name: "migrate-to-vitest-5", version: "23.3.0-beta.8" },
      ]);
      expect(plan.migrations.find((entry) => entry.name === "1.0.2-effect-testing-baseline")?.version).toBe("1.0.2-rc.4");
      expect(plan.packageUpdates.vitest.version).toBe("5.0.3");
      expect(plan.packageUpdates["@effect/vitest"].version).toBe("4.0.1");
      for (const [name, update] of Object.entries(plan.packageUpdates))
        if (name === "nx" || name.startsWith("@nx/")) expect(update.version).toBe("23.3.0-beta.9");
    }
  );
});
