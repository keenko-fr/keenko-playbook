# ADR 0004: Convex upstream skills remain external; Keenko owns the discoverable adapter

## Status

Accepted. Updated by the pre-v1 defect review without changing the licensing premise.

## Context

Keenko prefers first-party Convex guidance for version-sensitive behavior. The public `get-convex/agent-skills` repository is intentionally installable according to Convex documentation, but the reviewed repository does not declare a compatible repository redistribution license. Public visibility and an upstream installer are not sufficient grounds for Keenko to copy that source into this MIT repository.

A warning-only external skill reference was also insufficient: a clean consumer could report green while neither supported harness actually discovered Convex guidance.

## Decision

- Keep the reviewed upstream Convex repository revision in `vendor/sources.json` as an external provenance record.
- Do not redistribute its files and do not make that external suite a hidden v1 prerequisite.
- Ship a Keenko-owned `convex` specialist skill in both supported harness trees. It routes agents to the consuming project's installed Convex version, installed package source/types, current first-party Convex documentation, and the external provenance record copied to `.playbook/external-sources.json`.
- Installing the official external Convex skill suite remains an explicit optional project mutation, performed only from current Convex installation instructions with human approval. Keenko does not attest or manage that external installation.
- If the upstream repository later declares a compatible redistribution license, supersede this ADR before changing distribution mode.
