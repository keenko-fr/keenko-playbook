# ADR 0002: versioned materialization into consuming projects

## Status

Accepted.

## Decision

Consuming projects pin a released playbook version in `.playbook/config.json`. The installer materializes selected docs/skills into `.playbook/`, treats that subtree as generated/read-only, and exposes native skill copies to supported harness directories.

Updates preview first and require explicit apply. Project-owned files are preserved.

## Why

Directly tracking `main`, submodules, or ad-hoc copies make convention changes surprising or hard to audit. A pinned generated snapshot produces ordinary reviewable Git diffs and a clear ownership boundary.
