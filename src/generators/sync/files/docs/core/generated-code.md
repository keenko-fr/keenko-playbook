# Generated code

Generated files are never edited manually. Change the source, configuration, schema, template, or generator and regenerate.

Tracking policy is generator-specific:

- source-required generated contracts may be committed when the ecosystem expects them;
- reproducible build artifacts should normally be ignored and regenerated.

Each generator's module/project docs must state which model applies.

Generated, manager-owned, and vendored output is excluded from direct formatter/linter ownership by default. Formatting/linting must not rewrite another tool's bytes merely to satisfy authored-source policy; validate generated output through its generator/materializer/drift contract. A generator may explicitly opt generated source into direct formatting/linting only when that is part of its canonical contract.

Repositories expose a canonical aggregate codegen command rather than relying on developers to remember every generator invocation. When generated contracts change, verify deterministic regeneration (for example, run generation twice and require a clean second pass).

CI should detect drift for tracked generated artifacts. Never claim generation/checks passed unless they actually ran.

## Checking application-generated source

From an installed generated workspace, run `bun run codegen:check`. It copies the current workspace and installed dependencies into an Effect-scoped temporary directory, runs the canonical `bun run codegen` there with Nx caching disabled, and compares file contents, modes, and link targets. It includes uncommitted and Git-ignored source. No Git commit or clean working tree is required.

The check covers every project participating in root codegen, including web Paraglide/Router and backend Confect. A zero exit means regeneration produced the same state. A stale-state failure lists changed paths. A generator failure reports its exit code. Both failures leave the original workspace unchanged; Effect scope removes the temporary copy on completion or interruption.

To resolve drift, run `bun run codegen` in the real workspace, review the diff, and rerun `bun run codegen:check`. `bun run check` invokes the freshness check after `bun x nx sync:check`. Fix generator errors at their owning project before retrying. Keep the same Bun/Node runtimes and generator environment used for normal codegen; install dependencies with `bun install --frozen-lockfile` first.

Git metadata, Nx and tool caches (`.nx`, `.cache`, `.tanstack`), `.DS_Store`, and TypeScript build info are excluded. Installed `node_modules` are copied for execution but excluded from comparison. Ordinary generated files and directories are isolated, regenerated, and compared by sanitized state. Copying installed dependencies requires temporary disk space comparable to the workspace installation.

Generators must write workspace-relative output. This is filesystem isolation for ordinary codegen, not a sandbox for arbitrary commands or remote side effects. Local environment files stay in the disposable copy; do not commit secrets. Project owners maintain generator scripts and inputs; Keenko owns this generic checker. When adding a generator, expose its project `codegen` script and verify that a deliberate output change fails `codegen:check` without altering the original file.
