import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Duration, Effect as E, FileSystem, Path, Option, Ref, Schedule, Schema as S, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const packageName = "keenko";
const publicRegistry = "https://registry.npmjs.org";
const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export interface PublishedVersionWaitPolicy {
  readonly attemptTimeout: Duration.Input;
  readonly interval: Duration.Input;
  readonly maxAttempts: number;
  readonly timeout: Duration.Input;
  readonly timeoutLabel: string;
}

export const publishedVersionWaitPolicy = {
  attemptTimeout: "5 minutes",
  interval: "10 seconds",
  // 60 retry delays cover the deadline even when every failed probe returns immediately.
  maxAttempts: 61,
  timeout: "10 minutes",
  timeoutLabel: "10 minutes",
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
    return `${this.expectation} did not become ready from ${publicRegistry} within ${this.timeout} (${this.attempts}/${this.maxAttempts} attempts). Readiness diagnostics: ${this.lastFailure}`;
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
  const failures = yield* Ref.make<readonly string[]>([]);
  const observation = E.gen(function* () {
    yield* Ref.update(attempts, (count) => count + 1);
    return yield* probe.pipe(
      E.timeoutOrElse({
        duration: policy.attemptTimeout,
        orElse: () =>
          E.fail(
            new RegistryLookupFailure({
              reason: `Readiness probe exceeded its ${Duration.format(Duration.fromInputUnsafe(policy.attemptTimeout))} attempt timeout`,
            })
          ),
      })
    );
  }).pipe(
    E.tapError((failure) =>
      Ref.update(failures, (recent) => [...recent.filter((reason) => reason !== failure.reason), failure.reason].slice(-3)).pipe(
        E.andThen(Console.log(`Attempt failed for ${expectation}: ${failure.reason}`))
      )
    ),
    E.retry(Schedule.max([Schedule.spaced(policy.interval), Schedule.recurs(policy.maxAttempts - 1)])),
    E.timeout(policy.timeout)
  );

  return yield* observation.pipe(
    E.catch((error) =>
      E.gen(function* () {
        const attemptCount = yield* Ref.get(attempts);
        const recentFailures = (yield* Ref.get(failures)).join("\nReadiness failure: ") || "No completed registry observation";
        return yield* new PublishedVersionUnavailable({
          attempts: attemptCount,
          expectation,
          lastFailure:
            error._tag === "RegistryLookupFailure"
              ? `Attempt limit reached. Recent readiness failures: ${recentFailures}`
              : `Hard timeout of ${policy.timeoutLabel} elapsed. Recent readiness failures: ${recentFailures}`,
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

export const waitForPublication = (
  version: string,
  tags: Option.Option<PublicationTags>,
  lookup: RegistryLookup = resolvePublicRegistryVersion,
  tagLookup: DistTagLookup = resolvePublicDistTags,
  policy: PublishedVersionWaitPolicy = publishedVersionWaitPolicy
) =>
  waitForPublishedVersion(version, lookup, policy).pipe(
    E.tap(() => Console.log(`Bun can install ${packageName}@${version} from ${publicRegistry}.`)),
    E.andThen(
      Option.match(tags, {
        onNone: () => E.succeed(version),
        onSome: (configuration) => waitForPublishedDistTags(version, configuration, tagLookup, policy),
      })
    ),
    E.tap(() => Console.log(`Publication observations converged for ${packageName}@${version}.`))
  );

if (import.meta.main)
  NodeRuntime.runMain(
    // oxlint-disable-next-line effect/noGlobals -- process arguments are the release-wait command boundary.
    readPublicationArguments(process.argv.slice(2)).pipe(
      E.flatMap(({ version, tags }) => waitForPublication(version, tags)),
      E.provide(NodeServices.layer)
    )
  );
