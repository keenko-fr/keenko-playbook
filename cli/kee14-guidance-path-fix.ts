import { readFile, rm, writeFile } from "node:fs/promises";

const target = "src/guidance.ts";
let source = await readFile(target, "utf-8");
const hashBefore = `function hashTreeFiles(tree: Tree, roots: string[]) {\n  const files = roots.flatMap((root) => listTreeFiles(tree, root)).toSorted();`;
const hashAfter = `function hashTreeFiles(tree: Tree, roots: string[]) {\n  const files = roots.flatMap((root) => listTreeFiles(tree, root.replace(/\\/+$/u, ""))).toSorted();`;
if (!source.includes(hashBefore)) {
  throw new Error("Expected guidance hash root block was not found");
}
source = source.replace(hashBefore, hashAfter);

const copyBefore = `function copyTreeDirectory(tree: Tree, source: string, target: string) {\n  for (const change of tree.listChanges()) {\n    if (change.path.startsWith(\`\${source}/\`) && change.content !== null) {\n      tree.write(change.path.replace(source, target), change.content);\n    }\n  }\n}`;
const copyAfter = `function copyTreeDirectory(tree: Tree, source: string, target: string) {\n  for (const file of listTreeFiles(tree, source)) {\n    const content = tree.read(file);\n    if (content !== null) {\n      tree.write(file.replace(source, target), content);\n    }\n  }\n}`;
if (!source.includes(copyBefore)) {
  throw new Error("Expected guidance native-copy block was not found");
}
source = source.replace(copyBefore, copyAfter);

await writeFile(target, source);
await rm(import.meta.filename);
