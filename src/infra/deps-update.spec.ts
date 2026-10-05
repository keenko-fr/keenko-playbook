import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { serializeJson } from "@nx/devkit";
import { Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { describe, expect, test } from "vitest";

import {
  compatibilityVersionOverrides,
  DependencyUpdateFailure,
  formatDependencyUpdates,
  type DependencyUpdate,
  isExactPackageVersion,
  prereleaseChannels,
  updateDependencies,
  updateDependencySources,
  type LockfileRefresher,
  type RegistryResolver,
} from "./deps-update.js";

const provideNodeServices = <A, X>(effect: E.Effect<A, X, NodeServices.NodeServices>) => effect.pipe(E.provide(NodeServices.layer));

const sTestManifest = S.fromJsonString(
  S.Struct({ dependencies: S.Record(S.String, S.String), devDependencies: S.Record(S.String, S.String) })
);

const encodeJsonString = S.encodeSync(S.fromJsonString(S.String));

const selectedVersions = (updates: Record<string, DependencyUpdate>) =>
  Object.fromEntries(Object.entries(updates).map(([name, update]) => [name, update.selected]));

const failedResolver: RegistryResolver = (packageName, selector) =>
  E.fail(new DependencyUpdateFailure({ issue: "registry_resolution_failed", packageName, selector }));

const successfulResolver: RegistryResolver = (packageName) => E.succeed(packageName === "effect" ? "4.0.0" : "2.3.4");

const fixture = E.fn("test.deps.fixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-deps-test-" });
  const versionsDirectory = path.join(root, "src/generators");

  yield* fs.makeDirectory(versionsDirectory, { recursive: true });
  yield* fs.makeDirectory(path.join(root, "docs"), { recursive: true });
  yield* fs.writeFileString(
    path.join(versionsDirectory, "versions.ts"),
    `export const packageVersions = {\n  "@effect/platform-node": "4.0.0-rc.1",\n  "@nx/devkit": "23.3.0-beta.9",\n  "@nx/oxlint": "23.3.0-beta.9",\n  effect: "4.0.0-rc.1",\n  nx: "23.3.0-beta.9",\n} satisfies Record<string, string>;\n\nexport const runtimeVersions = {\n  bun: "1.4.2",\n  nodeRange: ">=24.15 <25",\n} satisfies Record<string, string>;\n`
  );
  yield* fs.writeFileString(
    path.join(root, "package.json"),
    '{\n  "dependencies": {\n    "@effect/platform-node": "4.0.0-rc.1",\n    "@nx/devkit": "23.3.0-beta.9",\n    "effect": "4.0.0-rc.1"\n  },\n  "devDependencies": {\n    "@nx/js": "23.3.0-beta.9",\n    "@nx/oxlint": "23.3.0-beta.9",\n    "nx": "23.3.0-beta.9"\n  }\n}\n'
  );
  yield* fs.writeFileString(path.join(root, "docs/versions.md"), "runtime and package documentation stays untouched\n");
  yield* fs.writeFileString(path.join(root, "bun.lock"), "original lockfile\n");

  return root;
});

describe("dependency updater", () => {
  it.live("resolves stable Effect and stable Confect to exact versions", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (packageName, selector) =>
          E.sync(() => {
            calls.push([packageName, selector]);
            return packageName === "@confect/core" ? "10.0.0" : "4.0.0";
          });

        const updates = yield* updateDependencySources(
          root,
          {
            "@confect/core": "10.0.0-next.22",
            "@effect/platform-node": "4.0.0-rc.1",
            "@nx/devkit": "23.3.0-beta.9",
            "@nx/oxlint": "23.3.0-beta.9",
            effect: "4.0.0-rc.1",
            nx: "23.3.0-beta.9",
          },
          resolver
        );
        const versions = yield* fs.readFileString(path.join(root, "src/generators/versions.ts"));
        const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(path.join(root, "package.json")));

        expect(calls).toEqual([
          ["@confect/core", "latest"],
          ["@effect/platform-node", "latest"],
          ["@nx/devkit", "latest"],
          ["@nx/devkit", "next"],
          ["@nx/oxlint", "latest"],
          ["@nx/oxlint", "next"],
          ["effect", "latest"],
          ["nx", "latest"],
          ["nx", "next"],
          ["@nx/js", "latest"],
          ["@nx/js", "next"],
        ]);
        expect(selectedVersions(updates)).toEqual({
          "@confect/core": "10.0.0",
          "@effect/platform-node": "4.0.0",
          "@nx/devkit": "23.3.0-beta.9",
          "@nx/js": "23.3.0-beta.9",
          "@nx/oxlint": "23.3.0-beta.9",
          effect: "4.0.1",
          nx: "23.3.0-beta.9",
        });
        expect(
          Object.values(updates).every(
            ({ stableCandidate, selected }) => isExactPackageVersion(stableCandidate) && isExactPackageVersion(selected)
          )
        ).toBe(true);
        expect(versions).toContain('"@effect/platform-node": "4.0.0"');
        expect(versions).toContain('effect: "4.0.1"');
        expect(versions).toContain('"@nx/devkit": "23.3.0-beta.9"');
        expect(versions).toContain('"@nx/oxlint": "23.3.0-beta.9"');
        expect(versions).toContain('nx: "23.3.0-beta.9"');
        expect(manifest.dependencies["@effect/platform-node"]).toBe("4.0.0");
        expect(manifest.dependencies.effect).toBe("4.0.1");
        expect(manifest.dependencies["@nx/devkit"]).toBe("23.3.0-beta.9");
        expect(manifest.devDependencies["@nx/oxlint"]).toBe("23.3.0-beta.9");
        expect(manifest.devDependencies.nx).toBe("23.3.0-beta.9");
        expect(manifest.devDependencies["@nx/js"]).toBe("23.3.0-beta.9");
      }).pipe(E.scoped)
    )
  );

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
    expect(prereleaseChannels).toEqual({ nx: "next" });
    expect(compatibilityVersionOverrides).toEqual({
      "@effect/vitest": "4.0.1",
      "@nx/devkit": "23.3.0-beta.9",
      "@nx/oxlint": "23.3.0-beta.9",
      "@nx/vitest": "23.3.0-beta.9",
      "@workos-inc/node": "10.14.0",
      effect: "4.0.1",
      jsdom: "30.0.1",
      nx: "23.3.0-beta.9",
      typescript: "6.0.3",
      vite: "8.3.2",
      vitest: "5.0.3",
    });
    expect(Object.values(compatibilityVersionOverrides).every(isExactPackageVersion)).toBe(true);
  });

  it.live("prevents all constrained tuple members from drifting to incompatible latest versions", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(
          path.join(root, "package.json"),
          serializeJson({ dependencies: {}, devDependencies: compatibilityVersionOverrides })
        );
        const calls: string[] = [];
        const resolver: RegistryResolver = (name) =>
          E.sync(() => {
            calls.push(name);
            return "99.0.0";
          });
        const updates = yield* updateDependencySources(root, compatibilityVersionOverrides, resolver);
        expect(selectedVersions(updates)).toEqual(compatibilityVersionOverrides);
        expect(calls).toEqual([
          "@effect/vitest",
          "@nx/devkit",
          "@nx/devkit",
          "@nx/oxlint",
          "@nx/oxlint",
          "@nx/vitest",
          "@nx/vitest",
          "@workos-inc/node",
          "effect",
          "jsdom",
          "nx",
          "nx",
          "typescript",
          "vite",
          "vitest",
        ]);
        for (const [name, selected] of Object.entries(compatibilityVersionOverrides)) {
          expect(updates[name]).toMatchObject({ held: true, selected, selector: "latest", stableCandidate: "99.0.0" });
          if (name === "nx" || name.startsWith("@nx/"))
            expect(updates[name]).toMatchObject({ prereleaseCandidate: "99.0.0", prereleaseChannel: "next" });
          else expect(O.fromNullishOr(updates[name].prereleaseCandidate)).toEqual(O.none());
          expect(yield* fs.readFileString(path.join(root, "src/generators/versions.ts"))).toContain(
            `${name.includes("@") ? encodeJsonString(name) : name}: ${encodeJsonString(selected)}`
          );
        }
        const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(path.join(root, "package.json")));
        expect(manifest.devDependencies).toEqual(compatibilityVersionOverrides);
      }).pipe(E.scoped)
    )
  );

  for (const [stableCandidate, prereleaseCandidate] of [
    ["23.2.1", "23.3.0-beta.10"],
    ["23.3.0", "23.4.0-beta.1"],
    ["23.2.1", "23.3.0-beta.9"],
  ])
    it.live(`discovers Nx stable ${stableCandidate} and next ${prereleaseCandidate} without adoption`, () =>
      provideNodeServices(
        E.gen(function* () {
          const root = yield* fixture();
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const current = {
            "@nx/devkit": "23.3.0-beta.9",
            "@nx/oxlint": "23.3.0-beta.9",
            "@nx/vitest": "23.3.0-beta.9",
            nx: "23.3.0-beta.9",
          };
          yield* fs.writeFileString(
            path.join(root, "package.json"),
            serializeJson({ dependencies: {}, devDependencies: { ...current, "@nx/js": current.nx } })
          );
          const calls: (readonly [string, string])[] = [];
          const resolver: RegistryResolver = (name, selector) =>
            E.sync(() => {
              calls.push([name, selector]);
              return selector === "latest" ? stableCandidate : prereleaseCandidate;
            });
          const updates = yield* updateDependencySources(root, current, resolver);
          const family = ["@nx/devkit", "@nx/oxlint", "@nx/vitest", "nx", "@nx/js"];
          expect(calls).toEqual(
            family.flatMap((name) => [
              [name, "latest"],
              [name, "next"],
            ])
          );
          for (const name of family)
            expect(updates[name]).toEqual({
              held: true,
              prereleaseCandidate,
              prereleaseChannel: "next",
              selected: current.nx,
              selector: "latest",
              stableCandidate,
            });
          const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(path.join(root, "package.json")));
          expect(manifest.devDependencies).toEqual({ ...current, "@nx/js": current.nx });
          const versions = yield* fs.readFileString(path.join(root, "src/generators/versions.ts"));
          for (const name of Object.keys(current))
            expect(versions).toContain(`${name === "nx" ? name : encodeJsonString(name)}: "23.3.0-beta.9"`);
          expect(versions).not.toContain('"@nx/js"');
          expect(formatDependencyUpdates(updates, current)).toEqual(
            family.map(
              (name) => `${name}: stable candidate ${stableCandidate}, next candidate ${prereleaseCandidate}, selected 23.3.0-beta.9 (held)`
            )
          );
        }).pipe(E.scoped)
      )
    );

  for (const failedSelector of ["latest", "next"])
    it.live(`fails Nx ${failedSelector} discovery before writes or lockfile refresh`, () =>
      provideNodeServices(
        E.gen(function* () {
          const root = yield* fixture();
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const owned = ["src/generators/versions.ts", "package.json", "bun.lock"].map((file) => path.join(root, file));
          const before = yield* E.forEach(owned, (file) => fs.readFileString(file));
          const calls: (readonly [string, string])[] = [];
          let refreshed = false;
          const resolver: RegistryResolver = (name, selector) => {
            calls.push([name, selector]);
            return selector === failedSelector ? failedResolver(name, selector) : E.succeed("23.2.1");
          };
          const failure = yield* updateDependencies(
            root,
            resolver,
            () =>
              E.sync(() => {
                refreshed = true;
                return { exitCode: 0, output: "installed" };
              }),
            { nx: "23.3.0-beta.9" }
          ).pipe(E.flip);
          expect(calls).toEqual(
            failedSelector === "latest"
              ? [["nx", "latest"]]
              : [
                  ["nx", "latest"],
                  ["nx", "next"],
                ]
          );
          expect(failure).toMatchObject({ issue: "registry_resolution_failed", packageName: "nx", selector: failedSelector });
          expect(refreshed).toBe(false);
          expect(yield* E.forEach(owned, (file) => fs.readFileString(file))).toEqual(before);
        }).pipe(E.scoped)
      )
    );

  it.live("discovers only stable candidates for the whole stable Confect family", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const current = { "@confect/cli": "10.0.0", "@confect/core": "10.0.0", "@confect/server": "10.0.0", "@confect/test": "10.0.0" };
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(path.join(root, "package.json"), serializeJson({ dependencies: current, devDependencies: {} }));
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (name, selector) =>
          E.sync(() => {
            calls.push([name, selector]);
            return "10.0.0";
          });
        const updates = yield* updateDependencySources(root, current, resolver);
        expect(calls).toEqual(Object.keys(current).map((name) => [name, "latest"]));
        for (const name of Object.keys(current))
          expect(updates[name]).toEqual({ held: false, selected: "10.0.0", selector: "latest", stableCandidate: "10.0.0" });
      }).pipe(E.scoped)
    )
  );

  for (const candidate of ["9.0.0", "8.3.2"])
    it.live(`discovers Vite candidate ${candidate} while holding the selected version at 8.3.2`, () =>
      provideNodeServices(
        E.gen(function* () {
          const root = yield* fixture();
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const versionsPath = path.join(root, "src/generators/versions.ts");
          const manifestPath = path.join(root, "package.json");
          yield* fs.writeFileString(
            versionsPath,
            'export const packageVersions = {\n  vite: "8.3.2",\n} satisfies Record<string, string>;\n'
          );
          yield* fs.writeFileString(manifestPath, '{\n  "dependencies": {},\n  "devDependencies": {\n    "vite": "8.3.2"\n  }\n}\n');
          const calls: (readonly [string, string])[] = [];
          const resolver: RegistryResolver = (packageName, selector) =>
            E.sync(() => {
              calls.push([packageName, selector]);
              return candidate;
            });

          const updates = yield* updateDependencySources(root, { vite: "8.3.2" }, resolver);

          expect(calls).toEqual([["vite", "latest"]]);
          expect(updates.vite).toEqual({ held: true, selected: "8.3.2", selector: "latest", stableCandidate: candidate });
          expect(formatDependencyUpdates(updates, { vite: "8.3.2" })).toEqual(
            candidate === "8.3.2" ? [] : ["vite: stable candidate 9.0.0, selected 8.3.2 (held)"]
          );
          expect(yield* fs.readFileString(versionsPath)).toContain('vite: "8.3.2"');
          const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(manifestPath));
          expect(manifest.devDependencies.vite).toBe("8.3.2");
        }).pipe(E.scoped)
      )
    );

  it.live("adopts ordinary candidates and preserves registry aliases", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const current = { "@typescript/native": "npm:typescript@7.0.2", react: "2.3.0" };
        yield* fs.writeFileString(
          path.join(root, "package.json"),
          serializeJson({
            dependencies: { react: current.react },
            devDependencies: { "@typescript/native": current["@typescript/native"] },
          })
        );
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (name, selector) =>
          E.sync(() => {
            calls.push([name, selector]);
            return name === "react" ? "2.4.0" : "7.0.3";
          });
        const updates = yield* updateDependencySources(root, current, resolver);
        expect(calls).toEqual([
          ["typescript", "latest"],
          ["react", "latest"],
        ]);
        expect(updates).toEqual({
          "@typescript/native": {
            held: false,
            selected: "npm:typescript@7.0.3",
            selector: "latest",
            stableCandidate: "npm:typescript@7.0.3",
          },
          react: { held: false, selected: "2.4.0", selector: "latest", stableCandidate: "2.4.0" },
        });
        const manifest = yield* S.decodeEffect(sTestManifest)(yield* fs.readFileString(path.join(root, "package.json")));
        expect(manifest.dependencies.react).toBe("2.4.0");
        expect(manifest.devDependencies["@typescript/native"]).toBe("npm:typescript@7.0.3");
        expect(yield* fs.readFileString(path.join(root, "src/generators/versions.ts"))).toContain('react: "2.4.0"');
        expect(formatDependencyUpdates(updates, current)).toEqual([
          "@typescript/native: stable candidate npm:typescript@7.0.3, selected npm:typescript@7.0.3",
          "react: stable candidate 2.4.0, selected 2.4.0",
        ]);
        expect(formatDependencyUpdates(updates, selectedVersions(updates))).toEqual([]);
      }).pipe(E.scoped)
    )
  );

  it.live("held registry failure fails the sweep before writes or lockfile refresh", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const owned = ["src/generators/versions.ts", "package.json", "bun.lock"].map((file) => path.join(root, file));
        const before = yield* E.forEach(owned, (file) => fs.readFileString(file));
        const calls: string[] = [];
        let refreshed = false;
        const resolver: RegistryResolver = (name, selector) => {
          calls.push(name);
          return name === "vite" ? failedResolver(name, selector) : E.succeed("2.4.0");
        };
        const failure = yield* updateDependencies(
          root,
          resolver,
          () =>
            E.sync(() => {
              refreshed = true;
              return { exitCode: 0, output: "installed" };
            }),
          { react: "2.3.0", vite: "8.3.2" }
        ).pipe(E.flip);
        expect(calls).toEqual(["react", "vite"]);
        expect(failure).toMatchObject({ issue: "registry_resolution_failed", packageName: "vite", selector: "latest" });
        expect(refreshed).toBe(false);
        expect(yield* E.forEach(owned, (file) => fs.readFileString(file))).toEqual(before);
      }).pipe(E.scoped)
    )
  );

  it.live("registry failure is modeled and leaves all files unchanged", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const versionsPath = path.join(root, "src/generators/versions.ts");
        const manifestPath = path.join(root, "package.json");
        const beforeVersions = yield* fs.readFileString(versionsPath);
        const beforeManifest = yield* fs.readFileString(manifestPath);
        const failure = yield* updateDependencySources(root, { "@effect/platform-node": "4.0.0-rc.1", nx: "1.0.0" }, failedResolver).pipe(
          E.flip
        );

        expect(failure).toMatchObject({ _tag: "DependencyUpdateFailure", issue: "registry_resolution_failed" });
        expect(yield* fs.readFileString(versionsPath)).toBe(beforeVersions);
        expect(yield* fs.readFileString(manifestPath)).toBe(beforeManifest);
      }).pipe(E.scoped)
    )
  );

  it.live("does not modify documentation or runtime policy", () =>
    provideNodeServices(
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
    )
  );

  it.live("selects @types/node from the canonical runtime major instead of latest", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (packageName, selector) =>
          E.sync(() => {
            calls.push([packageName, selector]);
            return selector === "24" ? "24.99.1" : "22.20.3";
          });

        const updates = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.3.0-beta.9" }, resolver, {
          nodeRange: ">=24.15 <25",
        });

        expect(calls).toEqual([
          ["@types/node", "24"],
          ["nx", "latest"],
          ["nx", "next"],
          ["@nx/js", "latest"],
          ["@nx/js", "next"],
        ]);
        expect(updates["@types/node"].selected).toBe("24.99.1");
      }).pipe(E.scoped)
    )
  );

  it.live("follows a changed canonical Node runtime major", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const selectors: string[] = [];
        const resolver: RegistryResolver = (_packageName, selector) =>
          E.sync(() => {
            selectors.push(selector);
            if (selector === "next") return "23.3.0-beta.9";
            return selector === "latest" ? "23.2.1" : `${selector}.1.2`;
          });

        const updates = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.3.0-beta.9" }, resolver, {
          nodeRange: ">=26.2 <27",
        });

        expect(selectors).toEqual(["26", "latest", "next", "latest", "next"]);
        expect(updates["@types/node"].selected).toBe("26.1.2");
      }).pipe(E.scoped)
    )
  );

  it.live("rejects a constrained @types/node result from another major", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const failure = yield* updateDependencySources(
          root,
          { "@types/node": "24.13.3", nx: "23.3.0-beta.9" },
          () => E.succeed("22.20.3"),
          {
            nodeRange: ">=24.15 <25",
          }
        ).pipe(E.flip);

        expect(failure).toMatchObject({
          issue: "invalid_version",
          packageName: "@types/node",
          selector: "24",
          value: "22.20.3",
        });
      }).pipe(E.scoped)
    )
  );

  it.live("reports constrained @types/node registry failures with selector context", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const failure = yield* updateDependencySources(root, { "@types/node": "24.13.3", nx: "23.3.0-beta.9" }, failedResolver, {
          nodeRange: ">=24.15 <25",
        }).pipe(E.flip);

        expect(failure).toMatchObject({
          issue: "registry_resolution_failed",
          packageName: "@types/node",
          selector: "24",
        });
      }).pipe(E.scoped)
    )
  );

  it.live("keeps ordinary packages on latest while retaining only required tuple holds", () =>
    provideNodeServices(
      E.gen(function* () {
        const root = yield* fixture();
        const calls: (readonly [string, string])[] = [];
        const resolver: RegistryResolver = (packageName, selector) =>
          E.sync(() => {
            calls.push([packageName, selector]);
            if (packageName === "effect") return "4.0.0";
            if (packageName === "@confect/core") return "10.0.0";
            return "9.8.7";
          });

        const updates = yield* updateDependencySources(
          root,
          {
            "@confect/core": "10.0.0-next.22",
            effect: "4.0.0-rc.1",
            nx: "23.3.0-beta.9",
            oxlint: "1.81.0",
            react: "19.0.0",
          },
          resolver
        );

        expect(calls).toEqual([
          ["@confect/core", "latest"],
          ["effect", "latest"],
          ["nx", "latest"],
          ["nx", "next"],
          ["oxlint", "latest"],
          ["react", "latest"],
          ["@nx/js", "latest"],
          ["@nx/js", "next"],
        ]);
        expect(selectedVersions(updates)).toEqual({
          "@confect/core": "10.0.0",
          "@nx/js": "23.3.0-beta.9",
          effect: "4.0.1",
          nx: "23.3.0-beta.9",
          oxlint: "9.8.7",
          react: "9.8.7",
        });
      }).pipe(E.scoped)
    )
  );

  it.live("keeps successful source and lockfile updates", () =>
    provideNodeServices(
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
          { effect: "4.0.0-rc.1", nx: "23.3.0-beta.9" },
          { nodeRange: ">=24.15 <25" }
        );

        expect(updates.effect.selected).toBe("4.0.1");
        expect(yield* fs.readFileString(path.join(root, "bun.lock"))).toBe("refreshed lockfile\n");
        expect(yield* fs.readFileString(path.join(root, "src/generators/versions.ts"))).toContain('effect: "4.0.1"');
      }).pipe(E.scoped)
    )
  );

  it.live("failed install preserves diagnostics and restores only update-owned files", () =>
    provideNodeServices(
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
          { effect: "4.0.0-rc.1", nx: "23.3.0-beta.9" },
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
    )
  );

  it.live("failed install removes a transaction-owned lockfile that did not previously exist", () =>
    provideNodeServices(
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
          { effect: "4.0.0-rc.1", nx: "23.3.0-beta.9" },
          { nodeRange: ">=24.15 <25" }
        ).pipe(E.flip);

        expect(yield* fs.exists(lockfilePath)).toBe(false);
      }).pipe(E.scoped)
    )
  );
});
