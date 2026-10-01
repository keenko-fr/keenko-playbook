# Keenko migrations

Native Nx migrations own post-1.0 upgrades of persisted Keenko consumer state. This contract follows KEE-14's native lifecycle and ownership boundary.

## Recognition and ownership

- Recognized source baseline: migrate deterministically.
- Recognized target baseline: no-op.
- Unrecognized customization of a Keenko-owned semantic field: fail before mutation with an actionable conflict and require manual reconciliation.
- Unrelated project-owned state: preserve unchanged.

Keenko migrations do not prove semantic equivalence of arbitrary project customization. Behaviorally compatible custom state can still require manual reconciliation. Never silently overwrite project customization.

Match the smallest Keenko-owned semantic field needed for the migration. Do not require unrelated surrounding project-owned state to match the generated baseline. Identify ownership from supported baseline structure, not from incidental effects on the same tool or file class.

## Implementation and verification

Do not build general semantic analyzers, control-flow/dataflow solvers, glob-algebra engines, or equivalent inference machinery solely to recognize arbitrary customized project state. AST parsing, glob matching, and other structured tools are appropriate for narrow deterministic matching of known Keenko-owned source or target state. Formatter-only differences may be normalized without interpreting custom behavior.

Conflicts must be detected before applying partial migration writes to the caller tree. Validate every required owned field and stage the complete migration before applying it. A conflict must leave caller state unchanged.

Verify recognized source upgrades, recognized target no-ops, preservation of unrelated state, actionable conflicts without mutation, and idempotent reruns through the native Nx lifecycle.
