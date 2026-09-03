# Contributing

Work on a dedicated branch and keep one coherent Linear deliverable per PR. Convention changes require another maintainer's review; merge and publication remain human-owned.

## Repository ownership

- `src/generators/`: Nx preset and generated-guidance synchronization.
- `src/migrations/`: focused Nx repository migrations.
- `docs/`: canonical Keenko engineering guidance.
- `skills/`: Keenko-owned workflows.
- `vendor/`: immutable pinned upstream skill sources and provenance.
- `templates/`: project-owned document seeds and managed harness routing.

Do not add stack selection, another package manager, `project.json` ceremony, a custom migration engine, or a parallel release mechanism.

## Verification

During implementation, run focused tests and type checks. Before review, run:

```sh
bun run check
```

Release-affecting changes also run:

```sh
bun run check:release
```

When creation, migrations, or packaging changes, verify a clean project from the packed artifact, its generated lockfile, `bun run check`, and the relevant upgrade baseline. Report only commands actually run.

## Version plans

If a change alters anything a Keenko user or generated project sees or follows, add an Nx version plan:

```sh
bun run release:plan
```

Use a patch for compatible pre-v1 corrections and a minor for meaningful pre-v1 evolution. `1.0.0` is always a deliberate human release decision. Nx Release consumes the plans and owns changelog, tag, and publication behavior.
