import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

type VendorSource = {
  id: string;
  mode: "vendor" | "external";
  license: string | null;
  commit: string | null;
  tree: string;
};
type VendorManifest = { sources: VendorSource[] };
type Preset = { externalSkills: Record<string, unknown>; ownedSkills: string[] };

describe("vendor policy", () => {
  test("never redistributes a source without a declared license", async () => {
    const manifest = JSON.parse(await readFile(`${ROOT}/vendor/sources.json`, "utf-8")) as VendorManifest;
    for (const source of manifest.sources) {
      if (source.mode === "vendor") {
        expect(source.license).toBeTruthy();
        expect(source.commit).toBeTruthy();
        expect(source.tree).toBeTruthy();
      }
    }
  });

  test("keeps Convex external and out of default external-skill expectations", async () => {
    const manifest = JSON.parse(await readFile(`${ROOT}/vendor/sources.json`, "utf-8")) as VendorManifest;
    const convex = manifest.sources.find((source) => source.id === "convex");
    const preset = JSON.parse(await readFile(`${ROOT}/presets/effect-convex-web.json`, "utf-8")) as Preset;
    expect(convex?.mode).toBe("external");
    expect(preset.externalSkills).toEqual({});
    expect(preset.ownedSkills).toContain("convex");
  });
});
