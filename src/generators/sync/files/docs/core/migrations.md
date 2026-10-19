# Keenko migrations

Native Nx migrations own supported upgrades of persisted Keenko consumer state. This contract follows KEE-14's native lifecycle and ownership boundary.

## Support window

Default direct forward support is immediately preceding stable → current stable. New projects start from the current release. Prereleases are not permanent supported origins. Older stable releases are outside the default direct-support window, and Keenko makes no default guarantee that an out-of-window project can recover through sequential historical releases. A release may explicitly widen its supported source window for a concrete requirement.

Migrations exist only when persisted project state requires transformation. Retain migration entries, implementations and assets only while a supported path or current behavior needs them. Published packages and Git tags preserve historical releases; the current package does not retain executable migrations solely for archaeology.

The `1.0.7` transition changes the managed dependency tuple. Its `1.0.7-managed-dependencies` migration converges exact versions, sections and presence in the root, backend, UI, shared and all `apps/*` packages classified with the Nx `type:app` tag. It preserves foreign dependencies and application configuration. The corrective `1.0.7-rc.1` qualification also covers `1.0.7-rc.0` temporarily, without making prereleases permanent supported origins.

## Native lifecycle

Inspect and resolve any existing plan before generating another one. Nx can replace a plan without proving that its entries ran.

```sh
bun x nx migrate keenko@<target>
bun install
if [ -f migrations.json ]; then
  bun x nx migrate --run-migrations
fi
bun install
bun x nx sync
bun run codegen
bun run check
```

For `1.0.6` or `1.0.7-rc.0` → `1.0.7-rc.1`, inspect the new plan and require `keenko` / `1.0.7-managed-dependencies`. After the second install, verify the managed slots and installed versions match the target tuple, including each classified application. Run applicable native migrations when Nx produces a migration plan. If none apply, Nx may create no `migrations.json`; continue with the second install and sync. Do not create a no-op migration or synthetic plan.

After every planned entry and final verification succeeds, archive the completed plan outside the default `migrations.json` path with the source/target versions and verification evidence. A retained plan is not a completion receipt and can refer to factories removed by a later release.

The second `bun install` is unconditional. Migrations can change dependency manifests after the first install. Bun alone reconciles installed packages and regenerates `bun.lock`; migrations never text-edit or merge the lockfile.

## Recognition and ownership

Keenko-managed dependency slots remain Keenko-owned after generation. When a release requires a migration, it must converge managed slots to the target compatibility tuple even when the consumer changes the version, moves the slot between dependency sections or deletes it. An upgrade with no persisted-state transformation does not require a repair-only migration. This rule does not authorize arbitrary source or configuration reconciliation.

- Recognized source baseline: migrate deterministically.
- Recognized target baseline: no-op.
- Managed dependency slots present in the target compatibility baseline: converge presence, dependency section, and exact version, including consumer-modified, moved, or deleted slots. Consumer changes do not transfer slot ownership.
- Other semantic fields with conflicting project-owned customization: fail before mutation with an actionable conflict and require manual reconciliation.
- Unrelated project-owned state: preserve unchanged.

Keenko migrations do not prove semantic equivalence of arbitrary project-owned customization. Behaviorally compatible custom configuration or source state can still require manual reconciliation. Preserve project-owned dependencies and customizations. The managed dependency-slot rule does not extend automatically to source or configuration, and does not decide removal of packages absent from a future compatibility tuple.

Match the smallest Keenko-owned semantic field needed for the migration. Do not require unrelated surrounding project-owned state to match the generated baseline. Identify ownership from supported baseline structure, not from incidental effects on the same tool or file class.

## Implementation and verification

Do not build general semantic analyzers, control-flow/dataflow solvers, glob-algebra engines, or equivalent inference machinery solely to recognize arbitrary customized project state. AST parsing, glob matching, and other structured tools are appropriate for narrow deterministic matching of known Keenko-owned source or target state. Formatter-only differences may be normalized without interpreting custom behavior.

Conflicts must be detected before applying partial migration writes to the caller tree. Validate every required owned field and stage the complete migration before applying it. A conflict must leave caller state unchanged.

Verify recognized source upgrades, recognized target no-ops, preservation of unrelated state, actionable conflicts without mutation, and idempotent reruns through the native Nx lifecycle.

## Residual-plan recovery

A plan describes work; the installed package version does not prove that work ran. Classify it before changing packages or generating a new plan:

| Situation | Safe action |
| --- | --- |
| An entry is not satisfied, or its state is unknown | Preserve the plan. Restore the exact published package containing its factory in a controlled checkout and run that entry through Nx. Resolve conflicts before proceeding. |
| Every entry is satisfied, but no execution receipt exists | Verify each postcondition and preserve the review evidence. Archive the reviewed plan; do not describe this as an executed migration. |
| Execution completed and verification passed, but the plan remains | Archive the completed plan with its evidence before the next upgrade. |
| A new plan targets the next release | Inspect package, names, versions and factories; install its target packages, execute all applicable entries, reinstall and verify. |

### Known 1.0.6 plan after rc.0

Published `1.0.7-rc.0` has no `nx-migrations` collection. Running the residual `1.0.6-optional-data-coverage` entry against it fails in Nx `readMigrationCollection` with `ERR_INVALID_ARG_TYPE`. The plan's factory belongs to published `1.0.6`. Neither an empty plan nor catching that error completes its work.

Use a clean branch or disposable checkout. Preserve the original plan, manifests and Bun lockfile in version control. Inspect **every** entry, including any from other packages. The following recovery applies only when the sole entry is the known Keenko optional-data migration; other entries require their own owner and postconditions.

1. Verify `packages/backend/tsconfig.json` covers `data/**/*.ts`, `domain/**/*.ts` and `errors/**/*.ts`, with valid compiler options and module resolution. Use real compiler probes in those directories, then remove the probes. Verify the current backend/shared Oxlint policy still checks authored code and excludes generated code. Verify the managed `1.0.6` dependency slots and consumer customizations separately. Merely finding three strings is insufficient evidence for arbitrary customized configuration.
2. If any migration postcondition is missing or uncertain, keep the plan pending. Restore `keenko@1.0.6` using Bun and the consumer's verified source lockfile, then execute the original plan with `bun x nx migrate --run-migrations`. The published owner supplies its original factory. A fresh `1.0.6` resolution can encounter the historical shared Effect drift; use the verified source installation/lockfile or a controlled recovery environment. Do not add overrides, edit a lockfile, or bypass the entry. If the published factory reports a conflict, stop and reconcile it explicitly.
3. After all postconditions are demonstrated, archive the plan, for example under `docs/project/migrations/1.0.6-reviewed.json`. Record whether it was executed or its postconditions were reviewed as already satisfied. The archive must preserve its original contents and the verification evidence. Do not replace it with `{ "migrations": [] }`.
4. Generate the new plan with `bun x nx migrate keenko@1.0.7-rc.1`. If the target is already installed but its migration has not run, use Nx's explicit origin: `bun x nx migrate keenko@1.0.7-rc.1 --from=keenko@1.0.7-rc.0`. Require the `1.0.7-managed-dependencies` entry. Follow the native install → run migrations → install → sync → codegen → check sequence above.
5. Compare every managed slot and its installed resolution with the qualified target, verify foreign dependencies and application changes are preserved, and archive the successfully completed new plan.

Nx has no durable receipt proving that this residual entry ran. `--exclude-applied-migrations` uses version information, not consumer postconditions, and is not a substitute for this review. Keenko therefore provides no automatic deletion or alternate migration runner.
