/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noModulePathFacts, effect/noNewPromise, effect/noTryCatch, eslint/no-await-in-loop -- This native Bun host installs a disposable isolated consumer and runs the real compiler and Vitest. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseJson, readJson, writeJson } from "@nx/devkit";
import { flushChanges, FsTree } from "nx/src/generators/tree";

import { authkitPatchKey, authkitPatchPath, installAuthkitTestPatch } from "../src/compatibility/authkit-test.js";

const repository = path.resolve(import.meta.dir, "..");
const run = async (cwd: string, args: string[]) => {
  const child = Bun.spawn(args, { cwd, stderr: "pipe", stdout: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, output: `${stdout}\n${stderr}` };
};

test("current AuthKit patch fixes the public test entrypoint without phantom dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "keenko-authkit-test-"));
  try {
    const roles = parseJson<Record<string, Record<string, Record<string, string>>>>(
      await readFile(path.join(repository, "tests/fixtures/current-dependencies.json"), "utf-8")
    );
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ private: true, type: "module", workspaces: ["apps/*", "packages/*"], ...roles.root })
    );
    await writeFile(path.join(root, "bunfig.toml"), '[install]\nlinker = "isolated"\nhoist = false\n');
    for (const [role, location] of [
      ["application", "apps/web"],
      ["backend", "packages/backend"],
      ["ui", "packages/ui"],
      ["shared", "packages/shared"],
    ]) {
      await mkdir(path.join(root, location), { recursive: true });
      await writeFile(
        path.join(root, location, "package.json"),
        JSON.stringify({ name: `@authkit-proof/${role}`, private: true, type: "module", ...roles[role] })
      );
    }
    const backend = path.join(root, "packages/backend");
    for (const [source, target] of [
      ["authkit-test.vitest.ts.template", "authkit.test.ts"],
      ["authkit-test.types.ts.template", "authkit.types.ts"],
    ])
      await writeFile(path.join(backend, target), await readFile(path.join(repository, "tests/fixtures", source)));
    await writeFile(
      path.join(backend, "vitest.config.ts"),
      'import { defineConfig } from "vitest/config"; export default defineConfig({ test: { environment: "node", include: ["authkit.test.ts"] } });\n'
    );
    await writeFile(
      path.join(backend, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "Bundler", skipLibCheck: false, strict: true, target: "ES2023", types: [] },
        include: ["authkit.types.ts"],
      })
    );
    await writeFile(
      path.join(backend, "tsconfig.runtime.json"),
      JSON.stringify({ compilerOptions: { skipLibCheck: true }, extends: "./tsconfig.json", include: ["authkit.test.ts"] })
    );
    const compiler = ["node", "../../node_modules/@typescript/native/bin/tsc", "--noEmit", "-p", "tsconfig.json"];
    const install = await run(root, ["bun", "install", "--ignore-scripts"]);
    expect(install.code).toBe(0);
    const before = await run(backend, compiler);
    expect(before.code).not.toBe(0);
    expect(before.output).toContain("Cannot find module 'convex-test'");
    expect(before.output).toContain("Cannot find type definition file for 'vite/client'");
    const sourcePath = path.join(backend, "node_modules/@convex-dev/workos-authkit/src/test.ts");
    const upstreamSource = await readFile(sourcePath, "utf-8");

    const tree = new FsTree(root, false);
    installAuthkitTestPatch(tree);
    flushChanges(root, tree.listChanges());
    const correctedInstall = await run(root, ["bun", "install", "--ignore-scripts"]);
    expect(correctedInstall.code).toBe(0);
    const lock = await readFile(path.join(root, "bun.lock"), "utf-8");
    for (const args of [["--frozen-lockfile"], []]) {
      const reinstall = await run(root, ["bun", "install", "--ignore-scripts", ...args]);
      expect(reinstall.code).toBe(0);
      expect(await readFile(path.join(root, "bun.lock"), "utf-8")).toBe(lock);
      const probe = await run(root, [
        "node",
        "--input-type=module",
        "--eval",
        await readFile(path.join(repository, "tests/fixtures/product-resolution.mjs.template"), "utf-8"),
        root,
      ]);
      expect(probe.code, probe.output).toBe(0);
      expect(await readFile(sourcePath, "utf-8")).toBe(upstreamSource);
      const types = await run(backend, compiler);
      expect(types.output).not.toContain("error TS");
      expect(types.code).toBe(0);
      const runtimeTypes = await run(backend, [
        "node",
        "../../node_modules/@typescript/native/bin/tsc",
        "--noEmit",
        "-p",
        "tsconfig.runtime.json",
      ]);
      expect(runtimeTypes.output).not.toContain("error TS");
      expect(runtimeTypes.code).toBe(0);
      const runtime = await run(backend, ["bun", "x", "vitest", "run"]);
      expect(runtime.output).toContain("2 passed");
      expect(runtime.code).toBe(0);
    }

    // Prove future removal needs only the owned mapping/asset and an ordinary
    // Bun install. No hand-edited lockfile or node_modules cleanup is involved.
    const removal = new FsTree(root, false);
    const manifest = readJson<{ patchedDependencies: Record<string, string> }>(removal, "package.json");
    Reflect.deleteProperty(manifest.patchedDependencies, authkitPatchKey);
    writeJson(removal, "package.json", manifest);
    removal.delete(authkitPatchPath);
    flushChanges(root, removal.listChanges());
    const removeInstall = await run(root, ["bun", "install", "--ignore-scripts"]);
    expect(removeInstall.code).toBe(0);
    const restored = await run(backend, compiler);
    expect(restored.code).not.toBe(0);
    expect(restored.output).toContain("Cannot find module 'convex-test'");
    expect(restored.output).toContain("Cannot find type definition file for 'vite/client'");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}, 60_000);
