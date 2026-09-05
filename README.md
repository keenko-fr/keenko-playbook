# Keenko

Keenko is one opinionated, versioned TypeScript application distribution built as an Nx plugin. It owns the preset, compatible stack versions, engineering conventions, generated guidance, sync generators, and forward migrations. Nx owns the lifecycle commands.

## Lifecycle

Node 24 is the tooling runtime. Bun `>=1.4.0 <2` owns package installation, workspace script entry, the v2 lockfile, and supported application execution.

Create a project with the canonical exact-pinned Nx command. Bun is the fixed package manager and Nx Cloud is skipped:

```sh
bunx create-nx-workspace@23.2.0 my-project \
  --preset=keenko \
  --packageManager=bun \
  --nxCloud=skip \
  --interactive=false \
  --trustThirdPartyPreset
cd my-project
bun run check
```

A fresh project starts with:

```text
apps/
  web/
packages/
  backend/
  ui/
  shared/
```

Those four workspaces are the initial topology, not a permanent workspace-count invariant. Add another workspace when it represents a real ownership or reuse boundary and give it the Nx tags required by the project boundary policy.

The Nx workspace `name` is the Keenko project identity. Keenko uses it unchanged as the root package name and workspace package scope, for example `my-project`, `@my-project/web`, and `@my-project/backend`. The preset rejects a name that cannot be represented as both the Nx workspace name and the npm package or scope name. It does not normalize names or maintain a second package-scope setting.

The stack is fixed: TypeScript, Nx, React, Effect 4, Convex, Confect, TanStack Start/Router/Query/Form/Table, Paraglide, shadcn with Tailwind CSS 4 and Base UI 1, the Keenko testing conventions, Oxfmt, Oxlint, and Ultracite.

`apps/web` comes from the exact-pinned public `@tanstack/create` API. `packages/ui` follows shadcn's monorepo `components.json`, package-import, and package-export conventions. `packages/backend` owns Effect/Convex/Confect application functions. `packages/shared` remains runtime-neutral and minimal.

## Synchronization and upgrades

Keenko generated guidance is a global Nx sync generator. Apply it with:

```sh
bun x nx sync
```

`bun run check` runs the synchronization check through the package script, where Bun resolves the workspace-local Nx binary. Generated guidance drift therefore fails the merge-ready check without rewriting tracked files.

Upgrade Keenko through normal Nx migrations:

```sh
bun x nx migrate keenko@0.2.0
bun install
bun x nx migrate --run-migrations
bun x nx sync
bun run codegen
bun run check
```

A Keenko release encodes its package and dependency compatibility changes in Nx migration metadata and migration generators. There is no Keenko wrapper that chooses a release or adds clean-tree, downgrade, prerelease, future-major, or same-version policy. Native Nx owns those invocation semantics.

Nx Release owns versions, changelogs, tags, and publication. User-visible changes require a file-based version plan under `.nx/version-plans/`. Publication remains an explicitly dispatched, human-owned operation.

## Guidance

Generated, read-only convention and skill assets live under `.keenko/`; native skill copies live under `.agents/skills/` and `.claude/skills/`. `AGENTS.md` and `CLAUDE.md` contain one managed routing block while project facts remain owned in `CONTEXT.md` and `docs/project/`.

Repository development uses:

```sh
bun install --frozen-lockfile
bun run check
bun run check:release
```

`bun run check` is the non-remediating merge-ready contract. The release check additionally verifies pinned vendor sources and inspects the npm pack list.
