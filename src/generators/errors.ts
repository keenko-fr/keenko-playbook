import { Schema as S } from "effect";

// TANSTACK CREATE--------------------------------------------------------------------------------------------------------------------------
export const sTanStackCreateIssue = S.Literals(["framework_unavailable", "generation_failed", "unexpected_command", "unexpected_output"]);

export class TanStackCreateFailure extends S.TaggedError<TanStackCreateFailure>()("TanStackCreateFailure", {
  cause: S.optional(S.Defect()),
  issue: sTanStackCreateIssue,
}) {}

// WORKSPACE -------------------------------------------------------------------------------------------------------------------------------
export const sWorkspaceIssue = S.Literals(["target_occupied"]);

export class WorkspaceFailure extends S.TaggedError<WorkspaceFailure>()("WorkspaceFailure", {
  issue: sWorkspaceIssue,
}) {}

// GUIDANCE --------------------------------------------------------------------------------------------------------------------------------
export class GuidanceFailure extends S.TaggedError<GuidanceFailure>()("GuidanceFailure", {
  issue: S.Literals(["invalid_routing_markers"]),
  path: S.String,
}) {}
