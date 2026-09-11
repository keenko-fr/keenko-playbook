# Confect

Confect is the default Effect/Convex application-function layer in Keenko, but it does not own every Convex boundary.

## Application functions

Ordinary application-owned Convex functions prefer Confect `FunctionSpec`/`GroupSpec`, implementations, generated refs, and codec-aware callers. Endpoint args belong to the spec and independently validate/normalize the backend trust boundary even when a frontend already validated similar input.

Keep endpoint Args local when they exist specifically for that endpoint. Share semantic primitives, not complete transport structs merely to remove duplication. Frontend/server code must not import backend spec source to steal an Args schema.

Endpoint-specific schemas normally stay inline when they are used once, simple, and do not represent meaningful reusable semantics. For example:

```ts
args: () =>
  S.Struct({
    query: S.Trim.check(S.isNonEmpty()),
  }),
```

Do not extract a schema solely to name a one-use endpoint field. Prefer Effect Schema built-ins such as `S.Trim` when they already express the required semantics rather than reconstructing equivalent behavior through lower-level transformations. Extract only when the schema is reusable, sufficiently complex, or represents an actual semantic primitive.

Generated Confect services/context are used directly; do not wrap them merely to rename or re-expose them.

## Persisted document system fields

Persisted resource schema modules start from application-controlled `sFooFields` and derive the complete `sFooDoc` with Confect's installed system-field facility. Do not manually recreate Convex `_id` or `_creationTime`.

For Confect `10.0.0-next.21`, the verified API is:

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

TanStack Start ServerFns do not proxy ordinary Convex CRUD. Call Convex directly from the browser for ordinary query/mutation flows. A ServerFn may use Effect and Confect `refs` when the Start server performs genuine work: server-only authentication or validation, secret access, orchestration across multiple backend/provider calls, or explicit retry, timeout, concurrency, and failure policy. Run the Effect once at that server-function boundary. Direct server-side Confect calls derive args from the actual ref (`Ref.Args<...>`) and use the codec-aware runner/client path rather than reconstructing types from a form/domain schema.

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

## Persistence patches

Preserve the semantic difference between `S.optionalKey` and `S.optional`; explicit `undefined` may be meaningful for clearing an optional Convex field. Prefer focused patch contracts when invariants exist; use broad partial patches only when every field is independently patchable.

Focused persistence-only Patch schemas stay with the data owner; shared Patch representations live in the persisted resource schema module only when they have a genuine cross-layer consumer.

## Versions and generated code

For Confect `10.0.0-next.21`, treat both `confect/_generated/` and the sibling `convex/` directory as generator-owned targets. Do not edit generated root Convex entrypoints such as `convex/schema.ts` or generated function modules manually. The supported authored exceptions inside `convex/` are `tsconfig.json` and `convex.config.ts`; keep those under normal authored-source ownership and typecheck the Convex runtime through `convex/tsconfig.json`.

Confect-generated deployment/runtime modules are source-required generated artifacts for the checked-in application shape. Track them when the repository deploys/tests from source, regenerate them through the repository's canonical codegen command after Confect inputs change, and make CI detect drift across the generated targets while excluding the authored `convex/` exceptions from generator-byte comparison.

- Run the repository's canonical codegen after specs/schema/refs/generated inputs change.
- Keep tightly coupled `@confect/*` prereleases exact-version aligned.
- Verify the installed Effect version satisfies Confect's Effect peer ranges. When relevant, verify separate platform peers such as `@confect/server`'s optional `@effect/platform-node` peer against their own ranges.
- Fix/upgrade a real compatibility boundary where possible; keep unavoidable prerelease workarounds narrow and documented rather than hiding them behind permanent generic facades.

The owned `confect` skill contains the procedural investigation/review workflow.
