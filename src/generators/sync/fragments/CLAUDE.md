## Keenko Playbook

Instruction precedence: current human instruction > project ADR/override > project-local docs > Keenko core > fixed-stack guidance > owned skills > upstream skills > generic defaults.

Before substantial implementation, read `.keenko/docs/core/agent-behavior.md`, root `CONTEXT.md`, `docs/project/architecture.md`, `docs/project/overrides.md`, `docs/project/ui.md` when present, relevant ADRs, then the fixed-stack conventions for the change.

Project-specific architecture belongs under `docs/project/`. Project-specific visual and interaction decisions belong in `docs/project/ui.md` when that file exists. Deliberate deviations from Keenko defaults belong in `docs/project/overrides.md`. Keep `CONTEXT.md` concise: stable domain vocabulary, durable product facts, constraints, and links, not session logs.

Skills are generated into `.claude/skills/`. For version-sensitive library APIs, inspect installed source/types and current first-party guidance before relying on memory.

For substantial TanStack work, run `bun node_modules/@tanstack/intent/dist/cli.mjs list` from the workspace root and load a matching installed package skill when available. This uses the pinned local CLI without network resolution. Otherwise inspect installed TanStack source/types and current first-party documentation. Use Context7 only as optional documentation retrieval after those authorities; it is not architectural authority or a prerequisite.

Run focused verification during implementation, the complete project verification before merge-ready review, and report exactly what ran. Merge and consequential external/destructive actions remain human-authorized.
