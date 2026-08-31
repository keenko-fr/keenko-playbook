# TanStack Form

## Ownership

TanStack Form owns editing/form state. The application owns its cross-feature Form integration (contexts/hooks/registered fields/submit controls/generic validation resolution) under an app-local form layer; generic UI primitives remain Form-unaware.

Feature-specific form schemas and validation mappings remain feature-owned.

## Trust boundaries

A form schema owns the browser/application OUT boundary. A server-function validator and a Confect endpoint Args schema own separate downstream trust boundaries. They may repeat composition intentionally. Share semantic primitives, not whole transport objects solely to remove duplication.

Use a domain schema directly when the browser/edit representation is identical. Introduce frontend-only schemas for `File`, temporary empty/partial inputs, UI-only fields, defaults, or editing-specific validation.

## Validation

Prefer the complete feature-owned Effect Schema as the primary form validator, adapted through Standard Schema at the Form consumer. Add field-level validators only for distinct timing/async/UX behavior.

Default validation timing: validate on submit initially, then on change after the first failed submission. Opt into blur/change earlier for a concrete UX reason.

Use async validation only when pre-submit feedback genuinely adds value; debounce where appropriate. Backend submission validation remains authoritative.

When a form schema transforms values, submit the parsed transformed output. Validation does not imply TanStack Form replaced its stored value with the decoded/transformed value.

Issue IDs map through feature-owned validation → Paraglide messages; never display raw programmatic issue codes.

Use TanStack Intent/current package guidance for exact APIs.
