# Backend architecture

For Effect + Convex/Confect applications, keep these responsibilities distinct:

```text
spec
→ external/backend function contract

feature
→ application/use-case orchestration

data
→ focused persistence reads/writes

infra
→ reusable technical/provider integration
```

Do not collapse layers merely because current implementations are small.

## Data

`data` owns narrow persistence concerns such as indexed reads, inserts, patches, removals, and pagination. It does not own full business workflows.

Use concise contextual names:

- `find` / `findByX`: absence is a legitimate result, normally represented with `Option` internally;
- `get` / `getByX`: the resource is required and absence is a typed failure;
- direct verbs such as `insert`, `patch`, and `remove` for writes.

## Feature

Features orchestrate use cases, business invariants, authorization policy, coordination across data/provider operations, and state transitions.

## Infra

`infra` owns reusable technical plumbing. Business policy remains with the owning feature. A rate-limiter adapter may live in infra; rate names, windows, quotas, and consequences belong to the feature.

Do not create `Context.Service` merely because a helper uses Effect. Introduce services when substitution/layering provides real value.

## Modules and packages

Prefer deep modules: substantial behavior behind a small stable interface. Avoid abstractions that merely rename/forward another API without adding ownership, invariants, policy, or simplification.

Create a workspace package only for a real package boundary: multiple consumers, a deliberate public API, distinct runtime/build constraints, or a genuinely shared architectural responsibility. Do not create packages merely to organize folders.

Consumers use supported package exports/subpaths rather than reaching into another package's private implementation directories. Keep the package dependency graph acyclic; when a cycle appears, revisit ownership instead of teaching tooling to tolerate it.
