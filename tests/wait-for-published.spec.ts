/* oxlint-disable effect/noEffectRunInTests -- bun:test callbacks return E.runPromise to bridge the native Bun runner to the repository Effect workflow. */
import { describe, expect, test } from "bun:test";

import { NodeServices } from "@effect/platform-node";
import { Effect as E, Fiber, FileSystem, Layer, Option, Path, Schema as S } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { TestClock } from "effect/testing";

import {
  PublishedVersionUnavailable,
  type DistTagLookup,
  type PublicationTags,
  readPublicationArguments,
  resolvePublicDistTags,
  waitForPublishedDistTags,
  RegistryLookupFailure,
  type ExactPackageInstaller,
  type PublishedVersionWaitPolicy,
  type RegistryLookup,
  resolvePublicRegistryVersion,
  waitForPublishedVersion,
} from "./wait-for-published.js";

const version = "1.2.3";
const testPolicy = { interval: 0, maxAttempts: 3, timeout: "1 second", timeoutLabel: "1 second" } satisfies PublishedVersionWaitPolicy;
const run = <A, X>(effect: E.Effect<A, X, NodeServices.NodeServices>) => E.runPromise(effect.pipe(E.provide(NodeServices.layer)));
const failLookup = (reason: string) => new RegistryLookupFailure({ reason });
const sInstalledPackage = S.fromJsonString(S.Struct({ version: S.String }));

describe("published version registry wait", () => {
  test("probes an exact dependency in an isolated project and accepts the installed version", () =>
    run(
      E.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const seenCacheDirectories = new Set<string>();
        let attempts = 0;
        const install: ExactPackageInstaller = (request) =>
          E.gen(function* () {
            attempts += 1;
            expect(request).toMatchObject({ name: "keenko", version });
            expect(request.cacheDirectory).toBe(path.join(request.directory, "bun-cache"));
            expect(seenCacheDirectories.has(request.cacheDirectory)).toBe(false);
            seenCacheDirectories.add(request.cacheDirectory);

            const manifest = yield* S.decodeEffect(
              S.fromJsonString(S.Struct({ dependencies: S.Record(S.String, S.String), private: S.Boolean }))
            )(yield* fs.readFileString(path.join(request.directory, "package.json")));
            expect(manifest).toEqual({ dependencies: { keenko: version }, private: true });

            if (attempts === 1) return yield* failLookup("No version matching the requested selector");
            const installedPackage = path.join(request.directory, "node_modules", request.name);
            yield* fs.makeDirectory(installedPackage, { recursive: true });
            yield* fs.writeFileString(path.join(installedPackage, "package.json"), yield* S.encodeEffect(sInstalledPackage)({ version }));
          }).pipe(E.mapError((error) => (S.is(RegistryLookupFailure)(error) ? error : failLookup(String(error)))));
        const lookup: RegistryLookup = (name, requestedVersion) => resolvePublicRegistryVersion(name, requestedVersion, install);

        expect(yield* waitForPublishedVersion(version, lookup, testPolicy)).toBe(version);
        expect(attempts).toBe(2);
        expect(seenCacheDirectories.size).toBe(2);
      })
    ));

  test("succeeds immediately when the exact requested version is available", () =>
    run(
      E.gen(function* () {
        let attempts = 0;
        const lookup: RegistryLookup = (_name, requestedVersion) =>
          E.sync(() => {
            attempts += 1;
            return requestedVersion;
          });

        expect(yield* waitForPublishedVersion(version, lookup, testPolicy)).toBe(version);
        expect(attempts).toBe(1);
      })
    ));

  test("retries an unavailable exact version and succeeds when it becomes available", () =>
    run(
      E.gen(function* () {
        let attempts = 0;
        const lookup: RegistryLookup = (_name, requestedVersion) =>
          E.suspend(() => {
            attempts += 1;
            return attempts < 3 ? E.fail(failLookup("No version matching the requested selector")) : E.succeed(requestedVersion);
          });

        expect(yield* waitForPublishedVersion(version, lookup, testPolicy)).toBe(version);
        expect(attempts).toBe(3);
      })
    ));

  test("fails with a useful diagnostic after the bounded attempts are exhausted", () =>
    run(
      E.gen(function* () {
        let attempts = 0;
        const lookup: RegistryLookup = () =>
          E.suspend(() => {
            attempts += 1;
            return E.fail(failLookup("No version matching the requested selector"));
          });
        const failure = yield* waitForPublishedVersion(version, lookup, testPolicy).pipe(E.flip);

        expect(failure).toBeInstanceOf(PublishedVersionUnavailable);
        expect(failure).toMatchObject({ attempts: 3, maxAttempts: 3, packageName: "keenko", version });
        expect(failure.message).toContain("3/3 attempts");
        expect(failure.message).toContain("No version matching the requested selector");
        expect(attempts).toBe(3);
      })
    ));

  test("hard timeout bounds a non-completing registry lookup", () => {
    const hardTimeoutPolicy = {
      interval: "1 hour",
      maxAttempts: 3,
      timeout: "10 millis",
      timeoutLabel: "10 millis",
    } satisfies PublishedVersionWaitPolicy;

    return E.runPromise(
      E.gen(function* () {
        let attempts = 0;
        const lookup: RegistryLookup = () =>
          E.suspend(() => {
            attempts += 1;
            return E.never;
          });
        const fiber = yield* waitForPublishedVersion(version, lookup, hardTimeoutPolicy).pipe(E.flip, E.forkChild);

        yield* TestClock.adjust("10 millis");
        const failure = yield* Fiber.join(fiber);

        expect(failure).toBeInstanceOf(PublishedVersionUnavailable);
        expect(failure).toMatchObject({ attempts: 1, maxAttempts: 3, packageName: "keenko", version });
        expect(failure.message).toContain("Hard timeout of 10 millis elapsed");
        expect(failure.message).not.toContain("Last lookup failure: No version matching");
        expect(attempts).toBe(1);

        yield* TestClock.adjust("2 hours");
        yield* E.yieldNow;
        expect(attempts).toBe(1);
      }).pipe(E.provide(Layer.merge(NodeServices.layer, TestClock.layer())))
    );
  });

  test("does not accept another available version", () =>
    run(
      E.gen(function* () {
        let attempts = 0;
        const lookup: RegistryLookup = () =>
          E.sync(() => {
            attempts += 1;
            return "1.2.4";
          });
        const failure = yield* waitForPublishedVersion(version, lookup, testPolicy).pipe(E.flip);

        expect(failure.message).toContain("Bun installed keenko@1.2.4 instead of keenko@1.2.3");
        expect(attempts).toBe(3);
      })
    ));

  test("retries transient lookup failures instead of treating them as absence", () =>
    run(
      E.gen(function* () {
        let attempts = 0;
        const lookup: RegistryLookup = (_name, requestedVersion) =>
          E.suspend(() => {
            attempts += 1;
            return attempts === 1 ? E.fail(failLookup("ETIMEDOUT contacting registry")) : E.succeed(requestedVersion);
          });

        expect(yield* waitForPublishedVersion(version, lookup, testPolicy)).toBe(version);
        expect(attempts).toBe(2);
      })
    ));
});

const published = "1.0.2-rc.1";
const previousLatest = "1.0.1";
const previousRc = "1.0.2-rc.0";
const rcTags = { mode: "rc", previousLatest, previousRc } satisfies PublicationTags;
const readyRc = { latest: previousLatest, rc: published };

describe("published dist-tag convergence", () => {
  test("npm adapter reads public tags and retries nonzero exits with stderr and malformed JSON", () =>
    run(
      E.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        let attempts = 0;
        const lookup = resolvePublicDistTags.pipe(
          E.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make((command) =>
              E.suspend(() => {
                expect(command._tag).toBe("StandardCommand");
                if (command._tag !== "StandardCommand") return E.die("Unexpected piped lookup");
                expect(command.command).toBe("npm");
                expect(command.args).toEqual([
                  "view",
                  "keenko",
                  "dist-tags",
                  "--json",
                  "--registry",
                  "https://registry.npmjs.org",
                  "--prefer-online",
                ]);
                expect(command.options.forceKillAfter).toBe("5 seconds");
                const script = [
                  "printf 'ETIMEDOUT contacting registry' >&2; exit 1",
                  "printf 'invalid JSON'",
                  `printf '%s' '{"latest":"${previousLatest}","rc":"${published}"}'`,
                ][attempts++];
                return spawner.spawn(ChildProcess.make("/bin/sh", ["-c", script], { forceKillAfter: "5 seconds" }));
              })
            )
          )
        );
        const failure = yield* lookup.pipe(E.flip);
        expect(failure.reason).toContain("npm dist-tags lookup exited 1: ETIMEDOUT contacting registry");
        attempts = 0;
        expect(yield* waitForPublishedDistTags(published, rcTags, lookup, testPolicy)).toBe(published);
        expect(attempts).toBe(3);
      })
    ));

  for (const scenario of [
    { name: "tag already correct on first lookup", observations: [readyRc] },
    { name: "stale previous tag then expected tag", observations: [{ latest: previousLatest, rc: previousRc }, readyRc] },
    { name: "temporarily missing tag then expected tag", observations: [{ latest: previousLatest }, readyRc] },
    { name: "transient registry failure then expected tag", observations: [failLookup("ETIMEDOUT contacting registry"), readyRc] },
  ])
    test(scenario.name, () =>
      run(
        E.gen(function* () {
          let attempts = 0;
          const lookup: DistTagLookup = E.suspend(() =>
            Option.match(Option.fromNullishOr(scenario.observations[attempts++]), {
              onNone: () => E.die("Unexpected extra lookup"),
              onSome: (observation) => (S.is(RegistryLookupFailure)(observation) ? E.fail(observation) : E.succeed(observation)),
            })
          );
          expect(yield* waitForPublishedDistTags(published, rcTags, lookup, testPolicy)).toBe(published);
          expect(attempts).toBe(scenario.observations.length);
        })
      )
    );

  test("exact installation succeeds while the old one-shot tag assertion would fail", () =>
    run(
      E.gen(function* () {
        let exactAttempts = 0;
        let tagAttempts = 0;
        const exactLookup: RegistryLookup = () =>
          E.sync(() => {
            exactAttempts += 1;
            return published;
          });
        const tags: DistTagLookup = E.sync(() => {
          expect(exactAttempts).toBe(1);
          tagAttempts += 1;
          const observed = tagAttempts === 1 ? { latest: previousLatest, rc: previousRc } : readyRc;
          if (tagAttempts === 1) expect(observed.rc === published).toBe(false);
          return observed;
        });
        yield* waitForPublishedVersion(published, exactLookup, testPolicy);
        yield* waitForPublishedDistTags(published, rcTags, tags, testPolicy);
        expect(exactAttempts).toBe(1);
        expect(tagAttempts).toBe(2);
      })
    ));

  for (const { mode, version: target, expected, stale, changed, unchangedTag, movingTag } of [
    {
      changed: { latest: "1.0.2", rc: published },
      expected: readyRc,
      mode: "rc",
      movingTag: "rc",
      stale: { latest: previousLatest, rc: previousRc },
      unchangedTag: "latest",
      version: published,
    },
    {
      changed: { latest: "1.0.2", rc: published },
      expected: { latest: "1.0.2", rc: previousRc },
      mode: "stable",
      movingTag: "latest",
      stale: { latest: previousLatest, rc: previousRc },
      unchangedTag: "rc",
      version: "1.0.2",
    },
  ] as const satisfies readonly {
    mode: PublicationTags["mode"];
    version: string;
    expected: Record<string, string>;
    stale: Record<string, string>;
    changed: Record<string, string>;
    unchangedTag: string;
    movingTag: string;
  }[]) {
    const configuration = { mode, previousLatest, previousRc };
    test(`${mode} requires the moving tag and unchanged tag in the same observation`, () =>
      run(
        E.gen(function* () {
          let attempts = 0;
          const lookup: DistTagLookup = E.sync(() => {
            attempts += 1;
            // Each first observation proves only one half. Neither may be accepted.
            return [stale, changed, expected][attempts - 1] ?? expected;
          });
          expect(yield* waitForPublishedDistTags(target, configuration, lookup, testPolicy)).toBe(target);
          expect(attempts).toBe(3);
        })
      ));
    for (const { name, observed, tag } of [
      { name: "permanently stale tag exhausts attempts", observed: stale, tag: movingTag },
      { name: "unexpectedly changed unchanged tag eventually fails", observed: changed, tag: unchangedTag },
    ])
      test(`${mode}: ${name}`, () =>
        run(
          E.gen(function* () {
            let attempts = 0;
            const lookup: DistTagLookup = E.sync(() => {
              attempts += 1;
              return observed;
            });
            const failure = yield* waitForPublishedDistTags(target, configuration, lookup, testPolicy).pipe(E.flip);
            expect(failure).toBeInstanceOf(PublishedVersionUnavailable);
            expect(failure.message).toContain(`keenko@${tag}: expected ${expected[tag]}, observed ${observed[tag]}`);
            expect(failure.message).toContain("3/3 attempts");
            expect(failure.message).toContain("within 1 second");
            expect(attempts).toBe(3);
          })
        ));
  }

  test("stable can preserve an absent rc tag, but rejects one appearing", () =>
    run(
      E.gen(function* () {
        const tags = { mode: "stable", previousLatest, previousRc: "" } satisfies PublicationTags;
        expect(yield* waitForPublishedDistTags("1.0.2", tags, E.succeed({ latest: "1.0.2" }), testPolicy)).toBe("1.0.2");
        const failure = yield* waitForPublishedDistTags("1.0.2", tags, E.succeed({ latest: "1.0.2", rc: published }), testPolicy).pipe(
          E.flip
        );
        expect(failure.message).toContain(`keenko@rc: expected <absent>, observed ${published}`);
        expect(failure.attempts).toBe(3);
      })
    ));

  test("hard timeout interrupts a non-completing lookup and preserves the last observation", () =>
    E.runPromise(
      E.gen(function* () {
        let attempts = 0;
        const lookup: DistTagLookup = E.suspend(() => {
          attempts += 1;
          return attempts === 1 ? E.succeed({ latest: previousLatest, rc: previousRc }) : E.never;
        });
        const policy = {
          interval: "10 millis",
          maxAttempts: 3,
          timeout: "20 millis",
          timeoutLabel: "20 millis",
        } satisfies PublishedVersionWaitPolicy;
        const fiber = yield* waitForPublishedDistTags(published, rcTags, lookup, policy).pipe(E.flip, E.forkChild);
        yield* TestClock.adjust("9 millis");
        expect(attempts).toBe(1);
        yield* TestClock.adjust("1 millis");
        expect(attempts).toBe(2);
        yield* TestClock.adjust("10 millis");
        const failure = yield* Fiber.join(fiber);
        expect(failure.message).toContain("Hard timeout of 20 millis elapsed");
        expect(failure.message).toContain(`keenko@rc: expected ${published}, observed ${previousRc}`);
        expect(failure.message).toContain("2/3 attempts");
        yield* TestClock.adjust("1 hour");
        expect(attempts).toBe(2);
      }).pipe(E.provide(Layer.merge(NodeServices.layer, TestClock.layer())))
    ));

  test("permanent registry failure reports expectations and last registry error", () =>
    run(
      E.gen(function* () {
        const failure = yield* waitForPublishedDistTags(published, rcTags, E.fail(failLookup("ECONNRESET")), testPolicy).pipe(E.flip);
        expect(failure.message).toContain(`keenko@rc = ${published}`);
        expect(failure.message).toContain(`keenko@latest = ${previousLatest}`);
        expect(failure.message).toContain("ECONNRESET");
        expect(failure.attempts).toBe(3);
      })
    ));

  test("CLI keeps exact-only compatibility and validates mode-specific arguments", () =>
    run(
      E.gen(function* () {
        expect(yield* readPublicationArguments([published])).toEqual({ tags: Option.none(), version: published });
        for (const mode of ["rc", "stable"] as const)
          expect(yield* readPublicationArguments([published, mode, previousLatest, ""])).toEqual({
            tags: Option.some({ mode, previousLatest, previousRc: "" }),
            version: published,
          });
        for (const args of [
          ["rc"],
          [published, "wrong", previousLatest, ""],
          [published, "rc", previousLatest],
          [published, "rc", "", ""],
          [published, "stable", previousLatest, "latest"],
        ])
          expect(yield* readPublicationArguments(args).pipe(E.flip)).toBeInstanceOf(PublishedVersionUnavailable);
      })
    ));

  test("workflow shell preserves absent rc and publishes once per mode without retries", () =>
    run(
      E.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const repository = yield* path.fromFileUrl(new URL("../", import.meta.url));
        const workflow = yield* fs.readFileString(path.join(repository, ".github/workflows/release.yml"));
        const step = (name: string) =>
          E.gen(function* () {
            const body = yield* Option.match(
              Option.fromNullishOr(workflow.split(`      - name: ${name}\n`)[1]?.split("      - name:")[0]),
              {
                onNone: () => E.die(`Missing workflow step ${name}`),
                onSome: E.succeed,
              }
            );
            const [, block = ""] = body.split("        run: |\n");
            if (block.length > 0) return block.replaceAll(/^ {10}/gmu, "");
            const inline = /^ {8}run: (?<command>.+)/mu.exec(body)?.groups?.command ?? "";
            if (inline.length === 0) return yield* E.die(`Missing run in ${name}`);
            return inline;
          });
        const directory = yield* fs.makeTempDirectoryScoped();
        const output = path.join(directory, "github-output");
        const nodeExecutable = (yield* spawner.string(
          ChildProcess.make("node", ["-p", "process.execPath"], { forceKillAfter: "5 seconds" })
        )).trim();
        for (const [name, script] of Object.entries({
          bun: `#!/bin/sh\nprintf '%s\\n' "$@"\n`,
          node: `#!/bin/sh\nif [ "$1" = "--input-type=module" ]; then exit 0; fi\nif [ "$2" = "require('./package.json').version" ]; then printf '%s\\n' '${published}'; else exec "$REAL_NODE" "$@"; fi\n`,
          npm: `#!/bin/sh\nprintf '%s\\n' '{"latest":"1.0.1"}'\n`,
        })) {
          const file = path.join(directory, name);
          yield* fs.writeFileString(file, script);
          yield* fs.chmod(file, 0o755);
        }
        const environment = {
          GITHUB_OUTPUT: output,
          PATH: `${directory}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
          PREVIOUS_LATEST: previousLatest,
          REAL_NODE: nodeExecutable,
        };
        yield* spawner.string(
          ChildProcess.make("/bin/bash", ["-e", "-c", yield* step("Read current npm dist-tags")], {
            env: environment,
            forceKillAfter: "5 seconds",
          })
        );
        expect(yield* fs.readFileString(output)).toBe("latest=1.0.1\nrc=\n");
        for (const mode of ["rc", "stable"] as const) {
          const validation = yield* spawner.spawn(
            ChildProcess.make("/bin/bash", ["-e", "-c", yield* step("Validate release mode")], {
              cwd: repository,
              env: { ...environment, RELEASE_MODE: mode },
              forceKillAfter: "5 seconds",
            })
          );
          expect(Number(yield* validation.exitCode)).toBe(0);
          const publication = yield* spawner.string(
            ChildProcess.make("/bin/bash", ["-e", "-c", yield* step("Release with Nx")], {
              cwd: repository,
              env: { ...environment, RELEASE_MODE: mode },
              forceKillAfter: "5 seconds",
            })
          );
          expect(publication.split("\n").filter((argument) => argument === "publish")).toHaveLength(1);
          expect(publication).toContain(`publish\n--tag\n${mode === "rc" ? "rc" : "latest"}\n`);
          const result = yield* spawner.string(
            ChildProcess.make("/bin/bash", ["-e", "-c", yield* step("Wait for published package and npm dist-tags")], {
              env: { ...environment, PREVIOUS_LATEST: previousLatest, PREVIOUS_RC: "", PUBLISHED_VERSION: published, RELEASE_MODE: mode },
              forceKillAfter: "5 seconds",
            })
          );
          const args = result.split("\n").slice(0, -1);
          expect(args.slice(0, 3)).toEqual(["run", "release:wait-for-published", "--"]);
          expect(yield* readPublicationArguments(args.slice(3))).toEqual({
            tags: Option.some({ mode, previousLatest, previousRc: "" }),
            version: published,
          });
        }
        const failedPublishes = path.join(directory, "failed-publishes");
        yield* fs.writeFileString(
          path.join(directory, "bun"),
          `#!/bin/sh\nif [ "$4" = publish ]; then echo publish >> "$FAILED_PUBLISHES"; exit 1; fi\n`
        );
        for (const mode of ["rc", "stable"] as const) {
          yield* fs.writeFileString(failedPublishes, "");
          const child = yield* spawner.spawn(
            ChildProcess.make("/bin/bash", ["-e", "-c", yield* step("Release with Nx")], {
              cwd: repository,
              env: { ...environment, FAILED_PUBLISHES: failedPublishes, RELEASE_MODE: mode },
              forceKillAfter: "5 seconds",
            })
          );
          expect(Number(yield* child.exitCode)).toBe(1);
          expect(yield* fs.readFileString(failedPublishes)).toBe("publish\n");
        }
      }).pipe(E.scoped)
    ));
});
