# Backend file topology

Structural section separators are navigation markers and an explicit exception to the rule that comments explain rationale. Preserve them and omit empty sections.

All separator comment lines are exactly 140 characters, including indentation. A level-1 separator starts a top-level section: place one blank line before it when it follows code, and none after it. A level-2 separator inside a fluent structure has no blank line before or after it.

```ts
// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const RETRY_LIMIT = 3;
```

```ts
  // QUERIES -------------------------------------------------------------------------------------------------------------------------------
  .addFunction(...)
```

## Public operations, internals and types

In ordinary business modules, prefer public declarations and operations first, then `INTERNALS` for private helpers, then `TYPES` for the remaining independent types. Omit empty sections. Prefer alphabetical order for exported functions and private helpers within each independent semantic group, following the preference and exceptions in `code-style.md`.

Function argument types stay immediately after their owning function. Schema-derived types stay immediately below their Schema with no blank line. Types directly associated with an enum, vocabulary or another declaration whose understanding requires adjacency also stay with that owner. Do not create enums or constant objects to satisfy this layout. A `S.TaggedError` class already provides its type identity and needs no alias.

`INTERNALS` groups private TypeScript helpers, including shared local loading/checking functions. Do not export a helper merely to avoid this section. `TYPES` groups types with no declaration requiring adjacency; prefer their alphabetical order.

Respect the effective `no-use-before-define` rule and JavaScript initialization order. Hoisted `function` declarations can live below their caller where the rule allows functions. Functions defined with `const`, configured `Effect.fn` values and other value dependencies must be initialized before their actual use. A later value referenced inside a function body can be safe if that body runs only after initialization; an eager construction cannot assume this.

If moving a helper would break initialization or require an artificial transformation, retain a technically correct arrangement. Do not add wrappers or abstractions solely for presentation. Private helpers returning Effects do not each need `Effect.fn`.

## Feature and domain files

Keep modules flat by default. Use level-1 sections per exported operation or coherent group, labelled for the operation, such as `CONCLUDE`, `FIND` or `SUBMIT`. Keep argument types adjacent, then collect private helpers and independent types in the final sections described above.

This complete pure-domain example exports a self-explanatory function for named imports, with hoisted local helpers and one structural argument:

```ts
// CAN SUBMIT REQUEST ----------------------------------------------------------------------------------------------------------------------
export function canSubmitRequest(args: SubmitRequestArgs) {
  return args.enabled && hasItems(args.items);
}

type SubmitRequestArgs = {
  enabled: boolean;
  items: readonly string[];
};

// INTERNALS -------------------------------------------------------------------------------------------------------------------------------
function hasItems(items: readonly string[]) {
  return items.length > 0;
}
```

Features follow the same order for effectful operations. Use `const` for configured functions such as `E.fn("orders.submit")(...)`. Shared values may precede the first operation that needs them when initialization/dependency order requires it. This example has no independent types, so it needs no `TYPES` section.

## Schema files

Keep only sections for real contracts, using the semantic persisted-resource grammar in `schema-types.md`. Do not manufacture `ENTITY`, `INSERT` or `PATCH` sections. Schema-derived types remain adjacent. A predicate used during Schema construction must already be available: a hoisted function may live in `INTERNALS`, while a configured value needed eagerly stays before its use.

## Error contract files

`errors/<concept>.ts` groups the context's used error families in this order:

```text
SCHEMA
FAILURES
DEFECTS
```

Each section keeps the issue Schema and its derived type together, followed by the Failure/Defect class when used. Schema validation uses native `SchemaError` without a compulsory custom class. Omit unused families.

Contracts imported by specs must be client-safe. Do not import data/feature/infra implementations, generated server services, `@confect/server` or other server-only values. See `validation.md` for semantic categories and diagnostic causes.

## Confect spec files

At level 1, use the following sections in order when present:

```text
CONSTANTS
SCHEMAS
SPEC
```

`SCHEMAS` is for extracted contracts that are reusable, complex or meaningful semantic primitives. Simple one-use endpoint contracts stay inline; derived types stay with their Schema.

Inside `GroupSpec.make()`, use level-2 separators before each existing function kind, in order:

```text
QUERIES
MUTATIONS
ACTIONS
INTERNAL QUERIES
INTERNAL MUTATIONS
INTERNAL ACTIONS
```

```ts
// SPEC ------------------------------------------------------------------------------------------------------------------------------------
export default GroupSpec.make()
  // QUERIES -------------------------------------------------------------------------------------------------------------------------------
  .addFunction(...)
  // MUTATIONS -----------------------------------------------------------------------------------------------------------------------------
  .addFunction(...);
```

## Confect implementation files

Use level-1 sections in this order when present:

```text
CONSTANTS
SCHEMAS
QUERIES
MUTATIONS
ACTIONS
INTERNAL QUERIES
INTERNAL MUTATIONS
INTERNAL ACTIONS
INTERNALS
TYPES
GROUP
```

Group entry points by function kind rather than adding a separator for every implementation. Prefer alphabetical order within each independent category, preserving construction dependencies. Keep argument and Schema-derived types adjacent.

Registered Confect internal queries, mutations and actions are framework functions, not private TypeScript helpers. Keep them in their `INTERNAL QUERIES`, `INTERNAL MUTATIONS` and `INTERNAL ACTIONS` categories. Optional `INTERNALS` and `TYPES` sections follow those categories for ordinary private helpers and independent types only.

`GROUP` owns the required `GroupImpl.make(...).pipe(...)` assembly and is always last. Keep initialized implementation values before the assembly that uses them.

## Infra files

Keep structural sections for the capability, such as `CONSTANTS` and `SERVICE`, when they contain real content. Framework construction and initialization order take priority over the ordinary business-module layout. Use `INTERNALS` / `TYPES` when useful and compatible with that structure; do not force empty sections or move initialized dependencies after their use.

Context issue/Failure/Defect contracts belong in `errors/<concept>.ts`. Foreign DTO Schemas belong in `schemas/<provider>/<resource>.ts`; adapter-local relationship Schemas such as `sFooFromDto` stay beside their consuming adapter. Do not introduce a parallel direct function API beside the service.

## Optional data files

Extract persistence modules only under the criteria in `backend-architecture.md`. Keep modules flat by default and name them for their persisted resource in kebab-case, such as `data/accounts.ts`. Do not require a file per table, matching feature/data files or CRUD file families.

Use level-1 sections for exported operations or coherent groups, such as `CREATE`, `FIND`, `GET` or `WITH RELATIONS`. Follow the public operations / `INTERNALS` / `TYPES` layout and adjacency exceptions above, respecting initialization order.

An exported operation may retrieve a configured or usable resource, load its required relations, check their consistency and invoke pure domain predicates. Keep shared loading/checking helpers private in the resource module unless independent reuse earns an export. Neither a matching feature file nor separate loading and validation functions are required; sections describe the meaningful operations that actually exist.

`data/confect.ts` is the narrow technical exception for focused Confect persistence adapters. Use coherent sections such as `ERRORS`, `OPTIONS` and `FAILURES` only when they contain real helpers. Preserve its technical group order, type adjacency and initialization dependencies. This file does not require resource data modules or a generic repository façade.
