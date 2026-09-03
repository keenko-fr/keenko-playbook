import { readFile, rm, writeFile } from "node:fs/promises";

const generatorPath = "src/generators/preset/generator.ts";
const packagePath = "package.json";

const generator = await readFile(generatorPath, "utf-8");
const before = String.raw`const codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}`;
const after = String.raw`const install = Bun.spawnSync(["bun", "install"], options);\nif (install.exitCode !== 0) {\n  throw new Error("bun install failed after shadcn updated workspace dependencies");\n}\n\nconst codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}\n\nconst format = Bun.spawnSync(["bun", "run", "format"], options);\nif (format.exitCode !== 0) {\n  throw new Error("Keenko format failed after shadcn generated components");\n}\n\nconst lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], options);\nif (lintFix.exitCode !== 0) {\n  throw new Error("Keenko lint fixes failed after shadcn generated components");\n}\n\nconst reformat = Bun.spawnSync(["bun", "run", "format"], options);\nif (reformat.exitCode !== 0) {\n  throw new Error("Keenko format failed after lint fixes");\n}`;

if (!generator.includes(before)) {
  throw new Error("Expected generated UI wrapper block was not found");
}
await writeFile(generatorPath, generator.replace(before, after));

const pkg = JSON.parse(await readFile(packagePath, "utf-8")) as { scripts: Record<string, string> };
pkg.scripts.format = "oxfmt .";
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await rm(import.meta.filename);
