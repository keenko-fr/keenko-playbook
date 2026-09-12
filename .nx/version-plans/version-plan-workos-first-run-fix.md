---
__default__: patch
---

Allow fresh generated Keenko projects to complete their first Convex development push before the WorkOS AuthKit webhook is configured.

Defer synchronized WorkOS identity and webhook registration until a real WORKOS_WEBHOOK_SECRET is configured, while preserving the official WorkOS component integration and behavioral lifecycle regression coverage.
