# Git and pull requests

- Use a dedicated branch for each coherent change.
- Prefer one coherent issue/deliverable per PR where practical.
- Use concise imperative commit subjects. Prefix taxonomies are optional.
- Keep commits focused enough to review or revert independently.
- Protected `main`, required CI, and peer review for policy/convention changes are the repository policy.
- Policy/convention changes require review by another maintainer.

## Main protection

Protect `main` with two separate active rulesets.

`Protect main history` targets the default branch, blocks branch deletion and non-fast-forward pushes, and has no bypass actors. No human or automation identity may bypass it.

`Require reviewed main changes` targets the default branch, requires pull requests and the canonical `check` status, and has one bypass actor: the dedicated `Keenko Release` GitHub App. The App uses direct bypass only for this ruleset so native Nx Release can push its generated fast-forward release commit to `main`.

Do not add a human bypass. Do not give the release App a bypass that also permits force-pushing, rewriting, or deleting `main`.

## Release automation

The `Keenko Release` GitHub App is installed only on `keenko-fr/keenko-playbook`. Its repository permissions are `Contents: read and write`, plus GitHub's implicit `Metadata: read`. Do not grant Administration, Workflows, Actions, Pull requests, or unrelated permissions.

The release workflow creates a repository-scoped installation token from `KEENKO_RELEASE_APP_CLIENT_ID` and `KEENKO_RELEASE_APP_PRIVATE_KEY`, asks the token action for `Contents: write` only, checks out the exact releasable `main` SHA with that token, runs release-grade verification, and invokes the native Nx Release flow with the App token.

Nx owns version calculation, version-plan consumption, changelog generation, the release commit, Git tag creation, Git push, GitHub release creation, and package publication. Do not add a release-preparation PR, custom tag reconciliation, custom first-release handling, or another release state machine around Nx.

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
