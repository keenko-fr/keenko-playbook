---
keenko: minor
---

Correct generated backend integration-test ownership by keeping ordinary backend tests in Node while running authored `packages/backend/test/` tests in Edge Runtime.

Add the Confect v10 testing dependencies required for generated-ref behavior tests without making generator-owned `packages/backend/convex/` an authored test location. Recreate pre-1.0 consumers, including Playground, from the accepted release candidate rather than patching them locally.
