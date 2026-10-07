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
