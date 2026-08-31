# Frontend file topology

For React route, page, layout, and component files, use only the sections the file needs and keep this canonical order:

```ts
// CONSTS ----------------------------------------------------------------------------------------------------------------------------------
// ROUTE -----------------------------------------------------------------------------------------------------------------------------------
// DISPLAY ---------------------------------------------------------------------------------------------------------------------------------
// STYLES ----------------------------------------------------------------------------------------------------------------------------------
// PAGE | LAYOUT | COMPONENT ---------------------------------------------------------------------------------------------------------------
// COMPONENTS ------------------------------------------------------------------------------------------------------------------------------
// HELPERS ---------------------------------------------------------------------------------------------------------------------------------
// TYPES -----------------------------------------------------------------------------------------------------------------------------------
```

Use the exact 140-character concern separators and canonical section names. Do not invent synonyms such as `CONSTANTS`, `UTILS`, `FUNCTIONS`, or `PRESENTATION`. Empty sections are omitted.

`PAGE`, `LAYOUT`, and `COMPONENT` are alternatives for the main rendered unit.

- `CONSTS`: static local values.
- `ROUTE`: TanStack route configuration.
- `DISPLAY`: domain/application value to user-facing meaning.
- `STYLES`: CVA/component-owned visual definitions.
- main rendered unit: the page/layout/component.
- `COMPONENTS`: file-local subordinate React components.
- `HELPERS`: non-React local implementation functions.
- `TYPES`: non-props file-local types; it is final and nothing follows it.

Keep a component/page/layout props type immediately after the function it describes, with no blank line, rather than moving props to final `TYPES`.

Prefer function declarations for intentionally trailing local components/helpers when hoisting supports the static-dependencies → main-unit → implementation-details reading order.
