# Schema and representation conventions

Use representations that correspond to real ownership or runtime boundaries. Naming symmetry is never a reason to create another layer.

## Canonical vocabulary

For a persisted resource `Foo`:

- `sFooFields` / `FooFields`: application-owned persisted fields, excluding Convex `_id` and `_creationTime`;
- `sFooDoc` / `FooDoc`: complete decoded persistence document including system fields;
- `sFoo` / `Foo`: canonical backend business Entity, retaining persistence identity and optionally adding constitutive related Entities;
- `sFooInsert` / `FooInsert`: application-controlled creation payload required to create the persisted resource;
- focused Patch contracts: operation-scoped update payloads when the operation owns meaningful invariants;
- `sFooDto` / `FooDto`: faithful foreign-system-owned representation crossing an integration boundary.

Persisted resources expose `Fields` and `Doc`. A canonical `Foo` exists when the persisted resource also owns a meaningful backend business Entity. `Insert`, Patch contracts, foreign `Dto`, and other representations exist when meaningful. Do not manufacture `Foo` solely because a table exists in persistence. This Entity contract concerns persisted resources; it does not redefine every non-persisted application representation as an Entity. `Dto` is not a generic synonym for an object that transports data: do not use it for Keenko-owned application models, feature inputs, forms, command payloads, Confect inputs, persistence documents, inserts, patches, view models, arbitrary response objects, or internal intermediates. Keep the canonical name `Foo`; do not introduce `FooEntity`, `FooModel`, `FooViewModel`, or `Entry` synonyms, or a generic `Entity` base class. `ENTITY` below is a section heading, not another representation name.

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
- Foreign-system-owned wire/data representations belong in `packages/backend/schemas/<provider>/<resource>.ts` from the first real provider schema.
- Persistence-only schemas, including focused patches used only by data, stay with the narrowest persistence/data owner.
- Infra `Issue` / `Failure` schemas stay with the infra capability because they describe our adapter contract rather than the provider wire format.
- Move/expose an application schema through `packages/shared/schemas` only when a real second workspace/runtime consumes the same representation; do not create `packages/shared` in anticipation of that consumer.

A backend-only Entity stays under backend schema ownership. A frontend consuming a transport projection does not consume the same representation as backend `Foo` and does not justify moving `sFoo` to `packages/shared`. Boundary-specific transport schemas stay at the narrowest Confect/API/facade owner. Share only the exact representation that has a real cross-workspace/runtime consumer.

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

Here `schemas/shows.ts` owns the application Show representations, `schemas/tvmaze/shows.ts` owns faithful TVMaze DTO representations, and `infra/tvmaze.ts` owns the adapter capability and the boundary composition that knows both sides. The canonical application representation is independent of the provider's DTO and wire contract. It may still contain an explicit provider identity such as `tvMazeId` when that identity is an application-owned product fact. When a decoder composes a foreign-owned DTO schema and an application-owned canonical schema, the adapter/infra boundary owns that composition unless a narrower genuine boundary owner exists. Do not make the foreign schema module depend on the application representation or make the canonical application schema aware of a foreign source.

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
- `ENTITY` owns `sFoo` / `Foo` when the persisted resource has a meaningful canonical backend business Entity and meaningful schema checks. Hydration constructors belong in `features/`, never in this section. Omit `ENTITY` when the table is only a persistence encoding of another application concept and no canonical `Foo` exists.
- `INSERT` owns `sFooInsert` / `FooInsert` when creation is meaningful.
- `PATCH` exists only when the shared schema module genuinely owns a reusable patch contract.
- `INTERNALS` owns only genuine private implementation helpers.

Do not introduce competing headings such as `DOC`, `TRANSFORMS`, `PRIMITIVES`, `VALUES`, or `ENUMS`.

A representative file can begin like this:

```ts
// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
export const sFooStatus = S.Literals(["active", "archived"]);
export type FooStatus = typeof sFooStatus.Type;

// FIELDS ----------------------------------------------------------------------------------------------------------------------------------
export const sFooFields = S.Struct({ barId: sBarId, status: sFooStatus });
export type FooFields = typeof sFooFields.Type;

export const sFooDoc = SystemFields.extendWithSystemFields("foo", sFooFields);
export type FooDoc = typeof sFooDoc.Type;

// ENTITY ----------------------------------------------------------------------------------------------------------------------------------
export const sFoo = sFooDoc;
export type Foo = typeof sFoo.Type;

// INSERT ----------------------------------------------------------------------------------------------------------------------------------
export const sFooInsert = sFooFields;
export type FooInsert = typeof sFooInsert.Type;
```

Here `sBarId` comes from the related resource's schema owner. This identity Entity retains `_id`, `_creationTime`, and `barId`; the foreign key alone does not require embedding `Bar`. Persistence alone does not require an `ENTITY` section. A storage-only table may expose `Fields`, `Doc`, `Insert`, and focused Patch contracts as meaningful without inventing `Foo`.

For Confect `10.0.0-next.21`, `SystemFields.extendWithSystemFields(tableName, schema)` takes the table name first and the schema second. Inspect the installed Confect source before documenting exact syntax for another version. Do not manually recreate `_id` or `_creationTime`.

Non-persisted, provider, and other schema owners are not forced into this persisted-resource grammar. Organize them only by relevant semantics while still following the universal adjacency, derivation, narrowest-owner, and no-duplicate-declaration rules.

## One structural authority and derivation

Related schemas derive, compose, or alias rather than independently repeating equivalent field declarations.

When a persisted-resource Entity needs no enrichment beyond its complete decoded document, alias `Doc`:

```ts
export const sFoo = sFooDoc;
export type Foo = typeof sFoo.Type;
```

Likewise, if creation semantics are identical:

```ts
export const sFooInsert = sFooFields;
export type FooInsert = typeof sFooInsert.Type;
```

Do not create an identity `fooFrom` when `Foo === FooDoc`. Naming symmetry is not a reason to add a constructor. `Foo`, `Doc`, `Fields`, and `Insert` retain their semantic ownership even when some schemas currently alias.

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

`sFoo` describes the canonical backend business Entity for a persisted resource that owns one. `Foo` retains `FooDoc` persistence/system identity, including `_id` and `_creationTime`. It may add constitutive related Entities and use backend/Effect-native values. Caller-facing transport/application projections are separate boundary-owned contracts.

`sFooInsert` owns creation semantics. Creation APIs accept `FooInsert`, not `FooFields` or `Foo`, even when the current shapes coincide. Server-owned/defaulted values may still be added by the feature/data layer.

A Patch represents operation scope and invariants, not “make every selected field optional.” For a status-only operation where status is required:

```ts
const sFooStatusPatch = sFooFields.mapFields(Struct.pick(["status"]));
type FooStatusPatch = typeof sFooStatusPatch.Type;
```

Do not make `status` optional merely because the representation is called a patch. Do not manufacture a broad partial Patch contract for symmetry.

The narrowest owner wins. If a focused patch is only a persistence/data contract, keep it data-local under that file's `SCHEMAS` section while deriving it from shared `Fields`. Move a patch into the shared schema module's `PATCH` section only when it is genuinely a cross-layer representation.

Do not collapse an already-earned focused Patch to a naked scalar merely because it currently contains one field.

## Absence, optionality, and nullability

For persisted fields that conceptually exist but currently have no value, prefer a stable explicit `null` encoding. `S.OptionFromNullOr(...)` is appropriate when backend logic genuinely benefits from `Option`:

```text
Convex/wire: null | string
Doc/Fields Type: Option<string>
Foo Type: may retain Option<string>
Transport projection: caller-appropriate encoding, such as null | string
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

Do not encode the source representation in ordinary value-producing function names and do not create transforms for symmetry. A schema describing a boundary relationship is different: `sFooFromDto` intentionally identifies its foreign source so it cannot be confused with canonical `sFoo`.

Ownership follows the target/boundary semantics:

- `features/foo.ts` owns `fooFrom(doc)`, which loads constitutive relations through data/features and assembles `Foo`;
- foreign `Dto -> Foo` schema composition lives in the adapter/infra boundary that knows both representations unless a narrower genuine boundary owner exists;
- persistence-only conversion lives in data;
- workflow/business transition lives in the feature.

Effect Schema transformations may model one-way, information-losing decoding across a real representation or trust boundary. This is appropriate when the foreign representation has an authored DTO schema, the decoded application representation has meaningful owned semantics, and omission, renaming, nullable normalization, image selection, flattening, nested normalization, defaults, or similar conversion naturally belongs to decoding. Name that relationship schema `sFooFromDto`. Its encoded side is the faithful foreign `FooDto`, its decoded side is canonical `Foo`, and encoding must be forbidden when the normalization cannot honestly be reversed. The relationship schema does not introduce another domain representation, so normally do not add a `FooFromDto` type.

Inside provider-specific adapter code such as `infra/tvmaze.ts`, prefer `sShowFromDto`; module topology already supplies provider ownership. When multiple foreign DTO sources coexist in one lexical scope, qualify the relationship as needed, for example `sShowFromTvMazeDto` and `sShowFromTmdbDto`. Do not require provider qualification everywhere.

Do not force every mapper into Schema. Use a plain deterministic TypeScript function for business or workflow transitions, arbitrary internal computation, mappings outside a schema/trust boundary, or cases where a schema transformation would obscure ownership.

## Constitutive relations and Entity construction

Embed a related Entity in canonical `Foo` only when that relation is a stable and constitutive part of `Foo`'s own business representation or invariants. A foreign key alone does not justify embedding.

- Embedded relations are mandatory parts of that Entity representation. Do not use `Option<Bar>` merely to represent hydration that has not happened yet.
- Persisted relation IDs remain present. Hydration adds relations while retaining persistence identity.
- Persistence remains normalized. Embedded Entities are not recursively persisted merely because they appear in backend `Foo`.
- Reverse relations and child collections normally remain queries or use-case projections rather than canonical parent fields.

Canonical mandatory Entity embedding should remain directed and acyclic. If embedding both directions would create a cycle, revisit ownership rather than introducing lazy, partial, or recursive Entity representations. This rule applies to the graph of mandatory full-Entity embedding dependencies, not all business/domain relationships.

The schema module describes the Entity. The resource feature owns its hydration constructor and loads the required relations directly.

`schemas/admins.ts`:

```ts
export const sAdmin = sAdminDoc.mapFields(Struct.assign({ user: sUser }), { unsafePreserveChecks: true });
export type Admin = typeof sAdmin.Type;
```

`features/admins.ts`:

```ts
const adminFrom = E.fn("admins.features.adminFrom")(function* (doc: AdminDoc) {
  const user = yield* userData.getById(doc.userId);
  return { ...doc, user } satisfies Admin;
});
```

`schemas/` owns Entity representations, types and meaningful schema validations. It has no hydration functions or data dependencies. `features/` owns `fooFrom(doc)`, constitutive relation loading, Entity assembly and use-case orchestration. `data/` returns decoded `FooDoc`; `domain/` owns pure business behavior.

Loading User with `getById(doc.userId)` already establishes its identity. Do not add `adminRelationsAgree`, an `admin.userId === admin.user._id` check, or an artificial `Option<Admin>` or failure path for that equality. Required relations use the existing retrieval semantics; valid absence in a lookup remains distinct from hydration.

Preserve genuine structural and business invariants. For example, when a Foo and its Bar must have the same owner, loading Bar by `doc.barId` establishes its identity but does not establish `doc.ownerId === bar.ownerId`. Keep the meaningful schema check and enforce that invariant in the owning feature/domain without repeating full schema decoding. A pure invariant predicate may be shared where both owners need the same rule.

Constructors trust decoded internal documents and relation Entities. Do not require an additional runtime schema decode merely to assemble them. Preserve source-schema checks when deriving the enriched schema according to the installed structural API's behavior. Do not introduce a generic hydration framework, repository or EntityLoader.

For an actual transport projection, value-level `Struct.pick` / `Struct.omit` may be appropriate at the caller-facing boundary. Removing `_id` or `_creationTime` there does not redefine canonical backend `Foo`. Provider decoding such as `sFooFromDto` remains separate from internal Entity hydration.

## Foreign DTO representations

`Dto` has a deliberately narrow Keenko meaning: a representation whose shape is owned by a foreign system crossing an integration boundary. This includes third-party HTTP API payloads, provider SDK payloads, webhook payloads, imported external formats, and other foreign-system-owned wire/data representations. The purpose of `Dto` is to make `Api` unnecessary, not to broaden the DTO concept.

A foreign DTO schema models its owner's real accepted/returned representation faithfully. Preserve relevant foreign field names, nesting, nullability, optionality, and other wire semantics rather than redesigning the DTO to resemble the application representation. Decode foreign data at the owning boundary, then normalize it to application representations before it leaves the adapter.

A provider schema file follows schema/type adjacency and derivation rules but does not inherit persisted-only headings such as `FIELDS`, `INSERT`, or `PATCH` unless those concepts genuinely apply.

The TVMaze validation case therefore uses `schemas/tvmaze/shows.ts` for provider schemas such as:

```text
sImageDto / ImageDto
sShowDto / ShowDto
sSearchResultDto / SearchResultDto
sSearchResponseDto / SearchResponseDto
```

`SearchResponseDto` is the clear name for that validation case; it is not a universal requirement for every provider response. Provider ownership normally comes from module/package topology. If DTOs from multiple providers enter one lexical scope, disambiguate at the import or use site rather than permanently burdening every foreign type with `Api` or a provider prefix.

The foreign schema stays faithful to that provider:

```ts
// schemas/tvmaze/shows.ts
export const sShowDto = S.Struct({ id: S.Int, name: S.String });
export type ShowDto = typeof sShowDto.Type;
```

This provider-normalization example uses a non-persisted application `Show`, not a persisted-resource Entity. It does not replace document-to-Entity construction or remove persisted identity. The application schema remains independent of the provider's DTO and wire representation. Provider independence does not require erasing provider identity when that identity is part of the application model:

```ts
// schemas/shows.ts
export const sShow = S.Struct({ tvMazeId: S.Int, title: S.String });
export type Show = typeof sShow.Type;
```

The adapter composes that schema with the faithful foreign schema:

```ts
// infra/tvmaze.ts
import { Schema as S, SchemaGetter as SG } from "effect";

const sShowFromDto = sShowDto.pipe(
  S.decodeTo(sShow, {
    decode: SG.transform(({ id, name }) => ({ tvMazeId: id, title: name })),
    encode: SG.forbidden(() => "Forbidden."),
  })
);
```

This syntax is valid for the repository's pinned Effect version; inspect the installed API before copying it to another version. Keep a plain helper instead for workflow/business transitions, arbitrary internal computation, application-to-application mappings, mappings outside a schema/trust boundary, or cases where Schema transformation would obscure ownership.

## Type vs encoded representation

Use `typeof sFoo.Type` for the normal decoded TypeScript type. Use `.Encoded` only at a boundary that explicitly needs the encoded side of a transforming schema. Do not routinely export parallel `FooEncoded` types; keep encoded aliases boundary-local unless a stable owned contract requires one.

`FooFields` and `FooDoc` are backend/persistence decoded representations and may use useful Effect-native values such as `Option` when the schema encodes them to Convex-compatible primitives.

For a persisted-resource Entity, `Foo` is the canonical backend business representation. It may contain `Option`, appropriate date/time/domain types, and embedded Entities. It is not automatically a frontend/server-client transport contract. Its shape and semantics remain independent of foreign provider DTOs; an explicit provider identity may still be part of `Foo` when the application owns and depends on it.

Confect/API/facade boundaries own the caller-facing projection and choose schemas/codecs appropriate to their transport and runtime requirements. Do not distort backend Entity design solely to make it serializable by a caller, or rely on callers to remember to encode backend values. Projection names follow actual endpoint semantics; no mandatory `FooResponse`, `FooTransport`, or generic `FooDto` convention is introduced. `Dto` remains reserved for foreign-system-owned representations.

## Timestamps

- Use Convex `_creationTime` as the default technical creation timestamp. Do not add `createdAt` merely to duplicate it.
- Add explicit timestamps for distinct domain events (`publishedAt`, `requestedAt`, `paidAt`, etc.).
- Add `updatedAt` only when last-modified semantics are genuinely used for UI, ordering, synchronization, concurrency, audit, or another product need.
- Application-owned persisted timestamps use a shared semantic schema for finite, non-negative integer epoch milliseconds.
- Persist and transport application-owned timestamps as numeric epoch milliseconds by default. A canonical backend Entity may use an appropriate date/time/domain type when its semantics need one; the owning transport boundary chooses its caller-facing encoding. Do not add a generic Date hydration layer.
- Obtain `now` at a trusted outer mutation/action boundary and pass the same value through a workflow when consistency matters. A small `WithNow<T>`-style helper is legitimate shared semantics.

## Validation and transformations

Decode untrusted data at the owning boundary (HTTP/provider/form/server function/persistence). Persistence codecs validate persistence representations; provider adapters validate new external/provider/SDK inputs. Correctly typed internal values are trusted afterward. Do not repeatedly schema-decode an already trusted `FooDoc`, relation Entity, or other internal representation merely for reassurance. This trust does not bypass semantic/business invariants owned by the domain/capability or meaningful ownership invariants enforced during Entity construction.

When generated Confect persistence services are used, pass the decoded representation they expect and let their codecs encode/decode storage. Do not manually convert `Option`/`null` around every DB call.

Use transforming schemas only when encoded and decoded representations genuinely differ in useful semantics. Do not add transformations to make types appear richer or to hide transport mismatches.

## Semantic primitives and finite vocabularies

Share semantic primitive schemas such as canonical email, slug, timestamp, or non-empty trimmed text at the narrowest genuinely shared layer. Prefer Effect built-ins when they already express the semantics; do not wrap a built-in merely to rename it.

Brand a primitive only when nominal distinction materially prevents real mistakes between otherwise identical values. Validation alone does not imply a brand.

Stable finite programmatic vocabularies use one canonical `S.Literals([...])` schema and derive the TypeScript type from it. Do not separately maintain an enum/string union/runtime constant object.
