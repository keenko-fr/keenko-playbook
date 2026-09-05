import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dir, "..");
const LEGACY_EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
`;
const LEGACY_OXFMT_CONFIG = `import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const { endOfLine: _endOfLine, tabWidth: _tabWidth, useTabs: _useTabs, ...formatting } = ultracite;

export default defineConfig({
  ...formatting,
  ignorePatterns: [
    ...(formatting.ignorePatterns ?? []),
    ".keenko/**",
    ".agents/skills/**",
    ".claude/skills/**",
    "**/_generated/**",
    "**/routeTree.gen.ts",
    "packages/backend/confect/**",
    "packages/backend/convex/**",
    "!packages/backend/convex/tsconfig.json",
    "!packages/backend/convex/convex.config.ts",
  ],
  printWidth: 140,
});
`;

test("the packed package ships only the supported post-0.2 migration and it preserves customized ownership", async () => {
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? "/tmp", "keenko-packed-migration-"));
  try {
    const tarballName = execFileSync("npm", ["pack", "--pack-destination", temp, "--silent"], {
      cwd: ROOT,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .at(-1);
    if (tarballName === undefined) {
      throw new Error("npm pack did not return a Keenko tarball name");
    }
    execFileSync("tar", ["-xzf", path.join(temp, tarballName), "-C", temp], { cwd: ROOT, stdio: "ignore" });

    const migrations = JSON.parse(await readFile(path.join(temp, "package/migrations.json"), "utf-8")) as {
      generators: Record<string, { factory: string; version: string }>;
    };
    expect(Object.keys(migrations.generators)).toEqual(["0.3.0-oxfmt-ownership"]);
    expect(migrations.generators["0.3.0-oxfmt-ownership"]?.version).toBe("0.3.0");
    expect(migrations.generators["0.3.0-oxfmt-ownership"]?.factory).toBe("./dist/src/migrations/remove-editorconfig.js");

    const migrationPath = path.join(temp, "package/dist/src/migrations/remove-editorconfig.js");
    const migration = (await import(pathToFileURL(migrationPath).href)) as { default: (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => void };
    const tree = createTreeWithEmptyWorkspace();
    tree.write(".editorconfig", LEGACY_EDITORCONFIG);
    tree.write("oxfmt.config.ts", LEGACY_OXFMT_CONFIG);
    migration.default(tree);
    expect(tree.exists(".editorconfig")).toBe(false);
    expect(tree.read("oxfmt.config.ts", "utf-8")).toContain("...ultracite");

    const customized = createTreeWithEmptyWorkspace();
    customized.write(".editorconfig", `${LEGACY_EDITORCONFIG}\n# project-owned\n`);
    customized.write("oxfmt.config.ts", LEGACY_OXFMT_CONFIG);
    expect(() => migration.default(customized)).toThrow(".editorconfig was customized");
    expect(customized.exists(".editorconfig")).toBe(true);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}, 60_000);
