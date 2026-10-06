# Agent behavior

## Authority

When instructions conflict, use this order:

1. explicit current human instruction;
2. project ADR or explicit project override;
3. project-local conventions and architecture;
4. Keenko core conventions;
5. Keenko fixed-stack guidance;
6. Keenko-owned skills;
7. vendored or first-party upstream skills;
8. generic agent or library defaults.

`AGENTS.md` and `CLAUDE.md` route the harness into this hierarchy; they do not outrank it.

## Before substantial work

Read the repository before editing:

- the applicable `AGENTS.md` or `CLAUDE.md` instructions;
- root `CONTEXT.md`;
- project architecture and overrides;
- relevant ADRs;
- the existing implementation and tests around the change;
- exact installed dependency versions when behavior is version-sensitive;
- generated/native APIs and installed package source/types when they define the real boundary.

Facts are the agent's job to investigate. Genuine product, architecture, legal, and business choices remain human decisions. Do not silently convert uncertainty into a new policy.

## Implementation discipline

- Prefer deletion and the smallest change that solves the actual problem.
- Keep behavior local to its owner until a real reuse, boundary, or seam exists.
- Prefer deep modules: small stable interfaces that hide meaningful complexity.
- Do not add wrappers, services, packages, state, schemas, configuration, or abstractions for hypothetical reuse.
- Abstract shared semantics and change axes, not structural similarity alone.
- Derive cheap deterministic values from canonical state instead of synchronizing duplicate copies.
- Make data flow, ownership, trust boundaries, and failure paths visible.
- Use short contextual names without cryptic abbreviation.
- Preserve established domain vocabulary; do not invent synonyms casually.
- Optimize after ownership/data flow are correct and a credible bottleneck exists.
- Verify behavior instead of asserting that code is correct.

These are Keenko's always-on concise implementation principles. Vendored skills may provide procedural detail but do not replace these rules.

For TypeScript implementation work, use the repository's canonical tooling rather than ad hoc formatter/linter commands. Format/fix the touched scope during implementation, inspect autofix diffs, and run focused lint/type/tests as appropriate. Never manually fight Oxfmt output or autofix generated/vendored sources. Before review handoff, run the applicable complete `bun run check` and report exactly what ran.

## Version-sensitive claims

For fast-moving libraries such as Effect, Confect, Convex, TanStack, Paraglide, provider SDKs, and the formatting/linting toolchain, inspect the installed version and current primary source/types/docs before making a behavior-dependent change. Model memory is a hypothesis, not evidence.

For substantial TanStack work, run `bun node_modules/@tanstack/intent/dist/cli.mjs list` from the workspace root and load a matching installed package skill with `bun node_modules/@tanstack/intent/dist/cli.mjs load <package>#<skill>` when one is available. The explicit installed CLI path avoids ambiguous package binaries and requires no network resolution. TanStack package skills version with their installed packages. If the relevant installed package does not ship a matching skill, continue with its installed source/types and current first-party documentation.

For library/API claims, preserve this authority order:

1. current human/project/repository authority, using the instruction hierarchy above;
2. installed source/types;
3. installed package-owned or current first-party guidance;
4. Context7 retrieval;
5. model memory.

Keenko provisions hosted Context7 MCP at project scope for Codex and Claude Code. Use Context7 automatically when current third-party library/API documentation materially affects correctness, without waiting for the user to say "use Context7". Do not use it mechanically for ordinary project logic or when higher-authority local evidence already answers the question. Match retrieval to the installed library version and resolve disagreements against higher-authority evidence.

If Context7 is unavailable, blocked by harness trust/approval, or rate-limited, continue with installed source/types and current first-party guidance. Report any remaining uncertainty that affects correctness. Context7 is retrieval support, never architectural authority or a prerequisite.

## Context7 configuration ownership

Codex uses project `.codex/config.toml` with `[mcp_servers.context7]`; Claude Code uses root `.mcp.json` with `mcpServers.context7` and HTTP transport. Both connect to `https://mcp.context7.com/mcp`, which supports anonymous access with rate limits. No Context7 application dependency, subprocess, or credentials are generated.

Fresh creation and `bun x nx sync`, including the supported upgrade lifecycle, add an absent entry and preserve a recognized equivalent existing entry unchanged. Keenko owns only `context7`. Unrelated settings and MCP entries stay project-owned. For extensible Codex TOML, sync appends the entry without rewriting user text; sealed inline-table layouts require TOML serialization that preserves all configuration values. Claude JSON additions preserve all unrelated values. Equivalent configuration is left byte-for-byte unchanged.

Malformed configuration or a materially customized conflicting `context7` entry fails before sync writes managed state. Reconcile the reported file manually and rerun `bun x nx sync`; do not erase user customization to make synchronization pass. Recognition is deliberately narrow: the hosted endpoint and harness transport, with optional explicit default values, empty headers, or Claude's equivalent `streamable-http` transport alias. Custom endpoints, authentication, timeouts, tool restrictions, or disabled entries require human reconciliation.

Codex loads project configuration only after the user trusts the project. Claude Code retains its project MCP approval behavior. Keenko does not write trust, approval, permissions, or credential settings. Respect those boundaries and never approve them on the user's behalf.

## Knowledge

Hidden model/session state is never canonical project knowledge. Durable information belongs in the appropriate source:

- code/config for executable truth;
- `CONTEXT.md` for concise stable project/domain context;
- architecture docs for the current architecture;
- ADRs for significant historical rationale;
- Linear for canonical actionable work;
- PRs for change-specific rationale and verification;
- runbooks for durable operations.

Do not require session journals or Obsidian in Keenko core.

## Consequential actions

Implementation authorization does not silently authorize external or destructive actions. Commit, push, PR, production deploy, migration, secret mutation, deletion, refund/billing action, force push, merge, and similar operations require the scope delegated by the current task. Merge remains explicitly human-owned.
