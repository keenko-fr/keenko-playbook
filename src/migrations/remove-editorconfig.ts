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
const OWNED_FORMATTING_FIELDS = new Set(["endOfLine", "tabWidth", "useTabs"]);
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
  const objectStart = findDefineConfigObjectStart(source);
  return readTopLevelProperties(source, objectStart).some((property) => {
    const propertyName = readStaticPropertyName(property);
    return propertyName !== null && OWNED_FORMATTING_FIELDS.has(propertyName);
  });
}

function findDefineConfigObjectStart(source: string) {
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const defineConfigIndex = source.indexOf("defineConfig", searchFrom);
    if (defineConfigIndex === -1) {
      break;
    }
    let cursor = skipTrivia(source, defineConfigIndex + "defineConfig".length);
    if (source[cursor] === "(") {
      cursor = skipTrivia(source, cursor + 1);
      if (source[cursor] === "{") {
        return cursor;
      }
    }
    searchFrom = defineConfigIndex + "defineConfig".length;
  }
  throwOwnershipConflict();
}

function readTopLevelProperties(source: string, objectStart: number) {
  const properties: string[] = [];
  let propertyStart = objectStart + 1;
  let braceDepth = 1;
  let bracketDepth = 0;
  let parenthesisDepth = 0;

  for (let index = objectStart + 1; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (character === '"' || character === "'" || character === "`") {
      index = skipQuoted(source, index, character);
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      continue;
    }
    if (character === "}") {
      braceDepth -= 1;
      if (braceDepth === 0) {
        properties.push(source.slice(propertyStart, index));
        return properties;
      }
      continue;
    }
    if (character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (character === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (character === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (character === ")") {
      parenthesisDepth -= 1;
      continue;
    }
    if (character === "," && braceDepth === 1 && bracketDepth === 0 && parenthesisDepth === 0) {
      properties.push(source.slice(propertyStart, index));
      propertyStart = index + 1;
    }
  }

  throwOwnershipConflict();
}

function readStaticPropertyName(property: string) {
  let cursor = skipTrivia(property, 0);
  if (property.startsWith("...", cursor)) {
    return null;
  }

  const firstCharacter = property[cursor];
  if (firstCharacter === '"' || firstCharacter === "'" || firstCharacter === "`") {
    return readQuotedLiteral(property, cursor)?.value ?? null;
  }
  if (firstCharacter === "[") {
    cursor = skipTrivia(property, cursor + 1);
    const quotedProperty = readQuotedLiteral(property, cursor);
    if (quotedProperty === null) {
      return null;
    }
    cursor = skipTrivia(property, quotedProperty.end);
    return property[cursor] === "]" ? quotedProperty.value : null;
  }

  const identifier = readIdentifier(property, cursor);
  if (identifier === null) {
    return null;
  }
  if (OWNED_FORMATTING_FIELDS.has(identifier.value)) {
    return identifier.value;
  }
  if (identifier.value !== "get" && identifier.value !== "set" && identifier.value !== "async") {
    return null;
  }

  cursor = skipTrivia(property, identifier.end);
  if (property[cursor] === ":") {
    return null;
  }
  return readIdentifier(property, cursor)?.value ?? null;
}

function readIdentifier(source: string, start: number) {
  const match = /^[A-Za-z_$][A-Za-z0-9_$]*/u.exec(source.slice(start));
  if (match === null) {
    return null;
  }
  return { end: start + match[0].length, value: match[0] };
}

function readQuotedLiteral(source: string, start: number) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return null;
  }

  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      return null;
    }
    if (quote === "`" && character === "$" && source[index + 1] === "{") {
      return null;
    }
    if (character === quote) {
      return { end: index + 1, value };
    }
    value += character;
  }
  return null;
}

function skipTrivia(source: string, start: number) {
  let cursor = start;
  while (cursor < source.length) {
    if (/\s/u.test(source[cursor] ?? "")) {
      cursor += 1;
      continue;
    }
    if (source[cursor] === "/" && source[cursor + 1] === "/") {
      cursor = skipLineComment(source, cursor) + 1;
      continue;
    }
    if (source[cursor] === "/" && source[cursor + 1] === "*") {
      cursor = skipBlockComment(source, cursor) + 1;
      continue;
    }
    break;
  }
  return cursor;
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
