import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { versions } from "../src/versions.ts";

const ROOT = path.resolve(import.meta.dir, "..");

describe("public package contract", () => {
  test("publishes one package with compiled CLI, Nx generators, migrations, and assets", async () => {
    const pkg = object(JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf-8")));
    expect(pkg.name).toBe("keenko");
    expect(pkg.private).toBe(false);
    expect(pkg.bin).toEqual({ keenko: "dist/cli/keenko.js" });
    expect(pkg.generators).toBe("./generators.json");
    expect(pkg["nx-migrations"]).toBe("./migrations.json");
    expect(pkg.version).toBe(versions.keenko);
    expect(await readFile(path.join(ROOT, "generators.json"), "utf-8")).toContain("dist/src/generators/preset/generator.js");
    const migrations = await readFile(path.join(ROOT, "migrations.json"), "utf-8");
    expect(migrations).toContain("dist/src/migrations/normalize-check.js");
    expect(migrations).toContain("dist/src/migrations/refresh-guidance.js");
  });

  test("uses Nx version plans and contains no custom release entrypoint", async () => {
    const nx = object(JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")));
    expect(object(nx.release).versionPlans).toBe(true);
    expect(await readFile(path.join(ROOT, ".nx/version-plans/kee-14.md"), "utf-8")).toContain("keenko: minor");
  });
});

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  return Object.fromEntries(Object.entries(value));
}
