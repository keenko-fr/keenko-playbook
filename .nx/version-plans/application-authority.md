---
keenko: minor
---

Define the application authority boundary between Convex/application code and the TanStack Start server runtime.

Clarify that business policy, workflows, invariants, idempotency, and business side effects belong to the authoritative backend, while TanStack Start server owns web-runtime concerns such as SSR, loaders, redirects, transport validation, callbacks, and presentation composition.
