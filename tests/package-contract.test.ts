import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const REPOSITORY = {
  type: "git",
  url: "git+https://github.com/keenko-fr/keenko-playbook.git",
};

describe("public package contract", () => {
  test("packs one public package with repository provenance, compiled CLI, Nx generators, migrations, and assets", async () => {
    const pkg = await packedManifest();
    expect(pkg.name).toBe("keenko");
    expect(pkg.private).toBe(false);
    expect(pkg.repository).toEqual(REPOSITORY);
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

  test("uses Nx version plans and configures provenance on reviewed publication", async () => {
    const nx = object(JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")));
    expect(object(nx.release).versionPlans).toBe(true);
    expect(await readFile(path.join(ROOT, ".nx/version-plans/kee-14.md"), "utf-8")).toContain("keenko: minor");
    const release = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(release).toContain("Prepare reviewable Nx release commit");
    expect(release).toContain("Verify exact reviewed main commit");
    expect(release).toContain("id-token: write");
    expect(release).toContain("registry-url: https://registry.npmjs.org");
    expect(release).toContain("NPM_CONFIG_PROVENANCE: true");
    expect(release).toContain("nx release publish");
  });
});

async function packedManifest() {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-package-contract-"));
  try {
    const output = execFileSync("npm", ["pack", "--pack-destination", temp, "--silent"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    const tarballName = output.trim().split("\n").at(-1);
    if (tarballName === undefined || tarballName.length === 0) {
      throw new Error("npm pack did not return a tarball name");
    }
    execFileSync("tar", ["-xzf", path.join(temp, tarballName), "-C", temp], { cwd: ROOT, stdio: "ignore" });
    return object(JSON.parse(await readFile(path.join(temp, "package/package.json"), "utf-8")));
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  return Object.fromEntries(Object.entries(value));
}
