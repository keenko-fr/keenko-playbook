# Git and pull requests

- Use a dedicated branch for each coherent change.
- Prefer one coherent issue/deliverable per PR where practical.
- Use concise imperative commit subjects. Prefix taxonomies are optional.
- Keep commits focused enough to review or revert independently.
- Protected `main`, required CI, and at least one peer approval are the target repository policy.
- Policy/convention changes require review by another maintainer.

## PR content

A nontrivial PR should state:

- what changed;
- why;
- linked issue/deliverable;
- verification actually run;
- migration/deployment implications when relevant;
- known risks/follow-up.

## Agent Git authority

An agent may commit, push, or open/update a PR only when delivery actions are explicitly delegated by the current task/workflow. A request to implement code alone does not silently authorize external Git mutation.

Merge remains explicitly human-owned. Do not infer merge permission from green CI, review, or an approved issue.

Force push, destructive branch operations, repository deletion, or equivalent consequential actions require explicit authorization for that operation.
