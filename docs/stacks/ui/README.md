# UI

## Ownership

- Generic cross-application, domain-agnostic controls belong in the shared UI layer.
- Domain-aware reusable components remain feature-owned until a genuine second application/package consumer requires promotion.
- Prefer existing shadcn/Base UI/shared primitives before adding feature-local foundational control behavior.
- Application-specific TanStack Form adapters remain app-local rather than shared UI.

## Meaning and styling

- Keep domain-to-user meaning in `DISPLAY` and visual rules in `STYLES`.
- Use exhaustive typed display mappings for finite values.
- Use an uppercase CVA object named for the main rendered unit.
- Expose existing semantic state through `data-*` attributes with canonical English values and style from those attributes.
- CVA variants are for genuine reusable visual API dimensions such as size, density, emphasis, or tone—not duplicated state.

## Accessibility

Accessibility is component behavior, not a later hardening phase. Prefer semantic HTML and mature primitives; preserve accessible names, keyboard interaction, focus, disabled/error/state semantics, and appropriate roles.

See `.playbook/docs/conventions/frontend.md` and `frontend-file-topology.md`.
