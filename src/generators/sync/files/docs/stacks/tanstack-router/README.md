# TanStack Router

## State ownership

Router owns navigation state that should survive refresh/share/back-forward/navigation: search, page, sort, filter, and navigation-significant selected state.

Validate route search at the route boundary using the installed Router-supported adapter; Standard Schema conversion belongs at that consumer boundary.

When search state affects loader data identity, declare the dependency through Router's loader dependency mechanism rather than reading it invisibly.

## Loaders and context

TanStack Query remains the server-state owner. A Router loader may preload/ensure query data for navigation performance while the page consumes the Query result rather than maintaining a second loader-owned cache.

Use loaders deliberately for navigation-critical preloading, redirects, route-level dependencies, or data needed before rendering. Do not require a loader for every route.

Use `beforeLoad` for authentication/authorization gates, redirects, route context enrichment, and pre-loader route policy rather than ordinary page fetching.

Router context is dependency injection for genuine route-wide dependencies (for example QueryClient/ConvexQueryClient/session context needed by loaders), not a generic application-state store.

## Navigation semantics

Use Router `Link`, route matches, and Router-derived active state. Preserve actual link semantics and avoid manual pathname parsing when the router already represents the intent.

Use TanStack Intent/current package guidance for exact APIs.
