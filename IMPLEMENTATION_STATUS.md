# Implementation status

The repository implements the pre-v1 Nx-based Keenko application distribution.

Implemented:

- one public `keenko` package with the Nx preset, generators, sync generator, forward migrations, guidance assets, and provenance, without a public Keenko lifecycle executable;
- initial `apps/web`, `packages/backend`, `packages/ui`, and `packages/shared` topology, with additional tagged Nx workspaces allowed for real ownership or reuse boundaries;
- exact-pinned first-party TanStack creation, shadcn monorepo routing, Effect 4/Confect/Convex baseline, and local code generation without cloud credentials;
- non-remediating `bun run check`, Node 24/Bun 1.4 CI, Nx synchronization for generated guidance, and Nx project-graph/module-boundary enforcement;
- native Nx migration traversal with release-specific Keenko migrations and dependency compatibility updates;
- Nx Release with file-based version plans.

Publication, independent acceptance, and downstream Playground recreation remain separate human-reviewed work.
