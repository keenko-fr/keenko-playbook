/* oxlint-disable effect/noNewError, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, effect/noUnsafeDictionaryType, eslint/curly, eslint/prefer-destructuring, eslint/prefer-named-capture-group, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- Native Nx migrations are synchronous Tree transforms over untyped project state and report deliberate conflicts by throwing. */
import { formatFiles, updateJson, type Tree } from "@nx/devkit";

type JsonObject = Record<string, unknown>;

const oldRouteTreePath = "apps/web/src/routeTree.gen.ts";
const applicationRouteTreePath = ":(glob)apps/*/src/routeTree.gen.ts";
const oldAppFiles = /files:\s*\[["']apps\/web\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const applicationFiles = /files:\s*\[["']apps\/\*\*\/\*\.\{ts,tsx\}["']\]/u;
const dependencyConstraint = /\{[^{}]*\}/gu;
const applicationTargetTags = ["scope:backend", "scope:shared", "scope:ui"];
const oldHostedUi = "/(?:authkit|workos)/u";
const oldBaseUrl = /(\s*)const baseUrl = process\.env\.AUTH_E2E_BASE_URL \?\? ["']http:\/\/localhost:3210["'];/u;
const oldHostedUiRequest = /\/\(\?:authkit\|workos\)\/u\.test\(request\.url\(\)\)/u;
const oldHostedUiWait = "page.waitForURL(/(?:authkit|workos)/u)";
const oldHostedUiExpectation = "await expect(page).toHaveURL(/(?:authkit|workos)/u);";
const applicationOriginDeclaration = "const applicationOrigin = new URL(baseUrl).origin;";
const hostedUiRequestByOrigin = "isOutsideApplicationOrigin(request.url())";
const hostedUiWaitByOrigin = "page.waitForURL((url) => url.origin !== applicationOrigin)";
const hostedUiExpectationByOrigin = "expect(new URL(page.url()).origin).not.toBe(applicationOrigin);";

export default function applicationWorkspaces102(tree: Tree) {
  const authSmokeMigration = planAuthSmokeMigration(tree);
  const oxlintMigration = planOxlintMigration(tree);
  migrateVitestDiscovery(tree);
  migrateGeneratedDrift(tree);
  migrateApplicationTags(tree);
  migrateContinuousTargets(tree);
  if (authSmokeMigration !== undefined) tree.write(authSmokeMigration.path, authSmokeMigration.source);
  if (oxlintMigration !== undefined) tree.write(oxlintMigration.path, oxlintMigration.source);
  return formatFiles(tree);
}

function migrateApplicationTags(tree: Tree) {
  for (const workspace of tree.children("apps")) {
    const path = `apps/${workspace}/package.json`;
    if (!tree.exists(path)) continue;
    updateJson<JsonObject>(tree, path, (packageJson) => {
      const nx = packageJson.nx;
      if (nx === undefined) {
        packageJson.nx = { tags: ["type:app"] };
        return packageJson;
      }
      if (!isObject(nx)) return conflict(path, "nx application metadata");
      const tags = nx.tags;
      if (tags === undefined) {
        nx.tags = ["type:app"];
        return packageJson;
      }
      if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) return conflict(path, "nx.tags");
      if (tags.some((tag) => tag.startsWith("type:") && tag !== "type:app")) return conflict(path, "nx.tags application classification");
      if (!tags.includes("type:app")) tags.push("type:app");
      return packageJson;
    });
  }
}

function migrateVitestDiscovery(tree: Tree) {
  updateJson<JsonObject>(tree, "nx.json", (nxJson) => {
    const plugins = nxJson.plugins;
    if (!Array.isArray(plugins)) return conflict("nx.json", "@nx/vitest plugin configuration");
    const candidates = plugins.filter((entry) => {
      if (
        !isObject(entry) ||
        entry.plugin !== "@nx/vitest" ||
        !isObject(entry.options) ||
        entry.options.testMode !== "run" ||
        entry.options.testTargetName !== "test"
      )
        return false;
      const exclusions = entry.exclude;
      return (
        Array.isArray(exclusions) &&
        exclusions.every((exclusion) => typeof exclusion === "string") &&
        (exclusions.includes("apps/web/vite.config.ts") || exclusions.includes("apps/*/vite.config.ts"))
      );
    });
    if (candidates.length !== 1) return conflict("nx.json", "@nx/vitest plugin ownership");
    const plugin = candidates[0];
    if (plugin === undefined) return conflict("nx.json", "@nx/vitest plugin configuration");
    const exclusions = plugin.exclude;
    if (!Array.isArray(exclusions) || exclusions.some((entry) => typeof entry !== "string"))
      return conflict("nx.json", "@nx/vitest exclude");
    if (exclusions.includes("apps/*/vite.config.ts")) return nxJson;
    const legacyIndex = exclusions.indexOf("apps/web/vite.config.ts");
    if (legacyIndex === -1) return conflict("nx.json", "@nx/vitest exclude");
    exclusions[legacyIndex] = "apps/*/vite.config.ts";
    return nxJson;
  });
}

function migrateGeneratedDrift(tree: Tree) {
  updateJson<JsonObject>(tree, "package.json", (packageJson) => {
    const scripts = packageJson.scripts;
    if (!isObject(scripts) || typeof scripts.check !== "string") return conflict("package.json", "scripts.check");
    if (scripts.check.includes(applicationRouteTreePath)) return packageJson;
    if (!scripts.check.includes(oldRouteTreePath)) return conflict("package.json", "scripts.check generated route-tree path");
    scripts.check = scripts.check.replace(oldRouteTreePath, applicationRouteTreePath);
    return packageJson;
  });
}

function planOxlintMigration(tree: Tree) {
  const path = "oxlint.config.ts";
  const source = tree.read(path, "utf-8");
  if (source === null) return conflict(path, "application lint and boundary policy");
  const filesCompliant = applicationFiles.test(source);
  const constraints = [...source.matchAll(dependencyConstraint)].map((match) => match[0]);
  const newBoundaries = constraints.filter((constraint) => isApplicationBoundary(constraint, "type:app"));
  const oldBoundaries = constraints.filter((constraint) => isApplicationBoundary(constraint, "scope:web"));
  if (newBoundaries.length > 1 || (newBoundaries.length === 0 && oldBoundaries.length !== 1))
    return conflict(path, "application dependency boundary");
  const boundaryCompliant = newBoundaries.length === 1;
  if (filesCompliant && boundaryCompliant) return;
  if (!filesCompliant && !oldAppFiles.test(source)) return conflict(path, "application lint and boundary policy");
  const migratedBoundary = boundaryCompliant
    ? source
    : source.replace(oldBoundaries[0] ?? "", (constraint) =>
        constraint.replace(/sourceTag:\s*(["'])scope:web\1/u, 'sourceTag: "type:app"')
      );
  return { path, source: migratedBoundary.replace(oldAppFiles, 'files: ["apps/**/*.{ts,tsx}"]') };
}

function isApplicationBoundary(constraint: string, sourceTag: string) {
  const source = /sourceTag:\s*["']([^"']+)["']/u.exec(constraint)?.[1];
  const targets = /onlyDependOnLibsWithTags:\s*\[([^\]]*)\]/u.exec(constraint)?.[1];
  if (source !== sourceTag || targets === undefined) return false;
  const tags = [...targets.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1]).toSorted();
  return tags.length === applicationTargetTags.length && tags.every((tag, index) => tag === applicationTargetTags[index]);
}

function migrateContinuousTargets(tree: Tree) {
  for (const root of ["apps", "packages"]) {
    for (const workspace of tree.children(root)) {
      const path = `${root}/${workspace}/package.json`;
      if (!tree.exists(path)) continue;
      updateJson<JsonObject>(tree, path, (packageJson) => {
        const scripts = packageJson.scripts;
        if (!isObject(scripts) || typeof scripts.dev !== "string") return packageJson;
        const nx = packageJson.nx;
        if (!isObject(nx) || !isContinuousWorkspace(nx.tags)) return packageJson;
        const targets = isObject(nx.targets) ? nx.targets : (nx.targets = {});
        const dev = targets.dev;
        if (dev === undefined) {
          targets.dev = { continuous: true };
          return packageJson;
        }
        if (!isObject(dev) || (dev.continuous !== undefined && dev.continuous !== true)) return conflict(path, "nx.targets.dev.continuous");
        dev.continuous = true;
        return packageJson;
      });
    }
  }
}

function planAuthSmokeMigration(tree: Tree) {
  const path = "apps/web/e2e/auth.e2e.ts";
  const source = tree.read(path, "utf-8");
  if (source === null) return;
  if (!source.includes(oldHostedUi)) {
    const newMarkers = [applicationOriginDeclaration, hostedUiRequestByOrigin, hostedUiWaitByOrigin, hostedUiExpectationByOrigin];
    const newMarkerCount = newMarkers.filter((marker) => source.includes(marker)).length;
    if (newMarkerCount > 0 && newMarkerCount !== newMarkers.length) return conflict(path, "Hosted UI transition detection");
    return;
  }
  if (
    !oldBaseUrl.test(source) ||
    !oldHostedUiRequest.test(source) ||
    !source.includes(oldHostedUiWait) ||
    !source.includes(oldHostedUiExpectation)
  )
    return conflict(path, "Hosted UI transition detection");

  const migrated = source
    .replace(
      oldBaseUrl,
      '$1const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";$1const applicationOrigin = new URL(baseUrl).origin;$1const isOutsideApplicationOrigin = (url: string) => new URL(url).origin !== applicationOrigin;'
    )
    .replace(oldHostedUiRequest, hostedUiRequestByOrigin)
    .replace(oldHostedUiWait, hostedUiWaitByOrigin)
    .replace(oldHostedUiExpectation, hostedUiExpectationByOrigin);
  if (migrated.includes(oldHostedUi)) return conflict(path, "Hosted UI transition detection");
  return { path, source: migrated };
}

function isContinuousWorkspace(tags: unknown) {
  return Array.isArray(tags) && (tags.includes("type:app") || tags.includes("scope:backend"));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function conflict(path: string, value: string): never {
  throw new Error(
    `Keenko-owned ${value} in ${path} conflicts with the 1.0.2 application-workspace contract. Reconcile the customization manually, then rerun the Keenko migration.`
  );
}
