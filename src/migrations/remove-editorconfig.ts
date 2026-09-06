import type { Tree } from "@nx/devkit";

const LEGACY_EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
`;
const LEGACY_FORMATTING_DECLARATION = `const { endOfLine: _endOfLine, tabWidth: _tabWidth, useTabs: _useTabs, ...formatting } = ultracite;

`;
const CURRENT_FORMATTING_DECLARATION = `const formatting = ultracite;

`;
const OWNED_FORMATTING_OVERRIDE = /^\s*(?:endOfLine|tabWidth|useTabs)\s*:/mu;
const REMOVED_FORMATTING_BINDING_REFERENCE = /\b_(?:endOfLine|tabWidth|useTabs)\b/u;
const LEGACY_OXFMT_CONFIG = `import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

${LEGACY_FORMATTING_DECLARATION}export default defineConfig({
  ...formatting,
  ignorePatterns: [
    ...(formatting.ignorePatterns ?? []),
    ".keenko/**",
    ".agents/skills/**",
    ".claude/skills/**",
    "**/_generated/**",
    "**/routeTree.gen.ts",
    "packages/backend/confect/**",
    "packages/backend/convex/**",
    "!packages/backend/convex/tsconfig.json",
    "!packages/backend/convex/convex.config.ts",
  ],
  printWidth: 140,
});
`;
const CURRENT_OXFMT_CONFIG = `import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".keenko/**",
    ".agents/skills/**",
    ".claude/skills/**",
    "**/_generated/**",
    "**/routeTree.gen.ts",
    "packages/backend/confect/**",
    "packages/backend/convex/**",
    "!packages/backend/convex/tsconfig.json",
    "!packages/backend/convex/convex.config.ts",
  ],
  printWidth: 140,
});
`;

export default function removeEditorConfig(tree: Tree) {
  const editorConfig = tree.read(".editorconfig", "utf-8");
  const oxfmtConfig = tree.read("oxfmt.config.ts", "utf-8");
  const normalizedEditorConfig = editorConfig === null ? null : normalizeLineEndings(editorConfig);

  if (normalizedEditorConfig !== null && normalizedEditorConfig !== LEGACY_EDITORCONFIG) {
    throw new Error(
      "Keenko-owned .editorconfig was customized. Reconcile or remove that project-owned file manually, then rerun the Keenko migration."
    );
  }
  if (oxfmtConfig === null) {
    throw new Error(
      "Keenko-owned oxfmt.config.ts is missing. Restore or reconcile the formatter config before rerunning the Keenko migration."
    );
  }

  const migratedOxfmtConfig = migrateOxfmtOwnership(oxfmtConfig);
  if (migratedOxfmtConfig !== oxfmtConfig) {
    tree.write("oxfmt.config.ts", migratedOxfmtConfig);
  }
  if (normalizedEditorConfig === LEGACY_EDITORCONFIG) {
    tree.delete(".editorconfig");
  }
}

function migrateOxfmtOwnership(source: string) {
  const normalizedSource = normalizeLineEndings(source);
  if (normalizedSource === LEGACY_OXFMT_CONFIG) {
    return CURRENT_OXFMT_CONFIG;
  }
  if (normalizedSource === CURRENT_OXFMT_CONFIG || normalizedSource.includes(CURRENT_FORMATTING_DECLARATION)) {
    return source;
  }
  if (!normalizedSource.includes(LEGACY_FORMATTING_DECLARATION)) {
    throwOwnershipConflict();
  }

  const withoutDeclaration = normalizedSource.replace(LEGACY_FORMATTING_DECLARATION, "");
  if (OWNED_FORMATTING_OVERRIDE.test(withoutDeclaration) || REMOVED_FORMATTING_BINDING_REFERENCE.test(withoutDeclaration)) {
    throwOwnershipConflict();
  }

  const migratedSource = normalizedSource.replace(LEGACY_FORMATTING_DECLARATION, CURRENT_FORMATTING_DECLARATION);
  if (source.includes("\r\n") && !source.replaceAll("\r\n", "").includes("\n")) {
    return migratedSource.replaceAll("\n", "\r\n");
  }
  return migratedSource;
}

function normalizeLineEndings(source: string) {
  return source.replaceAll(/\r\n?/gu, "\n");
}

function throwOwnershipConflict(): never {
  throw new Error(
    "Keenko formatter ownership fields in oxfmt.config.ts were customized. Reconcile endOfLine, tabWidth, and useTabs inheritance manually, then rerun the Keenko migration."
  );
}
