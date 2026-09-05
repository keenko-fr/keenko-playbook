---
keenko: minor
---

Make Keenko an opinionated Nx distribution instead of a parallel lifecycle CLI. Workspace creation, migrations, synchronization, and release mechanics now use native Nx commands. Generated guidance participates in `nx sync`, existing generated projects receive a forward migration away from `keenko check`, and repository release automation uses a dedicated least-privilege GitHub App for the native Nx Release push.
