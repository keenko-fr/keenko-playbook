# Convex

## Workspace integration and development lifecycle

- Convex integration configuration belongs at the repository root because it coordinates the backend and web Nx projects. Root `convex.json` points to `packages/backend/convex`.
- `packages/backend/convex` is the only Convex source location. Do not create root `convex/` or `apps/web/convex` directories.
- Root `.env.local` is untracked local deployment state shared by the workspace. Let Convex create and maintain deployment-derived values such as `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`; do not create the file manually or copy a URL from the dashboard.
- Run `bun run dev` from the workspace root on both fresh and configured repositories. It lets Convex establish and push the development deployment before starting the Nx application processes that consume `VITE_CONVEX_URL`; no separate setup command is part of the supported workflow.
- Missing `.env.local` is valid repository state. Generation, code generation, canonical validation, typecheck, tests, and builds must not require a configured Convex deployment.
- Validate `VITE_CONVEX_URL` when constructing the real Convex-backed application runtime, not eagerly at module import. There is no fake URL and no supported backend-less application mode.
- Production and preview deployment configuration is separate from local `.env.local`; supply their credentials and frontend deployment URL through the hosting or CI contract.
- WorkOS AuthKit is the fixed authentication provider. Root `convex.json` owns Convex-managed development provisioning, while `packages/backend/convex` owns the official WorkOS component, auth provider configuration, webhook routes, and authenticated function boundaries. See `../workos-authkit/README.md`.

Before Keenko `1.0.0`, recreate an older dogfood repository from the current release candidate to adopt this integration model; do not write a `0.x` project migration. Preserve project-owned application work deliberately while keeping all Convex source under `packages/backend/convex`. After `1.0.0`, a later Keenko release uses a native Nx migration only if supported persisted repository state actually needs transformation.

## Persistence and queries

- Convex query determinism/caching rules still apply when queries are expressed through Confect/Effect.
- Use `_creationTime` unless a distinct business event timestamp exists.
- Keep explicit `updatedAt` only when last-update semantics are genuinely used.
- Application-owned timestamps use finite non-negative integer epoch milliseconds.
- Use generated system-field schemas/types rather than recreating `_id`/`_creationTime` manually.
- Generated Convex code is generator-owned.

## Native boundaries

Use native Convex APIs where components, workflows, HTTP/provider integration, generated/native APIs, reactive pagination, or third-party Convex libraries require or materially benefit from them. Native Convex React APIs may coexist with TanStack Query and Confect when an adapter does not expose or materially improve the required capability. Do not replace a correct native boundary merely to maximize adapter or Confect usage, and do not wrap generated Convex `api` in a Keenko facade.

Infinite-scroll and load-more interfaces use native reactive Convex pagination through `usePaginatedQuery`. URL-owned pagination instead uses TanStack Router plus TanStack Query with a normal Convex query and explicit cursor/pagination arguments. See `../tanstack-query/README.md` for the browser lifecycle split.

## React / TanStack Query

During creation, Keenko composes Convex and TanStack Query into the initial router/root baseline and establishes the shared helpers and schemas used by that fixed stack. Those application files become project-owned after creation rather than remaining Keenko-synchronized surfaces.

The official Convex CLI requires an existing deployment to regenerate `convex/_generated/api`. To keep fresh generation and ordinary checks offline while the starter imports that official surface, the preset seeds the current official generated `api.js`/`api.d.ts` output for its fixed backend modules. This is checked-in Convex generated code, not a Keenko wrapper. After provisioning, `convex dev` remains its generator and must reproduce the checked-in files without drift.

For reactive Convex reads that fit the TanStack Query adapter, prefer `ConvexQueryClient` + TanStack Query with the generated Convex `api`. Browser callers consume encoded/plain-JavaScript representations by default; Effect/server consumers use Confect `refs`. See `../confect/README.md` for that representation boundary.

Reactive Convex queries normally do not need manual TanStack Query invalidation after Convex mutations; Convex pushes fresh results. Invalidate only resources that are genuinely non-reactive/external/ordinary Query-backed data.

Optimistic updates are optional UX improvements, not a default requirement. Use the supported Convex/integration mechanism and clear rollback semantics rather than maintaining duplicate React state.

Use official Convex agent skills as first-party operational guidance; Keenko documents architecture, not a fork of Convex instructions.
