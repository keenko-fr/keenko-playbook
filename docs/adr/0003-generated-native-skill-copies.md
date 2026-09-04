# ADR 0003: generated native skill copies

## Status

Accepted.

## Decision

The canonical generated skill copy lives under `.keenko/skills/`. Keenko generates native copies under `.agents/skills/` and `.claude/skills/`.

Generated native skill directories carry a marker and Keenko may overwrite only directories it generated. Existing human-owned skill directories are never silently replaced.

## Why

Native discovery is reliable across supported harnesses and platforms. Symlinks add portability problems, while independently maintained copies drift.
