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
const TRIVIA_PATTERN = String.raw`(?:\s|//[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)*`;
const OWNED_FORMATTING_FIELD = String.raw`(?:endOfLine|tabWidth|useTabs)`;
const OWNED_FORMATTING_PROPERTY = new RegExp(
  String.raw`^${TRIVIA_PATTERN}(?:${OWNED_FORMATTING_FIELD}\b${TRIVIA_PATTERN}(?::|\(|$)|["']${OWNED_FORMATTING_FIELD}["']${TRIVIA_PATTERN}(?::|\()|\[${TRIVIA_PATTERN}["']${OWNED_FORMATTING_FIELD}["']${TRIVIA_PATTERN}\]${TRIVIA_PATTERN}(?::|\())`,
  "u"
);
const DEFINE_CONFIG_OBJECT = new RegExp(
  String.raw`\bexport${TRIVIA_PATTERN}default${TRIVIA_PATTERN}defineConfig${TRIVIA_PATTERN}\(${TRIVIA_PATTERN}\{`,
  "u"
);
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
  if (hasOwnedFormattingProperty(withoutDeclaration) || REMOVED_FORMATTING_BINDING_REFERENCE.test(withoutDeclaration)) {
    throwOwnershipConflict();
  }

  const migratedSource = normalizedSource.replace(LEGACY_FORMATTING_DECLARATION, CURRENT_FORMATTING_DECLARATION);
  if (source.includes("\r\n") && !source.replaceAll("\r\n", "").includes("\n")) {
    return migratedSource.replaceAll("\n", "\r\n");
  }
  return migratedSource;
}

function hasOwnedFormattingProperty(source: string) {
  const objectMatch = DEFINE_CONFIG_OBJECT.exec(source);
  if (objectMatch?.index === undefined) {
    throwOwnershipConflict();
  }
  const objectStart = objectMatch.index + objectMatch[0].lastIndexOf("{");
  return readTopLevelProperties(source, objectStart).some((property) => OWNED_FORMATTING_PROPERTY.test(property));
}

function readTopLevelProperties(source: string, objectStart: number) {
  const properties: string[] = [];
  let propertyStart = objectStart + 1;
  let depth = 1;

  for (let index = objectStart + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      index = skipQuoted(source, index, character);
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (character === "{" || character === "[" || character === "(") {
      depth += 1;
      continue;
    }
    if (character === "}" || character === "]" || character === ")") {
      depth -= 1;
      if (depth === 0) {
        properties.push(source.slice(propertyStart, index));
        return properties;
      }
      continue;
    }
    if (character === "," && depth === 1) {
      properties.push(source.slice(propertyStart, index));
      propertyStart = index + 1;
    }
  }

  return throwOwnershipConflict();
}

function skipQuoted(source: string, start: number, quote: string) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === quote) {
      return index;
    }
  }
  return source.length;
}

function skipLineComment(source: string, start: number) {
  const lineEnd = source.indexOf("\n", start + 2);
  return lineEnd === -1 ? source.length : lineEnd;
}

function skipBlockComment(source: string, start: number) {
  const commentEnd = source.indexOf("*/", start + 2);
  return commentEnd === -1 ? source.length : commentEnd + 1;
}

function normalizeLineEndings(source: string) {
  return source.replaceAll(/\r\n?/gu, "\n");
}

function throwOwnershipConflict(): never {
  throw new Error(
    "Keenko formatter ownership fields in oxfmt.config.ts were customized. Reconcile endOfLine, tabWidth, and useTabs inheritance manually, then rerun the Keenko migration."
  );
}
