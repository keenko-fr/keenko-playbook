/* oxlint-disable effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType -- Native Nx migrations are synchronous Tree transforms over untyped project JSON and report deliberate conflicts by throwing. */
import { formatFiles, readJson, writeJson, type Tree } from "@nx/devkit";

export const OXC_EXTENSION = "oxc.oxc-vscode";

export const canonicalVscodeSettings = {
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "always",
    "source.format.oxc": "always",
  },
  "editor.defaultFormatter": OXC_EXTENSION,
  "editor.formatOnPaste": true,
  "editor.formatOnSave": false,
  "js/ts.experimental.useTsgo": true,
  "js/ts.tsdk.additionalLocations": ["./node_modules/typescript/bin"],
  "js/ts.tsdk.path": "./node_modules/typescript/bin",
  "js/ts.tsdk.promptToUseWorkspaceVersion": true,
};

const SETTINGS_PATH = ".vscode/settings.json";
const EXTENSIONS_PATH = ".vscode/extensions.json";
const [TSDK_LOCATION] = canonicalVscodeSettings["js/ts.tsdk.additionalLocations"];

type JsonObject = Record<string, unknown>;

export default function baseline031(tree: Tree) {
  const packageJson = readJson<JsonObject>(tree, "package.json");
  const settings = readOptionalJson(tree, SETTINGS_PATH);
  const extensions = readOptionalJson(tree, EXTENSIONS_PATH);

  const migratedPackageJson = mergePackageType(packageJson);
  const migratedSettings = mergeSettings(settings);
  const migratedExtensions = mergeExtensions(extensions);

  writeWhenChanged(tree, "package.json", packageJson, migratedPackageJson);
  writeWhenChanged(tree, SETTINGS_PATH, settings, migratedSettings);
  writeWhenChanged(tree, EXTENSIONS_PATH, extensions, migratedExtensions);

  return formatFiles(tree);
}

function mergePackageType(packageJson: JsonObject) {
  if (!Object.hasOwn(packageJson, "type")) return { ...packageJson, type: "module" };
  if (packageJson.type !== "module") throwConflict("package.json", "type");
  return packageJson;
}

function mergeSettings(settings: JsonObject) {
  const merged = { ...settings };
  let changed = false;

  for (const key of [
    "editor.defaultFormatter",
    "editor.formatOnPaste",
    "editor.formatOnSave",
    "js/ts.tsdk.path",
    "js/ts.tsdk.promptToUseWorkspaceVersion",
    "js/ts.experimental.useTsgo",
  ] satisfies readonly (keyof typeof canonicalVscodeSettings)[])
    changed = mergeOwnedScalar(merged, key, canonicalVscodeSettings[key], SETTINGS_PATH) || changed;

  changed = mergeCodeActions(merged) || changed;
  changed = mergeStringArrayEntry(merged, "js/ts.tsdk.additionalLocations", TSDK_LOCATION, SETTINGS_PATH) || changed;

  return changed ? merged : settings;
}

function mergeCodeActions(settings: JsonObject) {
  const key = "editor.codeActionsOnSave";
  const existing = settings[key];
  if (existing === undefined) {
    settings[key] = { ...canonicalVscodeSettings[key] };
    return true;
  }
  if (!isJsonObject(existing)) throwConflict(SETTINGS_PATH, key);

  const merged = { ...existing };
  let changed = false;
  for (const [action, value] of Object.entries(canonicalVscodeSettings[key]))
    changed = mergeOwnedScalar(merged, action, value, `${SETTINGS_PATH}#${key}`) || changed;

  if (changed) settings[key] = merged;
  return changed;
}

function mergeExtensions(extensions: JsonObject) {
  const merged = { ...extensions };
  return mergeStringArrayEntry(merged, "recommendations", OXC_EXTENSION, EXTENSIONS_PATH) ? merged : extensions;
}

function mergeOwnedScalar(target: JsonObject, key: string, expected: unknown, path: string) {
  if (!Object.hasOwn(target, key)) {
    target[key] = expected;
    return true;
  }
  if (target[key] !== expected) throwConflict(path, key);
  return false;
}

function mergeStringArrayEntry(target: JsonObject, key: string, required: string, path: string) {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = [required];
    return true;
  }
  if (!Array.isArray(existing) || existing.some((value) => typeof value !== "string")) throwConflict(path, key);

  let found = false;
  const merged = existing.filter((value) => {
    if (value !== required) return true;
    if (found) return false;
    found = true;
    return true;
  });
  if (!found) merged.push(required);
  if (merged.length === existing.length && found) return false;

  target[key] = merged;
  return true;
}

function readOptionalJson(tree: Tree, path: string): JsonObject {
  return tree.exists(path) ? readJson<JsonObject>(tree, path) : {};
}

function writeWhenChanged(tree: Tree, path: string, before: JsonObject, after: JsonObject) {
  if (before !== after) writeJson(tree, path, after);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwConflict(path: string, key: string): never {
  throw new Error(
    `Keenko-owned value ${key} in ${path} conflicts with the 0.3.1 baseline. Reconcile that project-owned value manually, then rerun the Keenko migration.`
  );
}
