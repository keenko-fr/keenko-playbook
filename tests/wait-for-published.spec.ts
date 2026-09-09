import { describe, expect, test } from "bun:test";

import { NodeServices } from "@effect/platform-node";
import { Effect as E, Fiber, FileSystem, Layer, Path, Schema as S } from "effect";
import { TestClock } from "effect/testing";

import {
  PublishedVersionUnavailable,
  RegistryLookupFailure,
  type ExactPackageInstaller,
  type PublishedVersionWaitPolicy,
  type RegistryLookup,
  resolvePublicRegistryVersion,
  waitForPublishedVersion,
} from "./wait-for-published.js";

const version = "0.3.0";
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
            return "0.3.1";
          });
        const failure = yield* waitForPublishedVersion(version, lookup, testPolicy).pipe(E.flip);

        expect(failure.message).toContain("Bun installed keenko@0.3.1 instead of keenko@0.3.0");
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
