import { describe, expect, test } from "bun:test";

import { NodeServices } from "@effect/platform-node";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";

import {
  compatibilityVersionOverrides,
  DependencyUpdateFailure,
  isExactPackageVersion,
  updateDependencySources,
  type RegistryResolver,
} from "./deps-update.js";

const run = <A, X>(effect: E.Effect<A, X, NodeServices.NodeServices>) => E.runPromise(effect.pipe(E.provide(NodeServices.layer)));

const sTestManifest = S.fromJsonString(
  S.Struct({ dependencies: S.Record(S.String, S.String), devDependencies: S.Record(S.String, S.String) })
);

const failedResolver: RegistryResolver = (packageName, channel) =>
  E.fail(new DependencyUpdateFailure({ channel, issue: "registry_resolution_failed", packageName }));

const successfulResolver: RegistryResolver = (_packageName, channel) => E.succeed(channel === "rc" ? "4.0.0-rc.9" : "2.3.4");

const fixture = E.fn("test.deps.fixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-deps-test-" });
  const versionsDirectory = path.join(root, "src/generators");

  yield* fs.makeDirectory(versionsDirectory, { recursive: true });
  yield* fs.makeDirectory(path.join(root, "docs"), { recursive: true });
  yield* fs.writeFileString(
    path.join(versionsDirectory, "versions.ts"),
    `export const packageVersions = {\n  "@nx/devkit": "23.2.0",\n  "@nx/oxlint": "23.2.0",\n  effect: "4.0.0-rc.1",\n  nx: "23.2.0",\n} satisfies Record<string, string>;\n\nexport const runtimeVersions = {\n  bun: "1.4.2",\n  nodeRange: ">=24 <25",\n} satisfies Record<string, string>;\n`
  );
  yield* fs.writeFileString(
    path.join(root, "package.json"),
    '{\n  "dependencies": {\n    "@nx/devkit": "23.2.0",\n    "effect": "4.0.0-rc.1"\n  },\n  "devDependencies": {\n    "@nx/js": "23.2.0",\n    "@nx/oxlint": "23.2.0",\n    "nx": "23.2.0"\n  }\n}\n'
  );
  yield* fs.writeFileString(path.join(root, "docs/versions.md"), "runtime and package documentation stays untouched\n");

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
        const resolver: RegistryResolver = (packageName, channel) =>
          E.sync(() => {
            calls.push([packageName, channel]);
            return channel === "rc" ? "4.0.0-rc.9" : "2.3.4";
          });

        const updates = yield* updateDependencySources(
          root,
          { "@nx/devkit": "23.2.0", "@nx/oxlint": "23.2.0", effect: "4.0.0-rc.1", nx: "23.2.0" },
          resolver
        );
        const versions = yield* fs.readFileString(path.join(root, "src/generators/versions.ts"));
        const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(path.join(root, "package.json")));

        expect(calls).toEqual([["effect", "rc"]]);
        expect(updates).toEqual({
          "@nx/devkit": "23.2.0",
          "@nx/oxlint": "23.2.0",
          effect: "4.0.0-rc.9",
          nx: "23.2.0",
        });
        expect(Object.values(updates).every(isExactPackageVersion)).toBe(true);
        expect(versions).toContain('effect: "4.0.0-rc.9"');
        expect(versions).toContain('"@nx/devkit": "23.2.0"');
        expect(versions).toContain('"@nx/oxlint": "23.2.0"');
        expect(versions).toContain('nx: "23.2.0"');
        expect(manifest.dependencies.effect).toBe("4.0.0-rc.9");
        expect(manifest.dependencies["@nx/devkit"]).toBe("23.2.0");
        expect(manifest.devDependencies["@nx/oxlint"]).toBe("23.2.0");
        expect(manifest.devDependencies.nx).toBe("23.2.0");
        expect(manifest.devDependencies["@nx/js"]).toBe("23.2.0");
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
      "@nx/devkit": "23.2.0",
      "@nx/oxlint": "23.2.0",
      nx: "23.2.0",
      oxlint: "1.81.0",
      typescript: "6.0.2",
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
});
