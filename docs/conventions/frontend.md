# Frontend ownership and rendering

## Component ownership

Use this ownership ladder:

```text
used only in one file
→ local COMPONENTS

reusable within one feature/domain
→ features/<feature>/components

cross-application + domain-agnostic
→ shared UI package

domain-aware and genuinely shared across application/package boundaries
→ shared domain UI
```

Avoid a generic global `components/` bucket for arbitrary business components.

Shared UI owns generic interaction, accessibility, visual state, semantic attributes, and styling. It does not know application terminology, domain values, or business workflows. Start domain-aware UI in its feature and promote it only after a genuine second application/package consumer makes local ownership inadequate.

A domain-agnostic primitive may be promoted earlier when primitive-level ownership is itself clear. Prefer an existing shadcn/Base UI/shared primitive before reimplementing foundational interaction behavior.

## DISPLAY

`DISPLAY` answers how an application/domain value is represented to a user. It may contain:

- translated labels/message functions;
- icons;
- locale-aware formatters;
- display-only options;
- finite domain-value → user-meaning mappings.

It does not contain business/persistence rules, Tailwind classes, CVA definitions, or literal translated copy.

For finite values, use exhaustive typed maps, normally named concisely such as `statusDisplay`, `stateDisplay`, `typeDisplay`, or `roleDisplay`, with `satisfies Record<...>` so new domain values require deliberate UI handling.

## STYLES

Component-owned styles live in an uppercase CVA object named for the main rendered unit. Keep meaningful/repeated styling out of JSX; trivial one-off structural classes may remain inline when extraction would add noise.

When state already exists, expose it via canonical semantic attributes such as `data-status`, `data-active`, `data-invalid`, `data-selected`, or `data-orientation` and style from that state. Use canonical English programmatic values in attributes. Do not create a CVA variant merely to mirror existing state.

CVA variants represent genuine reusable visual API choices such as size, density, emphasis, tone, or a real orientation API.

Keep meaning and visuals separate: `DISPLAY` decides what `draft` means to the user; `STYLES` decides how `data-status="draft"` looks.

## JSX responsibility

JSX owns semantic structure, composition, data flow, interaction, accessibility, and meaningful state exposure. `DISPLAY` owns user meaning; `STYLES` owns visuals; Paraglide owns interface copy.

## Semantics and accessibility

Prefer correct native semantic elements and accessible primitives before recreating behavior with `div`, click handlers, ARIA, or custom keyboard logic.

Accessibility is part of the component contract: accessible name, keyboard operation, focus behavior, disabled semantics, error association, meaningful state, and appropriate roles/HTML must be preserved where relevant. Prefer established primitives that implement difficult interaction semantics correctly.

## React state and effects

State ownership:

```text
Router search/params → bookmarkable/navigation state
TanStack Query       → server state
TanStack Form        → editing/form state
React local state    → ephemeral UI/component state
```

Do not copy Query results or other canonical state into React state/context merely to synchronize another copy. Derive values during rendering when they can be computed from props/current state.

Use `useEffect` primarily to synchronize React with an external system (browser API, subscription, imperative widget, timer, etc.), not as ordinary application orchestration. User-triggered side effects belong in the event/mutation flow that owns the interaction rather than “set state, then wait for an Effect to notice”.

Do not add `useMemo`, `useCallback`, or `memo` as ceremony. Use them for credible/measured performance needs or when stable identity is actually part of another API contract. Correctness must never depend on memoization.

Derive rather than synchronize duplicate state. Persist/cache derived values only for a concrete performance, historical, query, audit, external-contract, or snapshot reason.

## Markdown

When Markdown is the authored content format, form state and persistence keep raw Markdown. Rendered/generated HTML is presentation output only unless a project has a deliberate derived-cache requirement. A TanStack Form-aware Markdown field belongs in the app form layer; a lower-level controlled editor belongs in shared UI only when genuinely reusable.
