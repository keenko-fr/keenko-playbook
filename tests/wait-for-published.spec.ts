import { describe, expect, test } from "bun:test";

import { NodeServices } from "@effect/platform-node";
import { Effect as E, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  PublishedVersionUnavailable,
  RegistryLookupFailure,
  type PublishedVersionWaitPolicy,
  type RegistryLookup,
  waitForPublishedVersion,
} from "./wait-for-published.js";

const version = "0.3.0";
const testPolicy = { interval: 0, maxAttempts: 3, timeout: "1 second", timeoutLabel: "1 second" } satisfies PublishedVersionWaitPolicy;
const run = <A, X>(effect: E.Effect<A, X, NodeServices.NodeServices>) => E.runPromise(effect.pipe(E.provide(NodeServices.layer)));
const failLookup = (reason: string) => new RegistryLookupFailure({ reason });

describe("published version registry wait", () => {
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

        expect(failure.message).toContain("Registry returned 0.3.1 for keenko@0.3.0");
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
