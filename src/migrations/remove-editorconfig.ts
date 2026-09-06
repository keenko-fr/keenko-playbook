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
const CURRENT_FORMATTING_DECLARATION_LINE = /^[ \t]*const[ \t]+formatting[ \t]*=[ \t]*ultracite[ \t]*;[ \t]*$/mu;
const TRIVIA_PATTERN = String.raw`(?:\s|//[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)*`;
const OWNED_FORMATTING_FIELD = String.raw`(?:endOfLine|tabWidth|useTabs)`;
const OWNED_FORMATTING_KEY = String.raw`(?:${OWNED_FORMATTING_FIELD}\b|["']${OWNED_FORMATTING_FIELD}["']|\[${TRIVIA_PATTERN}["']${OWNED_FORMATTING_FIELD}["']${TRIVIA_PATTERN}\])`;
const OWNED_FORMATTING_PROPERTY = new RegExp(
  String.raw`^${TRIVIA_PATTERN}(?:${OWNED_FORMATTING_KEY}${TRIVIA_PATTERN}(?::|\(|$)|(?:get|set)\b${TRIVIA_PATTERN}${OWNED_FORMATTING_KEY}${TRIVIA_PATTERN}\()`,
  "u"
);
const COMPUTED_PROPERTY = new RegExp(String.raw`^${TRIVIA_PATTERN}(?:(?:get|set)\b${TRIVIA_PATTERN})?\[`, "u");
const STATIC_STRING_COMPUTED_PROPERTY = new RegExp(
  String.raw`^${TRIVIA_PATTERN}(?:(?:get|set)\b${TRIVIA_PATTERN})?\[${TRIVIA_PATTERN}(?:"[^"\\]*"|'[^'\\]*')${TRIVIA_PATTERN}\]`,
  "u"
);
const SPREAD_PROPERTY = new RegExp(String.raw`^${TRIVIA_PATTERN}\.\.\.`, "u");
const FORMATTING_SPREAD = new RegExp(String.raw`^${TRIVIA_PATTERN}\.\.\.${TRIVIA_PATTERN}formatting\b${TRIVIA_PATTERN}$`, "u");
const DEFINE_CONFIG_OBJECT = new RegExp(
  String.raw`\bexport${TRIVIA_PATTERN}default${TRIVIA_PATTERN}defineConfig${TRIVIA_PATTERN}\(${TRIVIA_PATTERN}\{`,
  "u"
);
const REMOVED_FORMATTING_BINDING_REFERENCE = /\b_(?:endOfLine|tabWidth|useTabs)\b/u;
const REGULAR_EXPRESSION_PREFIX_KEYWORD = /^(?:await|case|delete|do|else|in|instanceof|new|return|throw|typeof|void|yield)$/u;
const FOR_HEADER = /(?:^|[^\w$.#])for(?:\s+await)?\s*$/u;
const FOR_OF_BINDING = /^(?:(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*|[A-Za-z_$][A-Za-z0-9_$]*)\s*$/u;
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
  if (normalizedSource === CURRENT_OXFMT_CONFIG) {
    return source;
  }

  const maskedSource = maskCommentsAndStrings(normalizedSource);
  const legacyDeclarationIndex = maskedSource.indexOf(LEGACY_FORMATTING_DECLARATION);
  if (legacyDeclarationIndex === -1) {
    if (CURRENT_FORMATTING_DECLARATION_LINE.test(maskedSource)) {
      return source;
    }
    throwOwnershipConflict();
  }

  const withoutDeclaration =
    normalizedSource.slice(0, legacyDeclarationIndex) +
    normalizedSource.slice(legacyDeclarationIndex + LEGACY_FORMATTING_DECLARATION.length);
  if (
    hasOwnedFormattingProperty(withoutDeclaration) ||
    REMOVED_FORMATTING_BINDING_REFERENCE.test(maskCommentsAndStrings(withoutDeclaration, true))
  ) {
    throwOwnershipConflict();
  }

  const migratedSource =
    normalizedSource.slice(0, legacyDeclarationIndex) +
    CURRENT_FORMATTING_DECLARATION +
    normalizedSource.slice(legacyDeclarationIndex + LEGACY_FORMATTING_DECLARATION.length);
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
  const properties = readTopLevelProperties(source, objectStart);
  if (properties.some((property) => OWNED_FORMATTING_PROPERTY.test(property))) {
    return true;
  }

  const formattingSpreadIndex = properties.map((property) => FORMATTING_SPREAD.test(property)).lastIndexOf(true);
  if (formattingSpreadIndex === -1) {
    throwOwnershipConflict();
  }
  for (const property of properties.slice(0, formattingSpreadIndex)) {
    if (
      (SPREAD_PROPERTY.test(property) && !FORMATTING_SPREAD.test(property)) ||
      (COMPUTED_PROPERTY.test(property) && !STATIC_STRING_COMPUTED_PROPERTY.test(property))
    ) {
      return true;
    }
  }
  return false;
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

function maskCommentsAndStrings(source: string, scanTemplateExpressions = false) {
  const masked = Array.from({ length: source.length }, (_, index) => source.charAt(index));
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' || character === "'") {
      const end = skipQuoted(source, index, character);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (character === "`") {
      const end = scanTemplateExpressions ? maskTemplateLiteral(masked, source, index) : skipQuoted(source, index, character);
      if (!scanTemplateExpressions) {
        maskRange(masked, source, index, end);
      }
      index = end;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      const end = skipLineComment(source, index);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = skipBlockComment(source, index);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (scanTemplateExpressions && character === "/" && slashStartsRegularExpression(source, index, 0)) {
      const end = skipRegularExpression(source, index);
      maskRange(masked, source, index, end);
      index = end;
    }
  }
  return masked.join("");
}

function maskTemplateLiteral(masked: string[], source: string, start: number) {
  maskRange(masked, source, start, start);
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      const escapeEnd = Math.min(index + 1, source.length - 1);
      maskRange(masked, source, index, escapeEnd);
      index = escapeEnd;
      continue;
    }
    if (source[index] === "`") {
      maskRange(masked, source, index, index);
      return index;
    }
    if (source[index] === "$" && source[index + 1] === "{") {
      maskRange(masked, source, index, index + 1);
      index = scanTemplateExpression(masked, source, index + 2);
      continue;
    }
    maskRange(masked, source, index, index);
  }
  return source.length;
}

function scanTemplateExpression(masked: string[], source: string, start: number) {
  let depth = 1;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' || character === "'") {
      const end = skipQuoted(source, index, character);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (character === "`") {
      index = maskTemplateLiteral(masked, source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      const end = skipLineComment(source, index);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = skipBlockComment(source, index);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (character === "/" && slashStartsRegularExpression(source, index, start)) {
      const end = skipRegularExpression(source, index);
      maskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        maskRange(masked, source, index, index);
        return index;
      }
    }
  }
  return source.length;
}

function slashStartsRegularExpression(source: string, slashIndex: number, expressionStart: number) {
  let previousIndex = slashIndex - 1;
  while (previousIndex >= expressionStart && /\s/u.test(source[previousIndex] ?? "")) {
    previousIndex -= 1;
  }
  if (previousIndex < expressionStart) {
    return true;
  }

  const previous = source[previousIndex] ?? "";
  if (/[A-Za-z0-9_$]/u.test(previous)) {
    return identifierAllowsRegularExpression(source, previousIndex, expressionStart);
  }
  if (previous === '"' || previous === "'" || previous === "`" || previous === ")" || previous === "]" || previous === ".") {
    return false;
  }
  if (previous === "}") {
    return throwOwnershipConflict();
  }
  if (previous === "!") {
    return isPrefixBang(source, previousIndex, expressionStart);
  }
  if ((previous === "+" || previous === "-") && source[previousIndex - 1] === previous) {
    return false;
  }
  if ("([{,;:?=!*%&|^~<>+-".includes(previous)) {
    return true;
  }
  return throwOwnershipConflict();
}

function isPrefixBang(source: string, bangIndex: number, expressionStart: number) {
  let previousIndex = bangIndex - 1;
  while (previousIndex >= expressionStart && /\s/u.test(source[previousIndex] ?? "")) {
    previousIndex -= 1;
  }
  if (previousIndex < expressionStart) {
    return true;
  }

  const previous = source[previousIndex] ?? "";
  if (/[A-Za-z0-9_$]/u.test(previous)) {
    return identifierAllowsRegularExpression(source, previousIndex, expressionStart);
  }
  if (previous === '"' || previous === "'" || previous === "`" || previous === ")" || previous === "]") {
    return false;
  }
  if (previous === "}" || previous === "!" || previous === ".") {
    return throwOwnershipConflict();
  }
  if ("([{,;:?=*%&|^~<>+-".includes(previous)) {
    return true;
  }
  return throwOwnershipConflict();
}

function identifierAllowsRegularExpression(source: string, previousIndex: number, expressionStart: number) {
  let tokenStart = previousIndex;
  while (tokenStart > expressionStart && /[A-Za-z0-9_$]/u.test(source[tokenStart - 1] ?? "")) {
    tokenStart -= 1;
  }
  const token = source.slice(tokenStart, previousIndex + 1);
  if (token === "of") {
    return isForOfKeyword(source, tokenStart, expressionStart);
  }
  if (!REGULAR_EXPRESSION_PREFIX_KEYWORD.test(token)) {
    return false;
  }

  let contextIndex = tokenStart - 1;
  while (contextIndex >= expressionStart && /\s/u.test(source[contextIndex] ?? "")) {
    contextIndex -= 1;
  }
  return contextIndex < expressionStart || source[contextIndex] !== ".";
}

function isForOfKeyword(source: string, tokenStart: number, expressionStart: number) {
  const prefix = maskCommentsAndStrings(source.slice(expressionStart, tokenStart));
  let depth = 0;

  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const character = prefix[index] ?? "";
    if (/\s/u.test(character)) {
      continue;
    }
    if (")]}`".includes(character)) {
      depth += 1;
      continue;
    }
    if (!"([{".includes(character)) {
      continue;
    }
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    if (character !== "(") {
      return false;
    }
    return FOR_HEADER.test(prefix.slice(0, index)) && FOR_OF_BINDING.test(prefix.slice(index + 1));
  }
  return false;
}

function skipRegularExpression(source: string, start: number) {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "\n" || character === "\r") {
      return throwOwnershipConflict();
    }
    if (character === "[") {
      inCharacterClass = true;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (character === "/" && !inCharacterClass) {
      let end = index;
      while (/[A-Za-z]/u.test(source[end + 1] ?? "")) {
        end += 1;
      }
      return end;
    }
  }
  return throwOwnershipConflict();
}

function maskRange(masked: string[], source: string, start: number, end: number) {
  const finalIndex = Math.min(end, source.length - 1);
  for (let index = start; index <= finalIndex; index += 1) {
    if (source[index] !== "\n" && source[index] !== "\r") {
      masked[index] = " ";
    }
  }
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
