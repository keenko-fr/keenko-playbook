# KEE-65 optional persistence data modules

[KEE-65](https://linear.app/keenko/issue/KEE-65/allow-optional-persistence-data-modules-in-backend-architecture) is a reusable guidance defect. Searches across active and archived Linear issues found the completed KEE-59, KEE-62 and KEE-63 decisions, but no issue covering this accepted correction.

The authority is [Anoulà PR #14](https://github.com/keenko-fr/anoula/pull/14), implemented commit `f6b4cdabd02d654c4f19b5b1723736e50151679f`, and its [Optional persistence data modules override](https://github.com/keenko-fr/anoula/blob/f6b4cdabd02d654c4f19b5b1723736e50151679f/docs/project/overrides.md#optional-persistence-data-modules). Implementation starts from fetched Keenko `main` at `6682c8d1b6475e7c538c042c2808cd6519ba60a8` in the isolated `kee-65` worktree. The original checkout's editor customization is preserved.

## Guidance changes

Optional data extraction is supported. Mandatory features/data separation is not restored. Direct Confect persistence remains allowed in simple implementations and owning features. Data cannot depend on features. `data/confect.ts` is the canonical persistence-helper owner. Data may enforce checks intrinsic to its retrieval or persistence contract; independent business operations remain in features. Shared guidance contains no Anoulà-specific product policy.

Extract persistence when reuse, responsibility ownership, avoiding cycles, reducing meaningful duplication, readability or reduced architectural complexity gives a concrete benefit. A single consumer can justify the boundary. No line threshold, module per table, generic repository, CRUD factory, canonical Entity loader, complete hydration, forwarding wrapper or compulsory delegation path applies.

Data operations may perform the checks necessary to guarantee their retrieval or persistence contract, including invoking domain predicates and validating relationships between persisted resources.

Extract a feature when an operation has a meaningful independent business responsibility, not merely because a persistence function contains a validation condition.

The complete operation owns its checks and error contract. Data may return a configured or usable resource, load demanded relations, preserve independent owner consistency, call pure domain predicates and translate expected missing relations or invalid configuration into resource-specific Failures. Features own workflows, acting-User authorization, lifecycle actions and coordination beyond that persistence contract. Domain remains pure, infra owns independent technical/provider capabilities, and Confect owns registered contracts and execution boundaries. Reusable retrieval never grants authorization.

The initial strict separation of mechanical persistence from all business checks was rejected because it reintroduced unnecessary layering. This is a refinement of KEE-65, delivered as an additional commit on the existing branch and PR. Anoulà's PickupRule six-function split is evidence for cohesive retrieval in data with a private relation/checking helper; the independent Establishment owner checks must remain enforced. Shared guidance uses resource-neutral examples rather than copying that product policy.

Errors follow the owning operation's public contract. Preserve find/get, expected absence, typed Failure, SchemaError and impossible persisted-state Defect distinctions. Compose data and feature functions inside one root Convex mutation; rollback failures escape that mutation. Do not turn impossible invariant violations into expected retrieval failures.

## Final domain import and naming refinement

Domain functions use named imports and natural, self-explanatory names. Feature and data operations retain namespace imports. Domain function ownership follows business semantics, not mechanically the consuming resource. No additional module or abstraction is required.

The previous namespace-import rule for domain functions is superseded. Exported pure functions must convey their meaning without the original module namespace; constants, tagged unions and types also remain suitable for named imports. Do not mechanically prefix every function with its complete resource name or impose a universal verb list. Private helpers keep locally clear names.

A calculation belongs with the concept that establishes its meaning, even when another concept inherits its facts. Pass only the required facts through a small structural contract. Shared consumption alone does not justify a new module. These naming rules preserve every accepted optional-data responsibility and dependency boundary.

The canonical pure-domain example now exports `canSubmitRequest` with a small structural argument and a locally named private `hasItems` helper. Both the data qualification operation and creation feature named-import that function in the compiled product fixture; feature/data namespace imports remain intact. Generated-doc assertions require the distinct import conventions, natural naming, semantic ownership and no forced prefix/module, and reject the old namespace examples across all published Markdown.

## Canonical sources

Under `src/generators/sync/files/docs/`:

- `conventions/backend-architecture.md` adds optional data ownership, extraction and dependency rules, focused helper ownership, demand-driven enrichment and error semantics. It removes the elimination mandate and consumer-specific adaptation instruction.
- `conventions/backend-file-topology.md` replaces Former data files with optional resource naming and operation-section grammar, adjacent local/schema types and the technical helper exception.
- `core/code-style.md` recognizes resource data namespaces, canonical helper imports, resource operation arguments and local persistence type ownership.
- `stacks/confect/README.md` aligns extraction, direct generated services and root transaction composition.
- `conventions/schema-types.md` permits cohesive enrichment, configuration and independent owner checks in the owning data operation.
- `conventions/validation.md` recognizes data-owned error contracts and retrieval failure translation without a feature wrapper.
- `core/verification.md` recognizes qualified retrieval as a stable data test seam without duplicating workflow coverage.
- `core/tooling.md` and `core/migrations.md` explain compiler coverage and application-owned source preservation.

The generated Confect skill's boundary list also recognizes data. README records the current stable upgrade source alongside retained correction/recovery coverage. The historical KEE-63 report explicitly marks the data prohibition and helper placement as superseded.

## Preset, fixtures and migration

The fresh preset moves the existing helper template unchanged from `features/confect.ts` to `data/confect.ts`. Its backend compiler includes `data/**/*.ts`. It creates no application resource data modules.

`1.0.6-optional-data-coverage` reuses the existing idempotent backend-convention factory, extended to include data and reject conflicting exclusions before any write. It adds no source relocation or lockfile editing. Already inclusive compiler configurations remain unchanged; existing application helpers and imports remain project-owned.

Sync regression tests compare every generated Markdown document/skill to its canonical source, reject obsolete helper/prohibition wording and consumer product nouns, and verify idempotence and absence of source scaffolding. Preset tests verify helper ownership, compiler coverage and no resource module requirement. Migration tests cover 1.0.5 compiler repair, helper preservation, conflicts without writes and reruns. Native Nx planning tests cover RC/stable targets and retained supported origins.

The compiled Confect fixture retains direct impl and feature persistence while two meaningful features reuse one data module. Data loads a configuration relation, checks independent owner consistency, applies the canonical pure domain predicate and returns resource-specific retrieval Failures. Its shared relation helper is private, it imports no feature, and a registered query calls qualified retrieval directly. A separate publishing feature performs a state change rather than forwarding validation. Runtime tests distinguish incomplete/missing configuration, mismatched owners and domain rejection, preserve find/get semantics, and verify root rollback after an independent workflow failure.

Packed-product checks compare canonical, packed and synchronized guidance byte-for-byte, typecheck and lint the fixture, and prove data compiler coverage with an invalid-file probe. Existing snapshot ownership, stale-file removal and other checks remain active; no separate snapshot files are required.

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

Skip the migration execution command if Nx produces no plan. Confirm synchronized guidance expresses the accepted optional-data boundary, then remove only the temporary Optional persistence data modules override. No Anoulà source was changed here.

## Verification

Final domain import/naming refinement checks used supported Node `24.21.0` and Bun `1.4.2`.

| Check | Result |
| --- | --- |
| Full `bun run check` | Passed: formatting, lint, native typecheck, 29 Bun tests, 230 Vitest tests including preset/sync/migration suites, build/pack and release verification |
| Final generated-doc sync suite | Passed: 61 tests, including all generated Markdown/skill comparison, final ownership and domain import/naming rules, contradiction guards and absence of resource scaffolding |
| Full `bun run test:product` | Passed in 374.462 seconds: fresh creation, real published 1.0.4, 1.0.5-rc.0 and 1.0.5 upgrades, partial recovery, compiler probes, canonical checks, frozen reinstalls and migration/sync idempotence |
| Qualified retrieval fixture | Passed consumer lint/typecheck and six runtime tests in the fresh workspace and all four upgrade/recovery workspaces; relations, domain predicates, meaningful data failures, impossible persisted-state defects, duplicate-creation business policy, publishing and root rollback are exercised |
| Generated documentation inspection | The three naming-refined guides were inspected in a real generated consumer and matched canonical bytes; all seven KEE-65 guides remained covered; packed/generated equality also passed across every supported product path |
| Release checks | Existing native prepatch plan retained; version/release dry-run contracts passed; package version, dependencies and lockfile unchanged |
| Final formatting and diff checks | Passed |

The final naming refinement passed repository and packed-product gates on the first run. Earlier ownership work had fixed fixture lint violations and resolved transient temporary-directory/registry errors by rerunning unchanged gates. No checks, lint rules or timeout policies were weakened. The repository retains its existing non-failing Effect unstable-API diagnostics.

The correction is delivered on the existing `kee-65` branch and [PR #62](https://github.com/keenko-fr/keenko-playbook/pull/62) as an additional commit. Linear acceptance criteria and the PR description record the responsibility-based ownership rule, rejection of mandatory validation wrappers and final domain import/naming refinement.

Nothing has been merged or published. Public post-publication acceptance, live shadcn smoke and downstream Anoulà synchronization were not run. The deterministic shadcn fixture passed in the product gate. No Anoulà source was changed and no project-specific policy was added to shared guidance.
