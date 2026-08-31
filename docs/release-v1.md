# v1.0.0 release gate

Do not release `v1.0.0` merely because repository checks are green.

The human-readable gate is mirrored by `release/v1-gate.json`. Publication requires every machine-readable gate item to be `passed` with concrete evidence.

Required evidence:

1. release-grade source/type/test verification from a clean checkout;
2. clean fixture install, repeated install, update preview/apply, and `playbook check`;
3. expected default skills discover in both Codex and Claude;
4. `effect-convex-web` resolves its module and skill requirements correctly;
5. a real consumer repository bootstraps without manual file surgery;
6. a realistic Codex implementation/review task completes without a blocking convention/discovery problem;
7. a realistic Claude implementation/review task completes without a blocking convention/discovery problem;
8. Anoula successfully consumes the release candidate;
9. fresh-context defect-first review has no unresolved P0-P2 findings;
10. the regenerated convention set has no known unresolved contradiction with canonical docs/modules;
11. release notes document every deliberately deferred non-blocking limitation and breaking migration.

The release workflow has two explicit human-triggered stages:

- **prepare** creates a release branch/PR after release-grade verification and never writes directly to `main`;
- **publish** runs only from reviewed `main`, re-verifies the release candidate and `release/v1-gate.json`, then creates the tag/GitHub Release for the exact reviewed commit.
