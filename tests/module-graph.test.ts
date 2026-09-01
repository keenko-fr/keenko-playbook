import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

type ModuleManifest = { requires: string[]; skills: string[] };
type Preset = {
  modules: string[];
  ownedSkills: string[];
  vendorSkills: Record<string, string[]>;
};

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(ROOT, path), "utf-8")) as T;
}

describe("effect-convex-web preset", () => {
  test("keeps Confect dependencies and specialist skill explicit", async () => {
    const confect = await json<ModuleManifest>("docs/stacks/confect/module.json");
    expect(confect.requires).toEqual(["effect", "convex"]);
    expect(confect.skills).toEqual(["confect"]);
  });

  test("makes Effect and Convex specialist requirements executable", async () => {
    expect((await json<ModuleManifest>("docs/stacks/effect/module.json")).skills).toEqual(["effect-ts"]);
    expect((await json<ModuleManifest>("docs/stacks/convex/module.json")).skills).toEqual(["convex"]);
  });

  test("TanStack Form pulls the Effect Schema dependency its convention requires", async () => {
    const form = await json<ModuleManifest>("docs/stacks/tanstack-form/module.json");
    expect(form.requires).toEqual(["react", "effect"]);
  });

  test("preset selects every module-required skill", async () => {
    const preset = await json<Preset>("presets/effect-convex-web.json");
    const selected = new Set([...preset.ownedSkills, ...Object.values(preset.vendorSkills).flat()] as string[]);
    for (const name of preset.modules) {
      const module = await json<ModuleManifest>(`docs/stacks/${name}/module.json`);
      for (const skill of module.skills ?? []) expect(selected.has(skill)).toBe(true);
    }
  });
});
