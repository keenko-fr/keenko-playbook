import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Option as O, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { packageVersions } from "../generators/versions.js";

// POLICY ---------------------------------------------------------------------------------------------------------------------------------
export const prereleaseChannels = {
  "@confect/cli": "next",
  "@confect/core": "next",
  "@confect/server": "next",
  "@effect/platform-node": "rc",
  effect: "rc",
};

// npm latest is incompatible with another member of the fixed tuple. Re-evaluate these holds whenever the named constraint changes.
export const compatibilityVersionOverrides = {
  "@nx/devkit": "23.2.0",
  "@nx/oxlint": "23.2.0",
  nx: "23.2.0",
  oxlint: "1.82.0",
  typescript: "6.0.2",
};

const alignedRootPackages = {
  "@nx/js": "nx",
} satisfies Record<string, keyof typeof packageVersions>;

// ERRORS ----------------------------------------------------------------------------------------------------------------------------------
const sDependencyUpdateIssue = S.Literals([
  "invalid_manifest",
  "invalid_version",
  "invalid_versions_source",
  "lockfile_refresh_failed",
  "registry_resolution_failed",
]);

export class DependencyUpdateFailure extends S.TaggedError<DependencyUpdateFailure>()("DependencyUpdateFailure", {
  channel: S.optional(S.String),
  issue: sDependencyUpdateIssue,
  packageName: S.optional(S.String),
  value: S.optional(S.String),
}) {
  override get message() {
    const target = O.getOrElse(O.fromNullishOr(this.packageName), () => "dependency update");
    const selector = O.getOrElse(O.fromNullishOr(this.channel), () => "unknown selector");
    return `${this.issue}: ${target} (${selector})`;
  }
}

export type RegistryResolver = (
  packageName: string,
  channel: string
) => E.Effect<string, DependencyUpdateFailure, ChildProcessSpawner.ChildProcessSpawner>;

const semverPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export const isExactPackageVersion = (value: string) => semverPattern.test(value) || isExactAlias(value);

const isExactAlias = (value: string) =>
  parseAlias(value).pipe(
    O.match({
      onNone: () => false,
      onSome: ({ version }) => semverPattern.test(version),
    })
  );

const parseAlias = (value: string) => {
  if (!value.startsWith("npm:")) return O.none<{ packageName: string; version: string }>();

  const separator = value.lastIndexOf("@");
  if (separator <= 4) return O.none<{ packageName: string; version: string }>();

  return O.some({ packageName: value.slice(4, separator), version: value.slice(separator + 1) });
};

// REGISTRY -------------------------------------------------------------------------------------------------------------------------------
const sDistTags = S.fromJsonString(S.Record(S.String, S.String));

export const resolveRegistryVersion: RegistryResolver = E.fn("keenko.deps.resolveRegistryVersion")(function* (packageName, channel) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const output = yield* spawner
    .string(ChildProcess.make("bun", ["pm", "view", packageName, "dist-tags", "--json"]), { includeStderr: true })
    .pipe(E.mapError(() => new DependencyUpdateFailure({ channel, issue: "registry_resolution_failed", packageName })));

  const distTags = yield* S.decodeEffect(sDistTags)(output).pipe(
    E.mapError(() => new DependencyUpdateFailure({ channel, issue: "registry_resolution_failed", packageName }))
  );

  const version = yield* E.fromOption(
    O.fromNullishOr(distTags[channel]),
    () => new DependencyUpdateFailure({ channel, issue: "registry_resolution_failed", packageName })
  );

  if (!semverPattern.test(version))
    return yield* new DependencyUpdateFailure({ channel, issue: "invalid_version", packageName, value: version });

  return version;
});

// UPDATE ---------------------------------------------------------------------------------------------------------------------------------
export const updateDependencySources = E.fn("keenko.deps.updateSources")(function* (
  workspace: string,
  currentVersions: Readonly<Record<string, string>>,
  resolveVersion: RegistryResolver
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const versionsPath = path.join(workspace, "src/generators/versions.ts");
  const manifestPath = path.join(workspace, "package.json");

  const updates: Record<string, string> = {};

  for (const [packageName, current] of Object.entries(currentVersions)) {
    const alias = parseAlias(current);
    const registryPackage = O.getOrElse(
      O.map(alias, ({ packageName: name }) => name),
      () => packageName
    );
    const channel = O.getOrElse(findConfiguredValue(prereleaseChannels, packageName), () => "latest");
    const override = findConfiguredValue(compatibilityVersionOverrides, packageName);
    const version = O.isSome(override) ? override.value : yield* resolveVersion(registryPackage, channel);

    if (!semverPattern.test(version))
      return yield* new DependencyUpdateFailure({ channel, issue: "invalid_version", packageName: registryPackage, value: version });

    updates[packageName] = O.isNone(alias) ? version : `npm:${registryPackage}@${version}`;
  }

  const versionsSource = yield* fs.readFileString(versionsPath);
  const nextVersionsSource = yield* replacePackageVersions(versionsSource, updates);
  const manifestSource = yield* fs.readFileString(manifestPath);
  const manifest = yield* parseManifest(manifestSource);
  const nextManifestSource = yield* alignManifest(manifestSource, manifest, updates);

  yield* fs.writeFileString(versionsPath, nextVersionsSource);
  yield* fs.writeFileString(manifestPath, nextManifestSource);

  return updates;
});

export const updateDependencies = E.fn("keenko.deps.update")(function* (workspace: string) {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const updates = yield* updateDependencySources(workspace, packageVersions, resolveRegistryVersion);
  const exitCode = yield* spawner
    .exitCode(ChildProcess.make("bun", ["install"], { cwd: path.resolve(workspace) }))
    .pipe(E.mapError(() => new DependencyUpdateFailure({ issue: "lockfile_refresh_failed" })));

  if (exitCode !== 0) return yield* new DependencyUpdateFailure({ issue: "lockfile_refresh_failed", value: String(exitCode) });

  return updates;
});

// INTERNALS -------------------------------------------------------------------------------------------------------------------------------
const replacePackageVersions = (source: string, versions: Readonly<Record<string, string>>) => {
  const blockPattern = /export const packageVersions = \{[\s\S]*?\n\} satisfies Record<string, string>;/u;

  if (!blockPattern.test(source)) return E.fail(new DependencyUpdateFailure({ issue: "invalid_versions_source" }));

  const entries = Object.entries(versions).map(([packageName, version]) => {
    const key = /^[A-Za-z_$][\w$]*$/u.test(packageName) ? packageName : encodeJsonString(packageName);
    return `  ${key}: ${encodeJsonString(version)},`;
  });

  return E.succeed(
    source.replace(blockPattern, `export const packageVersions = {\n${entries.join("\n")}\n} satisfies Record<string, string>;`)
  );
};

const sManifest = S.fromJsonString(S.Struct({ dependencies: S.Record(S.String, S.String), devDependencies: S.Record(S.String, S.String) }));

type Manifest = typeof sManifest.Type;

const parseManifest = (source: string) =>
  S.decodeEffect(sManifest)(source).pipe(E.mapError(() => new DependencyUpdateFailure({ issue: "invalid_manifest" })));

const encodeJsonString = S.encodeSync(S.fromJsonString(S.String));

const findConfiguredValue = (configuration: Readonly<Record<string, string>>, packageName: string) =>
  O.map(
    O.fromIterable(Object.entries(configuration).filter(([configuredPackage]) => configuredPackage === packageName)),
    ([, configuredValue]) => configuredValue
  );

const alignManifest = E.fn("keenko.deps.alignManifest")(function* (
  source: string,
  manifest: Manifest,
  versions: Readonly<Record<string, string>>
) {
  let next = source;

  for (const [packageName, version] of Object.entries(versions)) {
    if (packageName in manifest.dependencies) next = yield* replaceManifestVersion(next, "dependencies", packageName, version);
    if (packageName in manifest.devDependencies) next = yield* replaceManifestVersion(next, "devDependencies", packageName, version);
  }

  for (const [packageName, sourcePackage] of Object.entries(alignedRootPackages))
    if (packageName in manifest.devDependencies)
      next = yield* replaceManifestVersion(next, "devDependencies", packageName, versions[sourcePackage]);

  return next;
});

const replaceManifestVersion = E.fn("keenko.deps.replaceManifestVersion")(function* (
  source: string,
  section: "dependencies" | "devDependencies",
  packageName: string,
  version: string
) {
  const sectionStart = source.indexOf(`${encodeJsonString(section)}: {`);
  const sectionEnd = source.indexOf("\n  }", sectionStart);

  if (sectionStart === -1 || sectionEnd === -1) return yield* new DependencyUpdateFailure({ issue: "invalid_manifest", packageName });

  const before = source.slice(0, sectionStart);
  const body = source.slice(sectionStart, sectionEnd);
  const after = source.slice(sectionEnd);
  const escapedPackage = encodeJsonString(packageName).replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const propertyPattern = new RegExp(`(?<prefix>${escapedPackage}\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "u");

  if (!propertyPattern.test(body)) return yield* new DependencyUpdateFailure({ issue: "invalid_manifest", packageName });

  return `${before}${body.replace(propertyPattern, `$<prefix>${encodeJsonString(version)}`)}${after}`;
});

if (import.meta.main)
  NodeRuntime.runMain(
    updateDependencies(".").pipe(
      E.tap((updates) => Console.log(`Updated ${Object.keys(updates).length} compatibility package pins and refreshed bun.lock.`)),
      E.provide(NodeServices.layer)
    )
  );
