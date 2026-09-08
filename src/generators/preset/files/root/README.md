# Keenko workspace

A Bun and Nx application workspace created with Keenko.

- `apps/web`: TanStack Start web application.
- `packages/backend`: Convex backend with Confect.
- `packages/ui`: shared UI components and styles.
- `packages/shared`: shared application contracts when needed.

From the workspace root, install dependencies with `bun install` and run `bun run dev` to start web and backend development.

Run `bun run codegen` to regenerate Paraglide, the TanStack Router route tree, and Confect contracts. Fresh creation materializes their required initial state. Run `bun run check` before review: it regenerates in place, fails when tracked generator-owned artifacts drift, and leaves those changes available to review and commit.

Keenko-managed guidance and skills use the Nx sync lifecycle. Run `bun x nx sync` to refresh them, or `bun x nx sync:check` to check for drift without applying changes.

Keep durable project context in [CONTEXT.md](CONTEXT.md). Project-owned architecture, UI decisions, and overrides live in [docs/project](docs/project/), starting with [architecture.md](docs/project/architecture.md).

This README belongs to the project after creation. Edit it as needed; Keenko sync does not overwrite or recreate it.
