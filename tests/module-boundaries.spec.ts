/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- Synchronous platform adapters keep this generated-tool integration fixture narrow. */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { type NxJsonConfiguration, updateJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, Layer as L } from "effect";

import type { PackageJson } from "../src/generators/helpers.js";
import { presetProgram } from "../src/generators/preset/preset.js";

const platformLayer = L.mergeAll(NodeFileSystem.layer, NodePath.layer);

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
            tree.write("apps/admin/src/forbidden.ts", 'import "../../web/src/router";\n');
            updateJson<NxJsonConfiguration>(tree, "nx.json", (nxJson) => {
              nxJson.plugins = [];
              return nxJson;
            });

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

            const result = Bun.spawnSync([path.join(repository, "node_modules/.bin/oxlint"), "apps/admin/src/forbidden.ts"], {
              cwd: workspace,
              env: nxEnvironment,
            });
            const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
            expect(result.exitCode).not.toBe(0);
            expect(output).toMatch(/@nx(?:\/|\()enforce-module-boundaries\)?/u);
          }),
        (workspace) =>
          E.sync(() => {
            rmSync(workspace, { force: true, recursive: true });
          })
      ).pipe(E.provide(platformLayer))
    ));
});
