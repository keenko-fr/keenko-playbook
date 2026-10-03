/* oxlint-disable effect/noNewError, effect/noNullish, effect/noThrowStatement -- Native Nx migrations reject ambiguous owned configuration before writing. */
import type { Tree } from "@nx/devkit";

const path = "bunfig.toml";

export default function bunLinker102(tree: Tree) {
  const source = tree.read(path, "utf-8");
  if (source === null) return conflict();
  const lines = source.split(/(?<=\n)/u);
  const fields = installFields(lines);
  const linkers = fields.filter((field) => field.key === "linker");
  const hoists = fields.filter((field) => field.key === "hoist");
  const [linker] = linkers;
  if (linkers.length !== 1 || linker === undefined || hoists.length > 1 || hoists.some((field) => field.value !== "false"))
    return conflict();
  if (!/^(?:"(?:hoisted|isolated)"|'(?:hoisted|isolated)')$/u.test(linker.value)) return conflict();
  if (linker.value.slice(1, -1) === "isolated") {
    if (hoists.length !== 1) return conflict();
    return;
  }
  lines[linker.index] = lines[linker.index].replace(/(?<quote>["'])hoisted\k<quote>/u, '"isolated"');
  if (hoists.length === 0) {
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    if (!lines[linker.index].endsWith("\n")) lines[linker.index] += newline;
    lines[linker.index] += `hoist = false${newline}`;
  }
  tree.write(path, lines.join(""));
}

// A bounded scan of literal fields, not a TOML normalizer. Opaque multiline/dotted representations require reconciliation.
function installFields(lines: string[]) {
  let section = "";
  let sections = 0;
  const fields: { index: number; key: string; value: string }[] = [];
  for (const [index, line] of lines.entries()) {
    const code = literalLine(line).trim();
    if (code === "") continue;
    if (code.startsWith("[")) {
      if (!/^\[[A-Za-z0-9_.-]+\]$/u.test(code) || /^\[install\.(?:linker|hoist)(?:\.|\])/u.test(code)) return conflict();
      section = code;
      if (section === "[install]") sections++;
      continue;
    }
    const field = /^(?<key>[A-Za-z0-9_-]+|"[^"\\]*"|'[^']*')\s*=\s*(?<value>.+)$/u.exec(code)?.groups;
    if (field === undefined) return conflict();
    const key = field.key.replaceAll(/^["']|["']$/gu, "");
    if (section === "" && key === "install") return conflict();
    if (section === "[install]") fields.push({ index, key, value: field.value });
  }
  if (sections !== 1) return conflict();
  return fields;
}

function literalLine(line: string) {
  let brackets = 0;
  const tokens = /(?<string>"(?:\\.|[^"\\\r\n])*"|'[^'\r\n]*')|(?<comment>#.*)|(?<open>[[{])|(?<close>[\]}])|(?<other>.)/gu;
  for (const token of line.matchAll(tokens)) {
    const { groups } = token;
    if (groups === undefined) return conflict();
    if (groups.comment !== undefined) return brackets === 0 ? line.slice(0, token.index) : conflict();
    if (groups.other === '"' || groups.other === "'" || /^["']{3}/u.test(line.slice(token.index))) return conflict();
    if (groups.open !== undefined) brackets++;
    if (groups.close !== undefined) brackets--;
    if (brackets < 0) return conflict();
  }
  if (brackets !== 0) return conflict();
  return line;
}

function conflict(): never {
  throw new Error(
    `Keenko-owned install.linker/install.hoist in ${path} conflict with the 1.0.2 Bun contract. Reconcile the customization manually, then rerun the Keenko migration.`
  );
}
