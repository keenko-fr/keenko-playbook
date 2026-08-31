# v1.0.0 release gate

Do not release `v1.0.0` merely because the source tree exists.

All of these must pass:

1. source repository `playbook check --source --release`;
2. clean fixture install;
3. fixture update/check flow;
4. expected default skills discover in both Codex and Claude;
5. `effect-convex-web` resolves correctly;
6. a real consumer repository bootstraps without manual file surgery;
7. at least one realistic implementation task completes through Codex without a blocking convention/discovery problem;
8. at least one realistic implementation task completes through Claude without a blocking convention/discovery problem;
9. the regenerated convention set has no known unresolved contradiction with the canonical docs/modules;
10. release notes document every deliberately deferred non-blocking limitation and any breaking migration.
