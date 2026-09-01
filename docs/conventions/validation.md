# Validation issues and failures

## Issue vocabulary

`Issue` is a stable programmatic code/vocabulary. `Failure` is a typed Effect error-channel value.

Use one canonical Effect Schema for each meaningful finite issue vocabulary and derive its TypeScript type from that schema:

```ts
import { Schema as S } from "effect";

export const sShowIssue = S.Literals(["unavailable", "invalid_response"]);

export type ShowIssue = typeof sShowIssue.Type;
```

- Issue IDs are lowercase `snake_case` stable programmatic values.
- Prefer short context-local issue values; prefix only when values genuinely share a global namespace.
- Do not create enum-like constant objects solely to name literal issue values.
- Introduce a custom issue when the application needs specific copy/handling, the failure crosses a boundary, multiple consumers need to recognize it, or it represents a meaningful domain/application condition.
- Do not create operation-specific issue schemas merely to document which failures an implementation might produce.

Keep the issue schema at the narrowest genuinely shared owner. If one backend feature owns the vocabulary, keep it feature-local. If another workspace/runtime later genuinely consumes the same vocabulary, move/expose the canonical schema through the earned shared package boundary rather than importing backend implementation files.

## Failure payloads

Typed failures that carry a canonical issue vocabulary use the property name `issue`:

```ts
export class ShowFailure extends S.TaggedError<ShowFailure>()("ShowFailure", {
  issue: sShowIssue,
}) {}
```

Do not use competing canonical field names such as `reason` or `code` for this Failure field.

Prefer one bounded-context Failure where failures share transport and handling. Use distinct failure types only when payload, transport, or handling genuinely differs.

## User-facing validation

Issue values never contain localized copy. A frontend feature maps issue values to Paraglide messages; the application form layer resolves them into field/UI errors. Never render raw issue values to users.

An application-wide generic localized fallback is allowed, but feature mappings should deliberately cover the stable values they own.
