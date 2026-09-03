import type { Tree } from "@nx/devkit";

const PREVIOUS = "bun run format:check && bun run lint && bun run typecheck && bun run build";
const CURRENT = "bun run codegen:check && bun run format:check && bun run lint && bun run typecheck && bun run build";

export default function normalizeCheck(tree: Tree) {
  const source = tree.read("package.json", "utf-8");
  if (source === null) {
    throw new Error("Cannot migrate: package.json is missing");
  }
  const parsed: unknown = JSON.parse(source);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Cannot migrate: package.json must contain an object");
  }
  const pkg = Object.fromEntries(Object.entries(parsed));
  const scripts = stringRecord(pkg.scripts);
  const check = scripts?.check;
  if (check === CURRENT) {
    return;
  }
  if (check !== PREVIOUS || scripts === undefined) {
    throw new Error(
      "Cannot migrate package.json scripts.check because it was customized; reconcile it with the Keenko check pipeline first"
    );
  }
  scripts.check = CURRENT;
  pkg.scripts = scripts;
  tree.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  return entries.every(([, entry]) => typeof entry === "string") ? Object.fromEntries(entries) : undefined;
}
