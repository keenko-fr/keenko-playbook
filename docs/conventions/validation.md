# Validation issues and failures

## Issue vocabulary

`Issue` is stable programmatic vocabulary. `Failure` is a typed Effect error-channel value.

Use one canonical Effect Schema for each meaningful finite issue vocabulary and derive its TypeScript type immediately below that schema:

```ts
import { Schema as S } from "effect";

export const sShowIssue = S.Literals(["unavailable", "invalid_response"]);
export type ShowIssue = typeof sShowIssue.Type;
```

- Issue values are lowercase `snake_case` stable programmatic values.
- User-facing copy never lives in issue values.
- Prefer short context-local issue values; prefix only when values genuinely share a global namespace.
- Do not create enum-like constant objects solely to name literal issue values.
- Introduce a custom issue when the application needs specific copy/handling, the failure crosses a boundary, multiple consumers need to recognize it, or it represents a meaningful domain/application condition.
- Do not create operation-specific issue schemas merely to document which failures an implementation might produce.

Keep the issue schema at the narrowest genuinely shared owner. If one backend feature owns the vocabulary, keep it feature-local. If another workspace/runtime later genuinely consumes the same vocabulary, move/expose the canonical schema through the earned shared package boundary rather than importing backend implementation files.

## Expected typed Failures

Expected typed failures in owned Effect code use Schema-tagged error values. Do not maintain handwritten tagged-object unions as a parallel canonical Failure model.

A Failure carrying canonical issue semantics uses the property name `issue`:

```ts
export class ShowFailure extends S.TaggedError<ShowFailure>()(
  "ShowFailure",
  {
    issue: sShowIssue,
  },
) {}
```

The class already provides the TypeScript type identity `ShowFailure`; do not add a redundant companion alias.

Do not use competing canonical field names such as `reason` or `code` for the Failure's issue field.

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
export class TvMazeFailure extends S.TaggedError<TvMazeFailure>()(
  "TvMazeFailure",
  {
    issue: sTvMazeIssue,
    cause: S.optional(S.Defect()),
  },
) {}
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

Each layer owns its Issue vocabulary. Translate provider semantics into feature/application semantics at the Issue boundary, even when the current string values happen to align.

Use a named pure mapper such as:

```ts
function showIssueFrom(issue: TvMazeIssue): ShowIssue {
  // exhaustive pure mapping
}
```

Then map the Effect error channel:

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

Do not cast/pass a provider Issue through as if it were the feature Issue. Do not branch on diagnostic `cause`, and do not copy the provider cause into the public feature Failure.

For a reusable mapping over a known finite union, prefer the installed Effect `Match` API and make the mapping exhaustive. See the Effect stack guidance for exact version-aware matcher syntax and `E.mapError` versus recovery.

## User-facing validation

Issue values never contain localized copy. A frontend feature maps issue values to Paraglide messages; the application form layer resolves them into field/UI errors. Never render raw issue values to users.

An application-wide generic localized fallback is allowed, but feature mappings should deliberately cover the stable values they own.
