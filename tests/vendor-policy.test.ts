import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

interface VendorSource {
  commit: string | null;
  id: string;
  license: string | null;
  mode: "vendor" | "external";
  tree: string;
}

describe("vendor policy", () => {
  test("never redistributes a source without a declared license", async () => {
    const manifest = await readJsonObject(`${ROOT}/vendor/sources.json`);
    const sources = asArray(manifest.sources, "vendor/sources.json.sources").map(asVendorSource);
    for (const source of sources) {
      if (source.mode === "vendor") {
        expect(source.license).toBeTruthy();
        expect(source.commit).toBeTruthy();
        expect(source.tree).toBeTruthy();
      }
    }
  });

  test("keeps Convex external while shipping the owned adapter", async () => {
    const manifest = await readJsonObject(`${ROOT}/vendor/sources.json`);
    const sources = asArray(manifest.sources, "vendor/sources.json.sources").map(asVendorSource);
    const convex = sources.find((source) => source.id === "convex");
    expect(convex?.mode).toBe("external");
    expect(convex?.license).toBe("Apache-2.0");
    expect(await readFile(`${ROOT}/skills/convex/SKILL.md`, "utf-8")).toContain("name: convex");
  });
});

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(filePath, "utf-8"));
  return asObject(value, filePath);
}

function asVendorSource(value: unknown): VendorSource {
  const source = asObject(value, "vendor source");
  const { mode } = source;
  if (mode !== "vendor" && mode !== "external") {
    throw new Error("Expected vendor source mode");
  }
  return {
    commit: asNullableString(source.commit, "vendor source commit"),
    id: asString(source.id, "vendor source id"),
    license: asNullableString(source.license, "vendor source license"),
    mode,
    tree: asString(source.tree, "vendor source tree"),
  };
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object at ${label}`);
  }
  return Object.fromEntries(Object.entries(value));
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected array at ${label}`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`Expected string at ${label}`);
  }
  return value;
}

function asNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  return asString(value, label);
}
