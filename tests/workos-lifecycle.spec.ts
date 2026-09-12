/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise, effect/noNodeBuiltinImport, effect/noTestLifecycleHooks, eslint/no-await-in-loop -- This test orchestrates a disposable native package installation and child Vitest process. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { packageVersions } from "../src/generators/versions.js";

const repository = path.resolve(import.meta.dir, "..");
let fixtureRoot = "";

const materialize = async () => {
  await mkdir(path.join(repository, ".tmp"), { recursive: true });
  fixtureRoot = await mkdtemp(path.join(repository, ".tmp", "workos-lifecycle-"));
  const confect = path.join(fixtureRoot, "confect");
  await mkdir(path.join(confect, "_generated"), { recursive: true });

  for (const source of ["http.ts", "identity.impl.ts", "identity.spec.ts", "workos.ts"]) {
    const template = path.join(repository, "src/generators/preset/files/backend/confect", `${source}.template`);
    await writeFile(path.join(confect, source), await readFile(template));
  }

  await writeFile(
    path.join(confect, "workos-lifecycle.test.ts"),
    await readFile(path.join(repository, "tests/fixtures/workos-lifecycle.vitest.ts.template"))
  );
  await writeFile(path.join(confect, "_generated/components.ts"), "export const components = { workOSAuthKit: {} };\n");
  await writeFile(path.join(confect, "_generated/schema.ts"), "export default {};\n");
  await writeFile(
    path.join(confect, "_generated/services.ts"),
    'import { QueryCtx as QueryCtx_ } from "@confect/server";\nexport const QueryCtx = QueryCtx_.QueryCtx();\nexport type QueryCtx = typeof QueryCtx.Identifier;\nexport const Auth = QueryCtx;\n'
  );
  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({
      dependencies: {
        "@confect/core": packageVersions["@confect/core"],
        "@confect/server": packageVersions["@confect/server"],
        "@convex-dev/workos-authkit": packageVersions["@convex-dev/workos-authkit"],
        convex: packageVersions.convex,
        effect: packageVersions.effect,
        vitest: packageVersions.vitest,
      },
      private: true,
      type: "module",
    })
  );

  const install = Bun.spawn(["bun", "install", "--ignore-scripts"], {
    cwd: fixtureRoot,
    stderr: "ignore",
    stdout: "ignore",
  });
  expect(await install.exited).toBe(0);
};

beforeAll(materialize, 30_000);
afterAll(() => rm(fixtureRoot, { force: true, recursive: true }));

describe("generated WorkOS lifecycle", () => {
  test("executes the materialized backend lifecycle contract", async () => {
    const process = Bun.spawn(["bun", "x", "vitest", "run", path.join(fixtureRoot, "confect/workos-lifecycle.test.ts")], {
      cwd: fixtureRoot,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);

    expect(`${stdout}\n${stderr}`).toContain("2 passed");
    expect(exitCode).toBe(0);
  }, 30_000);
});
