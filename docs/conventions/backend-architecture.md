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
→ organized cross-layer application representations and provider-namespaced wire representations

features
→ application/use-case orchestration and policy

data
→ focused persistence reads/writes

infra
→ external/substitutable technical capabilities, provider adapters, and reusable technical infrastructure
```

Do not collapse layers merely because current implementations are small. See `backend-file-topology.md` for canonical file section grammar.

## Confect

`confect/` owns backend function contracts and their Confect implementations. Keep endpoint/framework concerns at this boundary and delegate application policy to features or the narrower owning layer.

## Schemas

`schemas/` owns organized representation schemas, not every Effect Schema in the backend.

Shared application representations used across backend layers live directly under the resource owner, for example:

```text
schemas/
  shows.ts
```

Provider wire/API representations are namespaced by provider and resource from the first real provider schema, for example:

```text
schemas/
  tvmaze/
    shows.ts
```

Feature-local, endpoint-local, infra Issue/Failure, and persistence-only schemas remain with their narrower owner. Do not add a generic `schemas/providers/` hierarchy or speculative provider `common.ts`/`shared.ts` files.

See `schema-types.md` for persisted-resource grammar, provider schema ownership, derivation, and representation rules.

## Features

`features/` owns use-case orchestration, business/application invariants, authorization policy, coordination across data/provider operations, state transitions, feature-local failures, feature-local schemas, and cross-layer policy translation.

Features remain flat by default, for example `features/shows.ts`. Do not create a directory per feature merely for organization.

A representation transition can justify the feature boundary. For example, data may return `WatchlistDoc[]` while the feature maps each document through schema-owned `watchlistFrom` and returns `Watchlist[]`.

Do not preserve a feature wrapper merely for symmetry. If a future function becomes a literal pass-through with no policy, invariant, coordination, representation conversion, or interface simplification, remove the wrapper and let the narrower owner serve the caller directly.

## Data

`data/` owns narrow persistence concerns such as indexed reads, inserts, patches, removals, and pagination. It does not own full business workflows.

Use concise contextual names:

- `find` / `findByX`: absence is a legitimate result, normally represented with `Option` internally;
- `get` / `getByX`: the resource is required and absence is a typed failure;
- direct verbs such as `insert`, `patch`, and `remove` for writes.

Creation operations accept the semantic `FooInsert` contract, not `FooFields` or read-side `Foo`, even when their current shapes coincide. Focused persistence-only Patch contracts remain data-owned and derive from shared `Fields`.

## Infra

`infra/` owns provider adapters and reusable technical capabilities. Business policy remains with the owning feature. A rate-limiter adapter may live in infra; rate names, windows, quotas, and consequences belong to the feature.

Provider wire/API schemas do not live in the infra file. They live under `schemas/<provider>/<resource>.ts`. Provider-to-application conversion stays in infra because it crosses representation owners.

A real external or meaningfully substitutable technical capability is an Effect service from its first real consumer, even when it initially exposes only one operation. Examples include provider APIs, email delivery, payment gateways, object storage, and external AI providers.

This service threshold applies to capabilities, not deterministic implementation helpers. Helpers such as `showFrom(...)`, normalization, or provider-key construction remain plain TypeScript.

Once a capability is a service, expose one public capability API. Consumers depend on the service. Do not retain a parallel direct function for the same operation, create a second service merely to wrap it, or add a custom callback seam that duplicates an existing lower-level Effect service.

Provider service implementations may depend on lower-level services. Leave those requirements open until the outer application/runtime composition boundary rather than closing them inside the adapter. For example:

```text
FetchHttpClient.layer
        |
        v
TvMaze.layer
        |
        v
application runtime
```

`TvMaze.layer` requires `HttpClient` and provides `TvMaze`; runtime composition chooses the concrete HTTP implementation.

See the Effect stack guidance for `Context.Service`, `make`, native HTTP, testing seams, retry policy, and Layer mechanics.

## Imports across backend layers

Follow `docs/core/code-style.md` for the canonical import convention.

Only the architectural `data` and `features` layers receive the special namespace-import convention. Infra, schemas, Confect helpers, and ordinary modules use named imports by default. The consuming module's concept determines whether a `data` / `features` namespace needs a concept prefix.

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

A canonical application schema may move to `packages/shared/schemas` when multiple workspaces genuinely consume the same representation. Until then, cross-layer backend application schemas stay in `packages/backend/schemas`, provider wire schemas stay in their provider namespace there, and feature-local schemas stay with the feature.

Do not move backend provider, storage, or framework adapters to `shared/infra` merely because they are technical. `shared/infra` requires genuine cross-runtime reuse. Expose shared code through deliberate package exports/subpaths rather than arbitrary private imports.
