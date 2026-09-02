import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

interface ModuleManifest {
  requires: string[];
  skills: string[];
  uiSurface?: boolean;
}

interface Preset {
  modules: string[];
  ownedSkills: string[];
  vendorSkills: Record<string, string[]>;
}

async function json(filePath: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path.join(ROOT, filePath), "utf-8"));
  return asObject(value, filePath);
}

async function moduleManifest(filePath: string): Promise<ModuleManifest> {
  const value = await json(filePath);
  const uiSurface = value.uiSurface;
  if (uiSurface !== undefined && typeof uiSurface !== "boolean") {
    throw new Error(`Expected optional boolean at ${filePath}.uiSurface`);
  }
  return {
    requires: asStringArray(value.requires, `${filePath}.requires`),
    skills: asStringArray(value.skills, `${filePath}.skills`),
    ...(uiSurface === undefined ? {} : { uiSurface }),
  };
}

async function presetManifest(filePath: string): Promise<Preset> {
  const value = await json(filePath);
  return {
    modules: asStringArray(value.modules, `${filePath}.modules`),
    ownedSkills: asStringArray(value.ownedSkills, `${filePath}.ownedSkills`),
    vendorSkills: asStringArrayRecord(value.vendorSkills, `${filePath}.vendorSkills`),
  };
}

describe("effect-convex-web preset", () => {
  test("keeps Confect dependencies and specialist skill explicit", async () => {
    const confect = await moduleManifest("docs/stacks/confect/module.json");
    expect(confect.requires).toEqual(["effect", "convex"]);
    expect(confect.skills).toEqual(["confect"]);
  });

  test("makes Effect and Convex specialist requirements executable", async () => {
    const [effect, convex] = await Promise.all([
      moduleManifest("docs/stacks/effect/module.json"),
      moduleManifest("docs/stacks/convex/module.json"),
    ]);
    expect(effect.skills).toEqual(["effect-ts"]);
    expect(convex.skills).toEqual(["convex"]);
  });

  test("TanStack Form pulls the Effect Schema dependency its convention requires", async () => {
    const form = await moduleManifest("docs/stacks/tanstack-form/module.json");
    expect(form.requires).toEqual(["react", "effect"]);
  });

  test("react-ui owns the UI stack capability without requiring prototype", async () => {
    const [reactUi, preset] = await Promise.all([
      moduleManifest("docs/stacks/react-ui/module.json"),
      presetManifest("presets/effect-convex-web.json"),
    ]);

    expect(reactUi.requires).toEqual(["react"]);
    expect(reactUi.skills).toEqual([]);
    expect(reactUi.uiSurface).toBe(true);
    expect(preset.modules).toContain("react-ui");
    expect(preset.modules).not.toContain("ui");
    expect(preset.vendorSkills["matt-pocock"]).toContain("prototype");
  });

  test("modules without a UI surface do not opt into the UI project scaffold", async () => {
    const modules = await Promise.all(
      ["typescript", "effect", "convex", "confect", "testing"].map((name) => moduleManifest(`docs/stacks/${name}/module.json`))
    );
    for (const module of modules) {
      expect(module.uiSurface).toBeUndefined();
    }
  });

  test("preset selects every module-required skill", async () => {
    const preset = await presetManifest("presets/effect-convex-web.json");
    const selected = new Set([...preset.ownedSkills, ...Object.values(preset.vendorSkills).flat()]);
    const modules = await Promise.all(preset.modules.map((name) => moduleManifest(`docs/stacks/${name}/module.json`)));
    for (const module of modules) {
      for (const skill of module.skills) {
        expect(selected.has(skill)).toBe(true);
      }
    }
  });
});

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object at ${label}`);
  }
  return Object.fromEntries(Object.entries(value));
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at ${label}`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`Expected string at ${label}[${index}]`);
    }
    return item;
  });
}

function asStringArrayRecord(value: unknown, label: string): Record<string, string[]> {
  const object = asObject(value, label);
  return Object.fromEntries(Object.entries(object).map(([key, items]) => [key, asStringArray(items, `${label}.${key}`)]));
}
