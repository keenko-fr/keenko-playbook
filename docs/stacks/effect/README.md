# Effect

Effect is a stack module, not a universal requirement. Plain synchronous helpers remain plain TypeScript when Effect adds no value.

## Tooling

Effect-enabled TypeScript repositories require `@effect/tsgo` and `oxlint-plugin-effect` in addition to the canonical TypeScript tooling. The v1 pins are `@effect/tsgo@0.38.0` and `oxlint-plugin-effect@0.11.0`; the matching universal pins are recorded in `docs/core/tooling.md`.

Treat `@effect/tsgo`, TypeScript, Oxlint, and `oxlint-tsgolint` as one compatibility unit. Before an upgrade, inspect the installed/current `@effect/tsgo` supported-components manifest and move the supported pins together. Re-check the pinned `oxlint-plugin-effect` pairing at the same time because its recommended rule set and overlap with Effect tsgo are convention behavior.

Use `effect-tsgo patch --oxlint` after dependency installation so the Effect TypeScript-Go integration owns both the TypeScript and Oxlint integration. Keep root Oxlint `options.typeAware: true`. Extend the `@effect/tsgo/oxlint-presets` recommended preset so semantic/type-aware Effect diagnostics surface through Oxlint. When the Effect language-service plugin is enabled, set its `diagnostics` option to `false` so editor/LSP diagnostics are not duplicated; `typecheck` remains the separate TypeScript compiler verification contract.

Also enable the `oxlint-plugin-effect` recommended preset for authored Effect source. It owns unconditional Effect syntax/structural policy while `@effect/tsgo` owns semantic/type-aware Effect correctness. Keep the plugin's recommended rules active when the same concern also exists in Effect tsgo; for the pinned `oxlint-plugin-effect@0.11.0` pairing, disable the corresponding tsgo diagnostics instead. The canonical plugin exception is `effect/noTernary`, because a blanket ternary ban is stylistic rather than a correctness rule.

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
    // Keep the repository's normal Keenko overrides after the upstream presets.
  },
});
```

For the pinned plugin version, keep its unconditional rules and turn off the documented overlapping Effect tsgo diagnostics in the `@effect/language-service` plugin options. Preserve the other type-aware diagnostics, including `floatingEffect`, `runEffectInsideEffect`, `strictEffectProvide`, `extendsNativeError`, and `unsafeEffectTypeAssertion`.

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "diagnostics": false,
        "diagnosticSeverity": {
          "asyncFunction": "off",
          "cryptoRandomUUID": "off",
          "cryptoRandomUUIDInEffect": "off",
          "globalConsole": "off",
          "globalConsoleInEffect": "off",
          "globalDate": "off",
          "globalDateInEffect": "off",
          "globalFetch": "off",
          "globalFetchInEffect": "off",
          "globalRandom": "off",
          "globalRandomInEffect": "off",
          "globalTimers": "off",
          "globalTimersInEffect": "off",
          "newPromise": "off",
          "nodeBuiltinImport": "off",
          "preferSchemaOverJson": "off",
          "processEnv": "off",
          "processEnvInEffect": "off",
          "tryCatchInEffectGen": "off"
        }
      }
    ]
  }
}
```

This duplicate list is versioned upstream behavior, not a permanent hand-maintained Keenko catalog. Re-read the installed `oxlint-plugin-effect` pairing guidance whenever either Effect lint package changes and update the list only when upstream changes it.

In a mixed monorepo, keep type-aware linting in the root config and scope Effect-only policy to the Effect-owned workspaces instead of leaking it into non-Effect code. Use root overrides or an explicitly inherited package config according to the installed Oxlint configuration semantics; do not assume nested configs merge automatically, and keep root-only `options.typeAware` at the repository root.

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
