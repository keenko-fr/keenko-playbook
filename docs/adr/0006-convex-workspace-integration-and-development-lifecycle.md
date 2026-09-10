# ADR 0006: Convex workspace integration and development lifecycle

## Status

Accepted.

## Context

Convex serves the backend package and the web application in one Nx workspace. Its project configuration and local deployment state therefore coordinate multiple projects rather than belonging to either project alone. Starting those projects independently also creates a first-run race: the web application can try to consume a deployment URL before Convex has configured the development deployment and written that URL.

A configured development deployment is machine-local operational state, not part of the reproducible repository baseline. Repository generation, code generation, validation, and build/check workflows must remain usable before a developer selects or creates a Convex deployment.

## Decision

- Keep workspace-level Convex integration configuration at the repository root. Root `convex.json` points Convex at `packages/backend/convex`.
- Keep all authored and generated Convex source under `packages/backend/convex`. Do not create root `convex/` or `apps/web/convex` directories.
- Use the untracked root `.env.local` for local deployment-derived workspace state. Convex owns creating and maintaining values such as `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`; developers do not create that file manually or copy a deployment URL from the dashboard.
- Make root `bun run dev` the fresh-repository development entrypoint. It starts Convex from the workspace root and uses the Convex CLI's lifecycle orchestration so Convex configures and pushes the development deployment before starting the Nx application development processes that consume `VITE_CONVEX_URL`.
- Require and validate `VITE_CONVEX_URL` when constructing the actual Convex-backed application runtime. Do not decode it eagerly at module import or make it an unconditional repository, code-generation, validation, typecheck, test, or build invariant.
- Keep production deployment configuration outside local `.env.local` state. Production and preview automation supplies its deployment credentials and frontend URL through the deployment platform or CI contract.

Keenko does not add a URL-copying or synchronization script, invent a fake/default URL, support a backend-less application mode, or require a separate manual Convex setup command before `bun run dev`.

## Consequences

Fresh generated repositories can install, generate, check, and build without `.env.local`. Their first `bun run dev` may interactively authenticate and select or create a Convex project; after Convex establishes root deployment state, the web and remaining development processes start normally.

Existing generated repositories may need to move Convex integration configuration to the workspace root, remove duplicate web environment files or URL-copy scripts, and adopt the root development orchestration. A migration must not guess how to merge or delete untracked package-local environment files: if they exist, preserve any non-Convex values according to their owning integration, move the legacy files aside, complete the tracked migration, and run `bun run dev` so Convex reestablishes its deployment-derived values at the root. This migration must preserve `packages/backend/convex` as the sole Convex source owner.
