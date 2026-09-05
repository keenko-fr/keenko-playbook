import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const EXPECTED_SHA = `\${{ inputs.expected_sha }}`;
const CHECK_GITHUB_TOKEN = `GITHUB_TOKEN: \${{ github.token }}`;
const RELEASE_APP_TOKEN = `GITHUB_TOKEN: \${{ steps.release-app.outputs.token }}`;
const RELEASE_APP_CHECKOUT_TOKEN = `token: \${{ steps.release-app.outputs.token }}`;
const RELEASE_APP_CLIENT_ID = `client-id: \${{ vars.KEENKO_RELEASE_APP_CLIENT_ID }}`;
const RELEASE_APP_PRIVATE_KEY = `private-key: \${{ secrets.KEENKO_RELEASE_APP_PRIVATE_KEY }}`;
const RELEASE_APP_SLUG_ENV = `RELEASE_APP_SLUG: \${{ steps.release-app.outputs.app-slug }}`;
const RELEASE_APP_GIT_NAME = `git config user.name "\${RELEASE_APP_SLUG}[bot]"`;
const NODE_AUTH_TOKEN = `NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}`;
const REPOSITORY = {
  type: "git",
  url: "git+https://github.com/keenko-fr/keenko-playbook.git",
};

describe("public package contract", () => {
  test("packs the Nx plugin runtime, generator templates, supported migrations, and guidance assets without a public Keenko executable", async () => {
    const packed = await packedPackage();
    const pkg = packed.manifest;
    expect(pkg.name).toBe("keenko");
    expect(pkg.private).toBe(false);
    expect(pkg.repository).toEqual(REPOSITORY);
    expect(pkg.bin).toBeUndefined();
    expect(pkg.generators).toBe("./generators.json");
    expect(pkg["nx-migrations"]).toBe("./migrations.json");
    const scripts = object(pkg.scripts);
    expect(scripts.keenko).toBeUndefined();
    expect(scripts.test).toBe(
      "bun test --path-ignore-patterns tests/packed-product.test.ts --path-ignore-patterns tests/packed-upgrade-preservation.test.ts && bun run test:product"
    );
    expect(scripts.check).toContain("bun run test");
    expect(scripts["check:release"]).toBe("bun run check && bun run vendor:check && bun pm pack --dry-run");
    for (const file of [
      "package/dist/src/generators/preset/files/.gitignore__tmpl__",
      "package/dist/src/generators/preset/files/oxfmt.config.ts__tmpl__",
      "package/dist/src/generators/preset/files/tools/keenko-ui.ts__tmpl__",
      "package/dist/src/generators/preset/generator.js",
      "package/dist/src/generators/sync/generator.js",
      "package/dist/src/index.js",
      "package/dist/src/migrations/remove-editorconfig.js",
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
    expect(packed.files).not.toContain("package/dist/cli/keenko.js");
    expect(packed.files).not.toContain("package/dist/cli/vendor-sync.js");
    expect(packed.files).not.toContain("package/dist/cli/vendor-sync.d.ts");
    expect(packed.files).not.toContain("package/dist/src/migrations/native-nx-lifecycle.js");
    expect(packed.files).not.toContain("package/dist/src/migrations/normalize-check.js");

    const versions = await readFile(path.join(ROOT, "src/versions.ts"), "utf-8");
    expect(versions).not.toContain("keenko:");
    const generator = await readFile(path.join(ROOT, "src/generators/preset/generator.ts"), "utf-8");
    expect(generator).toContain("generateFiles(");
    expect(generator).toContain('joinPathFragments(import.meta.dirname, "files")');
    expect(generator).toContain("keenko: keenkoVersion()");
    expect(generator).toContain('globalGenerators: ["keenko:sync"]');
    expect(generator).not.toContain("JSON.parse");
    expect(generator).not.toContain("JSON.stringify(value, null, 2)");
    expect(await readFile(path.join(ROOT, "generators.json"), "utf-8")).toContain("dist/src/generators/preset/generator.js");
    const migrations = await readFile(path.join(ROOT, "migrations.json"), "utf-8");
    expect(migrations).toContain("dist/src/migrations/remove-editorconfig.js");
    expect(migrations).not.toContain("normalize-check");
    expect(migrations).not.toContain("native-nx-lifecycle");
  }, 30_000);

  test("uses one explicitly dispatched native Nx release flow", async () => {
    const nx = object(JSON.parse(await readFile(path.join(ROOT, "nx.json"), "utf-8")));
    const releaseConfig = object(nx.release);
    expect(releaseConfig.versionPlans).toBe(true);
    const version = object(releaseConfig.version);
    expect(version.adjustSemverBumpsForZeroMajorVersion).toBe(false);
    expect(version.git).toBeUndefined();
    const changelog = object(releaseConfig.changelog);
    expect(changelog.automaticFromRef).toBe(true);
    expect(changelog.git).toBeUndefined();
    expect(object(changelog.workspaceChangelog).createRelease).toBe("github");

    const plan = await readFile(path.join(ROOT, ".nx/version-plans/kee-14-generator-architecture.md"), "utf-8");
    expect(plan).toContain("keenko: minor");
    expect(plan).toContain("Oxfmt");
    expect(plan).toContain("0.2.0");

    const workflow = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(workflow).toContain("Verify exact releasable main commit");
    expect(workflow).toContain(`test "$(git rev-parse origin/main)" = "${EXPECTED_SHA}"`);
    expect(workflow).toContain(`git checkout -B main "${EXPECTED_SHA}"`);
    expect(workflow).toContain("git branch --set-upstream-to=origin/main main");
    expect(workflow).toContain('test "$(git symbolic-ref --short HEAD)" = "main"');
    expect(workflow).toContain(`test "$(git rev-parse HEAD)" = "${EXPECTED_SHA}"`);
    expect(workflow).toContain("bun run check:release");
    expect(workflow).toContain("run: bun x nx release --yes");
    expect(workflow).toContain("uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0");
    expect(workflow).toContain(RELEASE_APP_CLIENT_ID);
    expect(workflow).toContain(RELEASE_APP_PRIVATE_KEY);
    expect(workflow).toContain("permission-contents: write");
    expect(workflow).toContain(RELEASE_APP_CHECKOUT_TOKEN);
    expect(workflow).toContain(CHECK_GITHUB_TOKEN);
    expect(workflow).toContain(RELEASE_APP_TOKEN);
    expect(workflow).toContain(RELEASE_APP_SLUG_ENV);
    expect(workflow).toContain(RELEASE_APP_GIT_NAME);
    expect(workflow).toContain(NODE_AUTH_TOKEN);
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("registry-url: https://registry.npmjs.org");
    expect(workflow).toContain("NPM_CONFIG_PROVENANCE: true");
    expect(workflow).not.toContain("inputs.mode");
    expect(workflow).not.toContain("Prepare reviewable Nx release commit");
    expect(workflow).not.toContain("cli/release-tag.ts");
    expect(workflow).not.toContain("nx release version");
    expect(workflow).not.toContain("nx release changelog");
    expect(workflow).not.toContain("nx release publish");
    expect(workflow).not.toContain("git config user.name github-actions[bot]");

    const gitGuidance = await readFile(path.join(ROOT, "docs/core/git.md"), "utf-8");
    expect(gitGuidance).toContain("Protect main history");
    expect(gitGuidance).toContain("Require reviewed main changes");
    expect(gitGuidance).toContain("Keenko Release");
    expect(gitGuidance).toContain("No human or automation identity may bypass it.");
    expect(gitGuidance).toContain("Do not add a human bypass.");
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
