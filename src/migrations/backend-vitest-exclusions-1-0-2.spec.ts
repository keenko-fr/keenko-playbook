import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Read the frozen historical release fixture.
import { readFileSync } from "node:fs";

import { NodeServices } from "@effect/platform-node";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { presetProgram } from "../generators/preset/preset.js";
import migration from "./backend-vitest-exclusions-1-0-2.js";

const configPath = "packages/backend/vitest.config.ts";
const historical = readFileSync(new URL("files/backend-vitest-exclusions-1-0-2/vitest.config.1-0-1.ts.template", import.meta.url), "utf-8");
const fixture = (source = historical) => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(configPath, source);
  tree.write("bun.lock", "Bun-owned lockfile\n");
  return tree;
};

const sDiscovery = S.fromJsonString(
  S.Struct({
    nativeExclude: S.Array(S.String),
    projects: S.Array(S.Struct({ environment: S.String, exclude: S.Array(S.String), files: S.Array(S.String), name: S.String })),
  })
);

// Exercise Vitest's installed configuration loader and discovery, including a workspace-local dependency symlink.
const discover = E.fn("test.backendVitest.discover")(function* (source: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-backend-vitest-" });
  yield* fs.makeDirectory(path.join(root, "node_modules"));
  yield* fs.symlink(yield* path.fromFileUrl(new URL("../../node_modules/vitest", import.meta.url)), path.join(root, "node_modules/vitest"));
  const dependency = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-dependency-tests-" });
  yield* fs.writeFileString(path.join(dependency, "upstream.test.ts"), "throw new Error('Dependency-owned test must never run');\n");
  yield* fs.symlink(dependency, path.join(root, "node_modules/backend-dependency"));
  for (const file of ["authored.test.ts", "test/integration.test.ts", "convex/generated.test.ts"]) {
    yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
    yield* fs.writeFileString(path.join(root, file), "import { test } from 'vitest'; test('authored', () => {});\n");
  }
  yield* fs.writeFileString(path.join(root, "vitest.config.ts"), source);
  const script = `
import { createVitest } from "vitest/node";
import { configDefaults } from "vitest/config";
import { relative } from "node:path";
import { writeFileSync } from "node:fs";
const vitest = await createVitest("test", { root: process.cwd(), config: "vitest.config.ts", watch: false });
try {
  await vitest.init();
  const projects = await Promise.all(vitest.projects.map(async project => ({
    name: project.name, environment: project.config.environment, exclude: project.config.exclude,
    files: (await project.globTestFiles()).testFiles.map(file => relative(process.cwd(), file)).sort(),
  })));
  writeFileSync("discovery.json", JSON.stringify({ nativeExclude: configDefaults.exclude, projects }));
} finally { await vitest.close(); }
`;
  const child = yield* spawner.spawn(
    ChildProcess.make("node", ["--input-type=module", "--eval", script], { cwd: root, stderr: "inherit", stdout: "pipe" })
  );
  expect(Number(yield* child.exitCode)).toBe(0);
  return yield* S.decodeEffect(sDiscovery)(yield* fs.readFileString(path.join(root, "discovery.json")));
});

const verifyDiscovery = E.fn("test.backendVitest.verify")(function* (source: string) {
  const result = yield* discover(source);
  const node = result.projects.find((project) => project.name === "node");
  const integration = result.projects.find((project) => project.name === "integration");
  expect(node?.environment).toBe("node");
  expect(node?.exclude).toEqual([...result.nativeExclude, "convex/**", "test/**"]);
  expect(node?.files).toEqual(["authored.test.ts"]);
  expect(integration?.environment).toBe("edge-runtime");
  expect(integration?.files).toEqual(["test/integration.test.ts"]);
  expect(result.projects.flatMap((project) => project.files)).not.toContain("node_modules/backend-dependency/upstream.test.ts");
});

describe("1.0.2 backend Vitest exclusion migration", () => {
  test(
    "loads fresh generated config with native exclusions and unchanged test ownership",
    () =>
      E.runPromise(
        E.gen(function* () {
          const tree = createTreeWithEmptyWorkspace();
          yield* presetProgram(tree, { name: "vitest-proof" });
          const source = tree.read(configPath, "utf-8");
          expect(source).not.toBeNull();
          yield* verifyDiscovery(source ?? "");
        }).pipe(E.scoped, E.provide(NodeServices.layer))
      ),
    30_000
  );

  test(
    "restores native exclusions for the released configuration and is idempotent",
    () =>
      E.runPromise(
        E.gen(function* () {
          const old = yield* discover(historical);
          expect(old.projects.find((project) => project.name === "node")?.files).toContain(
            "node_modules/backend-dependency/upstream.test.ts"
          );
          const tree = fixture();
          migration(tree);
          const migrated = tree.read(configPath, "utf-8") ?? "";
          yield* verifyDiscovery(migrated);
          const before = tree.listChanges();
          migration(tree);
          expect(tree.listChanges()).toEqual(before);
          expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned lockfile\n");
        }).pipe(E.scoped, E.provide(NodeServices.layer))
      ),
    30_000
  );

  test("preserves unrelated configuration, comments, and additional projects", () => {
    const source = historical
      .replace("passWithNoTests: true,", "passWithNoTests: true, // project comment\n    retry: 2,")
      .replace('name: "node",', 'name: "node",\n          setupFiles: ["./setup.ts"],')
      .replace('name: "integration",', 'name: "integration",\n          exclude: ["test/slow/**"],')
      .replace("projects: [", 'projects: [{ test: { name: "custom", ...projectOwned } },');
    const tree = fixture(source);
    migration(tree);
    expect(tree.read(configPath, "utf-8")).toBe(
      source
        .replace("{ defineConfig }", "{ configDefaults, defineConfig }")
        .replace('exclude: ["convex/**", "test/**"]', 'exclude: [...configDefaults.exclude, "convex/**", "test/**"]')
    );
  });

  test("reuses aliased native imports", () => {
    const tree = fixture(
      historical.replace("defineConfig", "configDefaults as defaults, defineConfig as config").replace("defineConfig({", "config({")
    );
    migration(tree);
    expect(tree.read(configPath, "utf-8")).toContain("...defaults.exclude");
    const before = tree.listChanges();
    migration(tree);
    expect(tree.listChanges()).toEqual(before);
  });

  test.each([
    historical.replace('exclude: ["convex/**", "test/**"]', 'exclude: ["custom/**"]'),
    historical.replace('exclude: ["convex/**", "test/**"]', 'exclude: [...projectDefaults, "convex/**", "test/**"]'),
    historical.replace('name: "node",', 'name: "node", exclude: ["custom/**"],'),
    historical.replace('name: "node",', 'name: "node", ...custom,'),
    historical.replace("defineConfig({", "defineConfig(() => ({"),
    "export default { test: projectOwned };",
  ])("reports customized owned state without mutation", (source) => {
    const tree = fixture(source);
    const before = tree.listChanges();
    expect(() => {
      migration(tree);
    }).toThrow("Reconcile the customization manually");
    expect(tree.listChanges()).toEqual(before);
  });

  test("avoids a project-owned configDefaults binding", () => {
    const tree = fixture(`const configDefaults = 'project-owned';\n${historical}`);
    migration(tree);
    expect(tree.read(configPath, "utf-8")).toContain("configDefaults as keenkoVitestDefaults");
    expect(tree.read(configPath, "utf-8")).toContain("...keenkoVitestDefaults.exclude");
  });

  test("reports a missing managed config without creating a replacement", () => {
    const tree = fixture();
    tree.delete(configPath);
    const before = tree.listChanges();
    expect(() => {
      migration(tree);
    }).toThrow(configPath);
    expect(tree.listChanges()).toEqual(before);
  });
});
