# Backend architecture

For Effect + Convex/Confect backends, start with the operation and extract modules when their responsibilities justify it. A simple operation may live entirely in a Confect implementation. Business functions may read and write persistence directly.

## Target topology

```text
packages/backend/
  confect/
  features/
  data/
  domain/
  schemas/
  errors/
  infra/
```

These are ownership directories, not empty scaffolding requirements. Create only those with real content. Do not add an intermediate `src/` directory by default. See `backend-file-topology.md` for section grammar.

## Confect first

`confect/` owns `*.spec.ts` contracts and `*.impl.ts` implementations. Specs own runtime parameters, results and exposed Failures. An implementation may directly contain persistence reads/writes, projections, simple business checks or an autonomous operation. There is no mandatory feature delegation.

Confect/API/facade boundaries choose caller-facing projections and codecs appropriate to their runtime. Internal representations may retain useful Effect-native values; they need not match the transport result. Name projections for actual endpoint semantics. `Dto` remains foreign-system-owned.

Internal Confect functions required by scheduling, actions or other execution boundaries remain registered entry points. Do not register another function merely to reuse TypeScript code.

## Features and extraction

`features/` is the default owner of meaningful effectful business operations: workflows, authorization of acting Users, business actions, lifecycle state transitions and coordination across capabilities. Features enforce business decisions whose responsibility goes beyond a resource retrieval or persistence contract. A module may contain reads, writes and calls to infra. It may use generated `DatabaseReader`, `DatabaseWriter` and other Confect services directly. No intermediate persistence layer is required.

Extract from an implementation for an autonomous responsibility, significant business/technical complexity, useful reuse or a real improvement in caller readability. One consumer can justify an important operation. Line count may reveal a readability problem but is not an architectural threshold.

Keep modules flat by default, such as `features/orders.ts`. Remove wrappers that only rename or delegate an operation without adding responsibility.

A feature may call another feature for real business behavior. For example, orders may call payments to charge an account. Keep imports acyclic and retain a single root transaction when the composed operation must be atomic.

## Optional persistence data modules

`data/` owns optional, cohesive persistence-oriented operations: resource retrieval, indexed lookups, writes, meaningful initialization defaults, relationship loading/enrichment and persistence-specific result or absence adaptation. Persistence may remain in a simple Confect implementation or the feature that owns the operation.

Data operations may perform the checks necessary to guarantee their retrieval or persistence contract, including invoking domain predicates and validating relationships between persisted resources.

Extract a feature when an operation has a meaningful independent business responsibility, not merely because a persistence function contains a validation condition.

Judge the responsibility of the complete operation, not individual queries, conditions or predicate calls. Getting a configured or usable resource, validating its retrieved configuration and relations, or finding a current temporal relationship can be ordinary data operations. Pure domain predicates may be called by data or features. A reusable retrieval does not authorize an acting User or grant permission to perform a business action.

Extract into data when the complete operation's responsibility, useful reuse, dependency direction, reducing meaningful duplication, caller readability or reduced architectural complexity provides a concrete benefit. A single consumer can justify extraction when the responsibility or dependency boundary warrants it. Do not impose line-count thresholds or require a data module for every feature or table. Do not extract merely because a function contains a query, or introduce a feature merely because it contains a condition or calls domain logic. Prefer one cohesive operation over several layers of delegation.

Data modules must not import features. Keep resource module imports acyclic. Features may import data modules or use generated DatabaseReader/DatabaseWriter directly. Confect implementations may use features or data when their responsibility justifies it. Keep authorization at the appropriate trusted business/execution boundary, domain deterministic and infra responsible for independent technical capabilities.

For example, `features/orders.ts` and `features/billing.ts` may both import `data/accounts.ts` for `getById()` without depending on each other's lifecycle operations. The data module uses Confect persistence services and never calls those features. It owns the checks and failures intrinsic to its retrieval contract; each feature owns its independent business responsibility and may translate failures when its caller contract differs.

Do not introduce generic repositories, CRUD factories, canonical Entity loaders, mandatory hydration, mechanical forwarding wrappers or a compulsory `features → data` delegation path. Compose data and feature functions directly within the single root Convex transaction. No additional registered mutation or artificial orchestration layer is required for reuse.

## Focused Confect persistence adapters

`data/confect.ts` is the canonical owner of focused persistence adapters such as `dieOnDecodeError`, `dieOnEncodeError`, `dieOnGetByIdFailure`, `dieOnPatchError`, `optionById`, `optionByIndex`, `failById` and `failByIndex`.

This is a narrow technical exception for persistence-specific helpers, not a standalone business feature, general infra service or generic repository around DatabaseReader/DatabaseWriter. Its existence does not require data modules for application resources. Include only the adapters the application needs.

Translate codec errors to defects only for an owned invariant; preserve expected not-found as a typed get failure or normal find absence. Absence becomes a defect only when a concrete invariant proves it impossible. A generic fail adapter applies an explicit translation supplied by its caller. A resource data operation may own that translation when it is part of its retrieval contract.

## Pure domain

`domain/` is optional and owns deterministic business calculations, predicates, decisions, state transitions, eligibility rules and reusable invariants. It never reads the database or performs mutations.

Domain function ownership follows business semantics, not mechanically the consuming resource or most frequent caller. A concept that establishes contractual facts may own their calculation even when another concept inherits and uses those facts. Import that function directly; two consumers do not by themselves justify a new module or abstraction. Use natural, self-explanatory names that remain understandable without a module namespace.

Pass the facts the behavior needs through a small structural contract rather than an imposed complete Entity. Do not extract a trivial expression merely to satisfy theoretical separation.

Reusable pure predicates may also serve a Schema. Define independent fact types at their semantic owner so `schemas/` and `domain/` do not form import cycles. Keep a predicate schema-local if sharing it requires disproportionate structure.

## Runtime schemas and errors

`schemas/` owns justified runtime contracts: persistence, genuinely shared boundary representations, external formats, representation transformations and trust-boundary invariants. It does not require a Schema for each internal TypeScript interface or a canonical Entity for each table.

Application resource schemas live under their resource, such as `schemas/shows.ts`. Foreign wire schemas live under `schemas/<provider>/<resource>.ts` from the first real provider schema. Do not invent `schemas/providers/` or speculative common files. Endpoint-only contracts stay in specs; other local contracts stay at their narrowest owner.

`errors/<concept>.ts` groups the context's used SchemaIssue, Failure and Defect contracts. Spec-imported contracts remain server-implementation-free. See `validation.md` for categories, provenance and explicit translations.

## Infra capabilities

`infra/` owns real technical capabilities: provider adapters, payments, allocation, external systems and reusable or meaningfully substitutable services. Preserve existing service boundaries that carry real responsibility. Business policy stays with its operation owner.

A real external or substitutable capability is an Effect service from its first consumer. A deterministic helper is an ordinary function. Expose one capability API rather than parallel direct functions or another service that only wraps it.

Provider DTOs stay in their provider schema namespace. An adapter-local `sFooFromDto` may compose foreign and application Schemas at the actual boundary. Internal computations and workflow transitions remain plain functions.

Leave lower-level service requirements open until runtime composition. For example, `TvMaze.layer` requires `HttpClient` and provides `TvMaze`; the application chooses `FetchHttpClient.layer`. See the Effect stack guidance for native HTTP, Layers and testing seams.

## Concept ownership

Use the persisted resource name in kebab-case when it anchors the module: `orderIntents` maps to `features/order-intents.ts` or an extracted `data/order-intents.ts`. This does not require feature, data and domain modules for every table.

An operation touching several tables belongs to the concept responsible for its business result. An orders submission may create an intent without introducing another concept.

Create a new concept only for an independent, specialized, cross-concept or distinct technical responsibility. Do not invent Context, Bundle, Setup or Processing types/modules just to gather existing resources. Those names remain valid when they express a demonstrated responsibility.

## Minimal representations

Use an existing document when it suffices. Enrich that resource when a relation has useful semantics; otherwise use local variables. Introduce a distinct representation only for distinct meaning.

Neither full Entities nor hydration are mandatory. Keep persistence Schemas and codecs. Internal enrichment may be a plain type, and does not require another runtime Schema or a constructor. Do not introduce generic Repository, EntityLoader, Loader or hydration infrastructure.

Relation loading and the consistency checks needed to return a valid resource may live together in data. For example, `data/rules.ts` can expose `getConfiguredById()` and `getUsableByAccountId()`: retrieve the rule, load required relations, check that their owners agree, validate configuration and apply the named-imported pure `isRuleUsable()` predicate for the usable retrieval. No forwarding `features/rules.ts` is required. A shared `withRelations()` helper stays private unless real independent reuse justifies export. Do not split loading and checking into separate modules solely to preserve a conceptual distinction.

Enrichment is demand-driven; load only the relations the contract needs. Do not require complete relation hydration. A feature remains appropriate for an independent workflow, acting-User authorization or business action using the retrieved resource.

Loading Bar through a Foo's persisted foreign key proves identity, not independent ownership. If their owners must agree, enforce `doc.ownerId === bar.ownerId` when both resources are available and validity is needed. Preserve meaningful schema and business checks without repeatedly decoding trusted internal values. See `schema-types.md`.

## Retrieval and composition

`find` / `findByX` treats absence as normal, usually with `Option` in Effect code. `get` / `getByX` treats absence as a typed failure. A corresponding pair normally returns the same success representation; different projections are not a find/get pair.

Errors follow the owning operation's public contract. A data retrieval may translate missing relations or invalid configuration into meaningful resource-specific Failures when these are expected retrieval outcomes. An operation-specific feature may translate those failures when its business contract differs. Preserve the distinction between expected absence, typed Failure, Schema validation errors and Defects for impossible persisted states; qualification does not turn an impossible invariant violation into an expected failure. Generic persistence adapters accept explicit caller policy rather than inventing business failure semantics. See `validation.md`.

Use the naming, zero-or-one-argument signatures and feature/data namespace imports and named domain imports in `docs/core/code-style.md`. `create` is the canonical authored creation verb; `insert` belongs to native persistence calls. Preserve business transition verbs.

## Execution guarantees

Simplifying structure does not change execution policy:

- Check caller authentication/identity at the appropriate boundary and preserve authorization, ownership and eligibility.
- Keep reads, decisions, writes and required capacity acquisition/release in one root Convex mutation when they must be atomic. Direct TypeScript composition must not become several registered mutations. Errors requiring rollback must fail the root mutation.
- Preserve idempotency keys and scope, semantic request comparison, replay behavior and relationships among created resources.
- Validate Confect inputs/results, persistence through installed codecs, external provider inputs and meaningful business invariants. Do not decode every correctly typed internal value.
- Test observable behavior, authorization, cross-resource consistency, replay and atomicity. Removing Entities or wrappers does not justify removing business coverage.

## Migration authority

This convention replaces the incompatible architectural prescriptions from KEE-59 and KEE-62: mandatory `features → data`, full canonical Entities, systematic hydration and their old naming/file rules. Optional persistence extraction corrects the later blanket prohibition of data without restoring mandatory separation. Accepted business invariants remain applicable.

Canonical Keenko generator sources own this guidance. Update generated consumers through the published package and native sync lifecycle. Sync updates guidance; it does not relocate application-owned source.

Retain useful existing data modules when they satisfy these responsibility and dependency rules. Reconcile application-owned helper locations and compiler coverage through the supported upgrade workflow. Product semantics remain under current project authority; verify business invariants after any runtime adaptation.

## Workspace boundaries

Create a package only for a real public API, consumer, runtime/build constraint or shared responsibility. Consumers use supported exports rather than private source paths. Keep package imports acyclic.

`packages/shared` requires real cross-workspace/runtime reuse. Organize earned content by responsibility, such as schemas, helpers or infra. It may depend on Effect Schema; shared does not mean dependency-free.

A frontend consuming a transport projection does not justify moving backend `Foo` there. Share the exact representation only when consumers actually use it. Keep backend provider/storage/framework adapters backend-owned unless genuine cross-runtime reuse exists.
