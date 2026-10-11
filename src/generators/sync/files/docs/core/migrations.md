# Keenko migrations

Native Nx migrations own supported upgrades of persisted Keenko consumer state. This contract follows KEE-14's native lifecycle and ownership boundary.

## Support window

Default direct forward support is immediately preceding stable → current stable. New projects start from the current release. Prereleases are not permanent supported origins. Older stable releases are outside the default direct-support window, and Keenko makes no default guarantee that an out-of-window project can recover through sequential historical releases. A release may explicitly widen its supported source window for a concrete requirement.

Migrations exist only when persisted project state requires transformation. Retain migration entries, implementations and assets only while a supported path or current behavior needs them. Published packages and Git tags preserve historical releases; the current package does not retain executable migrations solely for archaeology.

## Native lifecycle

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

Run applicable native migrations when Nx produces a migration plan. If none apply, Nx may create no `migrations.json`; continue with the second install and sync. Do not create a no-op migration or synthetic plan.

The second `bun install` is unconditional. Migrations can change dependency manifests after the first install. Bun alone reconciles installed packages and regenerates `bun.lock`; migrations never text-edit or merge the lockfile.

## Recognition and ownership

Keenko-managed dependency slots remain Keenko-owned after generation and during supported upgrades. They converge to the target compatibility tuple even when the consumer changes the version, moves the slot between dependency sections or deletes it. This rule does not authorize arbitrary source or configuration reconciliation.

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

## 1.0.5 RC scope and partial recovery

For the 1.0.5 release, the supported origins explicitly include stable 1.0.4 and published 1.0.5-rc.0. The first backend-convention entry is corrected to accept common or separate backend/shared overrides. The complementary `1.0.5-backend-shared-types` entry at 1.0.5-rc.1 uses that same idempotent factory. Consumers already on rc.0 therefore receive the policy on both packages, along with any missing compiler/dependency reconciliation from a failed first migration. No application modules are moved.

A failed factory leaves its tree unchanged, but an earlier Nx planning/install step may already have updated package.json and bun.lock. Do not infer that every migration completed from the installed Keenko version alone. Save the current project state and the old migrations.json before regenerating a plan. Preserve any unrelated pending migrations; review them separately rather than silently dropping them.

After 1.0.5-rc.1 is published, recover from the supported 1.0.4 baseline even if the manifest already names rc.0 or rc.1:

```sh
bun x nx migrate keenko@1.0.5-rc.1 --from=keenko@1.0.4
bun install
# Review the generated plan before executing it.
bun x nx migrate --run-migrations
bun install
bun x nx sync
bun run codegen
bun run check
bun install --frozen-lockfile
```

The Keenko entries must be `1.0.5-backend-convention` at 1.0.5-rc.0 followed by `1.0.5-backend-shared-types` at 1.0.5-rc.1, both resolved from the installed new candidate. The second entry deliberately reuses full reconciliation so that an earlier failed compiler/lint migration is repaired. The `--from` override regenerates the plan even when the target is already installed. An ordinary successful rc.0 upgrade without this override selects only the complementary entry.

Common Effect overrides remain common. The migration adds only the missing type-policy coverage, preserves all existing overrides and Effect rules, and leaves UI/application policies unchanged. Explicit conflicting severities, dynamic rule sources or ambiguous ownership stop before configuration/manifest writes. Reconcile those specific conflicts manually without deleting custom rules, then rerun the reviewed plan. Preserve application-owned data/features modules. Optional persistence extraction follows `backend-architecture.md`; sync does not relocate source.

Verify idempotence with a second `bun x nx migrate --run-migrations`, `bun x nx sync` and frozen install. These reruns must leave configuration, manifests, the lockfile and application helpers unchanged. Before public publication, the repository product gate proves this procedure against a locally packed candidate in an isolated registry; a public npm command cannot install an unpublished rc.1.

## Optional data compiler coverage

The `1.0.6-optional-data-coverage` entry at `1.0.6-rc.0` adds missing `data/**/*.ts` backend compiler coverage using the existing idempotent backend-convention factory. Broad includes already covering data stay unchanged. Conflicting exclusions or ambiguous configuration stop before writes. Native Nx selects this entry for published 1.0.5 consumers as well as the retained 1.0.4 and 1.0.5-rc.0 support paths.

The fresh preset places focused persistence adapters in `data/confect.ts`. Migration and sync preserve application-owned helper source and imports. After upgrading and synchronizing, reconcile those helpers and their imports with the canonical owner as an application change. Useful resource data modules can remain; no mandatory split or elimination applies. Run codegen and the project check after adaptation.
