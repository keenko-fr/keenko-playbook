# Code style

Optimize for reader load, explicit ownership, and directness rather than ceremony.

Oxfmt is the canonical owner of arbitrary source formatting. Follow its output instead of maintaining parallel prose rules for quotes, semicolons, wrapping, trailing commas, or equivalent appearance details. The canonical configuration and import-sorting contract live in `tooling.md`.

## Imports and modules

- Use `import type` for type-only imports; linting enforces the mechanical form.
- Keep simple import grouping: external/workspace packages first, then project-local imports. Oxfmt owns sorting within those groups and preserves side-effect import order.
- Do not create convenience `index.ts` barrels inside implementation trees. A barrel is appropriate only when it deliberately defines a package/module public API.
- Prefer named exports. Use default exports only when a framework/tooling contract naturally requires one.
- Use lowercase `kebab-case` filenames unless framework-special filenames require another form.

### Architectural module imports

Only architectural `data` and `features` modules use a special namespace-import convention.

Always namespace-import a data module. When the imported module represents the same concept as the consuming file, use the short architectural name:

```ts
import * as data from "../data/watchlist";
```

When it represents a different concept, preserve the missing concept information:

```ts
import * as usersData from "../data/users";
```

Always namespace-import a features module using the same rule:

```ts
import * as features from "../features/watchlist";
import * as usersFeatures from "../features/users";
```

Do not redundantly name same-concept imports `watchlistData` or `watchlistFeatures` when the consuming file already supplies the `watchlist` context.

Other architectural modules use named imports by default, including infra, schemas, Confect helpers, and ordinary modules:

```ts
import { TvMaze } from "../infra/tvmaze";
import {
  sWatchlist,
  type Watchlist,
  type WatchlistInsert,
} from "../schemas/watchlist";
```

Do not use generic `infra` or `schemas` namespace aliases. The convention optimizes for information that is not already present in the current module's concept.

## Naming

- Prefer concise contextual names. Inside `data/packs.ts`, `find`, `get`, `insert`, `patch`, and `remove` are better than repeating `Pack` in every identifier when imports remain clear.
- Avoid cryptic abbreviations. Conventional short forms such as `id`, `url`, `api`, `ctx`, and genuine `dto` usage are fine.
- Name booleans as readable predicates when useful (`isActive`, `hasAccess`, `canPublish`, `shouldRetry`) without mechanically forcing a prefix when the domain word is already boolean (`enabled`, `verified`).
- Prefer specific mutation verbs such as `insert`, `patch`, `remove`, `publish`, `archive`, `attach`, `detach`, `sync`, `record`, and `resolve`. Avoid vague `handle`, `process`, `manage`, `do`, or `execute` unless the function genuinely owns that generic boundary.
- Use `remove` for authored deletion operations; retain native `.delete()` when calling an API that uses that name.
- Preserve canonical domain vocabulary. Do not create synonyms for established concepts.

## Functions and types

- Use `const` for values and configured functions returned by APIs.
- Use function declarations for ordinary authored functions when hoisting improves main-first reading order. Do not impose arrows everywhere.
- Let TypeScript infer ordinary return types. Annotate when the return type is an important public contract, prevents harmful widening, documents a meaningful Effect contract, or makes complex inference clearer.
- Prefer `satisfies` when checking a value without widening its inferred shape.
- Treat casts, double casts, and non-null assertions as narrow boundary escape hatches. Prefer decoding, narrowing, or fixing upstream types; explain non-obvious interop casts.
- Prefer literal unions/schema-derived types over enum-like runtime objects when no runtime object is needed.

## Constants

Use `SCREAMING_SNAKE_CASE` for true static module-level constants. The chosen frontend CVA style-object convention is an explicit exception. Extract a literal when its name communicates domain meaning, it is reused, or it needs a single change point; do not manufacture constants for obvious one-off literals.

## Comments and suppressions

- Comments explain rationale, invariants, external constraints, or dangerous edge cases, not straightforward code.
- Canonical structural section separators defined by file-topology conventions are an explicit exception: they are navigation/file-structure markers, not explanatory comments. Follow the owning topology document's section names, levels, order, 140-column width, spacing, and empty-section omission rules.
- Use the narrowest lint suppression possible and include a concrete reason.
- Do not merge vague TODO/FIXME notes. A temporary note must describe a useful local constraint or reference tracked work.
- Remove commented-out implementation code; Git owns history.
