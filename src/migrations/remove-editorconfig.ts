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
const LEGACY_FORMATTING_SPREAD = "  ...formatting,\n";
const CURRENT_FORMATTING_SPREAD = "  ...ultracite,\n";
const LEGACY_IGNORE_PATTERNS = "formatting.ignorePatterns";
const CURRENT_IGNORE_PATTERNS = "ultracite.ignorePatterns";
const OWNED_FORMATTING_OVERRIDE = /^\s*(?:endOfLine|tabWidth|useTabs)\s*:/mu;

export default function removeEditorConfig(tree: Tree) {
  const editorConfig = tree.read(".editorconfig", "utf-8");
  const oxfmtConfig = tree.read("oxfmt.config.ts", "utf-8");

  if (editorConfig !== null && editorConfig !== LEGACY_EDITORCONFIG) {
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
  if (editorConfig === LEGACY_EDITORCONFIG) {
    tree.delete(".editorconfig");
  }
}

function migrateOxfmtOwnership(source: string) {
  if (
    !source.includes(LEGACY_FORMATTING_DECLARATION) &&
    source.includes(CURRENT_FORMATTING_SPREAD) &&
    !source.includes(LEGACY_FORMATTING_SPREAD) &&
    !source.includes(LEGACY_IGNORE_PATTERNS)
  ) {
    return source;
  }

  if (!source.includes(LEGACY_FORMATTING_DECLARATION) || !source.includes(LEGACY_FORMATTING_SPREAD)) {
    throwOwnershipConflict();
  }

  const withoutDeclaration = source.replace(LEGACY_FORMATTING_DECLARATION, "");
  if (OWNED_FORMATTING_OVERRIDE.test(withoutDeclaration)) {
    throwOwnershipConflict();
  }

  const migrated = withoutDeclaration
    .replace(LEGACY_FORMATTING_SPREAD, CURRENT_FORMATTING_SPREAD)
    .replaceAll(LEGACY_IGNORE_PATTERNS, CURRENT_IGNORE_PATTERNS);
  if (/\bformatting\b/u.test(migrated)) {
    throwOwnershipConflict();
  }
  return migrated;
}

function throwOwnershipConflict(): never {
  throw new Error(
    "Keenko formatter ownership fields in oxfmt.config.ts were customized. Reconcile endOfLine, tabWidth, and useTabs inheritance manually, then rerun the Keenko migration."
  );
}
