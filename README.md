# Keenko

Keenko is one opinionated, versioned TypeScript application distribution. It owns a fixed Nx package-based workspace, compatible stack versions, engineering conventions, AI guidance, and forward migrations.

## Lifecycle

Node 24 is the tooling runtime. Bun `>=1.4.0 <2` owns package installation, workspace script entry, the v2 lockfile, and supported application execution.

```sh
bunx keenko create my-project
cd my-project
bun run check
bunx keenko upgrade 0.2.0
```

`keenko create` refuses a non-empty destination, creates no commit, and generates exactly:

```text
apps/
  web/
packages/
  backend/
  ui/
  shared/
```

The stack is fixed: TypeScript, Nx, React, Effect 4, Convex, Confect, TanStack Start/Router/Query/Form/Table, Paraglide, shadcn with Tailwind CSS 4 and Base UI 1, the Keenko testing conventions, Oxfmt, Oxlint, and Ultracite.

`apps/web` comes from the exact-pinned public `@tanstack/create` API. `packages/ui` follows shadcn's monorepo `components.json`, package-import, and package-export conventions. `packages/backend` owns Effect/Convex/Confect application functions. `packages/shared` remains runtime-neutral and minimal.

## Upgrade and release ownership

`keenko upgrade` delegates package updates and ordered repository migrations to Nx, requires a clean Git tree before mutation, regenerates `bun.lock`, and refreshes generated guidance. It never commits, pushes, deploys, provisions services, or mutates remote data. Use `--dry-run` for a non-mutating version preview.

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
