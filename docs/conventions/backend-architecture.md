# Backend architecture

For Effect + Convex/Confect applications, keep backend responsibilities distinct and owned by the narrowest layer that genuinely needs them.

A workspace backend package uses this topology by default:

```text
packages/backend/
  confect/
  schemas/
  features/
  data/
  infra/
```

Do not add an intermediate `src/` directory by default. These are ownership directories, not empty scaffolding requirements: create the directories the backend actually needs and omit unused ones.

```text
confect
→ backend function contracts and Confect implementations

schemas
→ application schemas shared across multiple backend layers

features
→ application/use-case orchestration and policy

data
→ focused persistence reads/writes

infra
→ provider adapters and reusable technical infrastructure
```

Do not collapse layers merely because current implementations are small. See `backend-file-topology.md` for canonical file section grammar.

## Confect

`confect/` owns backend function contracts and their Confect implementations. Keep endpoint/framework concerns at this boundary and delegate application policy to features or the narrower owning layer.

## Schemas

`schemas/` owns application schemas that are genuinely shared across multiple backend layers. It is not a generic home for every Effect Schema. Keep feature-local, endpoint-local, provider-owned, and persistence-local schemas with their narrower owner; see `schema-types.md` for representation and schema ownership rules.

## Features

`features/` owns use-case orchestration, business/application invariants, authorization policy, coordination across data/provider operations, state transitions, feature-local failures, and feature-local schemas.

Features remain flat by default, for example `features/shows.ts`. Do not create a directory per feature merely for organization.

## Data

`data/` owns narrow persistence concerns such as indexed reads, inserts, patches, removals, and pagination. It does not own full business workflows.

Use concise contextual names:

- `find` / `findByX`: absence is a legitimate result, normally represented with `Option` internally;
- `get` / `getByX`: the resource is required and absence is a typed failure;
- direct verbs such as `insert`, `patch`, and `remove` for writes.

## Infra

`infra/` owns provider adapters and reusable technical plumbing. Business policy remains with the owning feature. A rate-limiter adapter may live in infra; rate names, windows, quotas, and consequences belong to the feature.

Provider-owned `*ApiDto` schemas stay with the owning adapter rather than moving to application `schemas/` or a shared package.

Do not create `Context.Service` merely because a helper uses Effect. Introduce services when substitution/layering provides real value.

## Modules and packages

Prefer deep modules: substantial behavior behind a small stable interface. Avoid abstractions that merely rename/forward another API without adding ownership, invariants, policy, or simplification.

Create a workspace package only for a real package boundary: multiple consumers, a deliberate public API, distinct runtime/build constraints, or a genuinely shared architectural responsibility. Do not create packages merely to organize folders.

Consumers use supported package exports/subpaths rather than reaching into another package's private implementation directories. Keep the package dependency graph acyclic; when a cycle appears, revisit ownership instead of teaching tooling to tolerate it.

## Shared package threshold

`packages/shared` is allowed only when real cross-workspace or cross-runtime reuse exists. Do not create it to anticipate a future consumer.

When that boundary is earned, organize it by actual technical responsibility and create only directories with real content, for example:

```text
packages/shared/
  schemas/
  helpers/
  infra/
```

`shared` may depend on Effect Schema. “Shared” means cross-runtime/cross-workspace ownership, not dependency-free code.

A canonical application schema may move to `packages/shared/schemas` when multiple workspaces genuinely consume the same representation. Until then, cross-layer backend schemas stay in `packages/backend/schemas` and feature-local schemas stay with the feature.

Do not move backend provider, storage, or framework adapters to `shared/infra` merely because they are technical. `shared/infra` requires genuine cross-runtime reuse. Expose shared code through deliberate package exports/subpaths rather than arbitrary private imports.
