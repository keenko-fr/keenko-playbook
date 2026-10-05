import { expect, test } from "bun:test";
// oxlint-disable-next-line effect/noNodeBuiltinImport -- Verify this repository's committed root metadata, including Bun's JSONC lockfile.
import { readFileSync } from "node:fs";

import { parseJson } from "@nx/devkit";

test("repository root package and Bun workspace identities agree", () => {
  const manifest = parseJson<{ name: string }>(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
  const lockfile = parseJson<{ workspaces: { "": { name: string } } }>(readFileSync(new URL("../bun.lock", import.meta.url), "utf-8"));
  expect(lockfile.workspaces[""].name).toBe(manifest.name);
});
