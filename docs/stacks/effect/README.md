# Effect

Effect is a stack module, not a universal requirement. Plain synchronous helpers remain plain TypeScript when Effect adds no value.

## Tooling

Effect-enabled TypeScript repositories require `@effect/tsgo` and `oxlint-plugin-effect` in addition to the canonical TypeScript tooling. The v1 pins are `@effect/tsgo@0.38.0` and `oxlint-plugin-effect@0.11.0`; the matching universal pins are recorded in `docs/core/tooling.md`.

Treat `@effect/tsgo`, TypeScript, Oxlint, and `oxlint-tsgolint` as one compatibility unit. Before an upgrade, inspect the installed/current `@effect/tsgo` supported-components manifest and move the supported pins together.

Use `effect-tsgo patch --oxlint` after dependency installation so the Effect TypeScript-Go integration owns both the TypeScript and Oxlint integration. Keep root Oxlint `options.typeAware: true`. Extend the `@effect/tsgo/oxlint-presets` recommended preset so semantic/type-aware Effect diagnostics surface through Oxlint. When the Effect language-service plugin is enabled, set its `diagnostics` option to `false` so editor/LSP diagnostics are not duplicated; `typecheck` remains the separate TypeScript compiler verification contract.

Also enable the `oxlint-plugin-effect` recommended preset for authored Effect source. It owns unconditional Effect syntax/structural policy while `@effect/tsgo` owns semantic/type-aware Effect correctness. Keep only explicit Keenko exceptions with rationale; the canonical baseline disables `effect/noTernary` because a blanket ternary ban is stylistic rather than a correctness rule. Where the plugin documents a diagnostic duplicated by `@effect/tsgo`, disable the duplicate plugin rule and retain the type-aware `effecttsgo` diagnostic.

In a mixed monorepo, keep type-aware linting in the root config and add a nested Effect package `oxlint.config.ts` only when needed to extend the root plus the Effect presets. Do not copy the root rule catalog into the package config.

## Imports

Canonical authored Effect 4 code prefers named imports from the package root, with local aliases when they improve readability:

```ts
import { Effect as E, Schema as S } from "effect";
```

Prefer adding other Effect modules to the same root import rather than defaulting to namespace subpath imports such as `effect/Effect` or `effect/Schema`.

Use a subpath import only when the required API is not suitably available from the root or a real tooling/runtime constraint requires it. Do not rewrite vendored/generated code merely to enforce this authored-code convention.

## When Effect owns the workflow

Prefer Effect for workflows that compose fallible/async operations, dependencies, retries, concurrency, typed failures, or resource lifecycles. External promises/throwing APIs enter Effect at the boundary through the appropriate `Effect` constructor/adapter; run the Effect once at the outer framework boundary.

Every authored `E.fn` has an explicit stable tracing name. Use `<domain>.<layer>.<operation>`, for example:

```text
packs.data.get
packs.features.attachVideoForUpload
storage.data.remove
```

Prefer Effect/Option/Match combinators over manual branching when an appropriate semantic combinator exists (`O.match`, `O.exists`, `E.filterOrFail`, `E.catchTag`, `E.all`, `Match`, etc.). Small shared helpers such as `onTrue`, `onFalse`, and `onSome` are legitimate when they make recurring Effect control flow clearer.

Prefer Effect `Match` for typed/exhaustive Effect-oriented branching. Native `switch` remains fine outside that context or when materially clearer.

## Schema

Effect Schema is canonical for first-party schemas when this module is enabled.

- Schema values use the `s` prefix exclusively.
- Do not introduce first-party Zod schemas.
- Prefer Effect built-ins and transformations before custom wrappers.
- Standard Schema (`S.toStandardSchemaV1`) is an adapter at an actual consumer boundary, not a canonical representation and not an `s...` export.
- See `.playbook/docs/conventions/schema-types.md` for `Type`/`Encoded`, transport, persistence, and representation rules.

## Errors and defects

Expected input/state/operator failures use the typed Effect error channel. Schema-tagged errors are appropriate when a failure is part of a serialized Confect/public contract; backend-only failures may stay local.

Audit tagged-error `_tag` values when adding/modifying them; tags must be unique and semantically correct.

Do not use JavaScript `throw` in owned application/Effect code. Expected failures use `E.fail`/typed failures. Genuine defects use Effect defect mechanisms (`E.die`, `orDie`, equivalent). Foreign/native APIs that throw are caught/converted at their boundary with `E.try`, `E.tryPromise`, or the appropriate adapter.

Use defect paths only for programmer errors, impossible integrity states, required invalid configuration, or genuine invariants. Do not promote ordinary expected failures to defects for convenience.

## Option and transport

`Option` is legitimate internal semantics for absence. Convert it to plain values such as `null` at public/server-client transport boundaries, or to a typed failure when absence is exceptional.

Do not expose Effect runtime types (`Option`, `Either`, services, fibers, causes, etc.) in public server/client contracts unless the boundary is explicitly Effect-internal.

## Services and configuration

- Introduce `Context.Service` only when substitution/layering provides real value.
- Use generated Confect/Effect services directly rather than wrappers that only rename/re-export them.
- Use Effect `Config` inside Effect-managed code. At genuinely native synchronous Convex/provider setup boundaries, native generated environment access is appropriate.
- Missing/invalid required runtime configuration may defect at the runtime boundary. Optional/business configuration stays typed when absence is meaningful.

For Effect API and tooling details, inspect the installed Effect guidance/source before relying on memory.
