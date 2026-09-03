import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("public package contract", () => {
  test("publishes one package with compiled CLI, Nx generators, migrations, and assets", async () => {
    const pkg = object(JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf-8")));
    expect(pkg.name).toBe("keenko");
    expect(pkg.private).toBe(false);
    expect(pkg.bin).toEqual({ keenko: "dist/cli/keenko.js" });
    expect(pkg.generators).toBe("./generators.json");
    expect(pkg["nx-migrations"]).toBe("./migrations.json");
    const versions = await readFile(path.join(ROOT, "src/versions.ts"), "utf-8");
    expect(versions).not.toContain("keenko:");
    const generator = await readFile(path.join(ROOT, "src/generators/preset/generator.ts"), "utf-8");
    expect(generator).toContain("keenko: keenkoVersion()");
    expect(await readFile(path.join(ROOT, "generators.json"), "utf-8")).toContain("dist/src/generators/preset/generator.js");
    const migrations = await readFile(path.join(ROOT, "migrations.json"), "utf-8");
    expect(migrations).toContain("dist/src/migrations/normalize-check.js");
    expect(migrations).not.toContain("refresh-guidance");
  });

  test("uses Nx version plans and separates reviewable versioning from tagged publication", async () => {
    const nx = object(JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")));
    expect(object(nx.release).versionPlans).toBe(true);
    expect(await readFile(path.join(ROOT, ".nx/version-plans/kee-14.md"), "utf-8")).toContain("keenko: minor");
    const release = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(release).toContain("Prepare reviewable Nx release commit");
    expect(release).toContain("Verify exact reviewed main commit");
    expect(release).toContain("nx release publish");
  });
});

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  return Object.fromEntries(Object.entries(value));
}
