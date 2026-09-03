import { readFile, rm, writeFile } from "node:fs/promises";

const target = "cli/kee14-ui-transaction-patch.ts";
let source = await readFile(target, "utf-8");
const replacements = [
  [
    'const upstream = new URL(\\`\\\\${url.pathname}\\\\${url.search}\\`, "https://registry.npmjs.org");',
    'const upstream = new URL(url.pathname + url.search, "https://registry.npmjs.org");',
  ],
  ['origin = \\`http://127.0.0.1:\\\\${server.port}\\`;', 'origin = "http://127.0.0.1:" + server.port;'],
  [
    'dist: { tarball: \\`\\\\${origin}/keenko/-/keenko-\\\\${packageVersion}.tgz\\` },',
    'dist: { tarball: origin + "/keenko/-/keenko-" + packageVersion + ".tgz" },',
  ],
] as const;

for (const [before, after] of replacements) {
  if (!source.includes(before)) {
    throw new Error(`Expected registry helper fragment was not found: ${before}`);
  }
  source = source.replace(before, after);
}

await writeFile(target, source);
await rm(import.meta.filename);
