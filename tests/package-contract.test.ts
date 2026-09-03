import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const EXPECTED_SHA = "$" + "{{ inputs.expected_sha }}";
const VERSION = "$" + "{version}";
const REPOSITORY = {
  type: "git",
  url: "git+https://github.com/keenko-fr/keenko-playbook.git",
};

describe("public package contract", () => {
  test("packs only the public runtime with repository provenance, CLI, Nx generators, migrations, and assets", async () => {
    const packed = await packedPackage();
    const pkg = packed.manifest;
    expect(pkg.name).toBe("keenko");
    expect(pkg.private).toBe(false);
    expect(pkg.repository).toEqual(REPOSITORY);
    expect(pkg.bin).toEqual({ keenko: "dist/cli/keenko.js" });
    expect(pkg.generators).toBe("./generators.json");
    expect(pkg["nx-migrations"]).toBe("./migrations.json");
    for (const file of [
      "package/dist/cli/keenko.js",
      "package/dist/src/generators/preset/generator.js",
      "package/dist/src/index.js",
      "package/dist/src/migrations/normalize-check.js",
      "package/docs/core/verification.md",
      "package/generators.json",
      "package/migrations.json",
      "package/skills/confect/SKILL.md",
      "package/src/generators/preset/schema.json",
      "package/templates/AGENTS.managed.md",
      "package/vendor/pstack/VENDORED.json",
    ]) {
      expect(packed.files).toContain(file);
    }
    expect(packed.files).not.toContain("package/dist/cli/vendor-sync.js");
    expect(packed.files).not.toContain("package/dist/cli/vendor-sync.d.ts");

    const versions = await readFile(path.join(ROOT, "src/versions.ts"), "utf-8");
    expect(versions).not.toContain("keenko:");
    const generator = await readFile(path.join(ROOT, "src/generators/preset/generator.ts"), "utf-8");
    expect(generator).toContain("keenko: keenkoVersion()");
    expect(await readFile(path.join(ROOT, "generators.json"), "utf-8")).toContain("dist/src/generators/preset/generator.js");
    const migrations = await readFile(path.join(ROOT, "migrations.json"), "utf-8");
    expect(migrations).toContain("dist/src/migrations/normalize-check.js");
    expect(migrations).not.toContain("refresh-guidance");
  });

  test("uses Nx version plans and attaches exact reviewed main before provenance publication", async () => {
    const nx = object(JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")));
    expect(object(nx.release).versionPlans).toBe(true);
    expect(await readFile(path.join(ROOT, ".nx/version-plans/kee-14.md"), "utf-8")).toContain("keenko: minor");
    const release = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(release).toContain("Prepare reviewable Nx release commit");
    expect(release).toContain("Verify exact reviewed main commit");
    expect(release).toContain(`test "$(git rev-parse origin/main)" = "${EXPECTED_SHA}"`);
    expect(release).toContain(`git checkout -B main "${EXPECTED_SHA}"`);
    expect(release).toContain("git branch --set-upstream-to=origin/main main");
    expect(release).toContain('test "$(git symbolic-ref --short HEAD)" = "main"');
    expect(release).toContain(`test "$(git rev-parse HEAD)" = "${EXPECTED_SHA}"`);
    expect(release).toContain(`test "$(git rev-list -n 1 "v${VERSION}")" = "${EXPECTED_SHA}"`);
    expect(release).toContain("id-token: write");
    expect(release).toContain("registry-url: https://registry.npmjs.org");
    expect(release).toContain("NPM_CONFIG_PROVENANCE: true");
    expect(release).toContain("nx release publish");
  });
});

async function packedPackage() {
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
    const tarball = path.join(temp, tarballName);
    const files = execFileSync("tar", ["-tzf", tarball], { cwd: ROOT, encoding: "utf-8" }).trim().split("\n");
    execFileSync("tar", ["-xzf", tarball, "-C", temp], { cwd: ROOT, stdio: "ignore" });
    return {
      files,
      manifest: object(JSON.parse(await readFile(path.join(temp, "package/package.json"), "utf-8"))),
    };
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
