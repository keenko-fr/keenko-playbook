---
__default__: patch
---

Reduce GitHub Actions usage for Keenko and newly generated applications.

Cancel superseded CI runs when newer commits are pushed to the same pull request, skip runner work while pull requests are drafts, and add bounded workflow timeouts.

Apply the same CI lifecycle to the generated application `check.yml` template so new Keenko projects avoid unnecessary Actions consumption without weakening merge-ready verification.
