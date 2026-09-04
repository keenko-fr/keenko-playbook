# React

This module owns the React-specific programming model. Renderer-neutral UI quality and component ownership live in `.keenko/docs/conventions/frontend.md`.

## Rendering and state

- JSX owns React structure, composition, data flow, interaction wiring, accessibility wiring, and meaningful state exposure.
- Keep screen-specific React behavior local until reuse is real. Follow the renderer-neutral ownership ladder when promoting components.
- Use `useState` for state the component genuinely owns. Derive values from props, Router, Query, Form, or local state during render instead of mirroring them into another state variable.
- Use `useEffect` primarily to synchronize React with an external system such as a browser API, subscription, imperative widget, or timer. Do not use Effects as ordinary application data-flow machinery.
- User-triggered side effects run from the event or mutation flow that owns the interaction. Do not set state only so an Effect can notice it and perform the action.
- Do not add `useMemo`, `useCallback`, or `memo` as default ceremony. Use memoization for a credible performance need or when another API genuinely requires stable identity. Correctness must not depend on memoization.

Use semantic native elements and accessibility-capable primitives according to the frontend component contract.

See `.keenko/docs/conventions/frontend.md` and `frontend-file-topology.md`. When `react-ui` is enabled, it owns React styling and component-stack conventions.
