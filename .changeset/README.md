# Changesets

Add one Markdown file per user-visible playbook change:

```md
---
bump: minor
---

Add a new optional stack module.
```

`bump` is `patch`, `minor`, or `major`. Breaking convention changes also require a migration note under `migrations/<version>.md` before release.
