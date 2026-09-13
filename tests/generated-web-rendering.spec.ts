/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise, effect/noNodeBuiltinImport, effect/noTestLifecycleHooks -- This test orchestrates a disposable generated rendering fixture and child Vitest process. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { packageVersions } from "../src/generators/versions.js";

const repository = path.resolve(import.meta.dir, "..");
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

  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({
      dependencies: {
        "@testing-library/dom": packageVersions["@testing-library/dom"],
        "@testing-library/react": packageVersions["@testing-library/react"],
        jsdom: packageVersions.jsdom,
        react: packageVersions.react,
        "react-dom": packageVersions["react-dom"],
        vite: packageVersions.vite,
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

describe("generated web rendering", () => {
  test("renders locale-sensitive navigation and explicit identity states", async () => {
    const process = Bun.spawn(["bun", "x", "vitest", "run"], {
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
