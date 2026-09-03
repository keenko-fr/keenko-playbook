# Keenko Playbook

This repository defines Keenko's shared engineering conventions and agent workflows.

Read in this order when relevant:

1. `docs/core/agent-behavior.md`;
2. the relevant `docs/core/` policy;
3. the relevant `docs/conventions/` convention;
4. the relevant fixed-stack guidance under `docs/stacks/`;
5. playbook ADRs under `docs/adr/` when changing playbook architecture;
6. the relevant owned/upstream skill.

Do not duplicate canonical rules into this file. Keep it as routing guidance.

Before substantial work, inspect existing implementation/tests and exact versions for version-sensitive APIs. Run focused verification during implementation and the complete applicable repository verification before merge-ready independent review. Report only checks actually run. Do not perform merge or consequential external/destructive actions without explicit human authorization.
