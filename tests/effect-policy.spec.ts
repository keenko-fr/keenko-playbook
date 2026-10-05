/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- This native Bun adapter materializes system-temp lint fixtures and invokes the installed Oxlint executable to verify diagnostic ownership. */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { recommended as tsgoRecommended } from "@effect/tsgo/oxlint-presets";
import { Schema as S } from "effect";
import { recommended } from "oxlint-plugin-effect/presets/recommended";

import { packageVersions } from "../src/generators/versions.js";

const repository = fileURLToPath(new URL("../", import.meta.url));
const consumerTemplate = "src/generators/preset/files/root/oxlint.config.ts.template";
const effectSpecs = [
  "src/generators/preset/preset.spec.ts",
  "src/generators/sync/sync.spec.ts",
  "src/infra/deps-update.spec.ts",
  "src/migrations/backend-vitest-exclusions-1-0-2.spec.ts",
  "tests/module-boundaries.spec.ts",
  "tests/wait-for-published.spec.ts",
];

describe("installed Effect policy", () => {
  test("loads the entire installed preset with one current TSGo ownership override", () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "keenko-consumer-policy-"));
    symlinkSync(path.join(repository, "node_modules"), path.join(fixture, "node_modules"), "dir");
    writeFileSync(path.join(fixture, "oxlint.config.ts"), readFileSync(path.join(repository, consumerTemplate)));
    for (const cwd of [repository, fixture]) {
      const loaded = Bun.spawnSync(
        [
          "bun",
          "--eval",
          'import config from "./oxlint.config.ts"; console.log(JSON.stringify(config.overrides.find(override => override.rules?.["effect/noTernary"] === "off").rules));',
        ],
        { cwd }
      );
      expect(loaded.exitCode, loaded.stderr.toString()).toBe(0);
      const rules = new Map(Object.entries(S.decodeUnknownSync(S.fromJsonString(S.Record(S.String, S.Unknown)))(loaded.stdout.toString())));
      for (const [rule, setting] of Object.entries(recommended))
        expect(rules.get(rule)).toEqual(rule === "effect/noTernary" ? "off" : setting);
      for (const [rule, setting] of Object.entries(tsgoRecommended.rules ?? {}))
        expect(rules.get(rule)).toEqual(rule === "effecttsgo/try-catch-in-effect-gen" ? "off" : setting);
      expect([...rules.keys()].filter((rule) => rule.startsWith("effecttsgo/") && rules.get(rule) === "off")).toEqual([
        "effecttsgo/try-catch-in-effect-gen",
      ]);
      for (const rule of [
        "noPlatformLayerOutsideEntry",
        "noPositionalLogArguments",
        "noRunPromise",
        "noTimeoutDieInTests",
        "noWithWrapperCall",
      ])
        expect(rules.get(`effect/${rule}`)).toBeUndefined();
    }
    rmSync(fixture, { force: true, recursive: true });
    expect(packageVersions["oxlint-plugin-effect"]).toBe("0.27.0");
    const template = readFileSync(path.join(repository, consumerTemplate), "utf-8");
    expect(template).not.toContain("effect/noEffectRunInTests");
    for (const spec of effectSpecs) {
      const source = readFileSync(path.join(repository, spec), "utf-8");
      expect(source).toContain('from "@effect/vitest"');
      expect(source).toContain("it.live(");
      expect(source).not.toContain("E.runPromise(");
      expect(source).not.toContain("oxlint-disable effect/noEffectRunInTests");
    }
  });

  test("accepts the official Effect facility, diagnoses ordinary manual runs and reports try syntax once", () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "keenko-effect-policy-"));
    symlinkSync(path.join(repository, "node_modules"), path.join(fixture, "node_modules"), "dir");
    mkdirSync(path.join(fixture, "tests"));
    writeFileSync(path.join(fixture, "oxlint.config.ts"), readFileSync(path.join(repository, "oxlint.config.ts")));
    writeFileSync(
      path.join(fixture, "tsconfig.json"),
      '{"compilerOptions":{"module":"nodenext","target":"esnext","types":["bun"]},"include":["tests/**/*.ts"]}'
    );
    const source =
      'import { test } from "vitest";\nimport { Effect as E } from "effect";\n\ntest("boundary", () => E.runPromise(E.void));\n';
    const probe = path.join(fixture, "tests/boundary.spec.ts");
    const lint = () => {
      const result = Bun.spawnSync([path.join(repository, "node_modules/.bin/oxlint"), "--format", "unix", "tests/boundary.spec.ts"], {
        cwd: fixture,
      });
      return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
    };
    writeFileSync(probe, source);
    const unscoped = lint();
    expect(unscoped.code).not.toBe(0);
    expect(unscoped.output).toContain("noEffectRunInTests");
    writeFileSync(
      probe,
      'import { it } from "@effect/vitest";\nimport { Effect as E } from "effect";\n\nit.effect("boundary", () => E.void);\n'
    );
    const scoped = lint();
    expect(scoped.code, scoped.output).toBe(0);
    writeFileSync(
      probe,
      'import { Effect as E } from "effect";\n\nexport const program = E.gen(function* () { try { yield* E.void; } finally { yield* E.void; } });\n'
    );
    const overlap = lint();
    expect(overlap.output.match(/effect\(noTryCatch\)/gu), overlap.output).toHaveLength(1);
    expect(overlap.output).not.toContain("try-catch-in-effect-gen");
    rmSync(fixture, { force: true, recursive: true });
  }, 30_000);
});
