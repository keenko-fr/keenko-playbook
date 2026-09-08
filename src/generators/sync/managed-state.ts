import { generateFiles, type Tree } from "@nx/devkit";
import { Effect as E, FileSystem, Option as O, Path } from "effect";

import { GuidanceFailure } from "../errors.js";
import { deleteTreeDirectory } from "../helpers.js";

// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const docsTarget = ".keenko/docs";

const skillsTarget = ".keenko/skills";
const skillTargets: readonly string[] = [".agents/skills", ".claude/skills"];

const aiStart = "<!-- keenko:start -->";
const aiEnd = "<!-- keenko:end -->";
const aiFragments = [
  { source: new URL("fragments/AGENTS.md", import.meta.url), target: "AGENTS.md" },
  { source: new URL("fragments/CLAUDE.md", import.meta.url), target: "CLAUDE.md" },
];

// MAIN ------------------------------------------------------------------------------------------------------------------------------------
export const syncManagedState = E.fn("keenko.sync.managedState")(function* (tree: Tree) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const docsRoot = yield* path.fromFileUrl(new URL("files/docs/", import.meta.url));

  const skillsRoot = yield* path.fromFileUrl(new URL("files/skills/", import.meta.url));
  const previousSkills = tree.children(skillsTarget).toSorted();
  const currentSkills = (yield* fs.readDirectory(skillsRoot)).toSorted();

  const aiFiles = yield* E.forEach(
    aiFragments,
    E.fn("keenko.sync.aiFragment")(function* ({ source, target }) {
      const sourcePath = yield* path.fromFileUrl(source);
      const managed = yield* fs.readFileString(sourcePath);
      const content = yield* mergeAiFragment(tree, `${aiStart}\n\n${managed.trimEnd()}\n\n${aiEnd}`, target);
      return { content, target };
    })
  );

  yield* E.sync(() => {
    deleteTreeDirectory(tree, docsTarget);
    generateFiles(tree, docsRoot, docsTarget, {});

    deleteTreeDirectory(tree, skillsTarget);
    generateFiles(tree, skillsRoot, skillsTarget, {});

    for (const targetRoot of skillTargets) {
      for (const skill of new Set([...previousSkills, ...currentSkills])) deleteTreeDirectory(tree, `${targetRoot}/${skill}`);
      for (const skill of currentSkills) generateFiles(tree, path.join(skillsRoot, skill), `${targetRoot}/${skill}`, {});
    }

    for (const { content, target } of aiFiles) if (tree.read(target, "utf-8") !== content) tree.write(target, content);
  });
});

// INTERNALS -------------------------------------------------------------------------------------------------------------------------------
const mergeAiFragment = E.fn("keenko.sync.mergeAiFragment")(function* (tree: Tree, block: string, target: string) {
  return yield* O.match(O.fromNullishOr(tree.read(target, "utf-8")), {
    onNone: () => E.succeed(`${block}\n`),
    onSome: (current) => {
      const startCount = current.split(aiStart).length - 1;
      const endCount = current.split(aiEnd).length - 1;

      if (startCount === 0 && endCount === 0) {
        const projectContent = current.trimEnd();
        return E.succeed(projectContent.length === 0 ? `${block}\n` : `${projectContent}\n\n${block}\n`);
      }

      const start = current.indexOf(aiStart);
      const end = current.indexOf(aiEnd);

      if (startCount !== 1 || endCount !== 1 || start > end)
        return E.fail(new GuidanceFailure({ issue: "invalid_routing_markers", path: target }));

      return E.succeed(`${current.slice(0, start)}${block}${current.slice(end + aiEnd.length)}`);
    },
  });
});
