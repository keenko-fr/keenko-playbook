# Validation issues and failures

## Issue vocabulary

Use a canonical Effect Schema for each meaningful validation/application issue vocabulary and derive its TypeScript type from that schema.

- IDs are lowercase `snake_case` stable programmatic values.
- Prefer short context-local codes; prefix only when codes genuinely share a global namespace.
- Do not create enum-like constant objects solely to name literal issue values.
- Introduce a custom issue when the application needs specific copy/handling, the failure crosses a boundary, multiple consumers need to recognize it, or it represents a meaningful domain/application condition.
- Do not create operation-specific issue schemas merely to document which failures an implementation might produce.

`Issue` is a stable code. `Failure` is a typed Effect error-channel value.

Prefer one bounded-context failure type with a code union when failures share the same architecture handling. Use distinct failure types when payload, transport, or handling genuinely differs.

## User-facing validation

Issue codes never contain localized copy. A frontend feature maps issue IDs to Paraglide messages; the application form layer resolves them into field/UI errors. Never render raw issue IDs to users.

An application-wide generic localized fallback is allowed, but feature mappings should deliberately cover the stable IDs they own.
