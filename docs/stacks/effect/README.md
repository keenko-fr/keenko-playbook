# Effect

Effect is a stack module, not a universal requirement. Plain synchronous helpers remain plain TypeScript when Effect adds no value.

## Tooling

Effect-enabled TypeScript repositories require `@effect/tsgo` and `oxlint-plugin-effect` in addition to the canonical TypeScript tooling. The v1 pins are `@effect/tsgo@0.39.1` and `oxlint-plugin-effect@0.12.0`; the matching universal pins are recorded in `docs/core/tooling.md`.

Treat `@effect/tsgo`, TypeScript, Oxlint, and `oxlint-tsgolint` as one compatibility unit. Before an upgrade, inspect the installed/current `@effect/tsgo` supported-components manifest and move the supported pins together. Re-check the pinned `oxlint-plugin-effect` pairing at the same time because its recommended rule set and overlap with Effect tsgo are convention behavior.

Use `effect-tsgo patch --oxlint` after dependency installation so the Effect TypeScript-Go integration owns both the TypeScript and Oxlint integration. Keep root Oxlint `options.typeAware: true`. Extend the `@effect/tsgo/oxlint-presets` recommended preset so semantic/type-aware Effect diagnostics surface through Oxlint. When the Effect language-service plugin is enabled, set its `diagnostics` option to `false` so editor/LSP diagnostics are not duplicated; `typecheck` remains the separate TypeScript compiler verification contract.

Enable the `oxlint-plugin-effect` recommended preset only for authored Effect-owned source. It owns unconditional Effect syntax/structural policy while `@effect/tsgo` owns semantic/type-aware Effect correctness. Within the Oxlint diagnostic surface, one concern has one owner. For the pinned `oxlint-plugin-effect@0.12.0` and `@effect/tsgo@0.39.1` pairing, keep the plugin's recommended unconditional rules and disable the corresponding duplicate `effecttsgo/*` diagnostics.

The canonical plugin exception is `effect/noTernary`. Effect should not introduce a different generic TypeScript syntax convention unless Effect semantics require that divergence. Ordinary Keenko TypeScript permits useful ternaries, while generic rules already reject problematic nested or unnecessary forms. Effect has no semantic reason to ban every conditional expression.

Inside the same Effect-owned scope, disable generic async and Promise rules that conflict with Effect's more specific async policy:

```ts
"eslint/require-await": "off",
"promise/prefer-await-to-callbacks": "off",
"promise/prefer-await-to-then": "off",
"typescript/promise-function-async": "off",
"typescript/return-await": "off",
```

`effect/noAsyncFunction` owns authored async-function policy there. Do not let a generic Promise rule push `E.promise(() => fetch(url))` toward an `async` callback that the Effect rule then rejects. Promise/callback interop at Effect boundaries should be adapted with the appropriate Effect abstraction instead of mechanically rewritten to `async`/`await`.

For an Effect-owned TypeScript repository, merge this Effect layer into the canonical root `oxlint.config.ts` rather than replacing the Ultracite/Keenko baseline:

```ts
import { recommended as effectTsgoRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import { recommended as effectRecommended } from "oxlint-plugin-effect/presets/recommended";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core, effectTsgoRecommended],
  jsPlugins: ["oxlint-plugin-effect/plugin"],
  options: {
    typeAware: true,
  },
  rules: {
    ...effectRecommended,
    "effect/noTernary": "off",
    "effecttsgo/async-function": "off",
    "effecttsgo/crypto-random-uuid": "off",
    "effecttsgo/crypto-random-uuid-in-effect": "off",
    "effecttsgo/global-console": "off",
    "effecttsgo/global-console-in-effect": "off",
    "effecttsgo/global-date": "off",
    "effecttsgo/global-date-in-effect": "off",
    "effecttsgo/global-fetch": "off",
    "effecttsgo/global-fetch-in-effect": "off",
    "effecttsgo/global-random": "off",
    "effecttsgo/global-random-in-effect": "off",
    "effecttsgo/global-timers": "off",
    "effecttsgo/global-timers-in-effect": "off",
    "effecttsgo/new-promise": "off",
    "effecttsgo/node-builtin-import": "off",
    "effecttsgo/prefer-schema-over-json": "off",
    "effecttsgo/process-env": "off",
    "effecttsgo/process-env-in-effect": "off",
    "effecttsgo/try-catch-in-effect-gen": "off",
    "eslint/require-await": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "typescript/promise-function-async": "off",
    "typescript/return-await": "off",
    // Keep the repository's normal Keenko overrides after the upstream presets.
  },
});
```

The overlap rule names above are compatibility data for the pinned package pairing. They are not permanent Keenko architecture. Keep the plugin's unconditional rules and preserve the remaining semantic/type-aware `effecttsgo/*` diagnostics, including `effecttsgo/floating-effect`, `effecttsgo/run-effect-inside-effect`, `effecttsgo/extends-native-error`, and `effecttsgo/unsafe-effect-type-assertion`.

Compose and provide Layers at application entry points. Keep `effecttsgo/strict-effect-provide` at its upstream default in the shared root baseline because the rule cannot distinguish valid entry-point provisioning from the non-entry-point usage it is intended to discourage. A repository may enable the rule only in a machine-identifiable scope that excludes its legitimate entry points; otherwise enforce this architectural distinction through prose and review.

The TypeScript language-service configuration is a separate surface. Disable its diagnostic emission globally so the editor does not repeat diagnostics already reported by Oxlint; do not use `diagnosticSeverity` there to control the Oxlint rule set.

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "diagnostics": false
      }
    ]
  }
}
```

The ownership principle is stable Keenko guidance. The exact plugin to Effect-tsgo overlap list is versioned upstream compatibility data. Whenever either Effect lint package changes, inspect the installed/current plugin preset and Effect-tsgo preset/pairing, then re-derive the overlap list before changing it.

In a mixed monorepo, keep type-aware linting in the root config and scope Effect-only policy to authored Effect-owned workspaces/source instead of leaking it into non-Effect TypeScript. The plugin preset, the generic async/Promise disables, and the duplicate `effecttsgo/*` disables belong to that same Effect-owned scope. Use root overrides or an explicitly inherited package config according to the installed Oxlint configuration semantics; do not assume nested configs merge automatically, and keep root-only `options.typeAware` at the repository root.

## Imports

Canonical authored Effect 4 code prefers named imports from the package root, with local aliases when they improve readability:

```ts
import { Context, Effect as E, Layer, Match, Schema as S, Struct } from "effect";
```

Prefer adding other Effect modules to the same root import rather than defaulting to namespace subpath imports such as `effect/Effect` or `effect/Schema`.

Use a subpath import only when the required API is not suitably available from the root or a real tooling/runtime constraint requires it. The first-party HTTP client APIs in Effect `4.0.0-beta.107` are one such case:

```ts
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
```

Do not rewrite vendored/generated code merely to enforce this authored-code convention.

## Effect-owned workflows and technical capabilities

Prefer Effect for workflows that compose fallible/async operations, dependencies, retries, concurrency, typed failures, or resource lifecycles. External promises/throwing APIs enter Effect at the boundary through the appropriate Effect constructor/adapter; run the Effect once at the outer framework boundary.

Within an Effect-owned workflow, prefer the Effect-native capability that owns a technical concern when it provides meaningful semantics such as typed failures, dependency injection, cancellation, resource safety, retry/scheduling, concurrency, tracing, or schema decoding. Do not drop to a raw platform API and manually rebuild those semantics without a concrete reason.

This does not mean wrapping trivial deterministic synchronous helpers in Effect. Pure helpers remain plain TypeScript.

## Semantic combinators

Choose the combinator that expresses the operation:

```text
success A -> success B
  E.map

error A -> error B
  E.mapError

success A -> Effect<B>
  E.flatMap

error A -> recovery Effect
  catch / catchTag / catchTags

Option<A> -> pure branch
  Option.match when appropriate

finite typed union -> exhaustive pure mapping
  Match when appropriate
```

Discourage `catch -> E.fail(mappedError)` and `flatMap -> E.succeed(mappedValue)` when `E.mapError` or `E.map` expresses the same operation directly.

Recovery combinators are for handlers that actually enter another Effect/recovery workflow. When the operation is only typed failure A -> typed failure B, use `E.mapError`.

## `E.fn` naming

Every authored `E.fn` has an explicit stable tracing name. Use `<domain>.<layer>.<operation>`, for example:

```text
packs.data.get
packs.features.attachVideoForUpload
tvmaze.infra.search
```

The explicit string owns the stable operation/tracing identity. Keep the callback anonymous rather than giving it a second semantic operation name:

```ts
const search = E.fn("tvmaze.infra.search")(function* (query: string) {
  // ...
});
```

Prefer Effect/Option/Match combinators over manual branching when an appropriate semantic combinator exists. Native `switch` remains fine outside Effect-oriented typed/exhaustive code or when materially clearer.

## Schema

Effect Schema is canonical for first-party schemas when this module is enabled.

- Schema values use the `s` prefix exclusively.
- Keep a schema-derived TypeScript type immediately below its schema declaration; see `schema-types.md`.
- Do not introduce first-party Zod schemas.
- Prefer Effect built-ins and transformations before custom wrappers.
- Standard Schema (`S.toStandardSchemaV1`) is an adapter at an actual consumer boundary, not a canonical representation and not an `s...` export.
- See `.keenko/docs/conventions/schema-types.md` for `Type`/`Encoded`, transport, persistence, representation, and ownership rules.

### Structural derivation

For Effect `4.0.0-beta.107`, prefer the installed structural APIs over reconstructing field objects manually. Relevant facilities include:

```ts
schema.mapFields(Struct.pick(["a"]));
schema.mapFields(Struct.omit(["a"]));
schema.mapFields(Struct.evolve({ field: (field) => S.optionalKey(field) }));
schema.pipe(S.fieldsAssign({ other: S.String }));
```

`Struct.assign`, `S.toEncoded(...)`, `S.toType(...)`, `S.decodeTo(...)`, Schema transformation facilities, and value-level `Struct.pick` / `Struct.omit` are also available for the relationships they actually model.

Inspect the installed API before copying syntax across Effect versions. Composition/derivation can interact with checks/refinements; preserve intended validation semantics rather than mechanically transforming a checked schema.

For Effect `4.0.0-beta.107`, `S.optionalKey(schema)` models key absence without automatically accepting explicit `undefined` as the value, while `S.optional(schema)` has different absence/undefined semantics. Nullability remains separate.

## Errors and defects

Expected input/state/operator failures use the typed Effect error channel. Expected typed Failures in owned Effect code use Schema-tagged error values rather than handwritten tagged-object unions, including backend-internal failures.

A canonical issue-bearing Failure follows the shared validation guidance:

```ts
export const sTvMazeIssue = S.Literals(["unavailable", "invalid_response"]);
export type TvMazeIssue = typeof sTvMazeIssue.Type;

export class TvMazeFailure extends S.TaggedError<TvMazeFailure>()("TvMazeFailure", {
  issue: sTvMazeIssue,
  cause: S.optional(S.Defect()),
}) {}
```

`cause` is diagnostic and opaque; application behavior branches on stable `issue`, not on `cause`. Do not automatically expose an internal cause through public/server-client Failure contracts. See `validation.md` for one-Failure-versus-several and public-boundary rules.

Audit tagged-error `_tag` values when adding/modifying them; tags must be unique and semantically correct.

Do not use JavaScript `throw` in owned application/Effect code. Expected failures use `E.fail`/typed failures. Genuine defects use Effect defect mechanisms (`E.die`, `orDie`, equivalent). Foreign/native APIs that throw are caught/converted at their boundary with `E.try`, `E.tryPromise`, or the appropriate adapter.

Use defect paths only for programmer errors, impossible integrity states, required invalid configuration, or genuine invariants. Do not promote ordinary expected failures to defects for convenience.

## Services and Layers

A real external or meaningfully substitutable infra capability is an Effect service from its first real consumer, even when it initially exposes only one operation. Examples include provider APIs, email delivery, payment gateways, object storage, and external AI providers.

This rule applies to capabilities, not deterministic helpers.

Once a capability is a service, expose one public capability API. Do not retain a parallel direct function for the same operation, create another service merely to wrap it, or add a custom injection callback that duplicates a lower-level native Effect dependency.

When practical, use `make` as the canonical source of a service implementation and infer the service shape from it. Effect `4.0.0-beta.107` supports `E.Success<typeof make>` and `Layer.effect` for this pattern:

```ts
const make = E.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;

  const search = E.fn("tvmaze.infra.search")(function* (query: string) {
    // use httpClient and return application representations
  });

  return { search };
});

export class TvMaze extends Context.Service<TvMaze, E.Success<typeof make>>()("TvMaze") {
  static readonly layer = Layer.effect(this, make);
}
```

If construction is pure, use normal TypeScript inference such as `ReturnType<typeof make>` rather than introducing Effect solely for inference.

The service class owns its primary and genuine variant layers as static properties. The primary implementation is `layer`; variants use descriptive names such as `layerTest` or `layerConfig` only when they really exist.

Generated Confect/Effect services are used directly rather than wrapped merely to rename/re-export them.

### Leave lower-level requirements open

A provider layer may require lower-level services. Do not close those dependencies inside the adapter merely for convenience.

For the TVMaze validation shape:

```text
TvMaze.layer
requires HttpClient
provides TvMaze
```

Outer runtime/application composition supplies the concrete transport, for example `FetchHttpClient.layer`. Keep Layer composition/provision at that outer boundary.

## Effect-native HTTP

When provider work is Effect-owned and the installed Effect version provides a first-party HTTP client, depend on that client rather than raw `fetch` plus a custom injection seam.

For Effect `4.0.0-beta.107`, the supported HTTP APIs are under `effect/unstable/http`. The request model supports structured URL parameters and headers, including `HttpClientRequest.setUrlParam`, `setUrlParams`, `setHeader`, and `setHeaders`.

Canonical provider adapters:

- depend on `HttpClient`;
- construct requests with `HttpClientRequest` APIs rather than manually rebuilding query strings;
- use request APIs for headers;
- use native HTTP status/error semantics such as response status filters;
- decode untrusted JSON through Effect Schema with `HttpClientResponse.schemaBodyJson(...)` or the exact installed equivalent;
- translate transport/status/decode failures into the stable provider Failure;
- retain originating lower-level errors as diagnostic `cause` when useful.

For the current TVMaze validation, transport/network failures and non-success statuses map to `unavailable`; body/JSON/provider-schema/application-compatibility failures map to `invalid_response`. Do not expose HTTP status as stable Failure data unless a real consumer later requires it.

## Native testing seams

The architecture exposes two native seams:

```text
feature-level
fake TvMaze service
    |
    v
feature

infra-level
fake/test HttpClient
    |
    v
TvMaze.layer
```

Use those seams rather than a custom `fetch` callback. Do not create another provider service solely to wrap the provider capability.

## Retry policy

Retry is not automatic merely because Effect supports it. Retry changes observable latency, request volume, rate-limit pressure, and failure timing.

Use Effect-native retry facilities for idempotent infra operations only when an explicit reliability/latency policy warrants retries. Retry count, delay, backoff, and retryable statuses require actual operational/product policy.

The TVMaze dogfood case does not establish such a policy, so canonical guidance adds no retry. If a future policy requires retries, prefer the installed Effect HTTP/Schedule facilities over hand-written retry loops.

## Match and Issue translation

For reusable exhaustive pure mapping over a known finite union, prefer the installed `Match.type<T>()` API. Effect `4.0.0-beta.107` supports a return-type constraint as the first pipeline step:

```ts
const showIssueFrom = Match.type<TvMazeIssue>().pipe(
  Match.withReturnType<ShowIssue>(),
  Match.when("unavailable", () => "unavailable"),
  Match.when("invalid_response", () => "invalid_response"),
  Match.exhaustive
);
```

Use `Match.value(value)` for an immediate concrete value. Use tag-specific Match APIs only when `_tag` is genuinely the discriminator; a plain `issue` string vocabulary is not a tagged union.

Cross-layer provider Failure -> feature Failure translation uses the pure Issue mapper plus `E.mapError`, not catch/recovery:

```ts
providerOperation(...).pipe(
  E.mapError((failure) =>
    new ShowFailure({
      issue: showIssueFrom(failure.issue),
    }),
  ),
);
```

Do not copy an internal diagnostic cause into the public feature Failure.

## Option and transport

`Option` is legitimate internal semantics for absence. Convert it to plain values such as `null` at public/server-client transport boundaries, or to a typed failure when absence is exceptional.

Do not expose Effect runtime types (`Option`, `Either`, services, fibers, causes, etc.) in public server/client contracts unless the boundary is explicitly Effect-internal.

## Configuration

Use Effect `Config` inside Effect-managed code. At genuinely native synchronous Convex/provider setup boundaries, native generated environment access is appropriate.

Missing/invalid required runtime configuration may defect at the runtime boundary. Optional/business configuration stays typed when absence is meaningful.

For Effect API and tooling details, inspect the installed Effect guidance/source before relying on memory.
