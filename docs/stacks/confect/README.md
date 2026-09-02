# Confect

Confect is the default Effect/Convex application-function layer when this module is enabled, but it does not own every Convex boundary.

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

For Confect `10.0.0-next.13`, the verified API is:

```ts
export const sFooDoc = SystemFields.extendWithSystemFields("foo", sFooFields);
export type FooDoc = typeof sFooDoc.Type;
```

The table name is the first argument and the schema is the second. Inspect the installed Confect source before documenting exact syntax for another version.

`schema-types.md` owns the persisted-resource grammar, representation relationships, and structural derivation rules. Do not duplicate that grammar here.

## File organization

Confect specs and implementations live under the backend `confect/` owner and follow `.playbook/docs/conventions/backend-file-topology.md` for canonical section grammar.

That topology is authoritative for:

- level-1 `CONSTANTS` / `SCHEMAS` / `SPEC` organization in spec files;
- level-2 query/mutation/action function-kind grouping inside `GroupSpec.make()`;
- implementation grouping by public/internal Confect function kind;
- schema/type adjacency;
- empty-section omission and `INTERNALS` / standalone-only `TYPES` placement.

Do not duplicate or invent a different section grammar in project-local Confect files.

## Confect refs vs native Convex refs

Use the representation appropriate to the caller:

```text
Confect ref
→ application contract
→ Args/Returns codecs
→ typed Effect/codec information

Convex api/internal/components ref
→ native Convex FunctionReference
→ integrations requiring native references
```

Do not add cosmetic wrappers between them.

Native Convex remains appropriate where required/materially better for components, workflows, third-party Convex libraries, generated/native APIs, and specific HTTP/provider/framework integrations. Verify installed Confect support before replacing a native boundary.

## Client/server use

Browser calls use the best installed reactive/client integration; do not force Effect execution into React for symmetry. A Confect-backed mutation may be called through the appropriate client/ref while TanStack Mutation owns pending/error/success UI state.

TanStack Start server functions that meaningfully orchestrate validation/auth/multiple backend calls may use Effect internally; run the Effect once at the server-function boundary. Direct server-side Confect calls derive args from the actual ref (`Ref.Args<...>`) and use the codec-aware runner/client path rather than reconstructing types from a form/domain schema.

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

For Confect `10.0.0-next.13`, treat both `confect/_generated/` and the sibling `convex/` directory as generator-owned targets. Do not edit generated root Convex entrypoints such as `convex/schema.ts` or generated function modules manually. The supported authored exceptions inside `convex/` are `tsconfig.json` and `convex.config.ts`; keep those under normal authored-source ownership and typecheck the Convex runtime through `convex/tsconfig.json`.

Confect-generated deployment/runtime modules are source-required generated artifacts for the checked-in application shape. Track them when the repository deploys/tests from source, regenerate them through the repository's canonical codegen command after Confect inputs change, and make CI detect drift across the generated targets while excluding the authored `convex/` exceptions from generator-byte comparison.

- Run the repository's canonical codegen after specs/schema/refs/generated inputs change.
- Keep tightly coupled `@confect/*` prereleases exact-version aligned.
- Verify the installed Effect version satisfies Confect's Effect peer ranges. When relevant, verify separate platform peers such as `@confect/server`'s optional `@effect/platform-node` peer against their own ranges.
- Fix/upgrade a real compatibility boundary where possible; keep unavoidable prerelease workarounds narrow and documented rather than hiding them behind permanent generic facades.

The owned `confect` skill contains the procedural investigation/review workflow.
