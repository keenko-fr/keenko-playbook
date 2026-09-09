import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Path, Ref, Schedule, Schema as S, type Duration } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const packageName = "keenko";
const publicRegistry = "https://registry.npmjs.org";
const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export interface PublishedVersionWaitPolicy {
  readonly interval: Duration.Input;
  readonly maxAttempts: number;
  readonly timeout: Duration.Input;
  readonly timeoutLabel: string;
}

export const publishedVersionWaitPolicy = {
  interval: "10 seconds",
  maxAttempts: 25,
  timeout: "5 minutes",
  timeoutLabel: "5 minutes",
} satisfies PublishedVersionWaitPolicy;

export class RegistryLookupFailure extends S.TaggedError<RegistryLookupFailure>()("RegistryLookupFailure", {
  reason: S.String,
}) {}

export class PublishedVersionUnavailable extends S.TaggedError<PublishedVersionUnavailable>()("PublishedVersionUnavailable", {
  attempts: S.Int,
  lastFailure: S.String,
  maxAttempts: S.Int,
  packageName: S.String,
  timeout: S.String,
  version: S.String,
}) {
  override get message() {
    return `${this.packageName}@${this.version} did not become Bun-installable from ${publicRegistry} within ${this.timeout} (${this.attempts}/${this.maxAttempts} attempts). Last readiness failure: ${this.lastFailure}`;
  }
}

export type RegistryLookup = (name: string, version: string) => E.Effect<string, RegistryLookupFailure, NodeServices.NodeServices>;

export interface ExactPackageInstall {
  readonly cacheDirectory: string;
  readonly directory: string;
  readonly name: string;
  readonly version: string;
}

export type ExactPackageInstaller = (request: ExactPackageInstall) => E.Effect<void, RegistryLookupFailure, NodeServices.NodeServices>;

const installExactPackage: ExactPackageInstaller = E.fn("keenko.release.installExactPackage")(
  function* ({ cacheDirectory, directory, name, version }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const outputFile = path.join(directory, "bun-install-output.log");
    const child = yield* spawner.spawn(
      ChildProcess.make(
        "/bin/sh",
        [
          "-c",
          'output=$1; shift; exec "$@" >"$output" 2>&1',
          "keenko-publication-probe",
          outputFile,
          "bun",
          "install",
          "--ignore-scripts",
          "--no-progress",
          "--registry",
          publicRegistry,
          "--cache-dir",
          cacheDirectory,
        ],
        {
          cwd: directory,
          env: {
            BUN_CONFIG_REGISTRY: publicRegistry,
            BUN_INSTALL_CACHE_DIR: cacheDirectory,
            NPM_CONFIG_REGISTRY: publicRegistry,
          },
          extendEnv: true,
        }
      )
    );
    const exitCode = yield* child.exitCode;
    if (exitCode !== 0)
      return yield* new RegistryLookupFailure({
        reason: `Bun could not install ${name}@${version} (exit code ${exitCode}):\n${(yield* fs.readFileString(outputFile)).slice(-16_000)}`,
      });
  },
  E.scoped,
  E.mapError((error) =>
    S.is(RegistryLookupFailure)(error)
      ? error
      : new RegistryLookupFailure({ reason: `Bun could not run the ${packageName} install probe: ${String(error)}` })
  )
);

const sInstalledPackage = S.fromJsonString(S.Struct({ version: S.String }));
const sProbeManifest = S.fromJsonString(S.Struct({ dependencies: S.Record(S.String, S.String), private: S.Boolean }));

export const resolvePublicRegistryVersion = E.fn("keenko.release.resolvePublicRegistryVersion")(
  function* (name: string, version: string, install: ExactPackageInstaller = installExactPackage) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "keenko-publication-probe-" });
    const cacheDirectory = path.join(directory, "bun-cache");
    yield* fs.writeFileString(
      path.join(directory, "package.json"),
      yield* S.encodeEffect(sProbeManifest)({ dependencies: { [name]: version }, private: true })
    );
    yield* install({ cacheDirectory, directory, name, version });

    return yield* S.decodeEffect(sInstalledPackage)(
      yield* fs.readFileString(path.join(directory, "node_modules", name, "package.json"))
    ).pipe(E.map((manifest) => manifest.version));
  },
  E.scoped,
  E.mapError((error) =>
    S.is(RegistryLookupFailure)(error)
      ? error
      : new RegistryLookupFailure({ reason: `Could not verify the installed package: ${String(error)}` })
  )
);

export const waitForPublishedVersion = E.fn("keenko.release.waitForPublishedVersion")(function* (
  version: string,
  lookup: RegistryLookup = resolvePublicRegistryVersion,
  policy: PublishedVersionWaitPolicy = publishedVersionWaitPolicy
) {
  const attempts = yield* Ref.make(0);
  const lookupExactVersion = E.gen(function* () {
    yield* Ref.update(attempts, (count) => count + 1);
    const resolvedVersion = yield* lookup(packageName, version);

    if (resolvedVersion !== version)
      return yield* new RegistryLookupFailure({
        reason: `Bun installed ${packageName}@${resolvedVersion} instead of ${packageName}@${version}`,
      });

    return resolvedVersion;
  }).pipe(
    E.tapError((failure) => Console.log(`Attempt failed for ${packageName}@${version}: ${failure.reason}`)),
    E.retry(Schedule.max([Schedule.spaced(policy.interval), Schedule.recurs(policy.maxAttempts - 1)])),
    E.timeout(policy.timeout)
  );

  return yield* lookupExactVersion.pipe(
    E.catch((error) =>
      E.gen(function* () {
        const attemptCount = yield* Ref.get(attempts);
        const lastFailure = error._tag === "RegistryLookupFailure" ? error.reason : `Hard timeout of ${policy.timeoutLabel} elapsed`;
        return yield* new PublishedVersionUnavailable({
          attempts: attemptCount,
          lastFailure,
          maxAttempts: policy.maxAttempts,
          packageName,
          timeout: policy.timeoutLabel,
          version,
        });
      })
    )
  );
});

const invalidVersionArgument = new PublishedVersionUnavailable({
  attempts: 0,
  lastFailure: "Expected one exact SemVer argument",
  maxAttempts: publishedVersionWaitPolicy.maxAttempts,
  packageName,
  timeout: publishedVersionWaitPolicy.timeoutLabel,
  version: "<invalid>",
});

const readVersionArgument = (args: readonly string[]): E.Effect<string, PublishedVersionUnavailable> =>
  S.decodeUnknownEffect(S.Tuple([S.String]))(args).pipe(
    E.mapError(() => invalidVersionArgument),
    E.flatMap(([version]) => (exactSemver.test(version) ? E.succeed(version) : E.fail(invalidVersionArgument)))
  );

if (import.meta.main)
  NodeRuntime.runMain(
    // oxlint-disable-next-line effect/noGlobals -- process arguments are the release-wait command boundary.
    readVersionArgument(process.argv.slice(2)).pipe(
      E.flatMap((version) => waitForPublishedVersion(version)),
      E.tap((version) => Console.log(`Bun can install ${packageName}@${version} from ${publicRegistry}.`)),
      E.provide(NodeServices.layer)
    )
  );
