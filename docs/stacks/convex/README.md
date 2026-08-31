# Convex

## Persistence and queries

- Convex query determinism/caching rules still apply when queries are expressed through Confect/Effect.
- Use `_creationTime` unless a distinct business event timestamp exists.
- Keep explicit `updatedAt` only when last-update semantics are genuinely used.
- Application-owned timestamps use finite non-negative integer epoch milliseconds.
- Use generated system-field schemas/types rather than recreating `_id`/`_creationTime` manually.
- Generated Convex code is generator-owned.

## Native boundaries

Use native Convex APIs where components, workflows, HTTP/provider integration, generated/native APIs, or third-party Convex libraries require/materially benefit from them. Do not replace native APIs merely to maximize Confect usage.

## React / TanStack Query

When TanStack Query integration is enabled, prefer `ConvexQueryClient` + TanStack Query for reactive Convex reads where it supports the required capability. Native Convex React hooks may coexist when the adapter does not expose a required Convex feature.

Reactive Convex queries normally do not need manual TanStack Query invalidation after Convex mutations; Convex pushes fresh results. Invalidate only resources that are genuinely non-reactive/external/ordinary Query-backed data.

Optimistic updates are optional UX improvements, not a default requirement. Use the supported Convex/integration mechanism and clear rollback semantics rather than maintaining duplicate React state.

Use official Convex agent skills as first-party operational guidance; Keenko documents architecture, not a fork of Convex instructions.
