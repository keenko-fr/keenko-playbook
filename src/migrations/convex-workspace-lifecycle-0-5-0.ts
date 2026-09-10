/* oxlint-disable effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType -- Native Nx migrations are synchronous Tree transforms over untyped project JSON and report deliberate conflicts by throwing. */
import { readJson, writeJson, type Tree } from "@nx/devkit";

import { packageVersions } from "../generators/versions.js";

const ROOT_PACKAGE_PATH = "package.json";
const BACKEND_PACKAGE_PATH = "packages/backend/package.json";
const WEB_PACKAGE_PATH = "apps/web/package.json";
const CONVEX_CONFIG_PATH = "convex.json";
const VITE_CONFIG_PATH = "apps/web/vite.config.ts";
const ENV_MODULE_PATH = "apps/web/src/config/env.ts";
const ROUTER_PATH = "apps/web/src/router.tsx";
const ROOT_ENV_PATH = ".env.local";
const LEGACY_ENV_PATHS: readonly string[] = ["apps/web/.env.local", "packages/backend/.env.local"];

const OLD_ROOT_DEV = "nx run-many -t dev";
const ROOT_DEV = 'convex dev --start "nx run-many -t dev"';
const OLD_BACKEND_DEV = 'bun run --parallel "dev:*"';

type JsonObject = Record<string, unknown>;

export default function convexWorkspaceLifecycle050(tree: Tree) {
  rejectLegacyLocalState(tree);

  const rootPackage = readJson<JsonObject>(tree, ROOT_PACKAGE_PATH);
  const backendPackage = readJson<JsonObject>(tree, BACKEND_PACKAGE_PATH);
  const webPackage = readJson<JsonObject>(tree, WEB_PACKAGE_PATH);
  const convexConfig = readOptionalJson(tree, CONVEX_CONFIG_PATH);
  const viteConfig = readRequiredText(tree, VITE_CONFIG_PATH);
  const envModule = readRequiredText(tree, ENV_MODULE_PATH);
  const router = readRequiredText(tree, ROUTER_PATH);
  const gitignore = tree.read(".gitignore", "utf-8") ?? "";

  const migratedRootPackage = migrateRootPackage(rootPackage, webPackage);
  const migratedBackendPackage = migrateBackendPackage(backendPackage);
  const migratedConvexConfig = mergeConvexConfig(convexConfig);
  const migratedViteConfig = migrateViteConfig(viteConfig);
  const migratedEnvModule = migrateEnvModule(envModule);
  const migratedRouter = migrateRouter(router);
  const migratedGitignore = addRootEnvIgnore(gitignore);

  writeWhenChanged(tree, ROOT_PACKAGE_PATH, rootPackage, migratedRootPackage);
  writeWhenChanged(tree, BACKEND_PACKAGE_PATH, backendPackage, migratedBackendPackage);
  writeWhenChanged(tree, CONVEX_CONFIG_PATH, convexConfig, migratedConvexConfig);
  writeTextWhenChanged(tree, VITE_CONFIG_PATH, viteConfig, migratedViteConfig);
  writeTextWhenChanged(tree, ENV_MODULE_PATH, envModule, migratedEnvModule);
  writeTextWhenChanged(tree, ROUTER_PATH, router, migratedRouter);
  writeTextWhenChanged(tree, ".gitignore", gitignore, migratedGitignore);
}

function migrateRootPackage(rootPackage: JsonObject, webPackage: JsonObject) {
  const scripts = readObject(rootPackage, "scripts", ROOT_PACKAGE_PATH);
  const currentDev = scripts.dev;
  if (currentDev !== OLD_ROOT_DEV && currentDev !== ROOT_DEV) throwConflict(ROOT_PACKAGE_PATH, "scripts.dev");

  const webDependencies = readObject(webPackage, "dependencies", WEB_PACKAGE_PATH);
  const tanstackStartVersion = webDependencies["@tanstack/react-start"];
  if (typeof tanstackStartVersion !== "string") throwConflict(WEB_PACKAGE_PATH, "dependencies.@tanstack/react-start");

  const devDependencies = readOptionalObject(rootPackage, "devDependencies", ROOT_PACKAGE_PATH);
  mergeDependency(devDependencies, "convex", packageVersions.convex, ROOT_PACKAGE_PATH);
  mergeDependency(devDependencies, "@tanstack/react-start", tanstackStartVersion, ROOT_PACKAGE_PATH);

  return {
    ...rootPackage,
    devDependencies: sortRecord(devDependencies),
    scripts: { ...scripts, dev: ROOT_DEV },
  };
}

function migrateBackendPackage(backendPackage: JsonObject) {
  const scripts = readObject(backendPackage, "scripts", BACKEND_PACKAGE_PATH);
  if (scripts.dev !== OLD_BACKEND_DEV && scripts.dev !== "confect dev") throwConflict(BACKEND_PACKAGE_PATH, "scripts.dev");
  if (scripts["dev:confect"] !== undefined && scripts["dev:confect"] !== "confect dev")
    throwConflict(BACKEND_PACKAGE_PATH, "scripts.dev:confect");
  if (scripts["dev:convex"] !== undefined && scripts["dev:convex"] !== "convex dev")
    throwConflict(BACKEND_PACKAGE_PATH, "scripts.dev:convex");

  const remainingScripts = { ...scripts };
  Reflect.deleteProperty(remainingScripts, "dev:confect");
  Reflect.deleteProperty(remainingScripts, "dev:convex");
  return { ...backendPackage, scripts: { ...remainingScripts, dev: "confect dev" } };
}

function mergeConvexConfig(config: JsonObject) {
  const { functions } = config;
  if (functions !== undefined && functions !== "packages/backend/convex") throwConflict(CONVEX_CONFIG_PATH, "functions");
  return {
    $schema: "./node_modules/convex/schemas/convex.schema.json",
    ...config,
    functions: "packages/backend/convex",
  };
}

function migrateViteConfig(source: string) {
  if (/\benvDir\s*:/u.test(source)) {
    if (!/\benvDir\s*:\s*["']\.\.\/\.\.["']/u.test(source)) throwConflict(VITE_CONFIG_PATH, "envDir");
    return source;
  }

  return replaceRequired(source, "const config = defineConfig({", 'const config = defineConfig({\n  envDir: "../..",', VITE_CONFIG_PATH);
}

function migrateEnvModule(source: string) {
  if (source.includes("export const getPublicEnv = () => S.decodeUnknownSync(sPublicEnv)(import.meta.env);")) return source;
  return replaceRequired(
    source,
    "export const publicEnv = S.decodeUnknownSync(sPublicEnv)(import.meta.env);",
    "export const getPublicEnv = () => S.decodeUnknownSync(sPublicEnv)(import.meta.env);",
    ENV_MODULE_PATH
  );
}

function migrateRouter(source: string) {
  if (source.includes('import { getPublicEnv } from "./config/env.ts";') && source.includes("getPublicEnv().VITE_CONVEX_URL"))
    return source;

  const migratedImport = replaceRequired(
    source,
    'import { publicEnv } from "./config/env.ts";',
    'import { getPublicEnv } from "./config/env.ts";',
    ROUTER_PATH
  );
  return replaceRequired(migratedImport, "publicEnv.VITE_CONVEX_URL", "getPublicEnv().VITE_CONVEX_URL", ROUTER_PATH);
}

function rejectLegacyLocalState(tree: Tree) {
  const legacy = LEGACY_ENV_PATHS.filter((path) => tree.exists(path));
  if (legacy.length === 0) return;

  throw new Error(
    `Legacy package-local state exists at ${legacy.join(", ")}. Preserve any non-Convex values according to their owning integration, move the legacy file aside, and rerun the Keenko migration. Then run bun run dev so Convex creates or maintains deployment-derived values in ${ROOT_ENV_PATH}; do not create that file or copy a Convex URL from the dashboard.`
  );
}

function addRootEnvIgnore(source: string) {
  if (/^\/?\.env\.local$/mu.test(source)) return source;
  const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
  return `${source}${separator}/.env.local\n`;
}

function mergeDependency(target: JsonObject, name: string, expected: string, path: string) {
  if (target[name] !== undefined && target[name] !== expected) throwConflict(path, `devDependencies.${name}`);
  target[name] = expected;
}

function sortRecord(source: JsonObject) {
  return Object.fromEntries(Object.entries(source).toSorted(([left], [right]) => left.localeCompare(right)));
}

function readRequiredText(tree: Tree, path: string) {
  const value = tree.read(path, "utf-8");
  if (value === null) throw new Error(`Required Keenko baseline file ${path} is missing.`);
  return value;
}

function readOptionalJson(tree: Tree, path: string): JsonObject {
  return tree.exists(path) ? readJson<JsonObject>(tree, path) : {};
}

function readObject(source: JsonObject, key: string, path: string) {
  const value = source[key];
  if (!isJsonObject(value)) throwConflict(path, key);
  return { ...value };
}

function readOptionalObject(source: JsonObject, key: string, path: string) {
  const value = source[key];
  if (value === undefined) return {};
  if (!isJsonObject(value)) throwConflict(path, key);
  return { ...value };
}

function replaceRequired(source: string, before: string, after: string, path: string) {
  const migrated = source.replace(before, after);
  if (migrated === source) throwConflict(path, "Keenko Convex lifecycle baseline");
  return migrated;
}

function writeWhenChanged(tree: Tree, path: string, before: JsonObject, after: JsonObject) {
  if (before !== after) writeJson(tree, path, after);
}

function writeTextWhenChanged(tree: Tree, path: string, before: string, after: string) {
  if (before !== after) tree.write(path, after);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwConflict(path: string, key: string): never {
  throw new Error(
    `Keenko-owned value ${key} in ${path} conflicts with the 0.5.0 Convex workspace lifecycle. Reconcile that project-owned value manually, then rerun the Keenko migration.`
  );
}
