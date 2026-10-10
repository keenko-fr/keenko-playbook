# KEE-65 optional persistence data modules

[KEE-65](https://linear.app/keenko/issue/KEE-65/allow-optional-persistence-data-modules-in-backend-architecture) is a reusable guidance defect. Searches across active and archived Linear issues found the completed KEE-59, KEE-62 and KEE-63 decisions, but no issue covering this accepted correction.

The authority is [Anoulà PR #14](https://github.com/keenko-fr/anoula/pull/14), implemented commit `f6b4cdabd02d654c4f19b5b1723736e50151679f`, and its [Optional persistence data modules override](https://github.com/keenko-fr/anoula/blob/f6b4cdabd02d654c4f19b5b1723736e50151679f/docs/project/overrides.md#optional-persistence-data-modules). Implementation starts from fetched Keenko `main` at `6682c8d1b6475e7c538c042c2808cd6519ba60a8` in the isolated `kee-65` worktree. The original checkout's editor customization is preserved.

## Guidance changes

Optional data extraction is supported. Mandatory features/data separation is not restored. Direct Confect persistence remains allowed in simple implementations and owning features. Data cannot depend on features. `data/confect.ts` is the canonical persistence-helper owner. Business rules remain outside data. Shared guidance contains no Anoulà-specific product policy.

Extract persistence when reuse, responsibility ownership, avoiding cycles, reducing meaningful duplication or readability gives a concrete benefit. A single consumer can justify the boundary. No line threshold, module per table, generic repository, CRUD factory, canonical Entity loader, complete hydration, forwarding wrapper or compulsory delegation path applies.

Data owns persistence retrieval, indexed lookup, writes, meaningful defaults, mechanical relation enrichment and persistence-specific absence/result adaptation. Features remain the default owner of meaningful operations, authorization, eligibility, validation, transitions, cross-resource business invariants and coordination. Domain remains pure, infra owns technical/provider capabilities, and Confect owns registered contracts and execution boundaries.

Mechanical enrichment loads only demanded relations. Relationship identity does not prove independent ownership. Preserve independent owner checks and the existing find/get, expected absence, typed Failure, SchemaError and Defect distinctions. An owning feature may translate persistence failure into its operation-specific business failure. Compose data and feature functions inside one root Convex mutation; rollback failures escape that mutation.

## Canonical sources

Under `src/generators/sync/files/docs/`:

- `conventions/backend-architecture.md` adds optional data ownership, extraction and dependency rules, focused helper ownership, demand-driven enrichment and error semantics. It removes the elimination mandate and consumer-specific adaptation instruction.
- `conventions/backend-file-topology.md` replaces Former data files with optional resource naming and operation-section grammar, adjacent local/schema types and the technical helper exception.
- `core/code-style.md` recognizes resource data namespaces, canonical helper imports, resource operation arguments and local persistence type ownership.
- `stacks/confect/README.md` aligns extraction, direct generated services and root transaction composition.
- `conventions/schema-types.md` clarifies mechanical enrichment versus business checks.
- `core/tooling.md` and `core/migrations.md` explain compiler coverage and application-owned source preservation.

The generated Confect skill's boundary list also recognizes data. README records the current stable upgrade source alongside retained correction/recovery coverage. The historical KEE-63 report explicitly marks the data prohibition and helper placement as superseded.

## Preset, fixtures and migration

The fresh preset moves the existing helper template unchanged from `features/confect.ts` to `data/confect.ts`. Its backend compiler includes `data/**/*.ts`. It creates no application resource data modules.

`1.0.6-optional-data-coverage` reuses the existing idempotent backend-convention factory, extended to include data and reject conflicting exclusions before any write. It adds no source relocation or lockfile editing. Already inclusive compiler configurations remain unchanged; existing application helpers and imports remain project-owned.

Sync regression tests compare every generated Markdown document/skill to its canonical source, reject obsolete helper/prohibition wording and consumer product nouns, and verify idempotence and absence of source scaffolding. Preset tests verify helper ownership, compiler coverage and no resource module requirement. Migration tests cover 1.0.5 compiler repair, helper preservation, conflicts without writes and reruns. Native Nx planning tests cover RC/stable targets and retained supported origins.

The compiled Confect fixture retains direct impl and feature persistence while two features reuse one data module. The data module imports no feature, retains normal find absence and typed get failure, and leaves business failure translation/checks in features. Real root-mutation tests verify rollback after a downstream feature failure. Packed-product checks compare canonical, packed and synchronized guidance byte-for-byte, typecheck and lint the fixture, and prove data compiler coverage with an invalid-file probe. Existing snapshot ownership, stale-file removal and other checks remain active; no separate snapshot files are required.

## Release and downstream action

This is a shipped guidance/preset defect correction. Repository RC policy requires a native `prepatch` plan when starting from stable. The Nx-created plan resolves `1.0.5` to `1.0.6-rc.0` in a native version dry run. Package version, dependencies and bun.lock remain unchanged. Nx Release retains authority over eventual versioning, changelog, tag and publication; this implementation does not publish or merge.

After the accepted release is published, Anoulà must run its supported upgrade lifecycle with the exact published target:

```sh
bun x nx migrate keenko@<published-version>
bun install
# Review and run applicable migrations if Nx creates migrations.json.
bun x nx migrate --run-migrations
bun install
bun x nx sync
bun run codegen
bun run check
```

Skip the migration execution command if Nx produces no plan. Confirm synchronized guidance expresses the accepted optional-data boundary, then remove only the temporary Optional persistence data modules override. Anoulà's existing data helpers and resource modules already use the accepted owner. No Anoulà source was changed here.

## Verification

Checks used supported Node `24.21.0` and Bun `1.4.2`.

| Check | Result |
| --- | --- |
| Frozen repository install | Passed; dependencies and bun.lock unchanged |
| Full `bun run check` | Passed: formatting, lint, native typecheck, 29 Bun tests, 230 Vitest tests, build/pack and release verification |
| Focused generated-doc sync suite | Passed: 61 tests, including whole generated Markdown/skill comparison and contradiction checks |
| Native Nx migration planning suite | Passed: 11 tests, including current stable to RC/stable targets |
| Uncached `keenko:pack:check` | Passed; relocated helper asset is packaged, old asset absent |
| Full `bun run test:product` | Passed in 534.312 seconds: fresh creation, real published 1.0.4, 1.0.5-rc.0 and 1.0.5 upgrades, partial recovery, compiled/runtime fixtures, compiler probes, canonical checks, frozen reinstalls and migration/sync idempotence |
| Native version-plan check | Passed with the prepatch plan |
| Native version and full release dry runs | Passed; both resolve 1.0.6-rc.0, with no version/publication writes |
| Final formatting and diff checks | Passed |

The repository retains non-failing Effect unstable-API diagnostics. Product bootstrap encountered transient npm uplink timeouts before completing every phase successfully. These did not require weakening checks or changing the harness timeout policy.

Public publication, public post-publication acceptance, live shadcn smoke and downstream Anoulà synchronization were not run. The deterministic shadcn fixture remains part of the successful product gate. A dependency refresh belongs to the release qualification cycle; no unrelated package tuple changes were made here.
