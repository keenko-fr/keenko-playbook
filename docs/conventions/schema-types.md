# Schema and representation conventions

Use representations that correspond to real ownership or runtime boundaries. Naming symmetry is never a reason to create another layer.

## Canonical vocabulary

For a persisted resource `Foo`:

- `sFooFields` / `FooFields`: application-owned persisted fields, excluding Convex `_id` and `_creationTime`;
- `sFooDoc` / `FooDoc`: complete decoded persistence document including system fields;
- `sFoo` / `Foo`: canonical application/transport representation;
- `sFooInsert` / `FooInsert`: application-controlled creation payload required to create `Foo`;
- `sFooApiDto` / `FooApiDto`: genuine external provider/API-owned representation only.

Every persisted resource exposes `Fields`, `Doc`, and `Foo`. `Insert`, `Patch`, `ApiDto`, and other contracts exist when meaningful. Do not introduce `Entity`, generic `Dto`, `Entry`, `View`, or `ViewModel` synonyms.

Effect Schema values use the `s` prefix exclusively. An `s...` value is an Effect Schema, never a Standard Schema adapter.

## Type vs encoded representation

Use `typeof sFoo.Type` for the normal decoded TypeScript type. Use `.Encoded` only at a boundary that explicitly needs the encoded side of a transforming schema. Do not routinely export parallel `FooEncoded` types; keep encoded aliases boundary-local.

`FooFields` and `FooDoc` are backend/persistence decoded representations and may use useful Effect-native values such as `Option` when the schema encodes them to Convex-compatible primitives.

`Foo` is different: `sFoo.Type` itself must be transport-safe/plain. Do not put `Option`, `Either`, `Date`, Effect classes, fibers, causes, services, or other runtime-specific values in a server/client application contract and rely on callers to remember to encode them.

## Absence and nullability

For persisted fields that conceptually exist but currently have no value, prefer a stable explicit `null` encoding. `S.OptionFromNullOr(...)` is appropriate when backend logic genuinely benefits from `Option`:

```text
Convex/wire: null | string
Doc/Fields Type: Option<string>
Foo Type: null | string
```

Reserve omitted keys for contracts where presence itself has semantics, especially patches and genuinely optional inputs.

For patch semantics, distinguish intentionally:

- `S.optionalKey(...)`: key may be absent; explicit `undefined` is not the value;
- `S.optional(...)`: explicit `undefined` can be preserved and may intentionally clear an optional Convex field.

Do not mechanically choose one form for every patch.

## Fields, Doc, Insert, Patch

Start persisted resources from `sFooFields`; derive `sFooDoc` using the installed Confect/Convex system-field facility rather than manually recreating `_id` and `_creationTime`.

`FooInsert` is the application-controlled creation payload, not necessarily the complete object ultimately passed to storage. Server-owned/defaulted values such as state, timestamps, actor IDs, generated slugs/versions, and provider correlation state may be added by the feature/data layer.

Derive `Insert` from `Fields` when field semantics are identical. Define an independent field schema only when the representation genuinely differs.

Do not require a generic `FooPatch`. Use a reusable patch schema when there is a meaningful shared patch contract; prefer focused operation-specific patch contracts when invariants differ. Broad partial patches are acceptable only when every field is independently patchable.

## Timestamps

- Use Convex `_creationTime` as the default technical creation timestamp. Do not add `createdAt` merely to duplicate it.
- Add explicit timestamps for distinct domain events (`publishedAt`, `requestedAt`, `paidAt`, etc.).
- Add `updatedAt` only when last-modified semantics are genuinely used for UI, ordering, synchronization, concurrency, audit, or another product need.
- Application-owned persisted timestamps use a shared semantic schema for finite, non-negative integer epoch milliseconds.
- Keep timestamps numeric through normal backend/application transport. Create a temporary `Date` only when a local algorithm/API specifically benefits; do not add a Date hydration layer.
- Obtain `now` at a trusted outer mutation/action boundary and pass the same value through a workflow when consistency matters. A small `WithNow<T>`-style helper is legitimate shared semantics.

## Transforms

Name transforms by the representation they produce:

- `fooFrom(...)` produces `Foo`;
- `fooDocFrom(...)` produces `FooDoc` when a reverse conversion genuinely exists;
- `fooApiDtoFrom(...)` produces an external API DTO when needed.

Do not encode the source in the function name and do not create identity transforms for symmetry.

`fooFrom` is the natural place to flatten persistence richness (for example `Option<string>` to `string | null`) and project only application-needed system fields. `Foo` is not mechanically “Doc minus system fields”; it exposes exactly the application contract the caller needs.

## External APIs

`ApiDto` models the provider's real accepted/returned representation faithfully. Convert at the adapter boundary into application types; do not distort the provider DTO to look like `Foo`.

## Validation and transformations

Decode untrusted data at the owning boundary (HTTP/provider/form/server function/persistence). Once inside a correctly typed internal layer, do not repeatedly decode the same value merely for reassurance.

When generated Confect persistence services are used, pass the decoded representation they expect and let their codecs encode/decode storage. Do not manually convert `Option`/`null` around every DB call.

Use transforming schemas only when encoded and decoded representations genuinely differ in useful semantics. Do not add transformations to make types appear richer or to hide transport mismatches.

## Semantic primitives and finite vocabularies

Share semantic primitive schemas such as canonical email, slug, timestamp, or non-empty trimmed text at the narrowest genuinely shared layer. Prefer Effect built-ins when they already express the semantics; do not wrap a built-in merely to rename it.

Brand a primitive only when nominal distinction materially prevents real mistakes between otherwise identical values. Validation alone does not imply a brand.

Stable finite programmatic vocabularies use one canonical `S.Literals([...])` schema and derive the TypeScript type from it. Do not separately maintain an enum/string union/runtime constant object.
