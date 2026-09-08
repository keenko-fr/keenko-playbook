import { Effect as E, FileSystem, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const executionIgnoredEntries = new Set([".git", ".nx", ".cache", ".tanstack", ".DS_Store"]);

const comparisonIgnoredEntries = new Set([".git", ".nx", ".cache", ".tanstack", "node_modules", ".DS_Store"]);

// ERRORS ----------------------------------------------------------------------------------------------------------------------------------
export class CodegenCheckFailure extends S.TaggedError<CodegenCheckFailure>()("CodegenCheckFailure", {
  exitCode: S.optional(S.Finite),
  issue: S.Literals(["codegen_failed", "generated_code_stale", "git_diff_failed"]),
}) {}

// MAIN ------------------------------------------------------------------------------------------------------------------------------------
export const checkCodegen = E.fn("keenko.codegen.check")(function* (workspace: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const original = yield* fs.realPath(path.resolve(workspace));
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-codegen-" });

  const isolated = path.join(temporary, "workspace");
  const before = path.join(temporary, "before");
  const after = path.join(temporary, "after");

  // The execution copy includes node_modules so real codegen can run.
  yield* copyWorkspace(original, isolated, executionIgnoredEntries);

  // Comparison trees contain only meaningful workspace state.
  yield* copyComparableWorkspace(original, before);

  const codegenExit = yield* spawner.exitCode(
    ChildProcess.make("bun", ["run", "codegen"], {
      cwd: isolated,
      env: {
        NX_CACHE_DIRECTORY: path.join(isolated, ".nx/cache"),
        NX_DAEMON: "false",
        NX_NO_CLOUD: "true",
        NX_SKIP_NX_CACHE: "true",
        NX_SKIP_REMOTE_CACHE: "true",
        NX_WORKSPACE_DATA_DIRECTORY: path.join(isolated, ".nx/workspace-data"),
      },
      extendEnv: true,
    })
  );

  if (codegenExit !== 0)
    return yield* new CodegenCheckFailure({
      exitCode: codegenExit,
      issue: "codegen_failed",
    });

  yield* copyComparableWorkspace(isolated, after);

  const diffExit = yield* spawner.exitCode(ChildProcess.make("git", ["diff", "--no-index", "--exit-code", "--", before, after]));

  if (diffExit === 0) return;

  if (diffExit === 1)
    return yield* new CodegenCheckFailure({
      issue: "generated_code_stale",
    });

  return yield* new CodegenCheckFailure({
    exitCode: diffExit,
    issue: "git_diff_failed",
  });
});

// INTERNALS -------------------------------------------------------------------------------------------------------------------------------
const copyComparableWorkspace = E.fn("keenko.codegen.copyComparableWorkspace")(function* (source: string, target: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* copyWorkspace(source, target, comparisonIgnoredEntries);

  // tsbuildinfo may exist anywhere in the workspace.
  for (const relative of yield* fs.readDirectory(target, { recursive: true }))
    if (relative.endsWith(".tsbuildinfo")) yield* fs.remove(path.join(target, relative), { force: true });
});

const copyWorkspace = E.fn("keenko.codegen.copyWorkspace")(function* (source: string, target: string, ignoredEntries: ReadonlySet<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* fs.makeDirectory(target, { recursive: true });

  for (const entry of yield* fs.readDirectory(source)) {
    if (ignoredEntries.has(entry)) continue;

    yield* fs.copy(path.join(source, entry), path.join(target, entry));
  }
});
