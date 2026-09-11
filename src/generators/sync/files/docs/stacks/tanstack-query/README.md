# TanStack Query

TanStack Query owns server state in the browser. Do not copy Query results into React state/context merely to read them elsewhere; derive from the cache/result, and create Form state only when the user begins editing.

## Convex queries and browser representation

Browser, TanStack, and ordinary JavaScript consumers use Convex's generated `api` references by default. Consume the encoded, plain-JavaScript values returned through the Convex client. Do not route ordinary React reads through Confect `refs` merely to decode `Option`, `Either`, typed Effect values, or other Effect-domain representations in the browser.

For reactive Convex reads supported by the adapter, use `ConvexQueryClient`, TanStack Query, `convexQuery`, and the generated `api`. Native Convex React hooks remain appropriate when the adapter does not expose or materially improve a required capability. This caller rule does not replace backend Confect specs with native Convex implementations. See `../confect/README.md` for the `api` versus `refs` representation boundary and `../convex/README.md` for native capability ownership.

## Pagination

Choose pagination from the product state owner:

- Infinite-scroll and load-more interfaces use Convex's native reactive pagination and `usePaginatedQuery`. It owns live page subscriptions, concatenated results, pagination status, and `loadMore`.
- URL-owned pagination uses TanStack Router for URL state and TanStack Query for server-state lifecycle. Call a normal Convex query through generated `api` with explicit cursor or pagination arguments so the URL fully identifies the requested page.

Do not force URL pagination into `usePaginatedQuery`, and do not rebuild reactive infinite pagination from manual TanStack page queries while the Convex adapter lacks equivalent pagination support.

## Mutations and actions

Use TanStack `useMutation` to own browser pending/error/success lifecycle around generated-`api` Convex mutations and actions rather than duplicating lifecycle state with local `useState`.

- Ordinary reactive Convex mutations use the generated `api` with the native Convex mutation function inside `useMutation`. Do not manually invalidate their reactive Convex queries; Convex pushes updated results.
- Imperative Convex actions are TanStack mutations in the browser by default, including when they call external providers or perform non-reactive work.
- Put an action into TanStack Query as a query only when the product deliberately models that action as a read/cache/refetch resource. That is an explicit resource-semantics choice, not the default for every action.
- Manual invalidation remains appropriate for external APIs, action-backed cached resources, or other non-reactive Query data when those resources actually became stale.

Optimistic updates are deliberate UX choices, not default mutation ceremony. Use the integration's supported optimistic mechanism, with clear rollback semantics.

Type browser calls from the generated Convex `api`, not an unrelated form schema. Preserve backend failure semantics at the encoded client boundary and map them deliberately for UI behavior.

TanStack Start ServerFns do not proxy ordinary Convex CRUD. See `../confect/README.md` for the narrower genuine-server-orchestration boundary.

Use TanStack Intent/current package guidance for exact APIs.
