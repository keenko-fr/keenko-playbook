/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noModulePathFacts, effect/noNullish -- This native Vitest host adapter resolves repository tooling from its module location; synchronous platform adapters and process environment forwarding keep this generated-tool integration fixture narrow. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { type NxJsonConfiguration, updateJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, Layer as L } from "effect";
import { describe, expect } from "vitest";

import type { PackageJson } from "../src/generators/helpers.js";
import { presetProgram } from "../src/generators/preset/preset.js";

const platformLayer = L.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe("generated Nx/Oxlint module boundaries", () => {
  it.live("rejects a shared-to-ui dependency", () =>
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
          const repository = path.resolve(import.meta.dirname, "..");
          symlinkSync(path.join(repository, "node_modules"), path.join(workspace, "node_modules"), "dir");
          const nxEnvironment = { ...process.env, NX_DAEMON: "false", NX_INTERACTIVE: "false" };
          const graph = spawnSync(path.join(repository, "node_modules/.bin/nx"), ["show", "projects"], {
            cwd: workspace,
            env: nxEnvironment,
          });
          expect(graph.status, graph.stderr.toString()).toBe(0);
          const result = spawnSync(path.join(repository, "node_modules/.bin/oxlint"), ["packages/shared/src/forbidden.ts"], {
            cwd: workspace,
            env: nxEnvironment,
          });
          const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;

          expect(result.status).not.toBe(0);
          expect(output).toMatch(/@nx(?:\/|\()enforce-module-boundaries\)?/u);
        }),
      (workspace) =>
        E.sync(() => {
          rmSync(workspace, { force: true, recursive: true });
        })
    ).pipe(E.provide(platformLayer))
  );

  it.live("discovers two applications sharing one backend and rejects sibling application source imports", () =>
    E.acquireUseRelease(
      E.sync(() => mkdtempSync(path.join(tmpdir(), "keenko-multi-app-boundaries-"))),
      (workspace) =>
        E.gen(function* () {
          const tree = createTreeWithEmptyWorkspace();
          yield* presetProgram(tree, { name: "multi-app-test" });
          updateJson<PackageJson>(tree, "apps/web/package.json", (manifest) => {
            manifest.exports = { "./boundary-target": "./src/boundary-target.ts" };
            return manifest;
          });
          tree.write("apps/web/src/boundary-target.ts", "export const boundaryTarget = true;\n");
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
          const repository = path.resolve(import.meta.dirname, "..");
          symlinkSync(path.join(repository, "node_modules"), path.join(workspace, "node_modules"), "dir");
          const nxEnvironment = { ...process.env, NX_DAEMON: "false", NX_INTERACTIVE: "false" };
          const graph = spawnSync(path.join(repository, "node_modules/.bin/nx"), ["show", "projects"], {
            cwd: workspace,
            env: nxEnvironment,
          });
          expect(graph.status, graph.stderr.toString()).toBe(0);
          expect(graph.stdout.toString()).toContain("@multi-app-test/web");
          expect(graph.stdout.toString()).toContain("@multi-app-test/admin");
          expect(existsSync(path.join(workspace, "apps/admin/.vite-config-evaluated"))).toBe(false);

          const graphInspection = spawnSync(
            "node",
            [
              "-e",
              'import { createProjectGraphAsync } from "@nx/devkit"; const graph = await createProjectGraphAsync({ exitOnError: false }); console.log(JSON.stringify(Object.fromEntries(Object.entries(graph.nodes).map(([name, node]) => [name, node.data.tags?.includes("type:app")]))));',
            ],
            {
              cwd: workspace,
              env: nxEnvironment,
            }
          );
          expect(graphInspection.status, graphInspection.stderr.toString()).toBe(0);
          expect(graphInspection.stdout.toString()).toContain('"@multi-app-test/admin":true');
          expect(graphInspection.stdout.toString()).toContain('"@multi-app-test/web":true');

          const probe = path.join(workspace, "apps/admin/src/boundary-probe.ts");
          mkdirSync(path.dirname(probe), { recursive: true });
          writeFileSync(probe, 'import "@multi-app-test/web/boundary-target";\n');
          const result = spawnSync(path.join(repository, "node_modules/.bin/oxlint"), ["apps/admin/src/boundary-probe.ts"], {
            cwd: workspace,
            env: nxEnvironment,
          });
          const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
          expect(result.status).not.toBe(0);
          expect(output).toMatch(/@nx(?:\/|\()enforce-module-boundaries\)?/u);
          expect(output).toContain("type:app");
        }),
      (workspace) =>
        E.sync(() => {
          rmSync(workspace, { force: true, recursive: true });
        })
    ).pipe(E.provide(platformLayer))
  );
});
