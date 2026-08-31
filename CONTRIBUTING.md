# Contributing

## Change model

All changes go through a branch and PR. Keep a PR coherent and reviewable; prefer one issue/deliverable where practical.

Convention/policy changes require another maintainer's review because they affect downstream projects and agents.

## Where changes belong

- `docs/core/`: always-on cross-stack engineering policy.
- `docs/conventions/`: reusable cross-module conventions such as representations, frontend ownership, validation, and migrations.
- `docs/stacks/`: rules that apply only when that module is enabled.
- `skills/`: procedural Keenko-owned workflows.
- `vendor/`: pinned immutable upstream snapshots/provenance; do not edit vendor content in place.
- `templates/`: project-owned scaffold/managed-block templates.
- `presets/`: explicit module/skill selections.

Do not duplicate the same canonical rule into harness-specific manuals. `AGENTS.md`/`CLAUDE.md` route to shared sources.

## Verification

Run the repository's canonical source checks before PR review:

```bash
bun run check
```

For a release candidate:

```bash
bun run check:release
bun run vendor:check
```

Use the release workflow to prepare a release PR. Publishing is a separate explicit action after that PR is human-reviewed/merged and the machine-readable release gate is satisfied.

When materialization behavior changes, also install/update/check a clean fixture consumer and verify both `.agents/skills` and `.claude/skills` match the canonical `.playbook/skills` snapshot.

Report checks exactly as run; do not claim unavailable/unrun checks passed.

## Documentation and history

Update affected canonical docs in the same PR. Use ADRs for expensive-to-reverse governance/architecture decisions or rationale likely to be lost, not ordinary implementation choices. Supersede historical ADRs instead of rewriting their decision history.
