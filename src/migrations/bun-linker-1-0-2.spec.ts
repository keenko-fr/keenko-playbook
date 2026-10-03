import { describe, expect, test } from "bun:test";

import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";

import migration from "./bun-linker-1-0-2.js";

const historical = '[install]\nlinker = "hoisted"\n';
const target = '[install]\nlinker = "isolated"\nhoist = false\n';
const fixture = (source: string) => {
  const tree = createTreeWithEmptyWorkspace();
  tree.write("bunfig.toml", source);
  tree.write("bun.lock", "Bun-owned lockfile");
  tree.write("packages/shared/node_modules/effect/package.json", "installed state");
  return tree;
};

describe("1.0.2 Bun linker migration", () => {
  test("migrates released 1.0.1 without touching lockfile or installed state, then becomes a byte-for-byte no-op", () => {
    const tree = fixture(historical);
    migration(tree);
    expect(tree.read("bunfig.toml", "utf-8")).toBe(target);
    expect(tree.read("bun.lock", "utf-8")).toBe("Bun-owned lockfile");
    expect(tree.read("packages/shared/node_modules/effect/package.json", "utf-8")).toBe("installed state");
    const before = tree.listChanges();
    migration(tree);
    expect(tree.listChanges()).toEqual(before);
  });

  test("preserves comments, CRLF, unrelated literal settings and sections", () => {
    const source = `# project\r\nlogLevel = "warn"\r\n[install] # packages\r\ncache = true\r\n  linker = 'hoisted' # owned\r\nregistry = "https://example.test/#registry"\r\n[install.scopes]\r\n"@custom" = { url = "https://example.test", token = "project-owned" }\r\n[test]\r\ncoverage = true\r\n`;
    const tree = fixture(source);
    migration(tree);
    expect(tree.read("bunfig.toml", "utf-8")).toBe(
      source.replace("'hoisted'", '"isolated"').replace(" # owned\r\n", " # owned\r\nhoist = false\r\n")
    );
    const before = tree.listChanges();
    migration(tree);
    expect(tree.listChanges()).toEqual(before);
  });

  test.each([historical.trimEnd(), `${historical}hoist = false\n`, '[install]\n"linker" = "hoisted"\n'])(
    "recognizes bounded historical variants: %s",
    (source) => {
      const tree = fixture(source);
      migration(tree);
      expect(Bun.TOML.parse(tree.read("bunfig.toml", "utf-8") ?? "")).toEqual({ install: { hoist: false, linker: "isolated" } });
    }
  );

  test.each([
    "",
    "[test]\ncoverage = true\n",
    `${historical}linker = "isolated"\n`,
    `${historical}hoist = true\n`,
    `${target}hoist = false\n`,
    '[install]\nlinker = "isolated"\n',
    `${historical}[install]\ncache = true\n`,
    `${historical}[install.linker]\ncustom = true\n`,
    'install = { linker = "hoisted" }\n',
    'install.linker = "hoisted"\n',
    '[install]\nlinker = "hoisted"\n"hoist" = true\n',
    '[install]\nlinker = "hoisted"\nhoist.enabled = false\n',
    'description = """\n[install]\nlinker = "hoisted"\n"""\n',
    `${historical}custom = [\n"text"\n]\n`,
  ])("rejects ambiguous or conflicting owned state atomically: %s", (source) => {
    const tree = fixture(source);
    const before = tree.listChanges();
    expect(() => {
      migration(tree);
    }).toThrow("install.linker/install.hoist");
    expect(tree.listChanges()).toEqual(before);
  });

  test("does not synthesize missing configuration", () => {
    const tree = createTreeWithEmptyWorkspace();
    expect(() => {
      migration(tree);
    }).toThrow("bunfig.toml");
  });
});
