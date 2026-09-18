# Backend file topology

Backend structural section separators are navigation and file-organization conventions. They are an explicit exception to the generic rule that comments should explain rationale rather than straightforward code.

Use only sections that contain code. Keep the canonical order for the file kind. Do not add empty placeholder sections or invent synonymous headings. Section names, nesting level, order, width, and spacing are canonical.

All separator comment lines are exactly 140 characters, including indentation. A level-1 separator starts a major section: when it follows existing code, place one blank line before the separator and no blank line after it. A level-2 separator is a subseparator inside an enclosing fluent structure: add no blank line before or after it.

Level-1 separators organize top-level declarations:

```ts
// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
const RETRY_LIMIT = 3;
```

Level-2 separators organize nested fluent structure when the grammar below calls for them:

```ts
  // QUERIES -------------------------------------------------------------------------------------------------------------------------------
  .addFunction(...)
```

## Schema-derived types

Across backend file grammars, keep a schema-derived TypeScript type immediately below the schema declaration it belongs to, with no blank line. Do not move schema-derived aliases to a trailing `TYPES` section.

`TYPES` is only for genuine standalone non-schema-derived types such as helper types and function contracts. A class declared with `S.TaggedError` already owns its TypeScript type identity and does not need a companion alias.

Persisted-resource schema files have their own semantic grammar under `schema-types.md`: `CONSTANTS`, `FIELDS`, `ENTITY`, `INSERT`, `PATCH`, `INTERNALS`, with empty sections omitted. This document does not duplicate that grammar.

## Confect spec files

At level 1, a Confect spec may contain these sections in order:

```text
CONSTANTS
SCHEMAS
SPEC
```

Omit any section without content. `SCHEMAS` is for extracted schemas that are reusable, sufficiently complex, or meaningful semantic primitives; do not create it merely to hold a simple one-use endpoint schema. Any derived type for an extracted schema stays immediately below that schema.

Inside `GroupSpec.make()`, use level-2 separators immediately before the first function of each existing kind, in this order:

```text
QUERIES
MUTATIONS
ACTIONS
INTERNAL QUERIES
INTERNAL MUTATIONS
INTERNAL ACTIONS
```

Absent function kinds are omitted. `SCHEMAS` and `SPEC` are level 1; the function-kind separators are level 2 inside the fluent spec chain.

```ts
// SPEC ------------------------------------------------------------------------------------------------------------------------------------
export default GroupSpec.make()
  // QUERIES -------------------------------------------------------------------------------------------------------------------------------
  .addFunction(...)
  // MUTATIONS -----------------------------------------------------------------------------------------------------------------------------
  .addFunction(...);
```

## Confect implementation files

Use these level-1 sections in order:

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

Group implementations by Confect function kind. Do not create one separator per individual implementation function.

`SCHEMAS` owns only extracted schemas that genuinely belong to the implementation; their derived types remain adjacent. `INTERNALS` owns non-exported implementation helpers. `TYPES` contains only standalone non-schema-derived types and precedes `GROUP` when a group implementation is present. Empty sections are omitted.

`GROUP` is required for a Confect group implementation and owns the final `GroupImpl.make(...).pipe(...)` assembly. It is always last, after any `INTERNALS` and `TYPES` sections.

## Error contract files

Application/backend Failure contracts that must be imported by multiple backend owners, including Confect spec modules, live under:

```text
errors/
  shows.ts
  billing.ts
  ...
```

Use an error contract file only when the Failure or Issue vocabulary has earned a cross-owner backend contract. Do not create `errors/` files merely to mirror `schemas/`, features, or resources.

Error contract files must remain safe for Confect spec imports. They may depend on client-safe schema/contract modules but must not import data, infra implementations, generated server services, `@confect/server`, or other server-only modules.

A typical error contract file owns these sections, in order:

```text
ISSUES
FAILURES
```

- `ISSUES` owns canonical finite Issue schemas and their immediately adjacent derived types.
- `FAILURES` owns Schema-tagged Failure classes.
- Omit empty sections.
- A `S.TaggedError` class already owns its TypeScript type identity and does not need a companion alias.

Keep truly feature-local Failures in the owning feature file. Keep infra capability Failures with the infra capability.

## Feature files

Features remain flat by default:

```text
features/
  shows.ts
```

Do not create a directory per feature merely for organization.

Use these level-1 sections in order:

```text
CONSTANTS
SCHEMAS
ERRORS
<EXPORTED FUNCTION NAME>
<EXPORTED FUNCTION NAME>
...
INTERNALS
TYPES
```

Each named exported feature function gets its own section, using that function name as the section label (`search` → `SEARCH`).

- `SCHEMAS` owns feature-local schemas and their immediately adjacent schema-derived types.
- `ERRORS` owns Schema-tagged Failure classes that are genuinely local to this feature. If a Failure must also be imported by another backend owner such as a Confect spec, move the shared contract to `errors/<context>.ts` instead of importing the feature implementation module.
- `INTERNALS` owns non-exported helpers, including pure policy mappers such as provider Issue → feature Issue translation.
- `TYPES` is last and contains only standalone non-schema-derived types.

Empty sections are omitted.

## Infra files

A real infra capability uses these level-1 sections in order:

```text
CONSTANTS
ERRORS
SERVICE
INTERNALS
TYPES
```

- `CONSTANTS` owns capability/adapter constants when needed.
- `ERRORS` owns capability Issue schemas, their immediately adjacent derived types, and Schema-tagged Failure classes.
- `SERVICE` owns service construction, `make`, implementation operations, the service class, the primary layer, and genuine layer variants.
- `INTERNALS` owns private deterministic helpers and private foreign-to-application boundary schemas such as `sFooFromDto`.
- `TYPES` is last and contains only genuine standalone non-schema-derived types.

Empty sections are omitted.

Do not add a normal infra `SCHEMAS` section. Foreign `*Dto` schemas live under `schemas/<provider>/<resource>.ts`; an adapter-local `sFooFromDto` composes that foreign schema with canonical `sFoo` under `INTERNALS`. Do not create per-exported-function sections for service operations or expose parallel direct functions beside the capability service.

## Data files

Use these level-1 sections in order:

```text
CONSTANTS
SCHEMAS
FIND
LIST
INSERT
PATCH
REMOVE
INTERNALS
TYPES
```

The operation headings are CRUD families, not necessarily exact function names. Multiple related functions may live under the same heading.

- `SCHEMAS` owns persistence-only schemas, including focused Patch contracts that have no cross-layer consumer; derive them from shared `Fields` when appropriate and keep derived types adjacent.
- `FIND` may contain `find`, `findById`, `findByName`, `get`, `getById`, and equivalent single-resource reads. Preserve the semantic distinction between `find` and `get` from `backend-architecture.md`.
- `LIST` may contain `list`, `take`, `paginate`, and equivalent collection reads.
- `INSERT` may contain `insert`, `ensure`, and equivalent creation operations.
- `PATCH` contains update operations.
- `REMOVE` contains deletion operations.
- `INTERNALS` owns non-exported helpers.
- `TYPES` is last and contains only standalone non-schema-derived types.

Empty sections are omitted.
