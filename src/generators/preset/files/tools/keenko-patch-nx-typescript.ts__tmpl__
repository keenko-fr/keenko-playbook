import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.join("node_modules", "nx", "dist", "src", "plugins", "js", "utils", "typescript.js");
const source = await readFile(target, "utf-8");
const original = /require\(["']typescript["']\)/gu;
const patched = /require\(["']typescript-api["']\)/gu;
const originalCount = [...source.matchAll(original)].length;
const patchedCount = [...source.matchAll(patched)].length;

if (originalCount === 2 && patchedCount === 0) {
  await writeFile(target, source.replace(original, "require('typescript-api')"));
} else if (originalCount !== 0 || patchedCount !== 2) {
  throw new Error(
    `Expected Nx 23.2.0 TypeScript bridge at ${target} to contain two unpatched or two patched TypeScript requires; found ${originalCount} unpatched and ${patchedCount} patched`
  );
}
