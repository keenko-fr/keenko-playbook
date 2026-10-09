import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect as E, FileSystem, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const guidance = (file: string) =>
  file === "README.md" ||
  /^src\/generators\/sync\/files\/(?:docs|skills)\/.+\.md$/u.test(file) ||
  /^src\/generators\/sync\/fragments\/(?:AGENTS|CLAUDE)\.md$/u.test(file);
const documentation = (file: string) => /^docs\/.+\.md$/u.test(file) || /^\.nx\/version-plans\/[^/]+\.md$/u.test(file);

export const verificationMode = (files: readonly string[]) => {
  if (files.length === 0 || files.some((file) => !guidance(file) && !documentation(file))) return "full";
  return files.some(guidance) ? "guidance" : "docs";
};

const sRun = S.Struct({
  conclusion: S.NullOr(S.String),
  event: S.String,
  head_repository: S.NullOr(S.Struct({ full_name: S.String })),
  head_sha: S.String,
  id: S.Int,
  path: S.String,
  repository: S.Struct({ full_name: S.String }),
  run_attempt: S.Int,
  workflow_id: S.Int,
});
const sJob = S.Struct({
  conclusion: S.NullOr(S.String),
  name: S.String,
  steps: S.Array(S.Struct({ conclusion: S.NullOr(S.String), name: S.String })),
});
type Run = S.Schema.Type<typeof sRun>;
type Job = S.Schema.Type<typeof sJob>;

export const hasFullVerification = (run: Run, jobs: readonly Job[], repository: string, workflowId: number, tree: string) =>
  run.repository.full_name === repository &&
  run.head_repository?.full_name === repository &&
  run.workflow_id === workflowId &&
  run.path === ".github/workflows/ci.yml" &&
  run.event === "pull_request" &&
  run.conclusion === "success" &&
  /^[a-f0-9]{40}$/u.test(tree) &&
  jobs.some(
    (job) =>
      job.name === "check" &&
      job.conclusion === "success" &&
      ["Verify repository", "Verify release plan", "Verify packed product"].every((name) =>
        job.steps.some((step) => step.name === name && step.conclusion === "success")
      ) &&
      job.steps.some(
        (step) =>
          step.conclusion === "success" &&
          new RegExp(`^Verified full tree ${tree} revision [a-f0-9]{40} release-tag v[^ ]+$`, "u").test(step.name)
      )
  ) &&
  jobs.some((job) => job.name === "minimum-node" && job.conclusion === "success");

const command = E.fn("ci.command")(function* (executable: string, args: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(ChildProcess.make(executable, args, { forceKillAfter: "5 seconds" }));
});

const reuseVerification = E.gen(function* () {
  const repository = yield* Config.String("GITHUB_REPOSITORY");
  const tree = (yield* command("git", ["rev-parse", "HEAD^{tree}"])).trim();
  const workflow = yield* command("git", ["show", "HEAD:.github/workflows/ci.yml"]);
  const workflowId = (yield* command("gh", ["api", `repos/${repository}/actions/workflows/ci.yml`, "--jq", ".id"])).trim();
  // Bounded lookup; absent/expired evidence costs a full check, never correctness.
  const runs = yield* S.decodeEffect(S.fromJsonString(S.Struct({ workflow_runs: S.Array(sRun) })))(
    yield* command("gh", ["api", `repos/${repository}/actions/workflows/${workflowId}/runs?event=pull_request&status=success&per_page=50`])
  );
  for (const run of runs.workflow_runs) {
    const jobs = yield* S.decodeEffect(S.fromJsonString(S.Struct({ jobs: S.Array(sJob) })))(
      yield* command("gh", ["api", `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`])
    );
    if (!hasFullVerification(run, jobs.jobs, repository, Number(workflowId), tree)) continue;
    const recorded = jobs.jobs
      .find((job) => job.name === "check")
      ?.steps.find((step) => step.name.startsWith(`Verified full tree ${tree} revision `));
    const tested = recorded?.name.split(" ")[5] ?? "";
    const recordedTag = recorded?.name.split(" ")[7] ?? "";
    yield* command("git", ["fetch", "--no-tags", "origin", tested]);
    if ((yield* command("git", ["rev-parse", `${tested}^{tree}`])).trim() !== tree) continue;
    if ((yield* command("git", ["show", `${tested}:.github/workflows/ci.yml`])) !== workflow) continue;
    if ((yield* command("git", ["show", `${run.head_sha}:.github/workflows/ci.yml`])) !== workflow) continue;
    // Tree equality alone omits native Nx's Git history/tag inputs. Accept the
    // actual merge, or a squash onto exactly the same tested base, with the same
    // nearest release tag. Release-generated commits deliberately fall back.
    const revision = (yield* command("git", ["rev-parse", "HEAD"])).trim();
    if (revision !== tested) {
      const testedParents = (yield* command("git", ["show", "-s", "--format=%P", tested])).trim().split(" ");
      const releaseParents = (yield* command("git", ["show", "-s", "--format=%P", revision])).trim().split(" ");
      if (
        testedParents.length !== 2 ||
        releaseParents.length !== 1 ||
        testedParents[0] !== releaseParents[0] ||
        testedParents[1] !== run.head_sha
      )
        continue;
    }
    const releaseTag = (yield* command("git", ["describe", "--tags", "--match", "v*", "--abbrev=0", revision])).trim();
    if (
      releaseTag !== recordedTag ||
      (yield* command("git", ["describe", "--tags", "--match", "v*", "--abbrev=0", tested])).trim() !== releaseTag
    )
      continue;
    yield* Console.log(`Reusing full verification from https://github.com/${repository}/actions/runs/${run.id} for tree ${tree}`);
    return true;
  }
  return false;
});

const routeVerification = E.gen(function* () {
  const base = yield* Config.String("PLAN_BASE");
  const head = yield* Config.String("PLAN_HEAD");
  const mergeBase = (yield* command("git", ["merge-base", base, head])).trim();
  // Compare the tested merge tree to the PR's common ancestor. Base-side product
  // changes, deletions and both sides of renames must also receive full checks.
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const changed = yield* spawner.string(
    ChildProcess.make("git", ["diff", "--name-only", "--no-renames", "-z", mergeBase, "HEAD"], { forceKillAfter: "5 seconds" })
  );
  return verificationMode(changed.split("\0").filter((file) => file.length > 0));
});

if (import.meta.main)
  NodeRuntime.runMain(
    E.gen(function* () {
      // oxlint-disable-next-line effect/noGlobals -- CLI selects this repository's two verification boundaries.
      const reuse = process.argv[2] === "--reuse";
      const value = reuse
        ? yield* reuseVerification.pipe(
            E.catch((error) => Console.log(`Verification evidence unavailable; running full checks: ${String(error)}`).pipe(E.as(false)))
          )
        : yield* routeVerification;
      const output = yield* Config.String("GITHUB_OUTPUT");
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(output, `${reuse ? "reuse" : "mode"}=${value}\n`, { flag: "a" });
      yield* Console.log(`${reuse ? "reuse" : "mode"}=${value}`);
    }).pipe(E.scoped, E.provide(NodeServices.layer))
  );
