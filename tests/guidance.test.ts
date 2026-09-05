import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, test } from "bun:test";

import sync from "../src/generators/sync/generator.ts";
import { syncGuidance } from "../src/guidance.ts";

const START = "<!-- keenko:start -->";
const END = "<!-- keenko:end -->";

describe("Keenko managed guidance blocks", () => {
  test("installs one block when markers are absent and preserves human text", () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("AGENTS.md", "Human agents text.\n");
    tree.write("CLAUDE.md", "Human Claude text.\n");

    const result = sync(tree);

    const agents = tree.read("AGENTS.md", "utf-8") ?? "";
    const claude = tree.read("CLAUDE.md", "utf-8") ?? "";
    const generatedCode = tree.read(".keenko/docs/core/generated-code.md", "utf-8") ?? "";
    expect(result.outOfSyncMessage).toBe("Keenko generated guidance is out of sync. Run 'bun x nx sync'.");
    expect(generatedCode).toContain(
      "Use `bun x nx sync` to apply guidance updates and `bun x nx sync:check` to detect guidance drift without rewriting tracked files."
    );
    expect(generatedCode).not.toContain("Use `nx sync`");
    expect(agents.startsWith("Human agents text.\n")).toBe(true);
    expect(claude.startsWith("Human Claude text.\n")).toBe(true);
    expect(count(agents, START)).toBe(1);
    expect(count(agents, END)).toBe(1);
    expect(count(claude, START)).toBe(1);
    expect(count(claude, END)).toBe(1);
  });

  test("replaces one valid block and preserves text before and after it", () => {
    const tree = createTreeWithEmptyWorkspace();
    syncGuidance(tree);
    const canonical = tree.read("AGENTS.md", "utf-8") ?? "";
    tree.write("AGENTS.md", `Human before.\n\n${canonical.trim()}\n\nHuman after.\n`);

    sync(tree);

    const agents = tree.read("AGENTS.md", "utf-8") ?? "";
    expect(agents.startsWith("Human before.\n\n")).toBe(true);
    expect(agents.endsWith("\n\nHuman after.\n")).toBe(true);
    expect(count(agents, START)).toBe(1);
    expect(count(agents, END)).toBe(1);
  });

  test.each([
    [`${START}\nfirst\n${END}\n${START}\nsecond\n${END}`, "duplicate complete blocks"],
    [`${START}\n${START}\nbody\n${END}`, "duplicate start"],
    [`${START}\nbody\n${END}\n${END}`, "duplicate end"],
    [`${END}\nbody\n${START}`, "end before start"],
  ])("rejects malformed managed markers: %s", (content) => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write("AGENTS.md", content);
    expect(() => {
      sync(tree);
    }).toThrow("Remove duplicate or stray markers, then run 'bun x nx sync'.");
  });

  test("rejects a stale second block even when the first block is canonical", () => {
    const tree = createTreeWithEmptyWorkspace();
    syncGuidance(tree);
    const canonical = tree.read("AGENTS.md", "utf-8") ?? "";
    tree.write("AGENTS.md", `${canonical.trim()}\n\n${START}\nstale second block\n${END}\n`);

    expect(() => {
      sync(tree);
    }).toThrow("Remove duplicate or stray markers, then run 'bun x nx sync'.");
  });
});

function count(content: string, marker: string) {
  return content.split(marker).length - 1;
}
