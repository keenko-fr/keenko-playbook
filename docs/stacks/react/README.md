# React

Keenko web projects use React and the enabled React ecosystem adapters.

- Keep screen-specific behavior local until reuse is real.
- Feature-aware components live with their feature.
- Domain-agnostic controls move to shared UI only with genuine primitive/cross-application ownership.
- Do not create a generic global components dumping ground.
- Derive values during render instead of mirrored state.
- Use Effects for synchronization with external systems, not ordinary application data flow.
- User-triggered side effects belong to the event/mutation flow that caused them.
- Memoization is a performance tool, not default ceremony or a correctness mechanism.
- Prefer semantic native elements/accessibility-capable primitives.

See `.playbook/docs/conventions/frontend.md` and `frontend-file-topology.md`.
