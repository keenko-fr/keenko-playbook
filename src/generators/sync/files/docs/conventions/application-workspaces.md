# Application workspaces

## Outcome

`apps/*` is the physical application-workspace boundary. Each application is a real product ownership and deployment boundary, participates in the Nx project graph, code generation, verification, and development orchestration, and carries the semantic Nx tag `type:app`.

Fresh Keenko projects still contain only `apps/web`, `packages/backend`, `packages/ui`, and `packages/shared`. Add another application only when the product has a genuine application boundary; Keenko does not maintain an application registry or a separate metadata source.

## Create and integrate an application

1. From the repository root, use the current first-party TanStack creation tooling pinned by the repository to create the application under `apps/<name>`. Do not copy the generated demonstration routes, example UI, navigation, or product behavior from `apps/web`.
2. Give the workspace a unique package name and project-owned development configuration, including any required port, routes, environment values, and deployment settings.
3. Add `type:app` to `package.json#nx.tags`. A `scope:*` tag is optional and exists only when the project needs a stricter application-specific boundary.
4. Declare only the workspace dependencies the application uses. By default, an application may depend on the backend, UI, and shared packages; sibling applications must not depend on one another.
5. Keep its TanStack route-tree generation in the application `codegen` target and mark its long-running `dev` target with `nx.targets.dev.continuous: true`.
6. Add the application to project-owned environment, deployment, and authentication configuration as required. Follow the [WorkOS AuthKit guidance](../stacks/workos-authkit/README.md) when applications share the generated authentication foundation.

Shared packages are earned by genuine reuse. Do not introduce a shared application shell or move application-specific routes, navigation, or UX into a package merely to make two applications look alike.

## Verification

Run `bun run codegen` and `bun run check` from the repository root. The Nx graph must discover every application without evaluating its Vite config through the Vitest plugin, generated route trees under every `apps/*` workspace must remain clean after codegen, and module boundaries must reject application-to-application dependencies across the complete Nx project graph, including dependencies declared only in workspace manifests.

If an application cannot be discovered or verified, compare its package-owned Nx metadata and targets with this contract. Correct project-owned application configuration; do not add a second registry or hard-code its name into root Keenko tooling.
