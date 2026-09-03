import { readFile, rm, writeFile } from "node:fs/promises";

const generatorPath = "src/generators/preset/generator.ts";
const packagePath = "package.json";

const generator = await readFile(generatorPath, "utf-8");
const before = `const codegen = Bun.spawnSync(["bun", "run", "codegen"], options);
if (codegen.exitCode !== 0) {
  throw new Error("Keenko codegen failed after shadcn updated dependencies");
}`;
const after = `const install = Bun.spawnSync(["bun", "install"], options);
if (install.exitCode !== 0) {
  throw new Error("bun install failed after shadcn updated workspace dependencies");
}

const codegen = Bun.spawnSync(["bun", "run", "codegen"], options);
if (codegen.exitCode !== 0) {
  throw new Error("Keenko codegen failed after shadcn updated dependencies");
}

const format = Bun.spawnSync(["bun", "run", "format"], options);
if (format.exitCode !== 0) {
  throw new Error("Keenko format failed after shadcn generated components");
}

const lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], options);
if (lintFix.exitCode !== 0) {
  throw new Error("Keenko lint fixes failed after shadcn generated components");
}

const reformat = Bun.spawnSync(["bun", "run", "format"], options);
if (reformat.exitCode !== 0) {
  throw new Error("Keenko format failed after lint fixes");
}`;

if (!generator.includes(before)) {
  throw new Error("Expected generated UI wrapper block was not found");
}
await writeFile(generatorPath, generator.replace(before, after));

const pkg = JSON.parse(await readFile(packagePath, "utf-8")) as { scripts: Record<string, string> };
pkg.scripts.format = "oxfmt .";
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await rm(import.meta.filename);
