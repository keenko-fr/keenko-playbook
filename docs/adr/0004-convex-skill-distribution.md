# ADR 0004: official Convex skills are referenced, not redistributed

## Status

Accepted during implementation pending upstream licensing clarification.

## Context

Keenko prefers first-party Convex agent workflows. The current public `get-convex/agent-skills` repository does not declare a repository license. Public visibility alone does not grant redistribution rights.

## Decision

Record an immutable upstream Convex revision in `vendor/sources.json`, but do not copy its files into this MIT repository. Consuming projects install/use the official first-party source directly. If upstream later adds a compatible redistribution license, this ADR can be superseded and the suite may be vendored through the normal snapshot mechanism.
