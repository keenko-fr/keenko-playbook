# Keenko Playbook

Shared engineering conventions and portable agent workflows for Keenko projects using Codex and Claude.

The playbook separates:

- declarative engineering rules in `docs/`;
- procedural workflows in `skills/`;
- immutable/pinned upstream skill sources in `vendor/`;
- project presets in `presets/`;
- a Bun/TypeScript CLI that materializes a versioned `.playbook/` into consuming repositories.

## Core model

One canonical source feeds both harnesses. Consumer repositories receive generated native skill copies under `.agents/skills/` and `.claude/skills/`; project-owned `AGENTS.md` and `CLAUDE.md` keep only a managed Keenko routing block.

Instruction precedence is:

1. explicit current human instruction;
2. project ADR or explicit override;
3. project-local conventions/architecture;
4. Keenko core;
5. enabled stack modules;
6. Keenko-owned skills;
7. vendored/first-party upstream skills;
8. generic defaults.

## Consumer scaffold

`playbook install` creates/maintains:

```text
CONTEXT.md
AGENTS.md                  # project-owned; Keenko block managed
CLAUDE.md                  # project-owned; Keenko block managed
docs/project/
  architecture.md
  overrides.md
.playbook/
  config.json              # requested preset/modules
  lock.json                # exact materialized checksums
  docs/                    # generated, read-only
  skills/                  # canonical generated snapshot
.agents/skills/            # generated native Codex copies
.claude/skills/            # generated native Claude copies
```

`CONTEXT.md` is concise project/domain vocabulary and durable facts—not session logs or a second convention manual.

## CLI

Run through Bun without requiring a global install:

```bash
bun cli/playbook.ts install --target ../consumer --preset effect-convex-web
bun cli/playbook.ts update --target ../consumer
bun cli/playbook.ts update --target ../consumer --apply
bun cli/playbook.ts check --target ../consumer
```

`update` previews by default. `--apply` materializes the current source version. `check` verifies snapshot integrity, native skill copies, managed blocks, and required project scaffold.

## Conventions

Start with:

- `docs/core/agent-behavior.md`
- `docs/core/code-style.md`
- `docs/core/verification.md`
- `docs/core/security.md`
- `docs/conventions/schema-types.md`
- `docs/conventions/backend-architecture.md`
- `docs/conventions/frontend.md`
- `docs/conventions/frontend-file-topology.md`
- `docs/conventions/i18n.md`
- `docs/conventions/migrations.md`
- enabled stack modules under `docs/stacks/`

The initial preset is `effect-convex-web`: TypeScript, React, Effect 4, Convex, Confect, TanStack Start/Router/Query/Form/Table, Paraglide, UI, and testing.

## Upstream skills

Keenko owns its integration/convention layer and prefers first-party library guidance for version-specific APIs. Vendored sources are pinned and carry provenance/license metadata. Substantial intentional forks become Keenko-owned skills instead of silently modifying vendor snapshots.

The official Convex skill repository remains an external provenance source until it exposes a compatible redistribution license. Consumers receive a Keenko-owned `convex` specialist adapter that routes to installed-version source/types and current first-party Convex documentation; the external suite is optional and never treated as silently installed.

## Releases

SemVer applies to playbook behavior/configuration:

- patch: clarifications/fixes;
- minor: compatible rules/modules/skills;
- major: breaking config/materialization/behavior changes.

Git tags and GitHub Releases are canonical. Release preparation happens through a reviewed release PR; publication is a separate explicit action gated by `release/v1-gate.json`. A v1 release requires clean source/release checks, fixture install/update/check, both harnesses discovering generated skills, preset resolution, fresh-context review, and real Codex + Claude dogfood in Anoula.
