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

## Read from the operation down

Present the main function/declaration first, then its local types, then its private helpers, then the next section. Keep local details below their owner instead of requiring a final `INTERNALS` or `TYPES` block.

Schema-derived types stay immediately below their Schema with no blank line. A `S.TaggedError` class already provides its type identity and needs no alias.

Respect the effective `no-use-before-define` rule and JavaScript initialization order. Hoisted `function` declarations can live below their caller where the rule allows functions; a later `const` helper cannot be assumed safe or lint-compatible. Use an appropriate function declaration or another valid local arrangement. Private helpers returning Effects do not each need `Effect.fn`.

## Feature and domain files

Keep modules flat by default. Use level-1 sections per exported operation or coherent group, labelled for the operation, such as `SUBMIT`, `CONCLUDE` or `FIND`. Types and helpers follow the operation they describe.

This complete pure-domain example uses hoisted helpers and one argument:

```ts
// CAN SUBMIT ------------------------------------------------------------------------------------------------------------------------------
export function canSubmit(args: SubmitArgs) {
  return args.enabled && hasItems(args.items);
}

type SubmitArgs = {
  enabled: boolean;
  items: readonly string[];
};

function hasItems(items: readonly string[]) {
  return items.length > 0;
}
```

Features follow the same order for effectful operations. Use `const` for configured functions such as `E.fn("orders.submit")(...)`; put ordinary private function helpers below their caller. Shared declarations may precede the first operation that needs them when initialization/dependency order requires it. Do not collect every helper at the end.

## Schema files

Keep only sections for real contracts, using the semantic persisted-resource grammar in `schema-types.md`. Do not manufacture `ENTITY`, `INSERT` or `PATCH` sections. Schema-derived types remain adjacent; local predicates/helpers remain with the contract that uses them, in an order compatible with initialization.

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
GROUP
```

Group entry points by function kind rather than adding a separator for every implementation. Local types and helpers follow their owning entry point within that group. Shared helpers can follow their first owner without requiring a final helper block.

`GROUP` owns the required `GroupImpl.make(...).pipe(...)` assembly and is always last. Keep initialized implementation values before the assembly that uses them.

## Infra files

Keep structural sections for the capability, such as `CONSTANTS` and `SERVICE`, when they contain real content. Read from the public service/capability declaration down to its local implementation details, respecting initialization order. No mandatory trailing `INTERNALS` or `TYPES` block is imposed.

Context issue/Failure/Defect contracts belong in `errors/<concept>.ts`. Foreign DTO Schemas belong in `schemas/<provider>/<resource>.ts`; adapter-local relationship Schemas such as `sFooFromDto` stay beside their consuming adapter. Do not introduce a parallel direct function API beside the service.

## Optional data files

Extract persistence modules only under the criteria in `backend-architecture.md`. Keep modules flat by default and name them for their persisted resource in kebab-case, such as `data/accounts.ts`. Do not require a file per table, matching feature/data files or CRUD file families.

Use level-1 sections for exported operations or coherent groups, such as `FIND`, `GET`, `CREATE` or `WITH RELATIONS`. Keep local argument/result types and private helpers below their owning operation, respecting initialization order. Schema-derived types remain immediately below their Schema. Omit empty sections; no final `TYPES` or `INTERNALS` block is required.

An exported operation may retrieve a configured or usable resource, load its required relations, check their consistency and invoke pure domain predicates. Keep shared loading/checking helpers private in the resource module unless independent reuse earns an export. Neither a matching feature file nor separate loading and validation functions are required; sections describe the meaningful operations that actually exist.

`data/confect.ts` is the narrow technical exception for focused Confect persistence adapters. Use coherent sections such as `ERRORS`, `OPTIONS` and `FAILURES` only when they contain real helpers. Keep local types with their owner. This file does not require resource data modules or a generic repository façade.
