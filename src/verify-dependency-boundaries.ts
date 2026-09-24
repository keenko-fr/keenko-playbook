#!/usr/bin/env node
/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch -- The executable adapter maps the reusable verifier's rejected promise to a process diagnostic and exit status. */
import { verifyWorkspaceDependencyBoundaries } from "./dependency-boundaries.js";

try {
  await verifyWorkspaceDependencyBoundaries();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
