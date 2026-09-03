# Schema and representation conventions

Use representations that correspond to real ownership or runtime boundaries. Naming symmetry is never a reason to create another layer.

## Canonical vocabulary

For a persisted resource `Foo`:

- `sFooFields` / `FooFields`: application-owned persisted fields, excluding Convex `_id` and `_creationTime`;
- `sFooDoc` / `FooDoc`: complete decoded persistence document including system fields;
- `sFoo` / `Foo`: canonical application/transport representation;
- `sFooInsert` / `FooInsert`: application-controlled creation payload required to create `Foo`;
- focused Patch contracts: operation-scoped update payloads when the operation owns meaningful invariants;
- `sFooApiDto` / `FooApiDto`: genuine external provider/API-owned representation only.

Every persisted resource exposes `Fields`, `Doc`, and `Foo`. `Insert`, Patch contracts, `ApiDto`, and other representations exist when meaningful. Do not introduce `Entity`, generic `Dto`, `Entry`, `View`, or `ViewModel` synonyms. `ENTITY` below is a section heading, not another representation name.

Effect Schema values use the `s` prefix exclusively. An `s...` value is an Effect Schema, never a Standard Schema adapter.

## Schema-derived type adjacency

When an authored Effect Schema declaration owns a TypeScript representation, keep the derived type immediately below the schema with no blank line:

```ts
export const sFoo = S.Struct({ name: S.String });
export type Foo = typeof sFoo.Type;
```

If an encoded alias is genuinely needed, keep the schema-owned cluster contiguous:

```ts
export const sFoo = S.Struct({ count: S.NumberFromString });
export type Foo = typeof sFoo.Type;
export type FooEncoded = typeof sFoo.Encoded;
```

Do not routinely export encoded aliases. Private schemas do not need artificial exported companion types.

`TYPES` sections remain valid in file grammars for standalone types that do not correspond directly to a colocated schema declaration, such as helper types and function contracts. Do not collect schema-derived aliases in a trailing generic `TYPES` section.

A class declared with `S.TaggedError` already provides its TypeScript type identity. Do not add a redundant alias for it.

## Schema ownership

Keep every schema at the narrowest layer that genuinely owns its semantics. Do not move a schema merely because it is an Effect Schema.

- Endpoint-only Confect input/output details stay with the endpoint/spec; simple one-use schemas normally stay inline.
- Feature-local application schemas and issue vocabularies stay with the feature.
- Application representations genuinely shared across multiple backend layers belong in `packages/backend/schemas/<resource>.ts`.
- Provider-owned wire/API representations belong in `packages/backend/schemas/<provider>/<resource>.ts` from the first real provider schema.
- Persistence-only schemas, including focused patches used only by data, stay with the narrowest persistence/data owner.
- Infra `Issue` / `Failure` schemas stay with the infra capability because they describe our adapter contract rather than the provider wire format.
- Move/expose an application schema through `packages/shared/schemas` only when a real second workspace/runtime consumes the same representation; do not create `packages/shared` in anticipation of that consumer.

`packages/backend/schemas` owns organized representation schemas, not every Effect Schema in the backend.

For example:

```text
packages/backend/
  schemas/
    shows.ts
    tvmaze/
      shows.ts
  features/
    shows.ts
  infra/
    tvmaze.ts
```

Here `schemas/shows.ts` owns the shared application `Show` representations, `schemas/tvmaze/shows.ts` owns TVMaze wire representations, and `infra/tvmaze.ts` owns the adapter capability and provider-to-application conversion.

Do not add `schemas/providers/`. Do not default to a flat `schemas/tvmaze.ts` when the provider contract has a meaningful resource/domain filename. Create provider-wide primitive/common files only after genuine reuse appears; do not speculate `common.ts` or `shared.ts`.

See `backend-architecture.md` for package/layer boundaries and `validation.md` for `Issue` / `Failure` vocabulary.

## Persisted resource schema files

Persisted resource schema modules use this major order:

```text
CONSTANTS
FIELDS
ENTITY
INSERT
PATCH
INTERNALS
```

Omit empty sections. Use the separator mechanics from `backend-file-topology.md`.

- `CONSTANTS` owns semantic leaf schemas and genuine constants, including finite vocabularies, branded IDs, bounded semantic scalars, other semantic primitives, and real runtime constants.
- `FIELDS` owns `sFooFields` / `FooFields` and `sFooDoc` / `FooDoc`. `FooDoc` stays in `FIELDS`; do not create a `DOC` section.
- `ENTITY` owns `sFoo` / `Foo` and schema-owned representation-producing helpers such as `fooFrom(...)` when they are warranted.
- `INSERT` owns `sFooInsert` / `FooInsert` when creation is meaningful.
- `PATCH` exists only when the shared schema module genuinely owns a reusable patch contract.
- `INTERNALS` owns only genuine private implementation helpers.

Do not introduce competing headings such as `DOC`, `TRANSFORMS`, `PRIMITIVES`, `VALUES`, or `ENUMS`.

A representative file can begin like this:

```ts
// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
export const sWatchlistStatus = S.Literals(["planned", "watching", "completed", "dropped"]);
export type WatchlistStatus = typeof sWatchlistStatus.Type;

// FIELDS ----------------------------------------------------------------------------------------------------------------------------------
export const sWatchlistFields = S.Struct({ tvmazeId: sTvmazeId, status: sWatchlistStatus });
export type WatchlistFields = typeof sWatchlistFields.Type;

export const sWatchlistDoc = SystemFields.extendWithSystemFields("watchlist", sWatchlistFields);
export type WatchlistDoc = typeof sWatchlistDoc.Type;

// ENTITY ----------------------------------------------------------------------------------------------------------------------------------
export const sWatchlist = sWatchlistFields;
export type Watchlist = typeof sWatchlist.Type;

// INSERT ----------------------------------------------------------------------------------------------------------------------------------
export const sWatchlistInsert = sWatchlistFields;
export type WatchlistInsert = typeof sWatchlistInsert.Type;
```

For Confect `10.0.0-next.21`, `SystemFields.extendWithSystemFields(tableName, schema)` takes the table name first and the schema second. Inspect the installed Confect source before documenting exact syntax for another version. Do not manually recreate `_id` or `_creationTime`.

Non-persisted, provider, and other schema owners are not forced into this persisted-resource grammar. Organize them only by relevant semantics while still following the universal adjacency, derivation, narrowest-owner, and no-duplicate-declaration rules.

## One structural authority and derivation

Related schemas derive, compose, or alias rather than independently repeating equivalent field declarations.

If `Foo` currently has the same field semantics as `Fields`, preserve the meaningful representation name but alias/derive it:

```ts
export const sFoo = sFooFields;
export type Foo = typeof sFoo.Type;
```

Likewise, if creation semantics are identical:

```ts
export const sFooInsert = sFooFields;
export type FooInsert = typeof sFooInsert.Type;
```

Do not create an identity `fooFrom` merely for symmetry. `Foo`, `Fields`, and `Insert` remain independent semantic representations even when their schemas currently alias; they may evolve separately later.

Derive from the nearest representation that already owns the facts you need. For Effect 4, inspect the installed API and prefer its structural algebra over reconstructing field objects manually. Supported Effect `4.0.0-beta.107` examples include:

```ts
const sSelected = schema.mapFields(Struct.pick(["a", "b"]));
const sWithoutMetadata = schema.mapFields(Struct.omit(["metadata"]));
const sEvolved = schema.mapFields(Struct.evolve({ field: (field) => S.optionalKey(field) }));
const sExtended = schema.pipe(S.fieldsAssign({ other: S.String }));
```

Use the installed equivalents of `Struct.assign`, `S.toEncoded(...)`, `S.toType(...)`, `S.decodeTo(...)`, and Schema transformation facilities when they express the actual relationship. For values, prefer `Struct.pick` / `Struct.omit` when the operation is structural projection.

Do not default to raw reconstruction such as `S.Struct({ ...otherSchema.fields })` when an installed structural API expresses the relationship directly.

Schema composition can interact with checks/refinements. Preserve intended validation semantics rather than applying a transformation mechanically. In particular, inspect the installed `mapFields`/composition behavior when the source schema carries checks.

## Fields, Doc, Foo, Insert, and Patch

`sFooFields` owns application-controlled persisted field semantics.

`sFooDoc` derives from `sFooFields` with the installed Confect/Convex system-field facility.

`sFoo` owns the canonical application/transport representation. It is an explicit stable application contract, not mechanically “Fields/Doc minus system fields.” If `Foo` and `Fields` currently have identical semantics, alias/derive rather than restating fields. If they differ, express that difference explicitly.

`sFooInsert` owns creation semantics. Creation APIs accept `FooInsert`, not `FooFields` or `Foo`, even when the current shapes coincide. Server-owned/defaulted values may still be added by the feature/data layer.

A Patch represents operation scope and invariants, not “make every selected field optional.” For a status-only operation where status is required:

```ts
const sWatchlistStatusPatch = sWatchlistFields.mapFields(Struct.pick(["status"]));
type WatchlistStatusPatch = typeof sWatchlistStatusPatch.Type;
```

Do not make `status` optional merely because the representation is called a patch. Do not manufacture a broad partial Patch contract for symmetry.

The narrowest owner wins. If a focused patch is only a persistence/data contract, keep it data-local under that file's `SCHEMAS` section while deriving it from shared `Fields`. Move a patch into the shared schema module's `PATCH` section only when it is genuinely a cross-layer representation.

Do not collapse an already-earned focused Patch to a naked scalar merely because it currently contains one field.

## Absence, optionality, and nullability

For persisted fields that conceptually exist but currently have no value, prefer a stable explicit `null` encoding. `S.OptionFromNullOr(...)` is appropriate when backend logic genuinely benefits from `Option`:

```text
Convex/wire: null | string
Doc/Fields Type: Option<string>
Foo Type: null | string
```

Reserve omitted keys for contracts where presence itself has semantics, especially patches and genuinely optional inputs.

For Effect `4.0.0-beta.107`, distinguish intentionally:

- `S.optionalKey(schema)`: the key may be absent; explicit `undefined` is not automatically accepted as the field value;
- `S.optional(schema)`: absence/explicit `undefined` semantics differ and may be appropriate when intentionally clearing an optional value;
- nullability is separate.

Use `Struct.evolve` plus the appropriate optional schema when omission genuinely carries semantics. Inspect installed Effect behavior before copying exact optionality syntax across versions.

## Transform ownership

Name transforms by the representation they produce:

- `fooFrom(...)` produces `Foo`;
- `fooDocFrom(...)` produces `FooDoc` when a reverse conversion genuinely exists;
- `fooApiDtoFrom(...)` produces `FooApiDto` when needed.

Do not encode the source representation in the function name and do not create transforms for symmetry.

Ownership follows the target/boundary semantics:

- shared `Doc -> Foo` projection lives beside the canonical `Foo` representation;
- provider `ApiDto -> Foo` conversion lives in infra because it crosses provider/application owners;
- persistence-only conversion lives in data;
- workflow/business transition lives in the feature.

Use declarative Effect Schema transformation only when the relationship is honestly an encoded/decoded representation with appropriate reversible semantics. Use a plain deterministic TypeScript helper for information-losing projection, metadata dropping, one-way normalization, or other non-reversible mapping.

For example, if `Foo === Fields` and `FooDoc` differs only by system fields:

```ts
export function fooFrom(doc: FooDoc): Foo {
  return Struct.omit(doc, ["_id", "_creationTime"]);
}
```

Prefer value-level structural projection over manually maintaining another field object when that is the actual operation. Do not re-decode a trusted `FooDoc` solely to project it.

## Provider API representations

`ApiDto` models a provider's real accepted/returned representation faithfully. Decode provider data at the provider boundary, then normalize it to application representations before it leaves the adapter.

A provider schema file follows schema/type adjacency and derivation rules but does not inherit persisted-only headings such as `FIELDS`, `INSERT`, or `PATCH` unless those concepts genuinely apply.

The TVMaze validation case therefore uses `schemas/tvmaze/shows.ts` for provider schemas such as:

```text
sImageApiDto / ImageApiDto
sShowApiDto / ShowApiDto
sSearchResultApiDto / SearchResultApiDto
sSearchResponseApiDto / SearchResponseApiDto
```

`SearchResponseApiDto` is the clear name for that validation case; it is not a universal requirement for every provider response.

Provider-to-application conversion remains in infra. A helper such as `showFrom(show: ShowApiDto): Show` is a private deterministic helper under the adapter's `INTERNALS`; do not move it into the provider schema file and make that owner depend on the application representation.

## Type vs encoded representation

Use `typeof sFoo.Type` for the normal decoded TypeScript type. Use `.Encoded` only at a boundary that explicitly needs the encoded side of a transforming schema. Do not routinely export parallel `FooEncoded` types; keep encoded aliases boundary-local unless a stable owned contract requires one.

`FooFields` and `FooDoc` are backend/persistence decoded representations and may use useful Effect-native values such as `Option` when the schema encodes them to Convex-compatible primitives.

`Foo` is different: `sFoo.Type` itself must be transport-safe/plain. Do not put `Option`, `Either`, `Date`, Effect classes, fibers, causes, services, or other runtime-specific values in a server/client application contract and rely on callers to remember to encode them.

## Timestamps

- Use Convex `_creationTime` as the default technical creation timestamp. Do not add `createdAt` merely to duplicate it.
- Add explicit timestamps for distinct domain events (`publishedAt`, `requestedAt`, `paidAt`, etc.).
- Add `updatedAt` only when last-modified semantics are genuinely used for UI, ordering, synchronization, concurrency, audit, or another product need.
- Application-owned persisted timestamps use a shared semantic schema for finite, non-negative integer epoch milliseconds.
- Keep timestamps numeric through normal backend/application transport. Create a temporary `Date` only when a local algorithm/API specifically benefits; do not add a Date hydration layer.
- Obtain `now` at a trusted outer mutation/action boundary and pass the same value through a workflow when consistency matters. A small `WithNow<T>`-style helper is legitimate shared semantics.

## Validation and transformations

Decode untrusted data at the owning boundary (HTTP/provider/form/server function/persistence). Once inside a correctly typed internal layer, do not repeatedly decode the same value merely for reassurance.

When generated Confect persistence services are used, pass the decoded representation they expect and let their codecs encode/decode storage. Do not manually convert `Option`/`null` around every DB call.

Use transforming schemas only when encoded and decoded representations genuinely differ in useful semantics. Do not add transformations to make types appear richer or to hide transport mismatches.

## Semantic primitives and finite vocabularies

Share semantic primitive schemas such as canonical email, slug, timestamp, or non-empty trimmed text at the narrowest genuinely shared layer. Prefer Effect built-ins when they already express the semantics; do not wrap a built-in merely to rename it.

Brand a primitive only when nominal distinction materially prevents real mistakes between otherwise identical values. Validation alone does not imply a brand.

Stable finite programmatic vocabularies use one canonical `S.Literals([...])` schema and derive the TypeScript type from it. Do not separately maintain an enum/string union/runtime constant object.
