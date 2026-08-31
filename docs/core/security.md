# Security and privacy

## Trust boundaries

Clients express intent; backend/runtime state establishes authority.

- Never trust caller-supplied identity, role, ownership, price/amount, provider state, storage references, verification flags, or infrastructure metadata when the backend can derive them.
- Authenticate and authorize at the protected backend operation. Route/UI gating is not a substitute.
- Authorize the exact resource/action, not merely a broad role.
- Derive trusted metadata such as actor, request IP, verified webhook identity, origin, and server timestamp at the trusted boundary.

## Public/private contracts

- Design explicit public-safe projections rather than returning rich internal objects and subtracting known sensitive fields.
- Security-sensitive public errors must not enable account/resource/ownership/payment enumeration.
- Keep useful internal diagnostics while returning stable sanitized external failures.
- Authenticated/private or capability-bearing responses default to `Cache-Control: private, no-store` unless a deliberate reviewed caching strategy says otherwise.

## Capabilities and providers

- Capability URLs/tokens are minimum-scope and short-lived when possible.
- Never persist/log raw secrets, authorization headers, passwordless tokens, signed playback tokens, webhook secrets, API keys, or full secret URLs unnecessarily. Retain safe IDs/hashes/provider references when durable correlation is needed.
- Verify webhook authenticity before application mutation.
- Treat duplicate, replayed, and reasonably reordered events as normal; reconciliation must be idempotent and avoid state regression.
- Provider/component state is not automatically application authority. Application-owned concepts remain authoritative unless architecture explicitly delegates ownership.

## Abuse protection

Apply rate limiting to abuse-sensitive or expensive operations rather than every endpoint mechanically. Infrastructure owns the limiting mechanism; the feature owns keys, windows, quotas, and business consequences.

## Logging

Production logs are structured operational evidence with stable context fields. Log enough to diagnose failures while minimizing personal/private/payment/provider payload data. Prefer safe internal IDs, event IDs, operation names, statuses, and sanitized errors over full inputs.

## Configuration and headers

- Never commit or paste real secret values into source, docs, issues, PRs, tests, or agent instructions.
- Repository configuration may contain variable names, schemas, and safe placeholders; values live in deployment/CI/provider secret stores.
- Required security configuration fails closed rather than silently becoming permissive.
- Security headers/CSP follow least privilege. Keep policies separate when public/authenticated surfaces have different trust needs.

## Privacy and audit

Privacy/retention follows data semantics, relationships, legal/financial retention, and approved policy. Do not implement generic cascading erasure.

Treat access/export/rectification/objection/erasure/anonymization/unsubscription/retention as explicit application workflows with authorization, scope, outcome, and auditability.

Material administrative actions should record durable evidence such as actor, action, target, reason, timestamp, and outcome based on risk/significance rather than auditing every click.

## Consequential operations

Planning and dry-run inspection are allowed. Production writes, destructive migrations, secret rotation, data deletion, billing/refund actions, and similar operations require explicit human authorization for the action being executed.
