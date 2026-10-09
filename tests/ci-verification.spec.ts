/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noModulePathFacts -- Synchronous Git/process adapters exercise the CI CLI in isolated repository fixtures. */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hasFullVerification, verificationMode } from "./ci-verification.js";

const guidance = "src/generators/sync/files/docs/conventions/schema-types.md";
const tree = "a".repeat(40);
const repository = "keenko-fr/keenko-playbook";
const run = {
  conclusion: "success",
  event: "pull_request",
  head_repository: { full_name: repository },
  head_sha: "b".repeat(40),
  id: 1,
  path: ".github/workflows/ci.yml",
  repository: { full_name: repository },
  run_attempt: 1,
  workflow_id: 2,
};
const jobs = [
  {
    conclusion: "success",
    name: "check",
    steps: [
      "Verify repository",
      "Verify release plan",
      "Verify packed product",
      `Verified full tree ${tree} revision ${run.head_sha} release-tag v1.0.0`,
    ].map((name) => ({
      conclusion: "success",
      name,
    })),
  },
  { conclusion: "success", name: "minimum-node", steps: [] },
] as const;

describe("PR verification routing", () => {
  test("distinguishes repository documentation from synchronized/packaged guidance", () => {
    expect(verificationMode(["docs/reports/kee-64.md"])).toBe("docs");
    for (const file of [
      guidance,
      "README.md",
      "src/generators/sync/files/skills/confect/SKILL.md",
      "src/generators/sync/fragments/AGENTS.md",
    ])
      expect(verificationMode([file, "docs/packed-product-test.md", ".nx/version-plans/guidance.md"])).toBe("guidance");
  });

  test("fails closed for every product boundary, mixed changes, empty and unknown input", () => {
    for (const file of [
      "src/generators/sync/sync.ts",
      "src/generators/preset/files/root/package.json.template",
      "src/migrations/factory.ts",
      "migrations.json",
      "bun.lock",
      "package.json",
      "nx.json",
      ".github/workflows/release.yml",
      ".github/workflows/ci.yml",
      "tests/packed-product.ts",
      "tests/fixtures/upgrade-source.json",
      "src/generators/versions.ts",
      "unknown.md",
      "src/generators/sync/files/skills/confect/agents/openai.yaml",
      "src/generators/sync/files/docs/probe.ts",
    ]) {
      expect(verificationMode([file])).toBe("full");
      expect(verificationMode([guidance, file])).toBe("full");
    }
    expect(verificationMode([])).toBe("full");
  });
});

describe("release evidence", () => {
  test("requires GitHub-owned successful full steps, exact tree and minimum Node acceptance", () => {
    expect(hasFullVerification(run, jobs, repository, 2, tree)).toBe(true);
    for (const changedRun of [
      { ...run, conclusion: "failure" },
      { ...run, event: "push" },
      { ...run, workflow_id: 3 },
      { ...run, path: ".github/workflows/other.yml" },
      { ...run, head_repository: { full_name: "fork/keenko-playbook" } },
      // oxlint-disable-next-line effect/noNullish -- GitHub API explicitly returns null for a deleted head repository.
      { ...run, head_repository: null },
      { ...run, repository: { full_name: "other/repo" } },
    ])
      expect(hasFullVerification(changedRun, jobs, repository, 2, tree)).toBe(false);
    expect(hasFullVerification(run, jobs, repository, 2, "c".repeat(40))).toBe(false);
    for (const missing of jobs[0].steps)
      expect(
        hasFullVerification(run, [{ ...jobs[0], steps: jobs[0].steps.filter((step) => step !== missing) }, jobs[1]], repository, 2, tree)
      ).toBe(false);
    for (const conclusion of ["failure", "skipped", "cancelled"])
      for (const index of [0, 1])
        expect(
          hasFullVerification(
            run,
            jobs.map((job, i) => (i === index ? { ...job, conclusion } : job)),
            repository,
            2,
            tree
          )
        ).toBe(false);
    expect(
      hasFullVerification(
        run,
        [{ ...jobs[0], steps: jobs[0].steps.map((step) => ({ ...step, conclusion: "skipped" })) }, jobs[1]],
        repository,
        2,
        tree
      )
    ).toBe(false);
    expect(
      hasFullVerification(
        run,
        [{ ...jobs[0], steps: jobs[0].steps.map((step) => ({ ...step, name: step.name.replace("full tree", "guidance tree") })) }, jobs[1]],
        repository,
        2,
        tree
      )
    ).toBe(false);
  });
});

const fixture = (use: (directory: string, git: (args: string[]) => string, write: (file: string, contents?: string) => void) => void) => {
  const directory = mkdtempSync(path.join(tmpdir(), "keenko-ci-"));
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: directory, encoding: "utf-8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const write = (file: string, contents = "fixture\n") => {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), contents);
  };
  // oxlint-disable-next-line effect/noTryCatch -- Synchronous fixture cleanup must run after a failing Bun assertion.
  try {
    git(["init", "--quiet"]);
    write(".git/info/exclude", "output\nbin/\nruns.json\njobs.json\n");
    git(["config", "user.email", "ci-fixture@keenko.invalid"]);
    git(["config", "user.name", "CI Fixture"]);
    use(directory, git, write);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};
const cli = path.join(import.meta.dirname, "ci-verification.ts");

test("workflow keeps the required check unconditional and publication behind full evidence or verification", () => {
  const ci = readFileSync(path.join(import.meta.dirname, "../.github/workflows/ci.yml"), "utf-8");
  expect(ci).not.toMatch(/^ {2}push:|^ {2}paths(?:-ignore)?:/mu);
  expect(ci).not.toMatch(/^ {4}if:/mu);
  expect(ci).toContain("  check:\n");
  const release = readFileSync(path.join(import.meta.dirname, "../.github/workflows/release.yml"), "utf-8");
  for (const step of ["Verify repository", "Verify packed product before publication"])
    expect(release.split(`      - name: ${step}\n`)[1]?.split("      - name:")[0]).toContain("if: steps.evidence.outputs.reuse != 'true'");
  expect(release.match(/bun run test:published --/gu)).toHaveLength(1);
  expect(release).toContain("permission-contents: write");
  expect(release).toContain("id-token: write");
  expect(release.indexOf("- name: Revalidate current main before release")).toBeLessThan(release.indexOf("- name: Release with Nx"));
  expect(release.match(/test "\$\(git rev-parse refs\/remotes\/origin\/main\)" = "\$GITHUB_SHA"/gu)).toHaveLength(2);
});
const route = (directory: string, base: string, head: string) => {
  const output = path.join(directory, "output");
  writeFileSync(output, "");
  const result = spawnSync("bun", [cli], {
    cwd: directory,
    encoding: "utf-8",
    env: { ...process.env, GITHUB_OUTPUT: output, PLAN_BASE: base, PLAN_HEAD: head },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(output, "utf-8");
};

test("real Git routing includes deletions, rename sources and concurrent base-side product changes", () => {
  fixture((directory, git, write) => {
    write("src/index.ts");
    write(guidance);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "Base"]);
    const base = git(["rev-parse", "HEAD"]);
    write(guidance, "Changed guidance\n");
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "Guidance"]);
    const head = git(["rev-parse", "HEAD"]);
    expect(route(directory, base, head)).toBe("mode=guidance\n");
    git(["rm", "src/index.ts"]);
    write("docs/moved.md");
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "Move product to docs"]);
    expect(route(directory, base, git(["rev-parse", "HEAD"]))).toBe("mode=full\n");
    git(["checkout", "--quiet", "-b", "concurrent", base]);
    write("src/index.ts", "New base product\n");
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "Concurrent product"]);
    const changedBase = git(["rev-parse", "HEAD"]);
    git(["merge", "--quiet", "--no-edit", head]);
    expect(route(directory, changedBase, head)).toBe("mode=full\n");
  });
});

test("release CLI accepts a squash with the same tree, rejects changed workflows and falls back on API failure", () => {
  fixture((directory, git, write) => {
    const workflow = readFileSync(path.join(import.meta.dirname, "../.github/workflows/ci.yml"), "utf-8");
    write(".github/workflows/ci.yml", workflow);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "Base"]);
    const base = git(["rev-parse", "HEAD"]);
    git(["tag", "v1.0.0"]);
    git(["checkout", "--quiet", "-b", "pr"]);
    write("src/index.ts");
    git(["add", "src/index.ts"]);
    git(["commit", "--quiet", "-m", "Product"]);
    const head = git(["rev-parse", "HEAD"]);
    git(["checkout", "--quiet", "-b", "tested", base]);
    git(["merge", "--quiet", "--no-ff", "--no-edit", head]);
    const tested = git(["rev-parse", "HEAD"]);
    const testedTree = git(["rev-parse", "HEAD^{tree}"]);
    git(["checkout", "--quiet", "-b", "release", base]);
    git(["merge", "--quiet", "--squash", head]);
    git(["commit", "--quiet", "-m", "Squash"]);
    expect(git(["rev-parse", "HEAD"])).not.toBe(tested);
    expect(git(["rev-parse", "HEAD^{tree}"])).toBe(testedTree);
    git(["remote", "add", "origin", directory]);
    const returnedRun = { ...run, head_sha: head };
    const returnedJobs = jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step) => ({ ...step, name: step.name.replace(tree, testedTree).replace(run.head_sha, tested) })),
    }));
    write(
      "bin/gh",
      `#!/bin/sh\ncase "$2" in\n */workflows/ci.yml) echo 2 ;;\n */runs\\?*) cat "$FIXTURE/runs.json" ;;\n */jobs\\?*) cat "$FIXTURE/jobs.json" ;;\n *) exit 1 ;;\nesac\n`
    );
    chmodSync(path.join(directory, "bin/gh"), 0o755);
    write("runs.json", JSON.stringify({ workflow_runs: [returnedRun] }));
    write("jobs.json", JSON.stringify({ jobs: returnedJobs }));
    const output = path.join(directory, "output");
    const reuse = () => {
      writeFileSync(output, "");
      const result = spawnSync("bun", [cli, "--reuse"], {
        cwd: directory,
        encoding: "utf-8",
        env: {
          ...process.env,
          FIXTURE: directory,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: repository,
          PATH: `${path.join(directory, "bin")}:${process.env.PATH}`,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      return readFileSync(output, "utf-8");
    };
    expect(reuse()).toBe("reuse=true\n");
    git(["tag", "v2.0.0", tested]);
    expect(reuse()).toBe("reuse=false\n");
    git(["tag", "--delete", "v2.0.0"]);
    git(["commit", "--quiet", "--allow-empty", "-m", "Unverified release identity"]);
    expect(reuse()).toBe("reuse=false\n");
    git(["reset", "--hard", "HEAD^"]);
    write(".github/workflows/ci.yml", `${workflow}\n# changed workflow\n`);
    git(["add", ".github/workflows/ci.yml"]);
    git(["commit", "--quiet", "-m", "Workflow changed"]);
    // A claimed current tree must still match the actual tested Git commit.
    const currentTree = git(["rev-parse", "HEAD^{tree}"]);
    write(
      "jobs.json",
      JSON.stringify({
        jobs: returnedJobs.map((job) => ({
          ...job,
          steps: job.steps.map((step) => ({ ...step, name: step.name.replace(testedTree, currentTree) })),
        })),
      })
    );
    expect(reuse()).toBe("reuse=false\n");
    write("bin/gh", "#!/bin/sh\nexit 1\n");
    expect(reuse()).toBe("reuse=false\n");
  });
});
