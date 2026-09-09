import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect as E, Ref, Schedule, Schema as S, type Duration } from "effect";
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
    return `${this.packageName}@${this.version} did not become resolvable from ${publicRegistry} within ${this.timeout} (${this.attempts}/${this.maxAttempts} attempts). Last lookup failure: ${this.lastFailure}`;
  }
}

export type RegistryLookup = (
  name: string,
  version: string
) => E.Effect<string, RegistryLookupFailure, ChildProcessSpawner.ChildProcessSpawner>;

export const resolvePublicRegistryVersion: RegistryLookup = E.fn("keenko.release.resolvePublicRegistryVersion")(function* (name, version) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const selector = `${name}@${version}`;
  const output = yield* spawner
    .string(
      ChildProcess.make("bun", ["pm", "view", selector, "version", "--json"], {
        env: { BUN_CONFIG_REGISTRY: publicRegistry, NPM_CONFIG_REGISTRY: publicRegistry },
        extendEnv: true,
      }),
      { includeStderr: true }
    )
    .pipe(E.mapError((error) => new RegistryLookupFailure({ reason: String(error) })));

  return yield* S.decodeEffect(S.fromJsonString(S.String))(output).pipe(
    E.mapError(() => new RegistryLookupFailure({ reason: `Registry returned invalid version metadata: ${output.trim()}` }))
  );
});

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
        reason: `Registry returned ${resolvedVersion} for ${packageName}@${version}`,
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
      E.tap((version) => Console.log(`${packageName}@${version} is resolvable from ${publicRegistry}.`)),
      E.provide(NodeServices.layer)
    )
  );
