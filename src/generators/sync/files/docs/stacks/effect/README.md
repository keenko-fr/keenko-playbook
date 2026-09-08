# Effect

Effect is a stack module, not a universal requirement.

Plain deterministic synchronous helpers remain plain TypeScript when Effect adds no meaningful semantics.

## Tooling

Effect-enabled TypeScript repositories use `@effect/tsgo` and `oxlint-plugin-effect` in addition to the canonical TypeScript tooling.

Current package specifications belong to Keenko's canonical package compatibility map. Do not duplicate current Effect tooling versions in this documentation.

Treat `@effect/tsgo`, TypeScript, Oxlint, and `oxlint-tsgolint` as a compatibility unit.

Before upgrading one of them:

1. inspect the installed/current `@effect/tsgo` supported-components information;
2. verify the supported TypeScript, Oxlint, and `oxlint-tsgolint` combination;
3. re-check `oxlint-plugin-effect`;
4. move coupled package specifications together when required;
5. re-derive any rule overlap from the installed presets.

Use:

```sh
effect-tsgo patch --no-typescript --oxlint
```

after dependency installation.

Effect tooling owns the supported Oxlint integration but does not replace the TypeScript package used by Nx.

Keep root Oxlint:

```ts
options: {
  typeAware: true,
}
```

Enable the `@effect/tsgo` Oxlint integration so semantic and type-aware Effect diagnostics surface through Oxlint.

When the Effect language-service plugin is enabled, disable its diagnostic emission so editor/LSP diagnostics are not duplicated. `typecheck` remains the separate compiler verification contract.

Enable `oxlint-plugin-effect` policy only for authored Effect-owned source.

`oxlint-plugin-effect` owns unconditional Effect syntax and structural policy.

`@effect/tsgo` owns semantic and type-aware Effect correctness.

Within the same diagnostic surface, one concern has one owner.

Exact duplicate-rule names are versioned compatibility data. Do not maintain their current list in documentation. Re-derive overlaps from the installed presets whenever either owning lint package changes.

The canonical generic syntax exception is:

```text
effect/noTernary
```

Effect should not introduce a different generic TypeScript syntax convention unless Effect semantics require that divergence.

Ordinary Keenko TypeScript permits useful ternaries while generic rules already reject problematic nested or unnecessary forms. Effect has no semantic reason to ban every conditional expression.

Inside Effect-owned source, disable generic async and Promise rules when they conflict with Effect's more specific async policy.

`effect/noAsyncFunction` owns authored async-function policy there.

Do not let a generic Promise rule push an Effect boundary callback toward `async`/`await` when the Effect rule then rejects that form.

Promise and callback interop at Effect boundaries should be adapted with the appropriate Effect abstraction rather than mechanically rewritten to `async`/`await`.

The exact lint override set belongs in the executable Oxlint configuration, not this document. When lint packages change, inspect their installed presets and re-derive the overlap rather than updating a prose copy.

Compose and provide Layers at application entry points.

Do not globally enable a lint rule that cannot distinguish legitimate entry-point Layer provisioning from the non-entry-point usage it intends to prevent. Enable such a rule only in a machine-identifiable scope where its semantics are correct; otherwise enforce the architectural distinction through structure and review.

The TypeScript language-service configuration is a separate surface.

Disable Effect language-service diagnostic emission globally when Oxlint owns those diagnostics:

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

Do not use language-service diagnostic severity configuration to control the Oxlint rule set.

In a mixed monorepo, keep type-aware linting in the root config and scope Effect-specific policy to authored Effect-owned workspaces or source.

Do not assume nested Oxlint configurations merge automatically. Follow the installed Oxlint configuration semantics.

## Imports

Canonical authored Effect 4 code prefers named imports from the package root, with local aliases when they improve readability:

```ts
import { Context, Effect as E, Layer, Match, Schema as S, Struct } from "effect";
```

Prefer adding other Effect modules to the same package-root import when the API is suitably exported there.

Use a subpath import only when the required API is not suitably available from the root or a real tooling/runtime constraint requires it.

For unstable or version-sensitive Effect APIs, inspect the installed package exports and first-party source before choosing an import path. Do not encode a historical subpath as permanent Keenko convention.

Do not rewrite vendored or generated code merely to enforce this authored-code convention.

## Effect-owned workflows and technical capabilities

Prefer Effect for workflows that compose:

- fallible or asynchronous operations;
- dependencies;
- retries or schedules;
- concurrency;
- typed failures;
- resource lifecycles;
- cancellation;
- tracing;
- schema decoding.

External promises and throwing APIs enter Effect at the boundary through the appropriate Effect constructor or adapter.

Run the Effect once at the outer framework/runtime boundary.

Within an Effect-owned workflow, prefer the Effect-native capability that owns a technical concern when it provides meaningful semantics such as:

- typed failures;
- dependency injection;
- cancellation;
- resource safety;
- retry/scheduling;
- concurrency;
- tracing;
- schema decoding.

Do not drop to a raw platform API and manually rebuild those semantics without a concrete reason.

This does not mean wrapping trivial deterministic synchronous helpers in Effect.

Pure helpers remain plain TypeScript.

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

Discourage:

```text
catch -> E.fail(mappedError)
```

when `E.mapError` expresses the same operation.

Discourage:

```text
flatMap -> E.succeed(mappedValue)
```

when `E.map` expresses the same operation.

Recovery combinators are for handlers that actually enter another Effect or recovery workflow.

When the operation is only typed failure A -> typed failure B, use `E.mapError`.

## `E.fn` naming

Every authored `E.fn` has an explicit stable tracing name.

Use:

```text
<domain>.<layer>.<operation>
```

For example:

```text
packs.data.get
packs.features.attachVideoForUpload
tvmaze.infra.search
```

The explicit string owns the stable operation and tracing identity.

Keep the callback anonymous rather than giving it a second semantic operation name:

```ts
const search = E.fn("tvmaze.infra.search")(function* (query: string) {
  // ...
});
```

Prefer Effect, Option, and Match combinators over manual branching when an appropriate semantic combinator exists.

Native `switch` remains fine outside Effect-oriented typed/exhaustive code or when materially clearer.

## Schema

Effect Schema is canonical for first-party schemas when this module is enabled.

- Schema values use the `s` prefix exclusively.
- Keep a schema-derived TypeScript type immediately below its schema declaration.
- Do not introduce first-party Zod schemas.
- Prefer Effect built-ins and transformations before custom wrappers.
- Standard Schema is an adapter at an actual consumer boundary, not a canonical representation and not an `s...` export.
- See `.keenko/docs/conventions/schema-types.md` for `Type`/`Encoded`, transport, persistence, representation, and ownership rules.

### Structural derivation

Prefer installed structural APIs over reconstructing schema field objects manually.

Common relationships include:

```ts
schema.mapFields(Struct.pick(["a"]));
schema.mapFields(Struct.omit(["a"]));
schema.mapFields(
  Struct.evolve({
    field: (field) => S.optionalKey(field),
  })
);
schema.pipe(
  S.fieldsAssign({
    other: S.String,
  })
);
```

Use installed Effect structural and Schema transformation facilities for the relationships they actually model.

Value-level `Struct.pick` and `Struct.omit` are appropriate for plain struct derivation, including selecting dependency maps from Keenko's canonical package specification map.

Inspect the installed API before copying syntax across Effect releases.

Composition and derivation can interact with checks and refinements. Preserve intended validation semantics rather than mechanically transforming a checked schema.

Optional-key semantics, explicit `undefined`, and nullability are separate concerns. Verify the installed Schema API when the distinction matters rather than relying on historical syntax.

## Errors and defects

Expected input, state, and operator failures use the typed Effect error channel.

Expected typed failures in owned Effect code use Schema-tagged error values rather than handwritten tagged-object unions, including backend-internal failures.

A canonical issue-bearing failure follows the shared validation guidance:

```ts
export const sTvMazeIssue = S.Literals(["unavailable", "invalid_response"]);
export type TvMazeIssue = typeof sTvMazeIssue.Type;

export class TvMazeFailure extends S.TaggedError<TvMazeFailure>()("TvMazeFailure", {
  issue: sTvMazeIssue,
  cause: S.optional(S.Defect()),
}) {}
```

`cause` is diagnostic and opaque.

Application behavior branches on stable `issue`, not on `cause`.

Do not automatically expose an internal cause through public/server-client failure contracts.

See `validation.md` for one-failure-versus-several and public-boundary rules.

Audit tagged-error `_tag` values when adding or modifying them. Tags must be unique and semantically correct.

Do not use JavaScript `throw` in owned application or Effect code.

Expected failures use `E.fail` and typed failures.

Genuine defects use Effect defect mechanisms such as:

```text
E.die
orDie
```

or the installed equivalent.

Foreign/native APIs that throw are caught or converted at their boundary with `E.try`, `E.tryPromise`, or the appropriate adapter.

Use defect paths only for:

- programmer errors;
- impossible integrity states;
- invalid required configuration;
- genuine invariants.

Do not promote ordinary expected failures to defects for convenience.

## Services and Layers

A real external or meaningfully substitutable infrastructure capability is an Effect service from its first real consumer, even when it initially exposes only one operation.

Examples include:

- provider APIs;
- email delivery;
- payment gateways;
- object storage;
- external AI providers.

This rule applies to capabilities, not deterministic helpers.

Once a capability is a service, expose one public capability API.

Do not:

- retain a parallel direct function for the same operation;
- create another service merely to wrap it;
- add a custom injection callback that duplicates a lower-level native Effect dependency.

When practical, use `make` as the canonical source of a service implementation and infer the service shape from it using the installed Effect facilities.

For example:

```ts
const make = E.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;

  const search = E.fn("tvmaze.infra.search")(function* (query: string) {
    // use httpClient and return application representations
  });

  return { search };
});
```

If construction is pure, use ordinary TypeScript inference such as `ReturnType<typeof make>` rather than introducing Effect solely for inference.

The service owns its primary and genuine variant Layers.

The primary implementation is conventionally `layer`.

Variants use descriptive names such as:

```text
layerTest
layerConfig
```

only when they actually exist.

Generated Confect/Effect services are used directly rather than wrapped merely to rename or re-export them.

### Leave lower-level requirements open

A provider Layer may require lower-level services.

Do not close those dependencies inside the adapter merely for convenience.

For example:

```text
TvMaze.layer
requires HttpClient
provides TvMaze
```

Outer runtime/application composition supplies the concrete transport.

Keep Layer composition and provisioning at that outer boundary.

## Effect-native platform capabilities

When Effect-owned code needs a capability that Effect or the selected Effect platform package already models, prefer that capability over a raw platform API.

Examples include:

- filesystem;
- paths;
- child processes;
- HTTP;
- crypto;
- encoding;
- configuration.

Use the Effect-native capability when it provides meaningful semantics such as:

- typed failures;
- dependency injection;
- resource safety;
- cancellation;
- testing seams;
- tracing.

Do not use `node:fs`, `node:path`, `node:child_process`, `node:crypto`, raw `fetch`, or equivalent platform primitives inside Effect-owned workflows when the installed Effect stack already provides the required abstraction.

Concrete runtime adapters belong at the outer platform boundary.

## Effect-native HTTP

When provider work is Effect-owned and the installed Effect stack provides a first-party HTTP client, depend on that client rather than raw `fetch` plus a custom injection seam.

Inspect the installed Effect exports for the canonical HTTP modules and request/response APIs. Do not preserve an old unstable import path solely because previous documentation used it.

Canonical provider adapters:

- depend on the Effect HTTP client capability;
- construct requests with structured request APIs rather than manually rebuilding query strings;
- use request APIs for headers;
- use native HTTP status/error semantics;
- decode untrusted JSON through Effect Schema using the installed response-decoding facilities;
- translate transport, status, and decode failures into stable provider failures;
- retain originating lower-level errors as diagnostic `cause` when useful.

Do not expose HTTP status as stable application failure data unless an actual consumer requires it.

## Native testing seams

The architecture exposes native Effect seams.

At feature level:

```text
fake provider service
    |
    v
feature
```

At infrastructure level:

```text
fake/test lower-level Effect capability
    |
    v
provider layer
```

Use those seams rather than adding custom injection callbacks.

Do not create another provider service solely to wrap the provider capability.

For filesystem, HTTP, child-process, crypto, configuration, and other Effect-native capabilities, test through their service/layer boundaries rather than bypassing them with direct Node/Bun APIs.

## Retry policy

Retry is not automatic merely because Effect supports it.

Retry changes observable:

- latency;
- request volume;
- rate-limit pressure;
- failure timing.

Use Effect-native retry facilities for idempotent infrastructure operations only when an explicit reliability and latency policy warrants retries.

Retry count, delay, backoff, and retryable failures require actual operational or product policy.

Do not add retries merely as framework decoration.

When retry policy exists, prefer installed Effect scheduling and retry facilities over hand-written retry loops.

## Match and issue translation

For reusable exhaustive pure mapping over a known finite union, prefer the installed `Match` API.

Conceptually:

```ts
const showIssueFrom = Match.type<TvMazeIssue>().pipe(
  Match.withReturnType<ShowIssue>(),
  Match.when("unavailable", () => "unavailable"),
  Match.when("invalid_response", () => "invalid_response"),
  Match.exhaustive
);
```

Inspect the installed Match API before copying syntax across versions.

Use `Match.value(value)` for an immediate concrete value when appropriate.

Use tag-specific Match APIs only when `_tag` is genuinely the discriminator. A plain `issue` string vocabulary is not a tagged union.

Cross-layer provider failure to feature failure translation uses the pure issue mapper plus `E.mapError`, not catch/recovery:

```ts
providerOperation(...).pipe(
  E.mapError(
    (failure) =>
      new ShowFailure({
        issue: showIssueFrom(failure.issue),
      }),
  ),
);
```

Do not copy an internal diagnostic cause into the public feature failure.

## Option and transport

`Option` is legitimate internal semantics for absence.

Convert it to plain transport values such as `null` at public server/client boundaries, or to a typed failure when absence is exceptional.

Do not expose Effect runtime types such as:

- `Option`;
- `Either`;
- services;
- fibers;
- causes.

in public server/client contracts unless the boundary is explicitly Effect-internal.

## Configuration

Use Effect `Config` inside Effect-managed code.

At genuinely native synchronous framework/provider setup boundaries, native generated environment access is appropriate when the framework requires it.

Missing or invalid required runtime configuration may defect at the runtime boundary.

Optional or business configuration stays typed when absence is meaningful.

## API-version discipline

Exact Effect API syntax is not Keenko architecture.

When an API is version-sensitive:

1. inspect the installed package exports and types;
2. inspect the installed/generated Effect guidance when available;
3. consult current first-party Effect documentation/source;
4. use the simplest installed API that models the intended relationship;
5. do not preserve historical compatibility syntax merely because it appears in an older document.

Update this document only when an upgrade changes a durable architectural convention, not whenever an Effect package version or API spelling advances.
