import { describe, expect, test } from "bun:test";

import { NodeServices } from "@effect/platform-node";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";

import {
  compatibilityVersionOverrides,
  DependencyUpdateFailure,
  isExactPackageVersion,
  updateDependencies,
  updateDependencySources,
  type LockfileRefresher,
  type RegistryResolver,
} from "./deps-update.js";

const run = <A, X>(effect: E.Effect<A, X, NodeServices.NodeServices>) => E.runPromise(effect.pipe(E.provide(NodeServices.layer)));

const sTestManifest = S.fromJsonString(
  S.Struct({ dependencies: S.Record(S.String, S.String), devDependencies: S.Record(S.String, S.String) })
);

const failedResolver: RegistryResolver = (packageName, selector) =>
  E.fail(new DependencyUpdateFailure({ issue: "registry_resolution_failed", packageName, selector }));

const successfulResolver: RegistryResolver = (_packageName, selector) => E.succeed(selector === "rc" ? "4.0.0-rc.9" : "2.3.4");

const fixture = E.fn("test.deps.fixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-deps-test-" });
  const versionsDirectory = path.join(root, "src/generators");

  yield* fs.makeDirectory(versionsDirectory, { recursive: true });
  yield* fs.makeDirectory(path.join(root, "docs"), { recursive: true });
  yield* fs.writeFileString(
    path.join(versionsDirectory, "versions.ts"),
    `export const packageVersions = {\n  "@nx/devkit": "23.2.1",\n  "@nx/oxlint": "23.2.1",\n  effect: "4.0.0-rc.1",\n  nx: "23.2.1",\n} satisfies Record<string, string>;\n\nexport const runtimeVersions = {\n  bun: "1.4.2",\n  nodeRange: ">=24.15 <25",\n} satisfies Record<string, string>;\n`
  );
  yield* fs.writeFileString(
    path.join(root, "package.json"),
    '{\n  "dependencies": {\n    "@nx/devkit": "23.2.1",\n    "effect": "4.0.0-rc.1"\n  },\n  "devDependencies": {\n    "@nx/js": "23.2.1",\n    "@nx/oxlint": "23.2.1",\n    "nx": "23.2.1"\n  }\n}\n'
  );
  yield* fs.writeFileString(path.join(root, "docs/versions.md"), "runtime and package documentation stays untouched\n");
  yield* fs.writeFileString(path.join(root, "bun.lock"), "original lockfile\n");

  return root;
});

describe("dependency updater", () => {
  test("resolves latest and explicit prerelease channels to exact versions", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (packageName, selector) =>
          E.sync(() => {
            calls.push([packageName, selector]);
            return selector === "rc" ? "4.0.0-rc.9" : "2.3.4";
          });

        const updates = yield* updateDependencySources(
          root,
          { "@nx/devkit": "23.2.1", "@nx/oxlint": "23.2.1", effect: "4.0.0-rc.1", nx: "23.2.1" },
          resolver
        );
        const versions = yield* fs.readFileString(path.join(root, "src/generators/versions.ts"));
        const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(path.join(root, "package.json")));

        expect(calls).toEqual([["effect", "rc"]]);
        expect(updates).toEqual({
          "@nx/devkit": "23.2.1",
          "@nx/oxlint": "23.2.1",
          effect: "4.0.0-rc.9",
          nx: "23.2.1",
        });
        expect(Object.values(updates).every(isExactPackageVersion)).toBe(true);
        expect(versions).toContain('effect: "4.0.0-rc.9"');
        expect(versions).toContain('"@nx/devkit": "23.2.1"');
        expect(versions).toContain('"@nx/oxlint": "23.2.1"');
        expect(versions).toContain('nx: "23.2.1"');
        expect(manifest.dependencies.effect).toBe("4.0.0-rc.9");
        expect(manifest.dependencies["@nx/devkit"]).toBe("23.2.1");
        expect(manifest.devDependencies["@nx/oxlint"]).toBe("23.2.1");
        expect(manifest.devDependencies.nx).toBe("23.2.1");
        expect(manifest.devDependencies["@nx/js"]).toBe("23.2.1");
      }).pipe(E.scoped)
    ));

  test("never writes ranges or dist-tag names", () => {
    expect(isExactPackageVersion("1.2.3")).toBe(true);
    expect(isExactPackageVersion("2.0.0-rc.1")).toBe(true);
    expect(isExactPackageVersion("npm:typescript@7.0.2")).toBe(true);
    expect(isExactPackageVersion("^1.2.3")).toBe(false);
    expect(isExactPackageVersion("~1.2.3")).toBe(false);
    expect(isExactPackageVersion("latest")).toBe(false);
    expect(isExactPackageVersion("rc")).toBe(false);
  });

  test("keeps registry-incompatible members on explicit exact versions", () => {
    expect(compatibilityVersionOverrides).toEqual({
      "@nx/devkit": "23.2.1",
      "@nx/oxlint": "23.2.1",
      nx: "23.2.1",
      oxlint: "1.82.0",
      typescript: "6.0.2",
      vitest: "4.0.18",
    });
    expect(Object.values(compatibilityVersionOverrides).every(isExactPackageVersion)).toBe(true);
  });

  test("registry failure is modeled and leaves all files unchanged", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const versionsPath = path.join(root, "src/generators/versions.ts");
        const manifestPath = path.join(root, "package.json");
        const beforeVersions = yield* fs.readFileString(versionsPath);
        const beforeManifest = yield* fs.readFileString(manifestPath);
        const failure = yield* updateDependencySources(root, { effect: "4.0.0-rc.1", nx: "1.0.0" }, failedResolver).pipe(E.flip);

        expect(failure).toMatchObject({ _tag: "DependencyUpdateFailure", issue: "registry_resolution_failed" });
        expect(yield* fs.readFileString(versionsPath)).toBe(beforeVersions);
        expect(yield* fs.readFileString(manifestPath)).toBe(beforeManifest);
      }).pipe(E.scoped)
    ));

  test("does not modify documentation or runtime policy", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const versionsPath = path.join(root, "src/generators/versions.ts");
        const docsPath = path.join(root, "docs/versions.md");
        const beforeVersions = yield* fs.readFileString(versionsPath);
        const runtimePolicy = beforeVersions.slice(beforeVersions.indexOf("export const runtimeVersions"));
        const beforeDocs = yield* fs.readFileString(docsPath);
        yield* updateDependencySources(root, { effect: "4.0.0-rc.1", nx: "1.0.0" }, successfulResolver);

        expect((yield* fs.readFileString(versionsPath)).endsWith(runtimePolicy)).toBe(true);
        expect(yield* fs.readFileString(docsPath)).toBe(beforeDocs);
      }).pipe(E.scoped)
    ));

  test("selects @types/node from the canonical runtime major instead of latest", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (packageName, selector) =>
          E.sync(() => {
            calls.push([packageName, selector]);
            return selector === "24" ? "24.99.1" : "22.20.3";
          });

        const updates = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.2.1" }, resolver, {
          nodeRange: ">=24.15 <25",
        });

        expect(calls).toEqual([["@types/node", "24"]]);
        expect(updates["@types/node"]).toBe("24.99.1");
      }).pipe(E.scoped)
    ));

  test("follows a changed canonical Node runtime major", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const selectors: string[] = [];
        const resolver: RegistryResolver = (_packageName, selector) =>
          E.sync(() => {
            selectors.push(selector);
            return `${selector}.1.2`;
          });

        const updates = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.2.1" }, resolver, {
          nodeRange: ">=26.2 <27",
        });

        expect(selectors).toEqual(["26"]);
        expect(updates["@types/node"]).toBe("26.1.2");
      }).pipe(E.scoped)
    ));

  test("rejects a constrained @types/node result from another major", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const failure = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.2.1" }, () => E.succeed("22.20.3"), {
          nodeRange: ">=24.15 <25",
        }).pipe(E.flip);

        expect(failure).toMatchObject({
          issue: "invalid_version",
          packageName: "@types/node",
          selector: "24",
          value: "22.20.3",
        });
      }).pipe(E.scoped)
    ));

  test("reports constrained @types/node registry failures with selector context", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const failure = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.2.1" }, failedResolver, {
          nodeRange: ">=24.15 <25",
        }).pipe(E.flip);

        expect(failure).toMatchObject({
          issue: "registry_resolution_failed",
          packageName: "@types/node",
          selector: "24",
        });
      }).pipe(E.scoped)
    ));

  test("keeps ordinary packages on latest while preserving prerelease channels and exact holds", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (packageName, selector) =>
          E.sync(() => {
            calls.push([packageName, selector]);
            if (selector === "rc") return "4.0.0-rc.9";
            if (selector === "next") return "10.0.0-next.30";
            return "9.8.7";
          });

        const updates = yield* updateDependencySources(
          root,
          {
            "@confect/core": "10.0.0-next.22",
            effect: "4.0.0-rc.1",
            nx: "23.2.1",
            oxlint: "1.81.0",
            react: "19.0.0",
          },
          resolver
        );

        expect(calls).toEqual([
          ["@confect/core", "next"],
          ["effect", "rc"],
          ["react", "latest"],
        ]);
        expect(updates).toEqual({
          "@confect/core": "10.0.0-next.30",
          effect: "4.0.0-rc.9",
          nx: "23.2.1",
          oxlint: "1.82.0",
          react: "9.8.7",
        });
      }).pipe(E.scoped)
    ));

  test("keeps successful source and lockfile updates", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const refresh: LockfileRefresher = (workspace) =>
          fs.writeFileString(path.join(workspace, "bun.lock"), "refreshed lockfile\n").pipe(E.as({ exitCode: 0, output: "installed" }));

        const updates = yield* updateDependencies(
          root,
          successfulResolver,
          refresh,
          { effect: "4.0.0-rc.1", nx: "23.2.1" },
          { nodeRange: ">=24.15 <25" }
        );

        expect(updates.effect).toBe("4.0.0-rc.9");
        expect(yield* fs.readFileString(path.join(root, "bun.lock"))).toBe("refreshed lockfile\n");
        expect(yield* fs.readFileString(path.join(root, "src/generators/versions.ts"))).toContain('effect: "4.0.0-rc.9"');
      }).pipe(E.scoped)
    ));

  test("failed install preserves diagnostics and restores only update-owned files", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const ownedPaths = [path.join(root, "src/generators/versions.ts"), path.join(root, "package.json"), path.join(root, "bun.lock")];
        const before = yield* E.forEach(ownedPaths, (ownedPath) => fs.readFileString(ownedPath));
        const unrelatedPath = path.join(root, "docs/versions.md");
        yield* fs.writeFileString(unrelatedPath, "unrelated dirty fixture\n");
        const refresh: LockfileRefresher = (workspace) =>
          fs
            .writeFileString(path.join(workspace, "bun.lock"), "partially mutated lockfile\n")
            .pipe(E.as({ exitCode: 1, output: "resolved packages from simulated Bun stdout\nerror: incompatible peer dependency" }));

        const failure = yield* updateDependencies(
          root,
          successfulResolver,
          refresh,
          { effect: "4.0.0-rc.1", nx: "23.2.1" },
          { nodeRange: ">=24.15 <25" }
        ).pipe(E.flip);

        expect(failure).toMatchObject({
          command: "bun install",
          exitCode: 1,
          installerOutput: "resolved packages from simulated Bun stdout\nerror: incompatible peer dependency",
          issue: "lockfile_refresh_failed",
        });
        expect(failure.message).toContain("bun install");
        expect(failure.message).toContain("incompatible peer dependency");
        expect(yield* E.forEach(ownedPaths, (ownedPath) => fs.readFileString(ownedPath))).toEqual(before);
        expect(yield* fs.readFileString(unrelatedPath)).toBe("unrelated dirty fixture\n");
      }).pipe(E.scoped)
    ));

  test("failed install removes a transaction-owned lockfile that did not previously exist", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const lockfilePath = path.join(root, "bun.lock");
        yield* fs.remove(lockfilePath);
        const refresh: LockfileRefresher = () =>
          fs.writeFileString(lockfilePath, "new partial lockfile\n").pipe(E.as({ exitCode: 1, output: "install failed" }));

        yield* updateDependencies(
          root,
          successfulResolver,
          refresh,
          { effect: "4.0.0-rc.1", nx: "23.2.1" },
          { nodeRange: ">=24.15 <25" }
        ).pipe(E.flip);

        expect(yield* fs.exists(lockfilePath)).toBe(false);
      }).pipe(E.scoped)
    ));
});
