/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noNullish -- Synchronous platform adapters and process environment forwarding keep this generated-tool integration fixture narrow. */
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { type NxJsonConfiguration, updateJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, Layer as L } from "effect";

import type { PackageJson } from "../src/generators/helpers.js";
import { presetProgram } from "../src/generators/preset/preset.js";

const platformLayer = L.mergeAll(NodeFileSystem.layer, NodePath.layer);
setDefaultTimeout(60_000);

const runGraphBoundaryVerifier = (repository: string, workspace: string, env: Record<string, string | undefined>) => {
  const commandDirectory = path.join(workspace, ".test-bin");
  const commandPath = path.join(commandDirectory, "keenko-verify-boundaries");
  mkdirSync(commandDirectory);
  writeFileSync(
    commandPath,
    `#!/usr/bin/env sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(repository, "src/verify-dependency-boundaries.ts"))}\n`
  );
  chmodSync(commandPath, 0o755);
  return Bun.spawnSync([process.execPath, "run", "boundaries:check"], {
    cwd: workspace,
    env: { ...env, PATH: `${commandDirectory}${path.delimiter}${env.PATH ?? ""}` },
  });
};

describe("generated Nx/Oxlint module boundaries", () => {
  test("rejects a shared-to-ui dependency", () =>
    E.runPromise(
      E.acquireUseRelease(
        E.sync(() => mkdtempSync(path.join(tmpdir(), "keenko-boundaries-"))),
        (workspace) =>
          E.gen(function* () {
            const tree = createTreeWithEmptyWorkspace();
            yield* presetProgram(tree, { name: "boundary-test" });
            updateJson<PackageJson>(tree, "packages/shared/package.json", (manifest) => {
              manifest.dependencies = { "@boundary-test/ui": "workspace:*" };
              return manifest;
            });
            updateJson<NxJsonConfiguration>(tree, "nx.json", (nxJson) => {
              nxJson.plugins = [];
              return nxJson;
            });
            tree.write("packages/shared/src/forbidden.ts", 'import "@boundary-test/ui/lib/utils";\n');

            for (const change of tree.listChanges()) {
              if (!Buffer.isBuffer(change.content)) continue;
              const target = path.join(workspace, change.path);
              mkdirSync(path.dirname(target), { recursive: true });
              writeFileSync(target, change.content);
            }
            const repository = path.resolve(import.meta.dir, "..");
            symlinkSync(path.join(repository, "node_modules"), path.join(workspace, "node_modules"), "dir");
            const nxEnvironment = { ...process.env, NX_DAEMON: "false", NX_INTERACTIVE: "false" };
            const graph = Bun.spawnSync([path.join(repository, "node_modules/.bin/nx"), "show", "projects"], {
              cwd: workspace,
              env: nxEnvironment,
            });
            expect(graph.exitCode, graph.stderr.toString()).toBe(0);
            const result = Bun.spawnSync([path.join(repository, "node_modules/.bin/oxlint"), "packages/shared/src/forbidden.ts"], {
              cwd: workspace,
              env: nxEnvironment,
            });
            const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;

            expect(result.exitCode).not.toBe(0);
            expect(output).toMatch(/@nx(?:\/|\()enforce-module-boundaries\)?/u);
            const boundaryResult = runGraphBoundaryVerifier(repository, workspace, nxEnvironment);
            expect(boundaryResult.exitCode).not.toBe(0);
            expect(boundaryResult.stderr.toString()).toContain("@boundary-test/shared");
            expect(boundaryResult.stderr.toString()).toContain("@boundary-test/ui");
            expect(boundaryResult.stderr.toString()).toContain("scope:shared may depend only on [no internal projects]");
          }),
        (workspace) =>
          E.sync(() => {
            rmSync(workspace, { force: true, recursive: true });
          })
      ).pipe(E.provide(platformLayer))
    ));

  test("discovers two applications sharing one backend and rejects sibling application dependencies", () =>
    E.runPromise(
      E.acquireUseRelease(
        E.sync(() => mkdtempSync(path.join(tmpdir(), "keenko-multi-app-boundaries-"))),
        (workspace) =>
          E.gen(function* () {
            const tree = createTreeWithEmptyWorkspace();
            yield* presetProgram(tree, { name: "multi-app-test" });
            tree.write(
              "apps/admin/package.json",
              JSON.stringify({
                dependencies: { "@multi-app-test/backend": "workspace:*", "@multi-app-test/web": "workspace:*" },
                name: "@multi-app-test/admin",
                nx: { tags: ["type:app"], targets: { dev: { continuous: true } } },
                private: true,
                scripts: { dev: "vite dev", test: "vitest run" },
                type: "module",
              })
            );
            tree.write(
              "apps/admin/vitest.config.ts",
              'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({ test: { passWithNoTests: true } });\n'
            );
            tree.write(
              "apps/admin/vite.config.ts",
              'import { writeFileSync } from "node:fs";\nimport { defineConfig } from "vite";\n\nwriteFileSync("apps/admin/.vite-config-evaluated", "evaluated");\n\nexport default defineConfig({});\n'
            );

            for (const change of tree.listChanges()) {
              if (!Buffer.isBuffer(change.content)) continue;
              const target = path.join(workspace, change.path);
              mkdirSync(path.dirname(target), { recursive: true });
              writeFileSync(target, change.content);
            }
            const repository = path.resolve(import.meta.dir, "..");
            symlinkSync(path.join(repository, "node_modules"), path.join(workspace, "node_modules"), "dir");
            const nxEnvironment = { ...process.env, NX_DAEMON: "false", NX_INTERACTIVE: "false" };
            const graph = Bun.spawnSync([path.join(repository, "node_modules/.bin/nx"), "show", "projects"], {
              cwd: workspace,
              env: nxEnvironment,
            });
            expect(graph.exitCode, graph.stderr.toString()).toBe(0);
            expect(graph.stdout.toString()).toContain("@multi-app-test/web");
            expect(graph.stdout.toString()).toContain("@multi-app-test/admin");
            expect(existsSync(path.join(workspace, "apps/admin/.vite-config-evaluated"))).toBe(false);

            const graphInspection = Bun.spawnSync(
              [
                process.execPath,
                "-e",
                'import { createProjectGraphAsync } from "@nx/devkit"; const graph = await createProjectGraphAsync({ exitOnError: false }); console.log(JSON.stringify(graph.dependencies["@multi-app-test/admin"]));',
              ],
              {
                cwd: workspace,
                env: nxEnvironment,
              }
            );
            expect(graphInspection.exitCode, graphInspection.stderr.toString()).toBe(0);
            expect(graphInspection.stdout.toString()).toContain('"target":"@multi-app-test/web"');

            const result = runGraphBoundaryVerifier(repository, workspace, nxEnvironment);
            const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
            expect(result.exitCode).not.toBe(0);
            expect(output).toContain("@multi-app-test/admin");
            expect(output).toContain("@multi-app-test/web");
            expect(output).toContain("type:app may depend only on [scope:backend, scope:ui, scope:shared]");
          }),
        (workspace) =>
          E.sync(() => {
            rmSync(workspace, { force: true, recursive: true });
          })
      ).pipe(E.provide(platformLayer))
    ));
});
