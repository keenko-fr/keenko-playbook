import { readFile, rm, writeFile } from "node:fs/promises";

const generatorPath = "src/generators/preset/generator.ts";
const packagePath = "package.json";

let generator = await readFile(generatorPath, "utf-8");
const before = String.raw`const codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}`;
const after = String.raw`const install = Bun.spawnSync(["bun", "install"], options);\nif (install.exitCode !== 0) {\n  throw new Error("bun install failed after shadcn updated workspace dependencies");\n}\n\nconst codegen = Bun.spawnSync(["bun", "run", "codegen"], options);\nif (codegen.exitCode !== 0) {\n  throw new Error("Keenko codegen failed after shadcn updated dependencies");\n}\n\nconst format = Bun.spawnSync(["bun", "run", "format"], options);\nif (format.exitCode !== 0) {\n  throw new Error("Keenko format failed after shadcn generated components");\n}\n\nconst lintFix = Bun.spawnSync(["bun", "run", "lint:fix"], options);\nif (lintFix.exitCode !== 0) {\n  throw new Error("Keenko lint fixes failed after shadcn generated components");\n}\n\nconst reformat = Bun.spawnSync(["bun", "run", "format"], options);\nif (reformat.exitCode !== 0) {\n  throw new Error("Keenko format failed after lint fixes");\n}`;

if (!generator.includes(before)) {
  throw new Error("Expected generated UI wrapper block was not found");
}
generator = generator.replace(before, after);

const uiDependencyNeedle = '        "@base-ui/react": versions.baseUi,\n';
if (!generator.includes(uiDependencyNeedle)) {
  throw new Error("Expected UI dependency insertion point was not found");
}
generator = generator.replace(uiDependencyNeedle, `${uiDependencyNeedle}        "class-variance-authority": "0.7.1",\n`);

const backendOverrideNeedle = String.raw`    {\n      files: ["packages/backend/**/*.ts"],`;
const uiOverride = String.raw`    {\n      files: ["packages/ui/**/*"],\n      rules: { "eslint/sort-keys": "off" },\n    },\n`;
if (!generator.includes(backendOverrideNeedle)) {
  throw new Error("Expected lint override insertion point was not found");
}
generator = generator.replace(backendOverrideNeedle, `${uiOverride}${backendOverrideNeedle}`);

const uiTsconfigNeedle = '  tree.write("packages/ui/tsconfig.json", packageTsconfig("src/**/*.ts", "src/**/*.tsx"));';
const uiTsconfigReplacement =
  '  tree.write("packages/ui/tsconfig.json", json({ compilerOptions: { composite: false, jsx: "react-jsx" }, extends: "../../tsconfig.json", include: ["src/**/*.ts", "src/**/*.tsx"] }));';
if (!generator.includes(uiTsconfigNeedle)) {
  throw new Error("Expected UI tsconfig insertion point was not found");
}
generator = generator.replace(uiTsconfigNeedle, uiTsconfigReplacement);

await writeFile(generatorPath, generator);

const pkg = JSON.parse(await readFile(packagePath, "utf-8")) as { scripts: Record<string, string> };
pkg.scripts.format = "oxfmt .";
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await rm(import.meta.filename);
