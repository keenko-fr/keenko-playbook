# Implementation status

This tree is the regenerated pre-1.0 Keenko Playbook after the explicit convention audit.

## Implemented

- core governance, security, verification, dependency, documentation, and code-style rules;
- audited schema/representation conventions (`Fields`, `Doc`, `Foo`, `Insert`, `ApiDto`, Effect `Type`/`Encoded`, Option/null, timestamps, patches);
- audited backend layering and Confect/native Convex boundaries;
- audited React/UI ownership, `DISPLAY`/`STYLES`, accessibility, derived state/effect rules;
- audited TanStack Router/Query/Form/Table/Start state/boundary conventions;
- audited Paraglide/Sherlock message conventions;
- audited testing, migrations, generated-code, and human-reproducible operations;
- owned Confect specialist skill;
- `effect-convex-web` preset and module dependency graph;
- TypeScript/Bun installer, updater, integrity checker, vendor synchronizer, and release preparation;
- project `CONTEXT.md` scaffold plus managed `AGENTS.md` / `CLAUDE.md` blocks;
- generated `.agents` / `.claude` skill copies with overwrite protection;
- upstream pins/update workflow, CI/release scaffolding, changesets, ADRs, and v1 release gate.

## Intentionally incomplete before v1

- Redistributable upstream snapshots are not embedded in this chat-generated archive; `vendor:sync` is required before real install/release testing.
- Official Convex skills remain external because the reviewed upstream repository did not declare a compatible repository license.
- Shared GitHub/Linear publication is intentionally not performed by this local regeneration step.
- The v1 dogfood gate still requires real Codex and Claude runs in a consumer project.
