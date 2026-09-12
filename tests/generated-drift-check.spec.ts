/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- Synchronous platform adapters keep this shell-fragment unit fixture narrow. */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { generatedDriftCheck } from "../src/generators/preset/preset.js";

const runGeneratedDriftCheck = (scenario: "drift" | "head-failure" | "status-failure" | "unborn-main") => {
  const directory = mkdtempSync(path.join(tmpdir(), "keenko-generated-drift-"));
  const git = path.join(directory, "git");
  writeFileSync(
    git,
    `#!/bin/sh
case "$GIT_SCENARIO:$1:$2" in
  status-failure:status:*) exit 73 ;;
  drift:status:*) printf ' M apps/web/src/routeTree.gen.ts\\n'; exit 0 ;;
  *:status:*) exit 0 ;;
  drift:rev-parse:--verify) exit 0 ;;
  head-failure:rev-parse:--verify) exit 74 ;;
  unborn-main:rev-parse:--verify) exit 1 ;;
  *:symbolic-ref:*) printf 'refs/heads/main\\n'; exit 0 ;;
  head-failure:show-ref:*) exit 0 ;;
  unborn-main:show-ref:*) exit 1 ;;
esac
exit 1
`
  );
  chmodSync(git, 0o755);

  const result = Bun.spawnSync(["/bin/sh", "-c", generatedDriftCheck], {
    env: { GIT_SCENARIO: scenario, PATH: directory },
  });
  rmSync(directory, { force: true, recursive: true });
  return result;
};

describe("generated drift check", () => {
  test("reports Git status failures", () => {
    const result = runGeneratedDriftCheck("status-failure");

    expect(result.exitCode).toBe(73);
    expect(result.stderr.toString()).toContain("Unable to inspect generated code with Git.");
  });

  test("does not mistake an unexpected HEAD failure for unborn main", () => {
    const result = runGeneratedDriftCheck("head-failure");

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Unable to resolve Git HEAD as a commit or unborn main.");
  });

  test("reports tracked-intent generated drift", () => {
    const result = runGeneratedDriftCheck("drift");

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("apps/web/src/routeTree.gen.ts");
  });

  test("accepts canonical unborn main", () => {
    const result = runGeneratedDriftCheck("unborn-main");

    expect(result.exitCode).toBe(0);
  });
});
