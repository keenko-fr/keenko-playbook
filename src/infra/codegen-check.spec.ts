import { describe, expect, test } from "bun:test";

import { NodeServices } from "@effect/platform-node";
import { Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { checkCodegen } from "./codegen-check.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const webOutput = "apps/web/src/paraglide/messages.js";
const backendOutput = "packages/backend/confect/_generated/api.ts";

const sManifest = S.fromJsonString(
  S.Struct({
    scripts: S.Record(S.String, S.String),
  })
);

// HELPERS ---------------------------------------------------------------------------------------------------------------------------------
const run = <A, X>(effect: E.Effect<A, X, NodeServices.NodeServices>) => E.runPromise(effect.pipe(E.provide(NodeServices.layer)));

const fixture = E.fn("test.codegen.fixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const root = yield* fs.makeTempDirectoryScoped({
    prefix: "keenko-codegen-test-",
  });

  yield* fs.makeDirectory(path.join(root, path.dirname(webOutput)), {
    recursive: true,
  });

  yield* fs.makeDirectory(path.join(root, path.dirname(backendOutput)), {
    recursive: true,
  });

  yield* fs.writeFileString(
    path.join(root, "package.json"),
    yield* S.encodeEffect(sManifest)({
      scripts: {
        codegen: `printf current > ${webOutput} && printf current > ${backendOutput}`,
      },
    })
  );

  yield* fs.writeFileString(path.join(root, webOutput), "current");
  yield* fs.writeFileString(path.join(root, backendOutput), "current");

  return root;
});

const snapshot = E.fn("test.codegen.snapshot")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const result: Record<string, string> = {};

  for (const file of (yield* fs.readDirectory(root, { recursive: true })).toSorted()) {
    const absolute = path.join(root, file);

    if ((yield* fs.stat(absolute)).type === "File") result[file] = yield* fs.readFileString(absolute);
  }

  return result;
});

// TESTS -----------------------------------------------------------------------------------------------------------------------------------
describe("codegen freshness", () => {
  test("clean state passes without changing the workspace", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const before = yield* snapshot(root);

        yield* checkCodegen(root).pipe(E.scoped);

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("removes the disposable workspace after checking", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const directories: string[] = [];

        yield* checkCodegen(root).pipe(
          E.provideService(FileSystem.FileSystem, {
            ...fs,
            makeTempDirectoryScoped: (options) =>
              fs.makeTempDirectoryScoped(options).pipe(
                E.tap((directory) =>
                  E.sync(() => {
                    directories.push(directory);
                  })
                )
              ),
          }),
          E.scoped
        );

        expect(directories).toHaveLength(1);

        for (const directory of directories) expect(yield* fs.exists(directory)).toBe(false);
      }).pipe(E.scoped)
    ));

  for (const output of [webOutput, backendOutput])
    test(`detects stale ${output} without changing the workspace`, () =>
      run(
        E.gen(function* () {
          const root = yield* fixture();
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;

          yield* fs.writeFileString(path.join(root, output), "stale");

          const before = yield* snapshot(root);

          const failure = yield* checkCodegen(root).pipe(E.scoped, E.flip);

          expect(failure).toMatchObject({
            _tag: "CodegenCheckFailure",
            issue: "generated_code_stale",
          });

          expect(yield* snapshot(root)).toEqual(before);
        }).pipe(E.scoped)
      ));

  test("detects generated additions and deletions", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fs.writeFileString(path.join(root, "old.txt"), "old");

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: "rm old.txt && printf new > new.txt",
            },
          })
        );

        const before = yield* snapshot(root);

        const failure = yield* checkCodegen(root).pipe(E.scoped, E.flip);

        expect(failure).toMatchObject({
          _tag: "CodegenCheckFailure",
          issue: "generated_code_stale",
        });

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("detects generated files ignored by the project gitignore", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fs.writeFileString(path.join(root, ".gitignore"), "generated.txt\n");

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: "printf generated > generated.txt",
            },
          })
        );

        const before = yield* snapshot(root);

        const failure = yield* checkCodegen(root).pipe(E.scoped, E.flip);

        expect(failure).toMatchObject({
          _tag: "CodegenCheckFailure",
          issue: "generated_code_stale",
        });

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("ignores disposable Nx and tool cache changes", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: [
                'test "$NX_DAEMON" = false',
                'test "$NX_SKIP_NX_CACHE" = true',
                'test "$NX_NO_CLOUD" = true',
                "mkdir -p .nx/cache",
                "mkdir -p .cache",
                "mkdir -p .tanstack",
                "printf nx > .nx/cache/value",
                "printf cache > .cache/value",
                "printf tanstack > .tanstack/value",
              ].join(" && "),
            },
          })
        );

        const before = yield* snapshot(root);

        yield* checkCodegen(root).pipe(E.scoped);

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("ignores node_modules changes made during codegen", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fs.makeDirectory(path.join(root, "node_modules/example"), {
          recursive: true,
        });

        yield* fs.writeFileString(path.join(root, "node_modules/example/state"), "before");

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: "printf after > node_modules/example/state",
            },
          })
        );

        const before = yield* snapshot(root);

        yield* checkCodegen(root).pipe(E.scoped);

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("ignores tsbuildinfo changes", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: "printf cache > generated.tsbuildinfo",
            },
          })
        );

        const before = yield* snapshot(root);

        yield* checkCodegen(root).pipe(E.scoped);

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("reports a failed generator without changing the workspace", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: `printf partial > ${webOutput} && exit 7`,
            },
          })
        );

        const before = yield* snapshot(root);

        const failure = yield* checkCodegen(root).pipe(E.scoped, E.flip);

        expect(failure).toMatchObject({
          _tag: "CodegenCheckFailure",
          issue: "codegen_failed",
        });

        expect(yield* snapshot(root)).toEqual(before);
      }).pipe(E.scoped)
    ));

  test("cleans the disposable workspace when codegen fails", () =>
    run(
      E.gen(function* () {
        const root = yield* fixture();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directories: string[] = [];

        yield* fs.writeFileString(
          path.join(root, "package.json"),
          yield* S.encodeEffect(sManifest)({
            scripts: {
              codegen: "exit 7",
            },
          })
        );

        yield* checkCodegen(root).pipe(
          E.provideService(FileSystem.FileSystem, {
            ...fs,
            makeTempDirectoryScoped: (options) =>
              fs.makeTempDirectoryScoped(options).pipe(
                E.tap((directory) =>
                  E.sync(() => {
                    directories.push(directory);
                  })
                )
              ),
          }),
          E.scoped,
          E.flip
        );

        expect(directories).toHaveLength(1);

        for (const directory of directories) expect(yield* fs.exists(directory)).toBe(false);
      }).pipe(E.scoped)
    ));

  test(
    "ships an executable checker in the packed runtime",
    () =>
      run(
        E.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

          const repository = yield* path.fromFileUrl(new URL("../../", import.meta.url));

          const packed = yield* fs.makeTempDirectoryScoped({
            prefix: "keenko-codegen-pack-",
          });

          expect(
            yield* spawner.exitCode(
              ChildProcess.make("bun", ["run", "build"], {
                cwd: repository,
              })
            )
          ).toBe(ChildProcessSpawner.ExitCode(0));

          expect(
            yield* spawner.exitCode(
              ChildProcess.make("bun", ["pm", "pack", "--ignore-scripts", "--destination", packed], {
                cwd: repository,
              })
            )
          ).toBe(ChildProcessSpawner.ExitCode(0));

          const archives = (yield* fs.readDirectory(packed)).filter((file) => file.endsWith(".tgz"));

          expect(archives).toHaveLength(1);

          for (const archive of archives)
            expect(yield* spawner.exitCode(ChildProcess.make("tar", ["-xf", path.join(packed, archive), "-C", packed]))).toBe(
              ChildProcessSpawner.ExitCode(0)
            );

          const extracted = path.join(packed, "package");

          expect(yield* fs.exists(path.join(extracted, "dist/infra/codegen-check.js"))).toBe(true);

          expect(yield* fs.exists(path.join(extracted, "dist/infra/codegen-check-cli.js"))).toBe(true);

          const manifest = yield* fs.readFileString(path.join(extracted, "package.json"));

          expect(manifest).toContain('"keenko-codegen-check": "./dist/infra/codegen-check-cli.js"');

          // Reuse the package's already-installed Effect runtime dependencies.
          yield* fs.symlink(path.join(repository, "node_modules"), path.join(extracted, "node_modules"));

          const root = yield* fixture();

          const command = ChildProcess.make(path.join(extracted, "dist/infra/codegen-check-cli.js"), [], {
            cwd: root,
          });

          expect(yield* spawner.exitCode(command)).toBe(ChildProcessSpawner.ExitCode(0));

          yield* fs.writeFileString(path.join(root, webOutput), "stale");

          const before = yield* snapshot(root);

          expect(yield* spawner.exitCode(command)).not.toBe(ChildProcessSpawner.ExitCode(0));

          expect(yield* snapshot(root)).toEqual(before);
        }).pipe(E.scoped)
      ),
    60_000
  );
});
