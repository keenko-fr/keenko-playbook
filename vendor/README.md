# Vendored skills

`vendor/` is generated from immutable source pins in `sources.json`.

- Never edit generated upstream files directly.
- Run `bun run vendor:sync` to materialize the pinned redistributable sources.
- Run `bun run vendor:update` to resolve current upstream revisions and regenerate snapshots for review.
- Sources without a declared compatible redistribution license remain `external` and are not copied into this repository.

The pre-1.0 source archive may be distributed without the generated vendor snapshots. `playbook check --source --release` requires all redistributable snapshots before a release.
