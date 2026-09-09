import { describe, expect, test } from "bun:test";

import { readJson, writeJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { Effect as E } from "effect";

import migrations from "../../migrations.json" with { type: "json" };
import baseline031, { canonicalVscodeSettings, OXC_EXTENSION } from "./baseline-0-3-1.js";

interface RootPackage {
  readonly custom?: { readonly retained: boolean };
  readonly name?: string;
  readonly private?: boolean;
  readonly type?: string;
}

interface VscodeSettings {
  readonly "editor.codeActionsOnSave"?: Readonly<Record<string, string>>;
  readonly "editor.defaultFormatter"?: string;
  readonly "editor.formatOnPaste"?: boolean;
  readonly "editor.formatOnSave"?: boolean;
  readonly "js/ts.experimental.useTsgo"?: boolean;
  readonly "js/ts.tsdk.additionalLocations"?: readonly string[];
  readonly "js/ts.tsdk.path"?: string;
  readonly "js/ts.tsdk.promptToUseWorkspaceVersion"?: boolean;
  readonly "project.setting"?: string;
}

const settingsPath = ".vscode/settings.json";
const extensionsPath = ".vscode/extensions.json";
const runMigration = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => E.promise(() => baseline031(tree));

const createTree = () => {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, "package.json", { custom: { retained: true }, name: "consumer", private: true });
  return tree;
};

describe("0.3.1 baseline migration", () => {
  test("adds module metadata and creates the complete VS Code baseline", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTree();

        yield* runMigration(tree);

        expect(readJson<RootPackage>(tree, "package.json")).toEqual({
          custom: { retained: true },
          name: "consumer",
          private: true,
          type: "module",
        });
        expect(readJson(tree, settingsPath)).toEqual(canonicalVscodeSettings);
        expect(readJson(tree, extensionsPath)).toEqual({ recommendations: [OXC_EXTENSION] });
      })
    ));

  test("merges nested settings, SDK locations, and recommendations without dropping project state", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTree();
        writeJson(tree, settingsPath, {
          "editor.codeActionsOnSave": {
            "source.fixAll.eslint": "explicit",
            "source.fixAll.oxc": "always",
          },
          "js/ts.tsdk.additionalLocations": ["./vendor/typescript/bin", "./node_modules/typescript/bin", "./node_modules/typescript/bin"],
          "project.setting": "retained",
        });
        writeJson(tree, extensionsPath, {
          recommendations: ["project.extension", OXC_EXTENSION, OXC_EXTENSION],
          unwantedRecommendations: ["project.unwanted"],
        });

        yield* runMigration(tree);

        const settings = readJson<VscodeSettings>(tree, settingsPath);
        expect(settings["editor.defaultFormatter"]).toBe(canonicalVscodeSettings["editor.defaultFormatter"]);
        expect(settings["editor.formatOnPaste"]).toBe(canonicalVscodeSettings["editor.formatOnPaste"]);
        expect(settings["editor.formatOnSave"]).toBe(canonicalVscodeSettings["editor.formatOnSave"]);
        expect(settings["js/ts.experimental.useTsgo"]).toBe(canonicalVscodeSettings["js/ts.experimental.useTsgo"]);
        expect(settings["js/ts.tsdk.path"]).toBe(canonicalVscodeSettings["js/ts.tsdk.path"]);
        expect(settings["js/ts.tsdk.promptToUseWorkspaceVersion"]).toBe(canonicalVscodeSettings["js/ts.tsdk.promptToUseWorkspaceVersion"]);
        expect(settings["project.setting"]).toBe("retained");
        expect(settings["editor.codeActionsOnSave"]).toEqual({
          "source.fixAll.eslint": "explicit",
          "source.fixAll.oxc": "always",
          "source.format.oxc": "always",
        });
        expect(settings["js/ts.tsdk.additionalLocations"]).toEqual(["./vendor/typescript/bin", "./node_modules/typescript/bin"]);
        expect(readJson(tree, extensionsPath)).toEqual({
          recommendations: ["project.extension", OXC_EXTENSION],
          unwantedRecommendations: ["project.unwanted"],
        });
      })
    ));

  test("is idempotent when the target state is already correct", () =>
    E.runPromise(
      E.gen(function* () {
        const tree = createTree();
        yield* runMigration(tree);
        const expected = ["package.json", settingsPath, extensionsPath].map((path) => tree.read(path, "utf-8"));

        yield* runMigration(tree);

        expect(["package.json", settingsPath, extensionsPath].map((path) => tree.read(path, "utf-8"))).toEqual(expected);
      })
    ));

  for (const [name, settings] of [
    ["top-level setting", { "editor.formatOnSave": true }],
    ["nested code action", { "editor.codeActionsOnSave": { "source.fixAll.oxc": "never" } }],
  ] satisfies readonly (readonly [string, object])[])
    test(`rejects a conflicting Keenko-owned ${name} without partial writes`, () => {
      const tree = createTree();
      writeJson(tree, settingsPath, settings);
      const expectedPackage = tree.read("package.json", "utf-8");
      const expectedSettings = tree.read(settingsPath, "utf-8");

      expect(() => {
        void baseline031(tree);
      }).toThrow("conflicts with the 0.3.1 baseline");
      expect(tree.read("package.json", "utf-8")).toBe(expectedPackage);
      expect(tree.read(settingsPath, "utf-8")).toBe(expectedSettings);
      expect(tree.exists(extensionsPath)).toBe(false);
    });

  test("rejects a conflicting root package module type", () => {
    const tree = createTree();
    writeJson(tree, "package.json", { name: "consumer", type: "commonjs" });

    expect(() => {
      void baseline031(tree);
    }).toThrow("Keenko-owned value type in package.json conflicts");
    expect(tree.exists(settingsPath)).toBe(false);
    expect(tree.exists(extensionsPath)).toBe(false);
  });

  test("is registered at the 0.3.1 boundary", () => {
    expect(migrations).toEqual({
      generators: {
        "0.3.1-baseline": {
          description: "Apply the Keenko 0.3.1 module and VS Code baseline without replacing project-owned editor state.",
          factory: "./dist/migrations/baseline-0-3-1",
          version: "0.3.1",
        },
      },
      packageJsonUpdates: {},
    });
  });
});
