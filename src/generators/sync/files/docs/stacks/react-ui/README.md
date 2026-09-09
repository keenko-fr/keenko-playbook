# React UI

This module owns the canonical Keenko React UI stack. Renderer-neutral UI quality remains in `.keenko/docs/conventions/frontend.md`; React programming rules remain in the `react` module.

## Supported stack

For new projects, the supported major-generation contract is:

- Tailwind CSS 4 as the default styling language;
- shadcn/ui as the default application-owned component layer;
- Base UI 1 as the default primitive and accessibility foundation for new shadcn projects.

Exact package versions and executable theme values belong in project code/config. Do not copy patch pins or token values into project UI documentation.

Tailwind is the default, not a ban on handwritten CSS. Use semantic theme tokens for shared visual decisions. Arbitrary Tailwind values are fine for genuine one-off values. Do not create a second token system beside the project's canonical theme.

Existing sound Radix or React Aria projects do not migrate merely to match the default for new projects.

## Component selection and ownership

Use this precedence when implementing an interaction:

```text
existing project component
-> shadcn component
-> Base UI primitive
-> custom interaction behavior
```

shadcn-installed components are application-owned source. They are not generated or vendor code. Modify a shadcn component directly when its generic component contract needs to change.

Add a wrapper only when it represents meaningful composition, domain behavior, or another real abstraction. Do not wrap application-owned components only to avoid editing them.

`components/ui` is a deliberate reserved location for domain-agnostic application UI primitives. It is an explicit exception to the general rule against generic component dumping grounds. Business-aware and domain-aware components still follow the ownership ladder in `.keenko/docs/conventions/frontend.md`.

## STYLES

Component-owned styles live in an uppercase CVA object named for the main rendered unit. Keep meaningful or repeated styling out of JSX. Trivial one-off structural classes may remain inline when extraction would add noise.

When state already exists, expose it through canonical semantic attributes such as `data-status`, `data-active`, `data-invalid`, `data-selected`, or `data-orientation` and style from that state. Use canonical English programmatic values in attributes. Do not create a CVA variant merely to mirror existing state.

CVA variants represent genuine reusable visual API choices such as size, density, emphasis, tone, or a real orientation API.

Keep meaning and visuals separate. `DISPLAY` in the frontend convention decides what a domain/application value means to the user. `STYLES` decides how that exposed state looks.

## UI decisions

Project-specific visual and interaction decisions belong in `docs/project/ui.md`. Follow the renderer-neutral completeness and unsettled-decision rules in `.keenko/docs/conventions/frontend.md`.

The optional `prototype` skill may help explore materially different UI directions when it is installed by the project preset. This module does not require that skill.
