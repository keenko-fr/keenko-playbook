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
→ organized cross-layer representations, canonical backend Entity schemas/types, meaningful schema checks, and provider-namespaced wire representations

features
→ fooFrom(doc), constitutive relation loading, Entity assembly, and application/use-case orchestration and policy

data
→ focused persistence reads/writes, returning decoded FooDoc documents

domain (when needed)
→ pure deterministic business behavior over canonical Entities

infra
→ external/substitutable technical capabilities, provider adapters, and reusable technical infrastructure
```

Do not collapse layers merely because current implementations are small. See `backend-file-topology.md` for canonical file section grammar.

## Retrieval semantics

Name backend retrieval operations by what absence means:

- `find` / `findByX`: absence is a valid result, normally represented with `Option` inside Effect-owned workflows;
- `get` / `getByX`: absence is exceptional and is represented as a typed failure.

Corresponding `findX` / `getX` operations retrieve the same conceptual resource and normally share the same success representation. Do not use a `find` / `get` pair for endpoints that return materially different resources or projections.

Use contextual names. Do not repeat the owning module or domain noun when the module already supplies it. For example, an `identity` group exposes `findCurrent` and `getCurrent` for the same `CurrentIdentity` representation, not `getCurrentIdentity` or policy-oriented names such as `getProtectedIdentity`.

## Confect

`confect/` owns backend function contracts and their Confect implementations. Keep endpoint/framework concerns at this boundary and delegate application policy to features or the narrower owning layer. Confect/API/facade boundaries own caller-facing transport/application projections and schemas appropriate to their runtime. Canonical backend `Foo` may retain Effect-native values and embedded Entities; it need not be identical to the transport result. Use endpoint-semantic projection names rather than a mandatory generic transport naming convention. `Dto` remains foreign-system-owned.

## Schemas

`schemas/` owns organized representation schemas, not every Effect Schema in the backend.

For a persisted resource with a meaningful backend business Entity, `schemas/foo.ts` owns `sFoo`, canonical `Foo`, and meaningful schema validations. It has no hydration functions or data dependencies. `Foo` retains `FooDoc` persistence identity and persisted relation IDs. An identity Entity aliases its complete `FooDoc` without a constructor. A storage-only table does not need a canonical Entity.

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

Features orchestrate persistence reads returning `FooDoc`. `features/foo.ts` owns `fooFrom(doc)`, loads required constitutive relations directly through data/features, and assembles canonical `Foo`. Hydration is additive; persistence remains normalized. Embed only a stable, constitutive relation required by the Entity's own representation or invariants, never every foreign key. The resulting Entity has mandatory hydrated relations rather than optional lazy-loading states. Reverse relations and child collections normally belong to queries/use-case projections.

A feature may compose another resource feature to obtain a canonical hydrated Entity when this follows the directed acyclic graph of mandatory full-Entity embedding dependencies. This composition is permitted, not required. Concrete collection features may batch or deduplicate reads where useful. Do not introduce Repository, EntityRepository, EntityLoader, generic hydration services/layers, DataLoader conventions, or generic cache abstractions.

Canonical mandatory Entity embedding should remain directed and acyclic. If embedding both directions would create a cycle, revisit ownership rather than introducing lazy, partial, or recursive Entity representations. Business/domain relationships in general need not be acyclic.

Constructors trust decoded internal documents and relation Entities without another runtime schema decode merely for assembly. Do not revalidate trivial FK equality when a relation was loaded through its persisted identifier, or create an artificial `Option<Foo>` or failure path for it. Preserve genuine structural and business invariants: loading a CapacityPool by ID does not establish that it belongs to a PickupRule's Establishment. Keep meaningful schema checks and enforce owned invariants in features/domain. See `schema-types.md` for the constructor example and trust-boundary rules.

Do not preserve a feature wrapper merely for symmetry. If a future function becomes a literal pass-through with no policy, invariant, coordination, representation conversion, or interface simplification, remove the wrapper and let the narrower owner serve the caller directly.

## Domain

`domain/` is a legitimate owner for pure deterministic business behavior over canonical Entities when that layer is needed. Features orchestrate effects and supply those Entities; domain behavior enforces its owned semantic/business invariants. Correctly typed internal values do not need repeated schema decoding to enforce those invariants.

Create `domain/` only when real code needs it. It is not mandatory scaffolding and does not change the default generated topology.

## Data

`data/` owns narrow persistence concerns such as indexed reads, inserts, patches, removals, and pagination. It does not own full business workflows.

Persistence reads return complete decoded `FooDoc` documents, including persistence/system identity. Persistence codecs validate those representations. Data does not orchestrate constitutive relation hydration or recursively persist embedded backend Entities.

Apply the general backend retrieval semantics above to persistence reads. Use direct verbs such as `insert`, `patch`, and `remove` for writes.

Creation operations accept the semantic `FooInsert` contract, not `FooFields` or read-side `Foo`, even when their current shapes coincide. Focused persistence-only Patch contracts remain data-owned and derive from shared `Fields`.

Focused helpers that adapt Confect persistence errors and absence semantics belong in `data/confect.ts`. They are backend data-layer concerns, not cross-workspace utilities or endpoint/spec concerns. Convert document codec failures to defects only when they violate an owned persistence invariant. Preserve not-found as a typed failure for `get` / `getByX`; map it to `Option.none` for `find` / `findByX`. Do not generically turn not-found into a defect unless a concrete invariant establishes that absence is impossible.

## Infra

`infra/` owns provider adapters and reusable technical capabilities. Business policy remains with the owning feature. A rate-limiter adapter may live in infra; rate names, windows, quotas, and consequences belong to the feature.

Foreign/provider DTO schemas do not live in the infra file. They live under `schemas/<provider>/<resource>.ts`. The canonical application schema remains provider-independent. A boundary schema such as `sFooFromDto` normally stays in infra because the adapter composes the foreign DTO schema with the application schema across representation owners.

A real external or meaningfully substitutable technical capability is an Effect service from its first real consumer, even when it initially exposes only one operation. Examples include provider APIs, email delivery, payment gateways, object storage, and external AI providers.

This service threshold applies to capabilities, not deterministic implementation details. Provider-key construction and non-boundary computation remain plain TypeScript. A real authored foreign DTO schema may instead compose with an authored application schema as a one-way Effect Schema decoder such as `sFooFromDto`; do not convert workflow or arbitrary internal mappings into Schema transformations.

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

A schema may move to `packages/shared/schemas` when multiple workspaces genuinely consume the exact same representation. A frontend consuming a transport projection does not justify moving backend `Foo` there. Backend-only Entities stay in `packages/backend/schemas`; boundary-specific transport schemas stay at the narrowest Confect/API/facade owner. Provider wire schemas stay in their backend provider namespace, and feature-local schemas stay with the feature. Do not reshape a backend Entity solely to satisfy caller serialization.

Do not move backend provider, storage, or framework adapters to `shared/infra` merely because they are technical. `shared/infra` requires genuine cross-runtime reuse. Expose shared code through deliberate package exports/subpaths rather than arbitrary private imports.
