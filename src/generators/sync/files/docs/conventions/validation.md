# Validation, issues, failures and defects

## Predicates and checks

| Prefix  | Contract                                   |
| ------- | ------------------------------------------ |
| `is`    | Boolean state/property predicate           |
| `has`   | Boolean presence/possession predicate      |
| `can`   | Boolean capability/permission predicate    |
| `check` | Validation that can return a typed failure |

A check may return an Effect, Result or useful success value. Do not use validate, verify, assert and require as interchangeable check synonyms. Keep actual `Schema.check`, decode/encode, programming assertions and technical operations such as `verifySignature` with their specific semantics. Do not extract every trivial condition.

Reusable deterministic business predicates belong in domain; structural Schema constraints stay local. Predicates used to construct a Schema must not depend circularly on that Schema. Use independent fact types or keep the predicate local when sharing would be disproportionate. Runtime validation stays at the Schema's boundary.

## Three error families

Group the context's used families in `errors/<concept>.ts`, not one file per family. Declare only meaningful vocabularies, with Schema-derived types immediately adjacent. This complete `errors/foo.ts` example illustrates all three families:

```ts
import { Schema as S } from "effect";

// SCHEMA ----------------------------------------------------------------------------------------------------------------------------------
export const sFooSchemaIssue = S.Literals(["invalid_state"]);
export type FooSchemaIssue = typeof sFooSchemaIssue.Type;

// FAILURES --------------------------------------------------------------------------------------------------------------------------------
export const sFooFailureIssue = S.Literals(["forbidden", "not_found"]);
export type FooFailureIssue = typeof sFooFailureIssue.Type;

export class FooFailure extends S.TaggedError<FooFailure>()("FooFailure", {
  issue: sFooFailureIssue,
}) {}

// DEFECTS ---------------------------------------------------------------------------------------------------------------------------------
export const sFooDefectIssue = S.Literals(["inconsistent_state"]);
export type FooDefectIssue = typeof sFooDefectIssue.Type;

export class FooDefect extends S.TaggedError<FooDefect>()("FooDefect", {
  issue: sFooDefectIssue,
}) {}
```

- SchemaIssue identifies a Schema contract violation. Decoding/checking uses native `S.SchemaError`, without compulsory custom FooValidation or FooSchemaError classes.
- FailureIssue identifies an expected caller-interpretable failure. Failures travel through Effect's typed error channel, for example `E.fail(new FooFailure({ issue: "forbidden" }))`.
- DefectIssue identifies an impossible internal state or invariant violation. Use `E.die(new FooDefect({ issue: "inconsistent_state" }))`, not the expected Failure channel.

A one-off defect may retain its original cause without a custom class/vocabulary. Invalid data does not automatically imply Failure or Defect: provenance and the owning trust boundary determine the category. Translation between categories must be explicit. A SchemaIssue vocabulary does not replace or wrap the native SchemaError.

Errors follow the owning operation's public contract. A resource data retrieval may translate expected missing relations or invalid configuration into resource-specific Failures without a forwarding feature. Pure predicates and cross-resource checks do not determine the category by themselves: retain SchemaError at schema boundaries and Defects for impossible persisted states. A workflow may translate a data Failure when it adds a materially different caller contract.

## Issue vocabulary and ownership

Issues are stable, short `snake_case` programmatic values. User messages stay separate. Prefer context-local values and no enum-like object merely to name literals.

Create a vocabulary for meaningful contract/business conditions or actual consumer handling, not to enumerate every implementation error. Use the category-qualified names `sFooSchemaIssue`, `sFooFailureIssue`, `sFooDefectIssue` and their derived types. Do not merge their distinct meanings into a generic FooIssue.

Context families stay together in `errors/<concept>.ts`, including data/feature/infra-owned contexts, declaring only used families. Do not create files for contexts with no custom errors. A real cross-workspace consumer can earn shared contract ownership.

Failure classes use the property `issue`; do not introduce competing reason/code fields for the same semantics. TaggedError classes already own their type identity and need no companion alias.

A contract imported by Confect specs remains client-safe. It may import safe Schema/contracts but must not import data/feature/infra implementations, generated server services, `@confect/server` or other server-only modules. The owning capability can retain internal diagnostic causes while the public boundary exposes only deliberate payload.

## One Failure or several

Prefer one bounded-context Failure while payload, transport, and caller handling are genuinely shared.

Split Failure classes only when a stable structural difference exists, for example:

- one issue requires payload that other issues must not carry;
- serialization or transport genuinely differs;
- caller recovery/handling genuinely differs.

Do not solve required issue-specific data by adding broad optional fields that make nonsensical combinations representable.

Do not expose a lower-level HTTP `status` or similar transport detail as stable Failure data merely because the underlying technical error happens to carry it. Add such data to a stable contract only when a real consumer requires it and the resulting structural distinction is meaningful.

## Diagnostic cause

Internal typed Failures preserve the originating technical cause when it is useful for diagnostics:

```ts
export class TvMazeFailure extends S.TaggedError<TvMazeFailure>()("TvMazeFailure", {
  issue: sTvMazeFailureIssue,
  cause: S.optional(S.Defect()),
}) {}
```

Use the original lower-level error/defect value rather than eagerly flattening it to a debug string. Examples include HTTP client errors, schema/decode errors, and storage/provider errors.

The semantics are distinct:

```text
issue
-> stable, semantic, programmatic

cause
-> diagnostic, opaque, not for application branching
```

Callers do not branch on `cause`. Do not fabricate a cause when no lower-level cause exists.

## Public boundaries

Do not automatically serialize internal diagnostic causes through public/server-client Failure contracts.

A public Failure exposes:

- stable issue;
- deliberately public payload only.

When an internal provider Failure becomes a public feature Failure, strip the raw provider/HTTP/schema cause. Preserve needed diagnostics before translation through internal logging, tracing, spans, metrics, or equivalent observability.

## Cross-layer Issue translation

A feature may propagate an infra capability's typed Failure directly when its stable vocabulary already accurately represents the feature's caller-visible semantics. Do not create an equivalent feature Failure solely to rename stable literals or preserve layer symmetry.

Create or translate to a feature-owned Failure when the feature adds policy: it combines lower-level failure domains, changes Issue semantics, hides unstable or provider-specific details, removes diagnostics that cannot cross the public boundary, collapses cases, adds feature-specific cases, or otherwise creates a materially different caller contract.

Use a named pure mapper such as:

```ts
function showIssueFrom(issue: TvMazeFailureIssue): ShowFailureIssue {
  // exhaustive pure mapping
}
```

Then map the Effect error channel:

```ts
providerOperation(...).pipe(
  E.mapError((failure) =>
    new ShowFailure({
      issue: showIssueFrom(failure.issue),
    }),
  ),
);
```

When translation is required, do not cast/pass a provider Issue through as if it were the feature Issue. Do not branch on diagnostic `cause`, and do not copy the provider cause into the public feature Failure.

For a reusable mapping over a known finite union, prefer the installed Effect `Match` API and make the mapping exhaustive. See the Effect stack guidance for exact version-aware matcher syntax and `E.mapError` versus recovery.

## User-facing validation

Issue values never contain localized copy. A frontend feature maps issue values to Paraglide messages; the application form layer resolves them into field/UI errors. Never render raw issue values to users.

An application-wide generic localized fallback is allowed, but feature mappings should deliberately cover the stable values they own.
