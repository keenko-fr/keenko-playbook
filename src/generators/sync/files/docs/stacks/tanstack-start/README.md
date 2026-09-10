# TanStack Start

## Creation ownership

TanStack Create owns framework creation and its framework contracts. Keenko uses that supported creation API, then composes the fixed stack into the initial application baseline: it intentionally discards TanStack's generated `src/components/**` and `src/integrations/**` topology and installs the initial router, root route, and environment handling.

After creation, generated application source is project-owned. Keenko synchronization does not continuously manage it. After the first supported compatibility baseline, a future project migration may touch project source only for a real semantic transition under the normal preservation and conflict rules.

Server functions are real server trust boundaries. Validate/normalize input there even when the browser already validated it.

Keep values crossing SSR/server-function serialization transport-safe and explicit; do not leak Effect runtime values or `Date` hydration for internal symmetry.

A server function that meaningfully orchestrates validation, auth, and multiple fallible backend calls may use Effect internally. Convert foreign Promise/throwing APIs at their boundary and run the Effect once at the server-function/framework boundary.

For Confect calls, type the server-side transport from the actual ref (`Ref.Args<...>`) and use the codec-aware runner/client path. Do not import backend spec source or derive the transport type from a frontend form schema.

Keep the conceptual boundaries distinct:

```text
Form schema → browser/editing
serverFn validator → web-server input
Confect Args → backend application function contract
```

## Property ordering in the web app

TanStack Router route-option property order can affect TypeScript inference. Framework-required ordering outranks generic alphabetical `sort-keys` inside route-definition option objects.

For the current TanStack Router rule, inference-sensitive ordering applies to objects passed to `createRoute`, `createFileRoute`, `createRootRoute`, and `createRootRouteWithContext`. Re-check the installed/current TanStack Router lint package before changing this list because the supported APIs and order belong to TanStack, not to Keenko.

Prefer TanStack's published `@tanstack/router/create-route-property-order` rule through Oxlint's JS-plugin support when the pinned Oxlint and TanStack plugin pairing has executable evidence in the consuming repository. Do not add ESLint solely to run this rule.

The Playbook does not currently pin or install a TanStack Router lint package, so its own CI cannot prove that pairing. Until the Oxlint plugin integration is verified under the pinned versions, Keenko disables generic `eslint/sort-keys` across `apps/web/**/*.{ts,tsx}`.

This exemption is intentionally web-wide rather than limited to route-definition files. TanStack Start and its surrounding generated/tooling configuration can contain property-order-sensitive objects outside route files, and Keenko does not require those files to be rewritten merely to satisfy generic alphabetical ordering.

Where TanStack defines semantic property order, follow TanStack's required order. Do not manually alphabetize those objects. Treat automatic TanStack-specific route-order enforcement as unavailable until the Oxlint plugin integration is verified.

Use TanStack Intent/current package guidance for exact APIs.
