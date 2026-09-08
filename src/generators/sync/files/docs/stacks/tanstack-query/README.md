# TanStack Query

TanStack Query owns server state in the browser. Do not copy Query results into React state/context merely to read them elsewhere; derive from the cache/result, and create Form state only when the user begins editing.

## Convex

When using Convex's TanStack integration, prefer it for reactive Convex reads where installed capabilities fit. Native Convex hooks may coexist for unsupported integration-specific features.

Do not manually invalidate reactive Convex queries after ordinary Convex mutations; Convex pushes updated results. Use invalidation for non-reactive actions, external APIs, or other Query-backed resources where it is actually needed.

## Mutations

Use TanStack `useMutation` to own browser pending/error/success lifecycle around the appropriate Confect/native mutation function rather than duplicating lifecycle state with local `useState`.

Optimistic updates are deliberate UX choices, not default mutation ceremony. Use the integration's supported optimistic mechanism, with clear rollback semantics.

Type calls from the actual backend/ref contract, not an unrelated form schema. Preserve backend typed-failure semantics at the boundary and map them deliberately for UI behavior.

Use TanStack Intent/current package guidance for exact APIs.
