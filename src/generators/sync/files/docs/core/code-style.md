# Code style

Optimize for reader load, explicit ownership, and directness rather than ceremony.

Oxfmt is the canonical owner of arbitrary source formatting. Follow its output instead of maintaining parallel prose rules for quotes, semicolons, wrapping, trailing commas, or equivalent appearance details. The canonical configuration and formatting contract live in `tooling.md`.

## Imports and modules

- Use `import type` for type-only imports; linting enforces the mechanical form.
- Oxfmt owns mechanical import ordering through the configured Ultracite baseline. Do not manually arrange imports to satisfy an independent Keenko style convention.
- Do not create convenience `index.ts` barrels inside implementation trees. A barrel is appropriate only when it deliberately defines a package/module public API.
- Prefer named exports. Use default exports only when a framework/tooling contract naturally requires one.
- Use lowercase `kebab-case` by default for Keenko-owned filenames. A concrete framework, tool, generator, or ecosystem filename contract takes precedence over the Keenko default.

### Backend feature, data and domain imports

Namespace-import resource modules in `features/`, `data/` and `domain/`. For the same concept as the consuming file:

```ts
import * as data from "../data/orders";
import * as domain from "../domain/orders";
import * as feature from "../features/orders";
```

For another concept, use its singular name followed by Feature, Data or Domain:

```ts
import * as paymentAccountData from "../data/payment-accounts";
import * as paymentAccountDomain from "../domain/payment-accounts";
import * as paymentAccountFeature from "../features/payment-accounts";
```

This preserves natural variable names such as paymentAccount or orders. Use data aliases only for persistence operations; business behavior retains its feature/domain owner. Data modules must not import features.

Infra, schemas, Confect services and ordinary modules keep responsibility-appropriate imports, normally named imports. The narrow technical `data/confect.ts` helper file uses named imports for persistence adapters rather than a resource namespace.

## Naming

- Choose the shortest name retaining necessary meaning in its module. Prefer orderIntents.convert, orders.markReady and orderIntents.effectiveStatus over repeating the resource noun. No arbitrary name-length limit applies.
- Avoid cryptic abbreviations. Conventional short forms such as `id`, `url`, `api`, `ctx`, and genuine `dto` usage are fine.
- Name booleans as readable predicates when useful (`isActive`, `hasAccess`, `canPublish`, `shouldRetry`) without mechanically forcing a prefix when the domain word is already boolean (`enabled`, `verified`).
- Preserve business verbs such as submit, convert, decline, cancel, conclude, transition, markReady, publish and archive. Do not mechanically rename a transition to create because it also writes a document.
- Avoid vague handle/process/manage/do/execute and decorative Manager/Service/Handler/Helper/Context/Setup/Operation suffixes when a precise contextual name suffices. No suffix is mechanically banned when it expresses a real distinction.
- Use `remove` for authored deletion operations; retain native `.delete()` when calling an API that uses that name.
- Preserve canonical domain vocabulary. Do not create synonyms for established concepts.

### Backend CRUD vocabulary

| Verb              | Meaning                                      |
| ----------------- | -------------------------------------------- |
| `create`          | Create a resource                            |
| `find`, `findByX` | Read with normal absence                     |
| `get`, `getByX`   | Read with exceptional absence                |
| `list`, `listByX` | Read multiple resources                      |
| `patch`           | Partial modification                         |
| `replace`         | Full replacement                             |
| `remove`          | Deletion                                     |
| `ensure`          | Guarantee existence, creating when necessary |

`create` is the canonical creation verb in features and authored resource data operations. Reserve insert for native persistence calls. Do not expose insert/add/save/open synonyms for the same simple creation semantics. Use is/has/can for boolean predicates and check for fallible validation, with the specific exceptions in `validation.md`.

## Functions and types

Every exported operation in features/data/domain takes zero or one argument. Use zero parameters when nothing is needed, a direct parameter for one natural value, and one args object for several values. For example, feature.getById(id), feature.convert({ intentId, now }) and domain.transition({ order, command }). Private helpers and framework callbacks follow the signature that serves their actual contract.

Use ConvertArgs or FoobarArgs for function parameters. Input denotes an independently reusable business input. Simple signatures need no named type, and coincidentally identical shapes do not justify sharing an alias.

In `packages/backend/**/*.ts` and `packages/shared/**/*.ts`, prefer type for ordinary contracts; retain interface when its specific properties are useful. This preference does not extend backend-specific architecture or file grammar to shared. Do not mechanically rewrite existing interfaces. Verify the effective lint policy and apply the justified scope in `tooling.md`.

| Type                                | Narrowest semantic owner |
| ----------------------------------- | ------------------------ |
| Pure business facts/contracts       | domain/<concept>.ts      |
| Workflow args and local types       | features/<concept>.ts    |
| Persistence args and local types    | data/<resource>.ts       |
| Runtime/persistence representations | schemas/<concept>.ts     |
| Exposed Confect contracts           | confect/*.spec.ts        |
| Context issues and errors           | errors/<concept>.ts      |
| Truly cross-workspace contracts     | packages/shared          |

No global types directory or runtime Schema for each internal interface is required. Local types/helpers follow their owner; Schema-derived types remain immediately adjacent.

- Use `const` for values and configured functions returned by APIs.
- Use function declarations for ordinary authored functions when hoisting improves main-first reading order. Do not impose arrows everywhere.
- Let TypeScript infer ordinary return types. Annotate when the return type is an important public contract, prevents harmful widening, documents a meaningful Effect contract, or makes complex inference clearer.
- Prefer `satisfies` when checking a value without widening its inferred shape.
- Treat casts, double casts, and non-null assertions as narrow boundary escape hatches. Prefer decoding, narrowing, or fixing upstream types; explain non-obvious interop casts.
- Prefer literal unions/schema-derived types over enum-like runtime objects when no runtime object is needed.

## Constants

Use `SCREAMING_SNAKE_CASE` for true static module-level constants. The chosen frontend CVA style-object convention is an explicit exception. Extract a literal when its name communicates domain meaning, it is reused, or it needs a single change point; do not manufacture constants for obvious one-off literals.

## Comments and suppressions

- Comments explain rationale, invariants, external constraints, or dangerous edge cases, not straightforward code.
- Canonical structural section separators defined by file-topology conventions are an explicit exception: they are navigation/file-structure markers, not explanatory comments. Follow the owning topology document's conditions, section names, order, spacing, and empty-section omission rules.
- Use the narrowest lint suppression possible and include a concrete reason.
- Do not merge vague TODO/FIXME notes. A temporary note must describe a useful local constraint or reference tracked work.
- Remove commented-out implementation code; Git owns history.
