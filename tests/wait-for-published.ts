import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, FileSystem, Path, Option, Ref, Schedule, Schema as S, Stream, type Duration } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

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
  expectation: S.String,
  lastFailure: S.String,
  maxAttempts: S.Int,
  packageName: S.String,
  timeout: S.String,
  version: S.String,
}) {
  override get message() {
    return `${this.expectation} did not become ready from ${publicRegistry} within ${this.timeout} (${this.attempts}/${this.maxAttempts} attempts). Last readiness failure: ${this.lastFailure}`;
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
          forceKillAfter: "5 seconds",
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

const waitForPublicationProbe = E.fn("keenko.release.waitForPublicationProbe")(function* (
  version: string,
  expectation: string,
  probe: E.Effect<string, RegistryLookupFailure, NodeServices.NodeServices>,
  policy: PublishedVersionWaitPolicy
) {
  const attempts = yield* Ref.make(0);
  const lastFailure = yield* Ref.make("No completed registry observation");
  const observation = E.gen(function* () {
    yield* Ref.update(attempts, (count) => count + 1);
    return yield* probe;
  }).pipe(
    E.tapError((failure) =>
      Ref.set(lastFailure, failure.reason).pipe(E.andThen(Console.log(`Attempt failed for ${expectation}: ${failure.reason}`)))
    ),
    E.retry(Schedule.max([Schedule.spaced(policy.interval), Schedule.recurs(policy.maxAttempts - 1)])),
    E.timeout(policy.timeout)
  );

  return yield* observation.pipe(
    E.catch((error) =>
      E.gen(function* () {
        const attemptCount = yield* Ref.get(attempts);
        return yield* new PublishedVersionUnavailable({
          attempts: attemptCount,
          expectation,
          lastFailure:
            error._tag === "RegistryLookupFailure"
              ? error.reason
              : `Hard timeout of ${policy.timeoutLabel} elapsed. ${yield* Ref.get(lastFailure)}`,
          maxAttempts: policy.maxAttempts,
          packageName,
          timeout: policy.timeoutLabel,
          version,
        });
      })
    )
  );
});

export const waitForPublishedVersion = (
  version: string,
  lookup: RegistryLookup = resolvePublicRegistryVersion,
  policy: PublishedVersionWaitPolicy = publishedVersionWaitPolicy
) =>
  waitForPublicationProbe(
    version,
    `${packageName}@${version} to be Bun-installable`,
    E.gen(function* () {
      const resolvedVersion = yield* lookup(packageName, version);
      if (resolvedVersion !== version)
        return yield* new RegistryLookupFailure({
          reason: `Bun installed ${packageName}@${resolvedVersion} instead of ${packageName}@${version}`,
        });
      return resolvedVersion;
    }),
    policy
  );

const sDistTags = S.fromJsonString(S.Record(S.String, S.String));
export type DistTagLookup = E.Effect<Readonly<Record<string, string>>, RegistryLookupFailure, NodeServices.NodeServices>;

export const resolvePublicDistTags: DistTagLookup = E.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make("npm", ["view", packageName, "dist-tags", "--json", "--registry", publicRegistry, "--prefer-online"], {
      forceKillAfter: "5 seconds",
    })
  );
  const [output, stderr, exitCode] = yield* E.all(
    [Stream.mkString(Stream.decodeText(child.stdout)), Stream.mkString(Stream.decodeText(child.stderr)), child.exitCode],
    { concurrency: "unbounded" }
  );
  if (exitCode !== 0)
    return yield* new RegistryLookupFailure({ reason: `npm dist-tags lookup exited ${exitCode}: ${stderr.slice(-16_000)}` });
  return yield* S.decodeEffect(sDistTags)(output);
}).pipe(
  E.scoped,
  E.mapError((error) =>
    S.is(RegistryLookupFailure)(error) ? error : new RegistryLookupFailure({ reason: `Could not read npm dist-tags: ${String(error)}` })
  )
);

export interface PublicationTags {
  readonly mode: "rc" | "stable";
  readonly previousLatest: string;
  // An empty value means that rc was absent before publication.
  readonly previousRc: string;
}

export const waitForPublishedDistTags = (
  version: string,
  { mode, previousLatest, previousRc }: PublicationTags,
  lookup: DistTagLookup = resolvePublicDistTags,
  policy: PublishedVersionWaitPolicy = publishedVersionWaitPolicy
) => {
  const expected = { latest: mode === "stable" ? version : previousLatest, rc: mode === "rc" ? version : previousRc };
  const expectation = Object.entries(expected)
    .map(([tag, value]) => `${packageName}@${tag} = ${value || "<absent>"}`)
    .join(" and ");
  return waitForPublicationProbe(
    version,
    expectation,
    E.gen(function* () {
      const observed = yield* lookup;
      const mismatches = Object.entries(expected)
        .filter(([tag, value]) => (observed[tag] ?? "") !== value)
        .map(([tag, value]) => `${packageName}@${tag}: expected ${value || "<absent>"}, observed ${observed[tag] || "<absent>"}`);
      if (mismatches.length > 0) return yield* new RegistryLookupFailure({ reason: mismatches.join("; ") });
      return version;
    }),
    policy
  );
};

const invalidVersionArgument = new PublishedVersionUnavailable({
  attempts: 0,
  expectation: "Publication arguments",
  lastFailure: "Expected an exact SemVer, optionally followed by mode (rc|stable), previous latest, and previous rc (empty if absent)",
  maxAttempts: publishedVersionWaitPolicy.maxAttempts,
  packageName,
  timeout: publishedVersionWaitPolicy.timeoutLabel,
  version: "<invalid>",
});

export const readPublicationArguments = E.fn("keenko.release.readPublicationArguments")(function* (args: readonly string[]) {
  const parsed = yield* S.decodeUnknownEffect(
    S.Union([S.Tuple([S.String]), S.Tuple([S.String, S.Literals(["rc", "stable"]), S.String, S.String])])
  )(args).pipe(E.mapError(() => invalidVersionArgument));
  const [version] = parsed;
  if (!exactSemver.test(version)) return yield* invalidVersionArgument;
  if (parsed.length === 1) return { tags: Option.none<PublicationTags>(), version };
  const [, mode, previousLatest, previousRc] = parsed;
  if (!exactSemver.test(previousLatest) || (previousRc !== "" && !exactSemver.test(previousRc))) return yield* invalidVersionArgument;
  return { tags: Option.some({ mode, previousLatest, previousRc }), version };
});

if (import.meta.main)
  NodeRuntime.runMain(
    // oxlint-disable-next-line effect/noGlobals -- process arguments are the release-wait command boundary.
    readPublicationArguments(process.argv.slice(2)).pipe(
      E.flatMap(({ version, tags }) =>
        waitForPublishedVersion(version).pipe(
          E.tap(() => Console.log(`Bun can install ${packageName}@${version} from ${publicRegistry}.`)),
          E.andThen(
            Option.match(tags, {
              onNone: () => E.succeed(version),
              onSome: (configuration) => waitForPublishedDistTags(version, configuration),
            })
          ),
          E.tap(() => Console.log(`Publication observations converged for ${packageName}@${version}.`))
        )
      ),
      E.provide(NodeServices.layer)
    )
  );
