# Schema and representation conventions

Use representations that correspond to real ownership or runtime boundaries. Naming symmetry is never a reason to create another layer.

## Representation vocabulary

`FooFields`, `FooDoc`, `Foo`, `FooInsert` and `FooPatch` are optional roles, not a mandatory family for each table:

- `Fields` describes application-controlled persisted fields when that distinction is useful.
- `Doc` describes the full decoded persisted document, including system identity.
- `Foo` describes a meaningful stable business representation, possibly enriched.
- `Insert` or `Input` describes a real creation/business input contract.
- `Patch` describes a meaningful partial-update contract.
- `Args` describes function parameters, not an independent business representation.
- `Dto` describes a faithful foreign-system-owned representation.

Keep the Schemas required for table definition and persistence decoding. Removing redundant aliases or read/write representations does not remove Confect validation. Use existing documents when sufficient; do not create `Foo = FooDoc` or an identity `sFoo` alias merely for symmetry.

No canonical Entity, full Entity argument or hydration is mandatory. Do not invent Entity/Model/ViewModel alternatives or a generic Entity base to preserve the former architecture. A longer name remains valid when it expresses a real semantic distinction.

Effect Schema values use the `s` prefix exclusively. An `s...` value is an Effect Schema, never a Standard Schema adapter. `Dto` remains reserved for foreign representations, not internal inputs, persistence documents or application transport projections.

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

Local argument/helper types follow their owning operation as described in `backend-file-topology.md`. Do not collect Schema-derived aliases in a trailing generic `TYPES` section.

A class declared with `S.TaggedError` already provides its TypeScript type identity. Do not add a redundant alias for it.

## Schema ownership

Keep every schema at the narrowest layer that genuinely owns its semantics. Do not move a schema merely because it is an Effect Schema.

- Endpoint-only Confect input/output details stay with the endpoint/spec; simple one-use schemas normally stay inline.
- Feature-local runtime contracts stay with the feature only when a real validation boundary justifies them; internal args may be plain types.
- Context issue/Failure/Defect contracts belong in `errors/<concept>.ts`; declare only used families.
- Application representations genuinely shared across multiple backend layers belong in `packages/backend/schemas/<resource>.ts`.
- Foreign-system-owned wire/data representations belong in `packages/backend/schemas/<provider>/<resource>.ts` from the first real provider schema.
- Persisted/runtime representations belong in `schemas/<concept>.ts`; operation-local contracts stay with their narrower owner.
- Infra error contracts describe the capability, not the provider wire shape, and belong in `errors/<concept>.ts`.
- Move/expose an application schema through `packages/shared/schemas` only when a real second workspace/runtime consumes the same representation; do not create `packages/shared` in anticipation of that consumer.

A backend runtime representation stays under backend schema ownership; an internal enrichment can remain a plain type with its operation owner. A frontend consuming a transport projection does not consume the same representation as backend `Foo` and does not justify moving `sFoo` to `packages/shared`. Boundary-specific transport schemas stay at the narrowest Confect/API/facade owner. Share only the exact representation that has a real cross-workspace/runtime consumer.

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

Use only sections for existing contracts, in this semantic order:

```text
CONSTANTS
FIELDS
ENTITY
INSERT
PATCH
```

Omit unused sections. `CONSTANTS` contains real semantic primitives/constants. `FIELDS` contains application-controlled table fields and any useful complete document Schema. `ENTITY`, `INSERT` and `PATCH` exist only for meaningful runtime contracts. No identity Entity or symmetric insert/patch family is required. Local helpers stay with their contract rather than in a compulsory final `INTERNALS` block.

Use the 140-character separator mechanics in `backend-file-topology.md`. A minimal persistence module can stop here:

```ts
// FIELDS ----------------------------------------------------------------------------------------------------------------------------------
export const sFooFields = S.Struct({ name: S.String });
export type FooFields = typeof sFooFields.Type;

export const sFooDoc = SystemFields.extendWithSystemFields("foos", sFooFields);
export type FooDoc = typeof sFooDoc.Type;
```

Here `S` is Effect Schema and `SystemFields` comes from `@confect/core`. With qualified Confect `10.1.0`, `extendWithSystemFields(tableName, schema)` takes the table name first. Do not manually recreate Convex `_id` or `_creationTime`. A table may use its fields Schema directly without exporting every shown type or a separate Doc Schema.

Non-persisted/provider schemas follow their own semantics, with Schema/type adjacency and narrow ownership.

## Structural authority and derivation

Derive related contracts from the nearest owner of their facts rather than repeating equivalent field declarations. Alias only when distinct, already-earned contracts genuinely share a structure.

The installed Effect `4.0.2` structural APIs include:

```ts
const sSelected = schema.mapFields(Struct.pick(["a", "b"]));
const sWithoutMetadata = schema.mapFields(Struct.omit(["metadata"]));
const sEvolved = schema.mapFields(Struct.evolve({ field: (field) => S.optionalKey(field) }));
const sExtended = schema.pipe(S.fieldsAssign({ other: S.String }));
```

Inspect installed equivalents of `Struct.assign`, `S.toEncoded`, `S.toType`, `S.decodeTo` and transformation facilities when they express the relationship. Use value-level `Struct.pick`/`Struct.omit` for structural projections. Do not rebuild raw field objects when structural APIs express the operation.

Composition can drop outer checks. In particular, `mapFields` drops them by default; `unsafePreserveChecks: true` is valid only when the existing predicate remains sound for the resulting shape. Reapply or rewrite checks when changing their required facts.

Confect's registered table reader builds the complete document decoder from the declared table Schema. In qualified Confect `10.1.0`, the Struct and Union system-field paths preserve outer checks with `unsafePreserveChecks: true`; the plain Struct path in `10.0.0` dropped them. The original predicate must remain sound after adding system fields. Verify required checks through the registered persistence path, not only a separately checked `sFooDoc`. Preserve independent interresource and business invariants in their owning operation.

## Creation and patch contracts

Use the data the operation actually needs. `create` may accept a direct value, an args object or a genuine business Input; it does not require `FooInsert` for every table. Native Confect writes still receive their installed decoded payload contract.

A Patch expresses operation scope and invariants, not automatically an optional version of every field. For a status-only operation where status is required:

```ts
const sFooStatusPatch = sFooFields.mapFields(Struct.pick(["status"]));
type FooStatusPatch = typeof sFooStatusPatch.Type;
```

This example assumes a fields Schema owning `status`. Do not make it optional merely because the contract is called Patch. Keep local update args at their operation owner; move a runtime patch to the resource Schema only for a real shared contract. Do not generate broad partial schemas by symmetry.

## Absence, optionality, and nullability

For persisted fields that conceptually exist but currently have no value, prefer a stable explicit `null` encoding. `S.OptionFromNullOr(...)` is appropriate when backend logic genuinely benefits from `Option`:

```text
Convex/wire: null | string
Doc/Fields Type: Option<string>
Foo Type: may retain Option<string>
Transport projection: caller-appropriate encoding, such as null | string
```

Reserve omitted keys for contracts where presence itself has semantics, especially patches and genuinely optional inputs.

For installed Effect `4.0.2`, distinguish intentionally:

- `S.optionalKey(schema)`: the key may be absent; explicit `undefined` is not automatically accepted as the field value;
- `S.optional(schema)`: absence/explicit `undefined` semantics differ and may be appropriate when intentionally clearing an optional value;
- nullability is separate.

Use `Struct.evolve` plus the appropriate optional schema when omission genuinely carries semantics. Inspect installed Effect behavior before copying exact optionality syntax across versions.

## Transform ownership

Choose the shortest transform name that makes its output clear in context. In a resource namespace, `from` may suffice. In a mixed-representation scope:

- `fooFrom(...)` produces `Foo`;
- `fooDocFrom(...)` produces `FooDoc` when a reverse conversion genuinely exists;

Do not create transforms for symmetry or require an enrichment helper. A schema describing a boundary relationship uses `sFooFromDto` to distinguish its foreign source from `sFoo`.

Ownership follows the target/boundary semantics:

- enrichment that reads relations belongs in its impl or extracted feature; deterministic business computation belongs in domain only when extraction is useful;
- foreign `Dto -> Foo` schema composition lives in the adapter/infra boundary that knows both representations unless a narrower genuine boundary owner exists;
- persistence representation codecs stay with their runtime contract;
- workflow/business transition stays in its impl or extracted feature.

Effect Schema transformations may model one-way, information-losing decoding across a real representation or trust boundary. This is appropriate when the foreign representation has an authored DTO schema, the decoded application representation has meaningful owned semantics, and omission, renaming, nullable normalization, image selection, flattening, nested normalization, defaults, or similar conversion naturally belongs to decoding. Name that relationship schema `sFooFromDto`. Its encoded side is the faithful foreign `FooDto`, its decoded side is canonical `Foo`, and encoding must be forbidden when the normalization cannot honestly be reversed. The relationship schema does not introduce another domain representation, so normally do not add a `FooFromDto` type.

Inside provider-specific adapter code such as `infra/tvmaze.ts`, prefer `sShowFromDto`; module topology already supplies provider ownership. When multiple foreign DTO sources coexist in one lexical scope, qualify the relationship as needed, for example `sShowFromTvMazeDto` and `sShowFromTmdbDto`. Do not require provider qualification everywhere.

Do not force every mapper into Schema. Use a plain deterministic TypeScript function for business or workflow transitions, arbitrary internal computation, mappings outside a schema/trust boundary, or cases where a schema transformation would obscure ownership.

## Enrichment on demand

Prefer, in order:

1. The existing document when it suffices.
2. Enrichment of the existing resource when a relation has useful semantics.
3. Local variables for resources needed only briefly.
4. A distinct representation for a genuinely distinct meaning.

If Bar is a significant constitutive relation, an internal representation can simply be:

```ts
type Foo = FooDoc & {
  readonly bar: BarDoc;
};
```

This assumes existing decoded `FooDoc` and `BarDoc` contracts. It does not require `sFoo`, a constructor, another resource bundle or enrichment at every read. Put the type with its narrowest semantic owner; use `schemas/` when a real runtime representation is owned there.

Keep persistence normalized. Enrichment does not recursively persist relations or require a graph of complete Entities. Do not introduce generic hydration, Repository or EntityLoader infrastructure.

Loading Bar by `doc.barId` establishes identity. Do not add a redundant FK equality check or an artificial absence/failure path just to assemble the representation.

When a Foo and its Bar must have the same owner, identity does not establish `doc.ownerId === bar.ownerId`. Check that independent business invariant when both resources are available and correctness requires it. Reusable pure predicates belong in domain and receive independent facts; structural constraints stay local to their Schema. Avoid schema/domain cycles.

Do not require an additional runtime schema decode merely to assemble trusted documents. This does not bypass meaningful business checks or Schema checks at actual validation boundaries. A caller-facing projection may omit metadata without redefining the persisted resource.

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

This provider-normalization example uses a non-persisted application `Show`. It does not prescribe another representation for persisted resources. The application schema remains independent of the provider's DTO and wire representation. Provider independence does not require erasing provider identity when that identity is part of the application model:

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

A meaningful business representation may contain `Option`, appropriate date/time/domain types and useful relations. It is not automatically a frontend/server-client transport contract. Its shape and semantics remain independent of foreign provider DTOs; an explicit provider identity may still be part of `Foo` when the application owns and depends on it.

Confect/API/facade boundaries own the caller-facing projection and choose schemas/codecs appropriate to their transport and runtime requirements. Do not distort internal representation design solely to make it serializable by a caller, or rely on callers to remember to encode backend values. Projection names follow actual endpoint semantics; no mandatory `FooResponse`, `FooTransport`, or generic `FooDto` convention is introduced. `Dto` remains reserved for foreign-system-owned representations.

## Timestamps

- Use Convex `_creationTime` as the default technical creation timestamp. Do not add `createdAt` merely to duplicate it.
- Add explicit timestamps for distinct domain events (`publishedAt`, `requestedAt`, `paidAt`, etc.).
- Add `updatedAt` only when last-modified semantics are genuinely used for UI, ordering, synchronization, concurrency, audit, or another product need.
- Application-owned persisted timestamps use a shared semantic schema for finite, non-negative integer epoch milliseconds.
- Persist and transport application-owned timestamps as numeric epoch milliseconds by default. A business representation may use an appropriate date/time/domain type when its semantics need one; the owning transport boundary chooses its caller-facing encoding. Do not add a generic Date hydration layer.
- Obtain `now` at a trusted outer mutation/action boundary and pass the same value through a workflow when consistency matters. A small `WithNow<T>`-style helper is legitimate shared semantics.

## Validation and transformations

Decode untrusted data at the owning boundary (HTTP/provider/form/server function/persistence). Persistence codecs validate persistence representations; provider adapters validate new external/provider/SDK inputs. Correctly typed internal values are trusted afterward. Do not repeatedly schema-decode an already trusted document, related resource or other internal representation merely for reassurance. This trust does not bypass semantic/business invariants owned by the domain/capability or meaningful cross-resource ownership invariants.

When generated Confect persistence services are used, pass the decoded representation they expect and let their codecs encode/decode storage. Do not manually convert `Option`/`null` around every DB call.

Use transforming schemas only when encoded and decoded representations genuinely differ in useful semantics. Do not add transformations to make types appear richer or to hide transport mismatches.

## Semantic primitives and finite vocabularies

Share semantic primitive schemas such as canonical email, slug, timestamp, or non-empty trimmed text at the narrowest genuinely shared layer. Prefer Effect built-ins when they already express the semantics; do not wrap a built-in merely to rename it.

Brand a primitive only when nominal distinction materially prevents real mistakes between otherwise identical values. Validation alone does not imply a brand.

Stable finite programmatic vocabularies use one canonical `S.Literals([...])` schema and derive the TypeScript type from it. Do not separately maintain an enum/string union/runtime constant object.
