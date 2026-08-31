# TanStack Start

Server functions are real server trust boundaries. Validate/normalize input there even when the browser already validated it.

Keep values crossing SSR/server-function serialization transport-safe and explicit; do not leak Effect runtime values or `Date` hydration for internal symmetry.

A server function that meaningfully orchestrates validation, auth, and multiple fallible backend calls may use Effect internally. Convert foreign Promise/throwing APIs at their boundary and run the Effect once at the server-function/framework boundary.

For Confect calls, type the server-side transport from the actual ref (`Ref.Args<...>`) and use the codec-aware runner/client path. Do not import backend spec source or derive the transport type from a frontend form schema.

Keep the conceptual boundaries distinct:

```text
Form schema → browser/editing
serverFn validator → web-server input
Confect Args → backend application function contract
```

Use TanStack Intent/current package guidance for exact APIs.
