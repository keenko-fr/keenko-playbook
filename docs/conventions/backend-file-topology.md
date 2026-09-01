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

## Confect spec files

At level 1, a Confect spec may contain these sections in order:

```text
CONSTANTS
SCHEMAS
SPEC
```

Omit any section without content. `SCHEMAS` is for extracted schemas that are reusable, sufficiently complex, or meaningful semantic primitives; do not create it merely to hold a simple one-use endpoint schema.

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
```

Group implementations by Confect function kind. Do not create one separator per individual implementation function.

`INTERNALS` owns non-exported implementation helpers. `TYPES` is last. Empty sections are omitted.

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

Each named exported feature function gets its own section, using that function name as the section label (`search` → `SEARCH`). Feature-local schemas live under `SCHEMAS`; feature-local typed failures live under `ERRORS`; non-exported helpers live under `INTERNALS`; `TYPES` is last. Empty sections are omitted.

## Infra files

Use these level-1 sections in order:

```text
CONSTANTS
SCHEMAS
ERRORS
SERVICE
<NAMED EXPORTED FUNCTION>
<NAMED EXPORTED FUNCTION>
...
INTERNALS
TYPES
```

`SERVICE` is specifically for an Effect service/layer boundary. Ordinary exported functions get their own named sections. Provider-owned `*ApiDto` schemas stay under `SCHEMAS` in the owning infra adapter. Non-exported helpers live under `INTERNALS`; `TYPES` is last. Empty sections are omitted.

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

- `FIND` may contain `find`, `findById`, `findByName`, `get`, `getById`, and equivalent single-resource reads. Preserve the semantic distinction between `find` and `get` from `backend-architecture.md`.
- `LIST` may contain `list`, `take`, `paginate`, and equivalent collection reads.
- `INSERT` may contain `insert`, `ensure`, and equivalent creation operations.
- `PATCH` contains update operations.
- `REMOVE` contains deletion operations.
- `INTERNALS` owns non-exported helpers.
- `TYPES` is last.

Empty sections are omitted.
