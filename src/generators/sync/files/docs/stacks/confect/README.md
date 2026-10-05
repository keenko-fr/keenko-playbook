# Confect

Confect is the default Effect/Convex application-function layer in Keenko, but it does not own every Convex boundary.

Use [`application-authority.md`](../../conventions/application-authority.md) to place application authority and web-runtime responsibilities.

## Application functions

Ordinary application-owned Convex functions prefer Confect `FunctionSpec`/`GroupSpec`, implementations, generated refs, and codec-aware callers. Endpoint args belong to the spec and independently validate/normalize the backend trust boundary even when a frontend already validated similar input.

Keep endpoint Args local when they exist specifically for that endpoint. Share semantic primitives, not complete transport structs merely to remove duplication. Frontend/server code must not import backend spec source to steal an Args schema.

Endpoint-specific schemas normally stay inline when they are used once, simple, and do not represent meaningful reusable semantics. For example:

```ts
args: () => ({
  query: S.Trim.check(S.isNonEmpty()),
}),
```

Do not extract a schema solely to name a one-use endpoint field. Prefer Effect Schema built-ins such as `S.Trim` when they already express the required semantics rather than reconstructing equivalent behavior through lower-level transformations. Extract only when the schema is reusable, sufficiently complex, or represents an actual semantic primitive.

Generated Confect services/context are used directly; do not wrap them merely to rename or re-expose them.

Function `args` callbacks return field maps; `returns`, `item`, and `error` callbacks return schemas. Omit `args` for no-argument functions. Table declarations still return object-shaped schemas and import `Table` from `@confect/core` so specs and generated table bindings stay client-safe. Codegen rejects reachable value imports of `@confect/server` from specs.

Runners expose named methods. Destructure `runQuery`, `runMutation`, or `runAction` from the generated runner service before calling it. `StorageWriter.generateUploadUrl` is an Effect value; yield it directly. `TestConfect.layer(schema, convexSchema, modules)` returns a Layer directly, so provide the generated `TestConfect.layer` without an extra call. Each provision creates a fresh database.

Run codegen after changing the Confect family. It owns container annotations: `Spec.Spec`, `DatabaseSchema.DatabaseSchema`, and `DataModel.DataModel` use records keyed by name. Read groups with `Spec.groups(spec)` and tables with `DatabaseSchema.tables(schema)`.

Use serializable codecs at function boundaries, including `S.OptionFromNullOr(...)` for Options. Decoding failures use `S.SchemaError`. Table schemas must stay object-shaped at every transformation step; class schemas are unsupported. Recheck the registered document decoder when relying on outer schema checks, as described in `schema-types.md`.

### No-value returns

For a Confect function that semantically returns no value, use the shared `sVoid` schema as the function's `returns` schema.

`sVoid` represents `void` in application code and encodes it as `null` at the Convex boundary. Implementations therefore return `void`; Confect encodes that result to `null` before returning it to Convex.

Do not use raw `S.Void` as a Confect return schema. Its encoded representation is not a valid Convex value. Do not make implementations return `null` merely to satisfy Convex either; `null` is the wire representation, while `void` is the application representation.

```ts
returns: () => sVoid;
```

Effect/Confect callers decode the result as `void`. Callers using the generated native Convex API observe the encoded `null` value.

## Persisted document system fields

Persisted resource schema modules start from application-controlled `sFooFields` and derive the complete `sFooDoc` with Confect's installed system-field facility. Do not manually recreate Convex `_id` or `_creationTime`.

For Confect `10.0.0`, the verified API is:

```ts
export const sFooDoc = SystemFields.extendWithSystemFields("foo", sFooFields);
export type FooDoc = typeof sFooDoc.Type;
```

The table name is the first argument and the schema is the second. Inspect the installed Confect source before documenting exact syntax for another version.

`schema-types.md` owns the persisted-resource grammar, representation relationships, and structural derivation rules. Do not duplicate that grammar here.

## File organization

Confect specs and implementations live under the backend `confect/` owner and follow `.keenko/docs/conventions/backend-file-topology.md` for canonical section grammar.

That topology is authoritative for:

- level-1 `CONSTANTS` / `SCHEMAS` / `SPEC` organization in spec files;
- level-2 query/mutation/action function-kind grouping inside `GroupSpec.make()`;
- implementation grouping by public/internal Confect function kind;
- schema/type adjacency;
- empty-section omission and `INTERNALS` / standalone-only `TYPES` placement.

Do not duplicate or invent a different section grammar in project-local Confect files.

## Caller representation: Convex api vs Confect refs

Use the representation appropriate to the caller:

```text
Browser / TanStack / ordinary JavaScript
→ generated Convex api
→ encoded plain-JavaScript args and results

Effect / server consumer
→ generated Confect refs
→ Args/Returns codecs and typed Effect-domain information
```

React/browser code should not use Confect React helpers merely to decode `Option`, `Either`, typed Effect values, or other Effect-domain representations. Keep those representations on the Effect side of the boundary unless the UI has a specific product reason to own them. Do not add Keenko wrappers around either generated surface.

Using generated Convex `api` in the browser does not replace the backend's Confect `FunctionSpec`/`GroupSpec` or implementation. Confect can remain the authoritative backend contract while Convex codegen exposes its encoded native function references to ordinary JavaScript callers. See `../tanstack-query/README.md` for browser query, mutation, action, and pagination lifecycle.

Native Convex remains appropriate where required/materially better for components, workflows, third-party Convex libraries, generated/native APIs, and specific HTTP/provider/framework integrations. Verify installed Confect support before replacing a native boundary.

## Client/server use

Browser calls use generated Convex `api` by default; do not force Effect execution or Confect decoding into React for symmetry. TanStack Query owns browser server-state lifecycle around the native Convex reference while the backend function may remain Confect-specified and implemented.

TanStack Start ServerFns do not proxy ordinary Convex CRUD. Call Convex directly from the browser for ordinary query/mutation flows. A ServerFn may use Effect and Confect `refs` for web-owned work such as server-only authentication or validation, secret access, presentation composition across backend/provider calls, or HTTP-facing timeout, concurrency, and failure adaptation. If call order, conditions, compensations, collective success, retries, or idempotency are required for a business use case to be correct, the workflow belongs in the backend. Run the Effect once at the server-function boundary for the web-owned program. Direct server-side Confect calls derive args from the actual ref (`Ref.Args<...>`) and use the codec-aware runner/client path rather than reconstructing types from a form/domain schema.

Keep these trust boundaries distinct:

```text
Form schema
→ browser/editing

serverFn validator
→ server-function input

Confect Args
→ authoritative backend function contract
```

## Public contracts

Return schemas expose only information callers are entitled to know. Security-sensitive success/rejection distinctions may intentionally collapse for anti-enumeration; unexpected defects are not hidden merely to manufacture that behavior.

Internal diagnostic Failure causes do not automatically cross a public Confect/server-client contract. See `validation.md` for issue/cause and public-boundary rules.

## Query semantics

Confect queries remain Convex queries. Do not make reactive query results depend on wall clock, randomness, or mutable process state. Persist the relevant facts or evaluate time-sensitive policy at an appropriate non-query boundary.

### Query cardinality and consumption

Choose the read API from the contract's cardinality and how the result will be consumed:

| Requirement | API |
| --- | --- |
| Single resource; duplicate matching rows are an invariant/data defect | Indexed `reader.table(...).get(index, ...)` |
| Explicit `0..1`; the caller needs a typed cardinality-violation outcome | `QueryStream.unique` |
| Existence only | An index-constrained QueryStream consumed with `Stream.runHead`, then `Option.isSome` |
| All matching rows are genuinely required | `reader.table(...).index(...).collect()` |
| Pagination or composition requiring retained stream keys/layout | The appropriate QueryStream operation |

These APIs are not interchangeable style choices. Do not introduce QueryStream merely for stylistic consistency or mechanically replace indexed single-resource lookups or legitimate collection reads.

For the supported Confect `10.0.0` baseline, indexed `get(index, ...)` already calls Convex's `unique()` internally. Zero rows produce typed `GetByIndexFailure`; one row is decoded and returned; multiple rows cause a defect through the rejected uniqueness check. Keep indexed `get` when duplicates violate a single-resource invariant. Preserve the existing `get`/optional `find` absence distinction owned by [backend architecture](../../conventions/backend-architecture.md); absence is not automatically a defect.

`QueryStream.unique` instead consumes an explicitly `0..1` stream:

```text
0 rows  → None
1 row   → Some(value)
2+ rows → NotUniqueError
```

Use it when the caller needs to distinguish or handle duplicates through typed `NotUniqueError`. It inspects at most two emitted values, though filtering can require reading additional documents. It does not replace the existing indexed `get` invariant contract.

An existence read needs only the first matching value. Constrain the index range, consume with Effect's `Stream.runHead`, and map its `Option` to a boolean. Do not call `collect` or `Stream.runCollect` merely to test `results.length > 0`. `runHead` returns `None` for an empty stream and `Some` for the first value; it does not check uniqueness. This bounds the consumed result, not necessarily physical reads: filtering can scan additional documents before finding a match or exhausting the range.

With `reader` and `externalId` in scope, an `accounts` table indexed by `externalId` illustrates three different contracts:

```ts
import { QueryStream } from "@confect/server";
import { Effect as E, Option as O, Stream } from "effect";

const singleAccount = reader.table("accounts").get("by_external_id", externalId);

const optionalAccount = reader
  .table("accounts")
  .stream("by_external_id", (q) => q.eq("externalId", externalId))
  .pipe(QueryStream.unique);

const hasAccount = reader
  .table("accounts")
  .stream("by_external_id", (q) => q.eq("externalId", externalId))
  .pipe(Stream.runHead, E.map(O.isSome));
```

Keep `collect` when the operation genuinely needs every matching row. For an ordinary bounded read, use `take(n)` or `Stream.take(n)` followed by consumption. Reserve `QueryStream.paginate` for an actual paginated query contract that needs stream cursor/key semantics, not as a replacement for an ordinary bounded read.

A QueryStream is an Effect Stream with stored index keys, layout, and direction. Plain `Stream.filter`, `Stream.map`, and other Effect Stream transforms return ordinary streams without QueryStream metadata. They are appropriate once no later step requires QueryStream-specific operations or retained QueryStream metadata/semantics. Use `QueryStream.filter`, `QueryStream.map`, or their effectful variants when a later QueryStream-only operation, such as `QueryStream.unique`, must remain available, or when ordering, pagination, or keyed composition requires retained metadata. `unique` requires a QueryStream as input; this requirement does not mean it needs the stored keys/layout. Mapping emitted values does not recompute stored keys.

If an explicit `0..1` query requires a predicate before `unique`, retain the QueryStream through that transform. For example, using the same table and index:

```ts
const optionalCustomerAccount = reader
  .table("accounts")
  .stream("by_external_id", (q) => q.eq("externalId", externalId))
  .pipe(
    QueryStream.filter((account) => account.externalId.startsWith("customer:")),
    QueryStream.unique
  );
```

`QueryStream.filterEffect` also retains the QueryStream for a later `unique`. Ordinary `Stream.filter` would return an ordinary Stream that `QueryStream.unique` cannot consume. Choose the transform from the actual downstream contract, not stylistic consistency.

Use ordered `merge`, key-prefix deduplication through `distinct`, key-range `narrow`, `reverse`, joins through `flatMap`, and similar QueryStream operations only when their specific query/key semantics are materially required. The verified version exports `distinct`, not `deduplicate`. This is not a requirement to rewrite ordinary reads with streams.

QueryStream is experimental in Confect `10.0.0`; its API may change between releases. Reverify installed source/types before adopting syntax on another baseline. See first-party [reading](https://confect.dev/server/database/reading) and [streams](https://confect.dev/server/database/streams) documentation for API details. Stream pagination also has its own reactive-client integration requirements; verify those before exposing a paginated contract.

Data-local boolean persistence predicates such as `hasCurrentByFooId` belong under the existing `FIND` section. [Backend file topology](../../conventions/backend-file-topology.md) remains the grammar owner; do not introduce `PREDICATE`, `EXISTS`, or synonymous headings.

## Persistence patches

Preserve the semantic difference between `S.optionalKey` and `S.optional`; explicit `undefined` may be meaningful for clearing an optional Convex field. Prefer focused patch contracts when invariants exist; use broad partial patches only when every field is independently patchable.

Focused persistence-only Patch schemas stay with the data owner; shared Patch representations live in the persisted resource schema module only when they have a genuine cross-layer consumer.

## Versions and generated code

For Confect `10.0.0`, treat both `confect/_generated/` and the sibling `convex/` directory as generator-owned targets. Do not edit generated root Convex entrypoints such as `convex/schema.ts` or generated function modules manually. The supported authored exceptions inside `convex/` are `tsconfig.json` and `convex.config.ts`; keep those under normal authored-source ownership and typecheck the Convex runtime through `convex/tsconfig.json`.

Confect-generated deployment/runtime modules are source-required generated artifacts for the checked-in application shape. Track them when the repository deploys/tests from source and regenerate them through the repository's canonical codegen command after Confect inputs change. The sibling official Convex `convex/_generated/api.*` surface has a distinct lifecycle: after generated Convex module topology changes, refresh it through the configured official `convex dev` workflow. Offline CI may validate the committed surface but cannot prove that deployment-bound API output is fresh. Make CI detect drift across generated targets while excluding the authored `convex/` exceptions from generator-byte comparison.

- Run the repository's canonical codegen after specs/schema/refs/generated inputs change.
- Keep the managed `@confect/*` family exact-version aligned.
- Verify the installed Effect version satisfies Confect's Effect peer ranges. When relevant, verify separate platform peers such as `@confect/server`'s optional `@effect/platform-node` peer against their own ranges.
- Fix/upgrade a real compatibility boundary where possible; keep unavoidable prerelease workarounds narrow and documented rather than hiding them behind permanent generic facades.

The owned `confect` skill contains the procedural investigation/review workflow.
