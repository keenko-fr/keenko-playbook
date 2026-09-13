/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise, effect/noNodeBuiltinImport, effect/noTestLifecycleHooks -- This test orchestrates a disposable generated rendering fixture and child Vitest process. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const repository = path.resolve(import.meta.dir, "..");
const vitest = path.join(repository, "node_modules/vitest/vitest.mjs");
let fixtureRoot = "";

const materializeRoute = async (name: string) => {
  const source = path.join(repository, "src/generators/preset/files/web/src/routes", `${name}.template`);
  const target = path.join(fixtureRoot, "routes", name);
  const template = await readFile(source, "utf-8");
  await writeFile(target, template.replaceAll("<%= workspace %>", "test"));
};

const materialize = async () => {
  await mkdir(path.join(repository, ".tmp"), { recursive: true });
  fixtureRoot = await mkdtemp(path.join(repository, ".tmp", "generated-web-rendering-"));
  await mkdir(path.join(fixtureRoot, "routes"), { recursive: true });

  await Promise.all([
    materializeRoute("-site-header.tsx"),
    materializeRoute("mon-espace.tsx"),
    ...["generated-web-rendering.test.tsx", "mocks.tsx", "vitest.config.ts"].map(async (name) =>
      writeFile(
        path.join(fixtureRoot, name),
        await readFile(path.join(repository, "tests/fixtures/generated-web-rendering", `${name}.template`))
      )
    ),
  ]);
};

beforeAll(materialize, 30_000);
afterAll(() => rm(fixtureRoot, { force: true, recursive: true }));

describe("generated web rendering", () => {
  test("renders locale-sensitive navigation and explicit identity states", async () => {
    const process = Bun.spawn(["bun", vitest, "run"], {
      cwd: fixtureRoot,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);

    expect(`${stdout}\n${stderr}`).toContain("7 passed");
    expect(exitCode).toBe(0);
  }, 30_000);
});
