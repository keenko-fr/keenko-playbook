import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Option as O, Path, type PlatformError, Schema as S, type Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { packageVersions, runtimeVersions } from "../generators/versions.js";

// POLICY ---------------------------------------------------------------------------------------------------------------------------------
export const prereleaseChannels = {
  "@confect/cli": "next",
  "@confect/core": "next",
  "@confect/server": "next",
  "@confect/test": "next",
  "@effect/platform-node": "rc",
  effect: "rc",
};

// npm latest is incompatible with another member of the fixed tuple. Re-evaluate these holds whenever the named constraint changes.
export const compatibilityVersionOverrides = {
  "@nx/devkit": "23.2.1",
  "@nx/oxlint": "23.2.1",
  nx: "23.2.1",
  // Newer Oxlint releases are incompatible with the current Effect/TSGo integration.
  oxlint: "1.82.0",
  typescript: "6.0.2",
  vitest: "4.0.18",
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
  command: S.optional(S.String),
  exitCode: S.optional(S.Finite),
  installerOutput: S.optional(S.String),
  issue: sDependencyUpdateIssue,
  packageName: S.optional(S.String),
  rollbackError: S.optional(S.String),
  selector: S.optional(S.String),
  value: S.optional(S.String),
}) {
  override get message() {
    const target = O.getOrElse(O.fromNullishOr(this.packageName), () => "dependency update");
    const selector = O.getOrElse(O.fromNullishOr(this.selector), () => "unknown selector");
    const command = O.match(O.fromNullishOr(this.command), { onNone: () => "", onSome: (value) => `\ncommand: ${value}` });
    const exitCode = O.match(O.fromNullishOr(this.exitCode), { onNone: () => "", onSome: (value) => `\nexit code: ${value}` });
    const output = O.match(O.fromNullishOr(this.installerOutput), {
      onNone: () => "",
      onSome: (value) => `\ninstaller output:\n${value}`,
    });
    const rollback = O.match(O.fromNullishOr(this.rollbackError), {
      onNone: () => "",
      onSome: (value) => `\nrollback error: ${value}`,
    });
    return `${this.issue}: ${target} (${selector})${command}${exitCode}${output}${rollback}`;
  }
}

export type RegistryResolver = (
  packageName: string,
  selector: string
) => E.Effect<string, DependencyUpdateFailure, ChildProcessSpawner.ChildProcessSpawner>;

export interface LockfileRefreshResult {
  readonly exitCode: number;
  readonly output: string;
}

export type LockfileRefresher = (
  workspace: string
) => E.Effect<LockfileRefreshResult, DependencyUpdateFailure | PlatformError.PlatformError, NodeServices.NodeServices | Scope.Scope>;

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
const sRegistryVersion = S.fromJsonString(S.String);

export const resolveRegistryVersion: RegistryResolver = E.fn("keenko.deps.resolveRegistryVersion")(function* (packageName, selector) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const output = yield* spawner
    .string(ChildProcess.make("bun", ["pm", "view", `${packageName}@${selector}`, "version", "--json"]), {
      includeStderr: true,
    })
    .pipe(E.mapError(() => new DependencyUpdateFailure({ issue: "registry_resolution_failed", packageName, selector })));

  const version = yield* S.decodeEffect(sRegistryVersion)(output).pipe(
    E.mapError(() => new DependencyUpdateFailure({ issue: "registry_resolution_failed", packageName, selector }))
  );

  if (!semverPattern.test(version))
    return yield* new DependencyUpdateFailure({ issue: "invalid_version", packageName, selector, value: version });

  return version;
});

const nodeMajorFromRange = (nodeRange: string) => {
  const match = /^>=(?<major>[1-9]\d*)\.\d+(?:\.\d+)? <(?<upper>[1-9]\d*)$/u.exec(nodeRange);
  const major = Number(match?.groups?.major);
  const upper = Number(match?.groups?.upper);

  return Number.isSafeInteger(major) && upper === major + 1
    ? E.succeed(String(major))
    : E.fail(
        new DependencyUpdateFailure({
          issue: "invalid_version",
          packageName: "@types/node",
          selector: "runtimeVersions.nodeRange",
          value: nodeRange,
        })
      );
};

// UPDATE ---------------------------------------------------------------------------------------------------------------------------------
export const updateDependencySources = E.fn("keenko.deps.updateSources")(function* (
  workspace: string,
  currentVersions: Readonly<Record<string, string>>,
  resolveVersion: RegistryResolver,
  currentRuntimeVersions: Readonly<Record<string, string>> = runtimeVersions
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
    const selector =
      packageName === "@types/node"
        ? yield* nodeMajorFromRange(currentRuntimeVersions.nodeRange ?? "")
        : O.getOrElse(findConfiguredValue(prereleaseChannels, packageName), () => "latest");
    const override = findConfiguredValue(compatibilityVersionOverrides, packageName);
    const version = O.isSome(override) ? override.value : yield* resolveVersion(registryPackage, selector);

    if (!semverPattern.test(version))
      return yield* new DependencyUpdateFailure({ issue: "invalid_version", packageName: registryPackage, selector, value: version });

    if (packageName === "@types/node" && !version.startsWith(`${selector}.`))
      return yield* new DependencyUpdateFailure({ issue: "invalid_version", packageName, selector, value: version });

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

const refreshLockfile: LockfileRefresher = E.fn("keenko.deps.refreshLockfile")(function* (workspace) {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(ChildProcess.make("bun", ["install"], { cwd: path.resolve(workspace) })).pipe(
    E.mapError(
      (error) =>
        new DependencyUpdateFailure({
          command: "bun install",
          installerOutput: String(error),
          issue: "lockfile_refresh_failed",
        })
    )
  );
  const [output, exitCode] = yield* E.all([Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode], {
    concurrency: "unbounded",
  }).pipe(
    E.mapError(
      (error) =>
        new DependencyUpdateFailure({
          command: "bun install",
          installerOutput: String(error),
          issue: "lockfile_refresh_failed",
        })
    )
  );

  return { exitCode, output };
});

interface FileSnapshot {
  readonly contents: O.Option<string>;
  readonly exists: boolean;
  readonly path: string;
}

const snapshotFiles = E.fn("keenko.deps.snapshotFiles")(function* (paths: readonly string[]) {
  const fs = yield* FileSystem.FileSystem;
  const snapshots: FileSnapshot[] = [];

  for (const path of paths) {
    const exists = yield* fs.exists(path);
    snapshots.push({ contents: exists ? O.some(yield* fs.readFileString(path)) : O.none(), exists, path });
  }

  return snapshots;
});

const restoreFiles = E.fn("keenko.deps.restoreFiles")(function* (snapshots: readonly FileSnapshot[]) {
  const fs = yield* FileSystem.FileSystem;

  for (const snapshot of snapshots)
    if (snapshot.exists)
      yield* fs.writeFileString(
        snapshot.path,
        O.getOrElse(snapshot.contents, () => "")
      );
    else if (yield* fs.exists(snapshot.path)) yield* fs.remove(snapshot.path);
});

const rollbackInstallFailure = E.fn("keenko.deps.rollbackInstallFailure")(function* (
  snapshots: readonly FileSnapshot[],
  failure: DependencyUpdateFailure
) {
  const rollbackError = yield* restoreFiles(snapshots).pipe(
    E.as(O.none<string>()),
    E.catch((error) => E.succeedSome(String(error)))
  );

  return yield* new DependencyUpdateFailure({
    command: failure.command,
    exitCode: failure.exitCode,
    installerOutput: failure.installerOutput,
    issue: failure.issue,
    packageName: failure.packageName,
    rollbackError: O.getOrUndefined(rollbackError),
    selector: failure.selector,
    value: failure.value,
  });
});

const normalizeInstallFailure = (error: DependencyUpdateFailure | PlatformError.PlatformError) =>
  S.is(DependencyUpdateFailure)(error)
    ? error
    : new DependencyUpdateFailure({
        command: "bun install",
        installerOutput: String(error),
        issue: "lockfile_refresh_failed",
      });

export const updateDependencies = E.fn("keenko.deps.update")(function* (
  workspace: string,
  resolveVersion: RegistryResolver = resolveRegistryVersion,
  refresh: LockfileRefresher = refreshLockfile,
  currentVersions: Readonly<Record<string, string>> = packageVersions,
  currentRuntimeVersions: Readonly<Record<string, string>> = runtimeVersions
) {
  const path = yield* Path.Path;
  const root = path.resolve(workspace);
  const snapshots = yield* snapshotFiles([
    path.join(root, "src/generators/versions.ts"),
    path.join(root, "package.json"),
    path.join(root, "bun.lock"),
  ]);
  const updates = yield* updateDependencySources(root, currentVersions, resolveVersion, currentRuntimeVersions);
  const result = yield* E.scoped(refresh(root)).pipe(E.catch((error) => rollbackInstallFailure(snapshots, normalizeInstallFailure(error))));

  if (result.exitCode !== 0)
    return yield* rollbackInstallFailure(
      snapshots,
      new DependencyUpdateFailure({
        command: "bun install",
        exitCode: result.exitCode,
        installerOutput: result.output,
        issue: "lockfile_refresh_failed",
      })
    );

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
