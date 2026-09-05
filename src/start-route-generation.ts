import type { Tree } from "@nx/devkit";

const START_ROUTE_TREE_FOOTER = `import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}`;
const PREVIOUS_START_CALL = "tanstackStart()";
const CURRENT_START_CALL = "tanstackStart({ router: { routeTreeFileFooter: [] } })";

export function normalizeStartRouteGeneration(tree: Tree) {
  normalizeRouterConfig(tree);
  normalizeViteConfig(tree);
}

function normalizeRouterConfig(tree: Tree) {
  const file = "apps/web/tsr.config.json";
  const config = readJson(tree, file);
  const footer = config.routeTreeFileFooter;
  if (footer === undefined) {
    config.routeTreeFileFooter = [START_ROUTE_TREE_FOOTER];
    tree.write(file, `${JSON.stringify(config, null, 2)}\n`);
    return;
  }
  if (!Array.isArray(footer) || footer.length !== 1 || footer[0] !== START_ROUTE_TREE_FOOTER) {
    throw new Error(`Cannot update ${file} routeTreeFileFooter because the Keenko-owned Router footer was customized; reconcile it manually`);
  }
}

function normalizeViteConfig(tree: Tree) {
  const file = "apps/web/vite.config.ts";
  const source = readText(tree, file);
  if (source.includes(CURRENT_START_CALL)) {
    return;
  }
  const first = source.indexOf(PREVIOUS_START_CALL);
  if (first === -1 || first !== source.lastIndexOf(PREVIOUS_START_CALL)) {
    throw new Error(`Cannot update ${file} TanStack Start call because the Keenko-owned Router integration was customized; reconcile it manually`);
  }
  tree.write(file, source.replace(PREVIOUS_START_CALL, CURRENT_START_CALL));
}

function readJson(tree: Tree, file: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readText(tree, file));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${file} must contain an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function readText(tree: Tree, file: string) {
  const source = tree.read(file, "utf-8");
  if (source === null) {
    throw new Error(`Cannot update ${file}: file is missing`);
  }
  return source;
}
