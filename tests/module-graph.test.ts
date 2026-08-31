import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("effect-convex-web preset", () => {
  test("keeps Confect dependencies explicit", async () => {
    const confect = JSON.parse(await readFile(join(ROOT, "docs/stacks/confect/module.json"), "utf8"));
    expect(confect.requires).toEqual(["effect", "convex"]);
  });

  test("keeps TanStack modules independently selectable", async () => {
    for (const name of ["tanstack-start", "tanstack-router", "tanstack-query", "tanstack-form", "tanstack-table"]) {
      const module = JSON.parse(await readFile(join(ROOT, `docs/stacks/${name}/module.json`), "utf8"));
      expect(module.name).toBe(name);
    }
  });
});
