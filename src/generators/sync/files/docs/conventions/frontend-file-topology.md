# Frontend file topology

Frontend concern sections are navigation aids for files with multiple meaningful concerns, not required ceremony. Omit separators in a trivial or single-concern file. When sections materially clarify a React route, page, layout, or component file, use only the sections it needs and keep this canonical order:

```ts
// CONSTANTS -------------------------------------------------------------------------------------------------------------------------------
// ROUTE -----------------------------------------------------------------------------------------------------------------------------------
// DISPLAY ---------------------------------------------------------------------------------------------------------------------------------
// STYLES ----------------------------------------------------------------------------------------------------------------------------------
// PAGE | LAYOUT | COMPONENT ---------------------------------------------------------------------------------------------------------------
// COMPONENTS ------------------------------------------------------------------------------------------------------------------------------
// HELPERS ---------------------------------------------------------------------------------------------------------------------------------
// TYPES -----------------------------------------------------------------------------------------------------------------------------------
```

Use the canonical section names, but do not treat an exact separator width as normative. Keep separators visually consistent within a file and do not invent synonyms such as `CONSTS`, `UTILS`, `FUNCTIONS`, or `PRESENTATION`. Empty sections are omitted.

A frontend concern separator is a level-1/major separator. When it follows existing code, place one blank line before the separator and no blank line after it; the first declaration in that section follows immediately. At the start of a file there is naturally no preceding blank line.

`PAGE`, `LAYOUT`, and `COMPONENT` are alternatives for the main rendered unit.

- `CONSTANTS`: static local values.
- `ROUTE`: TanStack route configuration.
- `DISPLAY`: domain/application value to user-facing meaning.
- `STYLES`: CVA/component-owned visual definitions.
- main rendered unit: the page/layout/component.
- `COMPONENTS`: file-local subordinate React components.
- `HELPERS`: non-React local implementation functions.
- `TYPES`: file-level or shared local types without a stronger owner; when used, it is final and nothing follows it.

Type locality takes precedence over collecting types in a trailing section. Keep a component/page/layout props type beside the construct it describes rather than moving it to final `TYPES`. Keep other strongly-owned types near their owning schema, configuration, component, or helper.

When a frontend file owns an Effect Schema and a corresponding TypeScript representation, keep the schema-derived type immediately below the schema declaration instead of collecting it in `TYPES`.

Prefer function declarations for intentionally trailing local components/helpers when hoisting supports the static-dependencies → main-unit → implementation-details reading order.
