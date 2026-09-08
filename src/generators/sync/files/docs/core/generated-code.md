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

Fresh Keenko creation runs the aggregate `bun run codegen` command after dependencies are installed, so source-required generated state exists before development begins. Normal development uses the first-party generators and watch behavior owned by each project; `bun run codegen` remains the explicit way to regenerate every participating project.

`bun run check` runs real codegen in the working tree after `bun x nx sync:check`, then asks Git whether tracked generator-owned surfaces are modified, deleted, or contain new unignored files. A drift failure leaves regenerated files in place for review and commit. The comparison covers the tracked-intent TanStack Router route tree and Confect/Convex generated surfaces while excluding authored Convex configuration. On an unborn branch, there is no committed baseline to compare, so a fresh untouched workspace can run the complete check before its first commit.

Git-ignored reproducible output, including Paraglide compiler output, is regenerated for the checks that consume it but is not Git drift. Unrelated dirty project-owned files are outside the generated pathspec and do not cause a generated-drift failure.

To resolve drift, review the regenerated files left by `bun run check`, commit the correct generator-owned changes with their inputs, and rerun `bun run check`. Fix generator errors at their owning project before retrying. Keep the same Bun/Node runtimes and generator environment used for normal codegen; install dependencies with `bun install --frozen-lockfile` first.
