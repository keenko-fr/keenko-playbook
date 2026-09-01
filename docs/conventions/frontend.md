# Frontend UI quality

This convention owns renderer-neutral frontend and UI quality rules. Renderer-specific programming and styling rules belong in the enabled renderer modules.

## Component ownership

Use this ownership ladder:

```text
used only in one rendered unit
-> keep local

reusable within one feature/domain
-> keep with that feature/domain

domain-agnostic and application-wide
-> application UI layer

genuinely shared across application/package boundaries
-> shared UI package
```

Avoid generic global component buckets for arbitrary business components.

Shared UI owns generic interaction, accessibility, visual state, semantic attributes, and styling contracts. It does not know application terminology, domain values, or business workflows. Start domain-aware UI with its feature and promote it only when a real second application/package consumer makes local ownership inadequate.

Keep renderer-specific implementations local by default. Share them across renderers only when the implementation itself has earned a real shared boundary.

## DISPLAY and visual representation

`DISPLAY` answers how an application/domain value is represented to a user. It may contain:

- translated labels/message functions;
- icons;
- locale-aware formatters;
- display-only options;
- finite domain-value to user-meaning mappings.

It does not contain business or persistence rules, styling classes, style definitions, or literal translated copy.

For finite values, use exhaustive typed maps, normally named concisely such as `statusDisplay`, `stateDisplay`, `typeDisplay`, or `roleDisplay`, so new domain values require deliberate UI handling.

Keep user meaning separate from visual representation. `DISPLAY` owns meaning. The enabled renderer/UI stack owns the implementation of visual styles.

## Semantic structure and accessibility

Use semantic structure that expresses the content and interaction correctly. Prefer native semantics and accessibility-capable primitives before recreating established interaction behavior.

Accessibility is part of the component contract. Preserve accessible names, keyboard operation, focus behavior, disabled semantics, error association, state semantics, and appropriate roles as applicable. Do not defer accessibility as optional polish.

Separate domain and user meaning from visual representation when they can vary independently. Visual changes must not silently change domain meaning, and domain values must not become styling APIs by accident.

## UI completeness contract

An implementation must deliberately handle the applicable states and constraints:

- initial/loading state;
- empty state;
- failure state;
- pending mutations or actions;
- responsive behavior;
- keyboard and focus behavior;
- reduced-motion behavior where motion exists.

"Deliberately handle" can mean deciding that a state is not applicable. Do not leave an applicable state to accidental framework or browser behavior.

Responsive intent, interaction feedback, and action completion should be clear for the feature being implemented. The shared convention does not choose exact presentation. It does not prescribe spinner versus skeleton, toast versus inline feedback, exact breakpoints, confirmation-dialog policy, motion duration, default density, or a specific responsive composition.

## Project UI decisions

`docs/project/ui.md` is the canonical project-owned document for durable visual and interaction decisions when the enabled stack has a meaningful UI surface. Linear owns feature/product scope and acceptance decisions. Code and configuration own executable implementations and exact values such as theme tokens, CSS values, and component code.

An external design artifact such as Figma is authoritative only when `docs/project/ui.md` explicitly delegates authority to it. A design link in a ticket or repository does not become canonical by itself.

When a material UI choice is not settled in `docs/project/ui.md` or another higher-authority source, do not silently invent a durable project convention. Small local details may follow established project precedent. Material choices that affect layout, information hierarchy, navigation, responsive behavior, or the interaction model require an explicit human decision.

When the `prototype` skill is installed, prefer it to explore materially different UI directions before a human settles the choice. Renderer modules must not depend on that optional exploration workflow merely to enforce UI conventions.
