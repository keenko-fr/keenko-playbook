# Application authority

A Keenko application has one authoritative application backend: Convex/application code.

That backend owns authorization, resource ownership, business invariants, state transitions, business workflows, business idempotency, and business side effects. TanStack Start server remains a web runtime: it owns SSR, loaders, redirects, web session/authentication, transport validation, web callbacks, presentation composition, HTTP/error adaptation, and strictly web orchestration.

A ServerFn is a server trust boundary, but it is not thereby an application authority boundary. Validate and normalize untrusted web input there, then delegate business decisions to the authoritative backend.

## Placement test

Use these questions in order:

1. Does the code decide whether a business action is allowed, who owns a resource, which invariant must hold, or which state transition occurs? Put it in the backend.
2. Do the order, conditions, compensations, or collective success of several calls constitute a business use case? Put that workflow in the backend.
3. Are retries or idempotency required for the correctness of a business effect? Own them in the backend with that effect.
4. Is the code only composing backend reads/calls for a web response, redirect, SSR result, loader, callback, or other presentation concern? It may remain in TanStack Start server.
5. Does the code merely require a server-only secret? Place secret access in a server-capable runtime, but do not infer business ownership from secret location. Keep the business decision in the backend and expose the narrow integration needed to execute it.

Preload, cache state, and UI gating may anticipate an outcome for user experience, but they never authorize an operation or enforce a business invariant.

A genuine runtime or provider constraint does not automatically transfer application authority to TanStack Start. Document any unavoidable exception as an explicit repository-specific decision, including the constraint and the authority that remains elsewhere.

This convention does not require every server-side operation to pass through Convex. Legitimate ServerFns, loaders, SSR, AuthKit callbacks, web-only composition, transport validation, and HTTP adaptation remain web-owned. Do not introduce a new server abstraction solely to restate this boundary, and do not automatically migrate existing application code without evaluating each workflow.
