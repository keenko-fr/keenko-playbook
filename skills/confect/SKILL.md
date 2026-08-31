---
name: confect
description: Use when changing Confect specs, implementations, refs, codegen, or boundaries between Confect, Effect, Convex, and TanStack. Inspect installed versions and preserve Keenko schema, error, persistence, and native-boundary conventions.
---

# Confect specialist

Use this skill whenever work touches `@confect/*`, Confect specs/implementations/refs/codegen, Effect executed through Confect, or Confect/native Convex/client boundaries.

## Before editing

1. Read the consuming repository's `AGENTS.md` or `CLAUDE.md` instructions and root `CONTEXT.md`.
2. Read `.playbook/docs/stacks/confect/README.md`, `.playbook/docs/stacks/effect/README.md`, `.playbook/docs/stacks/convex/README.md`, and `.playbook/docs/conventions/schema-types.md`.
3. Read project architecture/overrides and relevant ADRs.
4. Inspect the exact installed Confect and Effect versions.
5. If an API/type/codec behavior is uncertain, inspect installed package source/types before relying on memory. Consult current official docs when necessary.
6. Use official Effect guidance for Effect library semantics and official Convex guidance for native Convex behavior.

Project-local decisions override the generic playbook.

## Architecture

Keep these responsibilities distinct even when shapes currently match:

```text
TanStack Form
  -> browser/application OUT boundary

TanStack Start validator
  -> web-server input boundary

Confect FunctionSpec Args
  -> backend API IN boundary

feature
  -> application/use-case orchestration

data
  -> focused persistence reads/writes

infra
  -> reusable technical/provider integration
```

Confect is the default application-function contract when enabled. Native Convex is still correct where components, workflows, third-party Convex libraries, generated/native APIs, or specific HTTP/provider/framework integrations require or materially benefit from a native `FunctionReference`.

Do not add wrappers merely to rename generated Confect services/refs or native Convex APIs.

## Schema and transport

- Effect Schema is canonical; schema values use the `s` prefix exclusively.
- Standard Schema is a consumer adapter (`S.toStandardSchemaV1`), not a canonical schema or `s...` export.
- Frontend Form, server-function input, and backend Args are separate trust boundaries. They may intentionally repeat composition.
- Share semantic primitive schemas; do not share complete transport structs merely to remove duplication.
- Do not import backend spec source into frontend/server application code to steal the Args schema.
- Backend Args independently normalize/validate input even when the browser/serverFn already validated it.
- Type direct callers from the generated ref contract (`Ref.Args<typeof refs...>`), not from a form/domain object.
- Use the codec-aware Confect runner/client path for server-side calls rather than manual encode/decode/casts.

Public/server-client contracts must be transport-safe. Do not leak Effect `Option`, `Either`, `Date`, services, causes, fibers, or other runtime-rich values across client serialization.

Persistence `Fields`/`Doc` may decode into Effect-rich backend values when the table codec encodes them to Convex-compatible primitives. Let Confect-generated DB services perform that encode/decode rather than manually converting `Option`/`null` around every call.

## Function and Effect style

- Every authored `E.fn` has an explicit tracing name using `<domain>.<layer>.<operation>`.
- Prefer semantic Effect/Option/Match combinators over manual branching when an appropriate combinator exists.
- Keep small recurring Effect helpers such as `onTrue`, `onFalse`, or `onSome` when they clarify control flow.
- Use `find` for legitimate absence and `get` for required/fail-on-missing semantics.
- Do not use JavaScript `throw` in owned Effect/application code. Convert foreign throwing APIs with `E.try`/`E.tryPromise`; use typed failures for expected conditions and Effect defect mechanisms for genuine defects.

## Errors

- Expected input/state/operator failures stay in the typed Effect error channel.
- Serializable public Confect failures use an appropriate schema-tagged contract.
- Backend-only failures may remain local when not part of the public API.
- One bounded-context Failure with a code union is preferred when payload/transport/handling are the same; split failure types when those semantics differ.
- Audit `_tag` uniqueness/correctness when adding/modifying tagged errors.
- Do not `orDie` ordinary expected failures; reserve defect paths for invalid required config, impossible integrity states, programmer errors, or genuine invariants.

## Query semantics

Confect queries are Convex queries. Do not make reactive query results depend on wall clock, randomness, or mutable process state. Persist time facts or evaluate time-sensitive policy in an appropriate action/HTTP/application boundary.

## Patch semantics

Do not mechanically choose one optionality shape:

- `S.optionalKey(...)` means omission is allowed but explicit `undefined` is not the value;
- `S.optional(...)` may preserve explicit `undefined`, including intentional Convex field clearing.

Prefer focused patch contracts when they encode invariants. Broad partial patches are valid only when every field is independently patchable; avoid schema explosion.

## Client and TanStack boundaries

- Browser queries use the best installed reactive integration (normally Convex/TanStack Query when enabled); do not force Effect execution into React for symmetry.
- Browser mutations may call Confect refs while TanStack Mutation owns pending/error/success UI state.
- TanStack Start server functions may use Effect internally for meaningful orchestration; run once at the server-function boundary.
- Keep Form -> serverFn -> Confect Args transforms explicit and owned by the boundary making the transition.

## Generated code and versions

- Never edit `confect/_generated` or `convex/_generated`.
- Run canonical codegen after spec/schema/ref changes and verify deterministic regeneration when contracts changed.
- Keep tightly coupled `@confect/*` prerelease packages exact-version aligned.
- Verify Effect peer compatibility.
- Keep prerelease workarounds narrow/documented; do not build permanent generic facades around an upstream mismatch.

## Verification

Run focused tests/type checks for the affected boundary, plus canonical codegen/check/typecheck/test/build categories as applicable before merge-ready review. Report only checks actually run.
