import { readFile, rm, writeFile } from "node:fs/promises";

const target = "src/guidance.ts";
let source = await readFile(target, "utf-8");
const before = `function hashTreeFiles(tree: Tree, roots: string[]) {\n  const files = roots.flatMap((root) => listTreeFiles(tree, root)).toSorted();`;
const after = `function hashTreeFiles(tree: Tree, roots: string[]) {\n  const files = roots.flatMap((root) => listTreeFiles(tree, root.replace(/\\/+$/u, ""))).toSorted();`;
if (!source.includes(before)) {
  throw new Error("Expected guidance hash root block was not found");
}
source = source.replace(before, after);
await writeFile(target, source);
await rm(import.meta.filename);
