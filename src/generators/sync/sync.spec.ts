import { describe, expect, test } from "bun:test";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E, FileSystem, Layer as L, Path } from "effect";

import { presetProgram } from "../preset/preset.js";
import { syncProgram } from "./sync.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const platformLayer = L.mergeAll(NodeFileSystem.layer, NodePath.layer);

const aiStart = "<!-- keenko:start -->";
const aiEnd = "<!-- keenko:end -->";

// HELPERS ---------------------------------------------------------------------------------------------------------------------------------
const runSync = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => syncProgram(tree).pipe(E.provide(platformLayer));

const readSource = (source: URL) =>
  E.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(yield* path.fromFileUrl(source));
  }).pipe(E.provide(platformLayer));

const expectedRoutingFile = (managed: string) => `${aiStart}\n\n${managed.trimEnd()}\n\n${aiEnd}\n`;

const readSkillNames = () =>
  E.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const root = yield* path.fromFileUrl(new URL("files/skills/", import.meta.url));

    return (yield* fs.readDirectory(root)).toSorted();
  }).pipe(E.provide(platformLayer));

// TESTS -----------------------------------------------------------------------------------------------------------------------------------

describe("keenko sync", () => {
  test("preserves edits to the README seeded during creation", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        yield* presetProgram(tree, { name: "test" });
        expect(tree.exists("README.md")).toBe(true);
        const edited = "# Our project\n\nProject-owned setup instructions.\n";
        tree.write("README.md", edited);

        yield* syncProgram(tree);

        expect(tree.read("README.md", "utf-8")).toBe(edited);
      }).pipe(E.provide(platformLayer))
    ));

  test("does not recreate a README deleted after creation", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        yield* presetProgram(tree, { name: "test" });
        expect(tree.exists("README.md")).toBe(true);
        tree.delete("README.md");

        yield* syncProgram(tree);

        expect(tree.exists("README.md")).toBe(false);
      }).pipe(E.provide(platformLayer))
    ));

  test("leaves a missing project-owned README absent", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        tree.delete("README.md");

        yield* runSync(tree);

        expect(tree.exists("README.md")).toBe(false);
      })
    ));

  test("synchronizes the canonical Keenko documentation", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        yield* runSync(tree);

        expect(tree.read(".keenko/docs/core/tooling.md", "utf-8")).toBe(
          yield* readSource(new URL("files/docs/core/tooling.md", import.meta.url))
        );

        expect(tree.read(".keenko/docs/conventions/frontend.md", "utf-8")).toBe(
          yield* readSource(new URL("files/docs/conventions/frontend.md", import.meta.url))
        );

        expect(tree.read(".keenko/docs/conventions/testing.md", "utf-8")).toBe(
          yield* readSource(new URL("files/docs/conventions/testing.md", import.meta.url))
        );

        expect(tree.read(".keenko/docs/stacks/effect/README.md", "utf-8")).toBe(
          yield* readSource(new URL("files/docs/stacks/effect/README.md", import.meta.url))
        );

        expect(tree.read(".keenko/docs/stacks/workos-authkit/README.md", "utf-8")).toBe(
          yield* readSource(new URL("files/docs/stacks/workos-authkit/README.md", import.meta.url))
        );

        for (const stack of ["confect", "convex", "tanstack-query"])
          expect(tree.read(`.keenko/docs/stacks/${stack}/README.md`, "utf-8")).toBe(
            yield* readSource(new URL(`files/docs/stacks/${stack}/README.md`, import.meta.url))
          );
      })
    ));

  test("removes stale files from the Keenko-owned documentation snapshot", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write(".keenko/docs/stale.md", "stale");
        tree.write(".keenko/project-owned.txt", "keep");

        yield* runSync(tree);

        expect(tree.exists(".keenko/docs/stale.md")).toBe(false);
        expect(tree.read(".keenko/project-owned.txt", "utf-8")).toBe("keep");
      })
    ));

  test("synchronizes the selected skill set into the canonical Keenko directory", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        const names = yield* readSkillNames();

        yield* runSync(tree);

        for (const name of names) {
          const expected = yield* readSource(new URL(`files/skills/${name}/SKILL.md`, import.meta.url));

          expect(tree.read(`.keenko/skills/${name}/SKILL.md`, "utf-8")).toBe(expected);
        }
      })
    ));

  test("removes stale skills from the canonical Keenko snapshot", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write(".keenko/skills/retired-skill/SKILL.md", "old");
        tree.write(".agents/skills/retired-skill/SKILL.md", "old");
        tree.write(".claude/skills/retired-skill/SKILL.md", "old");

        yield* runSync(tree);

        expect(tree.exists(".agents/skills/retired-skill/SKILL.md")).toBe(false);
        expect(tree.exists(".claude/skills/retired-skill/SKILL.md")).toBe(false);
      })
    ));

  test("synchronizes Keenko skills into both harness skill roots", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        const names = yield* readSkillNames();

        yield* runSync(tree);

        for (const name of names) {
          expect(tree.exists(`.agents/skills/${name}/SKILL.md`)).toBe(true);
          expect(tree.exists(`.claude/skills/${name}/SKILL.md`)).toBe(true);
        }
      })
    ));

  test("mirrors third-party licenses without inventing metadata for Keenko-authored skills", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();
        const license = yield* readSource(new URL("files/skills/grilling/LICENSE", import.meta.url));

        yield* runSync(tree);

        expect(tree.read(".keenko/skills/grilling/LICENSE", "utf-8")).toBe(license);
        expect(tree.read(".agents/skills/grilling/LICENSE", "utf-8")).toBe(license);
        expect(tree.read(".claude/skills/grilling/LICENSE", "utf-8")).toBe(license);
        for (const root of [".keenko/skills", ".agents/skills", ".claude/skills"])
          expect(tree.exists(`${root}/confect/LICENSE`)).toBe(false);
      })
    ));

  test("preserves project-owned sibling skills", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write(".agents/skills/project-debug/SKILL.md", "# Project debug");
        tree.write(".claude/skills/project-debug/SKILL.md", "# Project debug");

        yield* runSync(tree);

        expect(tree.read(".agents/skills/project-debug/SKILL.md", "utf-8")).toBe("# Project debug");
        expect(tree.read(".claude/skills/project-debug/SKILL.md", "utf-8")).toBe("# Project debug");
      })
    ));

  test("creates managed routing blocks in fresh root guidance files", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        const agents = yield* readSource(new URL("fragments/AGENTS.md", import.meta.url));
        const claude = yield* readSource(new URL("fragments/CLAUDE.md", import.meta.url));

        yield* runSync(tree);

        expect(tree.read("AGENTS.md", "utf-8")).toBe(expectedRoutingFile(agents));
        expect(tree.read("CLAUDE.md", "utf-8")).toBe(expectedRoutingFile(claude));
      })
    ));

  test("updates only the managed routing block", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write(
          "AGENTS.md",
          [
            "# Project instructions",
            "",
            "Keep this before the Keenko block.",
            "",
            aiStart,
            "stale managed guidance",
            aiEnd,
            "",
            "Keep this after the Keenko block.",
            "",
          ].join("\n")
        );

        const managed = yield* readSource(new URL("fragments/AGENTS.md", import.meta.url));

        yield* runSync(tree);

        expect(tree.read("AGENTS.md", "utf-8")).toBe(
          [
            "# Project instructions",
            "",
            "Keep this before the Keenko block.",
            "",
            aiStart,
            "",
            managed.trimEnd(),
            "",
            aiEnd,
            "",
            "Keep this after the Keenko block.",
            "",
          ].join("\n")
        );
      })
    ));

  test("rejects malformed routing markers before synchronizing managed state", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write("AGENTS.md", [aiStart, "first", aiStart, "second", aiEnd, ""].join("\n"));

        const failure = yield* runSync(tree).pipe(E.flip);

        expect(failure).toMatchObject({
          _tag: "GuidanceFailure",
          issue: "invalid_routing_markers",
          path: "AGENTS.md",
        });

        expect(tree.exists(".keenko/docs/core/tooling.md")).toBe(false);
        expect(tree.exists(".keenko/skills/confect/SKILL.md")).toBe(false);
      })
    ));

  test("is idempotent", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        yield* runSync(tree);

        const before = tree.listChanges();

        yield* runSync(tree);

        expect(tree.listChanges()).toEqual(before);
      })
    ));

  test("returns the Nx out-of-sync diagnostic", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        const result = yield* runSync(tree);

        expect(result).toEqual({
          outOfSyncMessage: "Keenko guidance is out of sync. Run `bun x nx sync`.",
        });
      })
    ));

  test("preserves project-owned guidance", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTreeWithEmptyWorkspace();

        tree.write("CONTEXT.md", "# My project context");
        tree.write("docs/project/architecture.md", "# My architecture");
        tree.write("docs/project/overrides.md", "# My overrides");
        tree.write("docs/project/ui.md", "# My UI");

        yield* runSync(tree);

        expect(tree.read("CONTEXT.md", "utf-8")).toBe("# My project context");

        expect(tree.read("docs/project/architecture.md", "utf-8")).toBe("# My architecture");

        expect(tree.read("docs/project/overrides.md", "utf-8")).toBe("# My overrides");

        expect(tree.read("docs/project/ui.md", "utf-8")).toBe("# My UI");
      })
    ));
});
