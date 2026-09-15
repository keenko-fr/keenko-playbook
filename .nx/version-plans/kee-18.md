---
keenko: minor
---

Reconcile foreign DTO boundary decoding and typed Failure ownership, add deterministic TanStack Intent discovery with optional Context7 retrieval guidance, and introduce one canonical frontend capability router. The KEE-19 follow-up clarifies the foreign `FooDto`, canonical `Foo`, and adapter-owned `sFooFromDto` relationship without changing the release scope.

This changes generated conventions and tooling before the first supported baseline. Recreate pre-1.0 consumers, including Playground, from the accepted release candidate rather than migrating them.
