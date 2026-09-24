export { default as presetGenerator } from "./generators/preset/preset.js";
export type { PresetGeneratorSchema } from "./generators/preset/schema.js";
export { findDependencyBoundaryViolations, verifyWorkspaceDependencyBoundaries } from "./dependency-boundaries.js";
export type { DependencyBoundaryViolation, DependencyConstraint } from "./dependency-boundaries.js";
