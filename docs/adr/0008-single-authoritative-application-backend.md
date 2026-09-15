# ADR 0008: Single authoritative application backend

## Status

Accepted.

## Context

Keenko applications combine a TanStack Start server runtime with a Convex backend, and both can execute trusted server-side code. Treating that shared capability as shared application authority makes authorization, invariants, workflows, idempotency, and business side effects harder to locate and enforce consistently. Runtime placement and access to secrets do not by themselves establish ownership.

## Decision

Each Keenko project has one authoritative application backend: Convex/application code. It owns application authorization, resource ownership, business invariants, state transitions, business workflows, business idempotency, and business side effects.

TanStack Start server remains the web runtime. A ServerFn may form a trust boundary and perform web-owned work without becoming an application authority boundary.

The synchronized [`application-authority.md`](../../src/generators/sync/files/docs/conventions/application-authority.md) convention owns the operational placement test and detailed boundary guidance.

## Consequences

Business behavior has one enforceable owner regardless of whether callers arrive through the browser, SSR, a loader, a ServerFn, or another transport. Web code may still compose backend reads/calls for presentation and may own SSR, redirects, sessions, callbacks, transport validation, and HTTP/error adaptation.

This decision does not require all server code to pass through Convex, remove legitimate TanStack Start server behavior, add a server abstraction, or automatically migrate existing project code. A real runtime/provider constraint requires an explicit repository-specific exception rather than silently transferring application authority.
