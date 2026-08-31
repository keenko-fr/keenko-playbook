import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("vendor policy", () => {
  test("never redistributes a source without a declared license", async () => {
    const manifest = JSON.parse(await readFile(`${ROOT}/vendor/sources.json`, "utf8"));
    for (const source of manifest.sources) {
      if (source.mode === "vendor") expect(source.license).toBeTruthy();
    }
  });

  test("keeps Convex external while upstream has no declared repo license", async () => {
    const manifest = JSON.parse(await readFile(`${ROOT}/vendor/sources.json`, "utf8"));
    const convex = manifest.sources.find((source: any) => source.id === "convex");
    expect(convex.mode).toBe("external");
  });
});
