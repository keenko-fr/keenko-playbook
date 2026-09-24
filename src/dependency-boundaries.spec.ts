import { describe, expect, test } from "bun:test";

import type { ProjectGraph } from "@nx/devkit";

import { findDependencyBoundaryViolations, type DependencyConstraint, validateDependencyBoundaryPolicy } from "./dependency-boundaries.js";

const constraints = [
  { onlyDependOnLibsWithTags: ["type:package"], sourceTag: "type:package" },
  { onlyDependOnLibsWithTags: ["scope:backend", "scope:ui", "scope:shared"], sourceTag: "type:app" },
  { onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:backend" },
  { onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:ui" },
  { onlyDependOnLibsWithTags: [], sourceTag: "scope:shared" },
] satisfies readonly DependencyConstraint[];

const graph = {
  dependencies: {
    admin: [{ source: "admin", target: "web", type: "static" }],
    shared: [{ source: "shared", target: "ui", type: "static" }],
    ui: [],
    web: [],
  },
  externalNodes: {},
  nodes: {
    admin: { data: { root: "apps/admin", tags: ["type:app"] }, name: "admin", type: "app" },
    shared: { data: { root: "packages/shared", tags: ["type:package", "scope:shared"] }, name: "shared", type: "lib" },
    ui: { data: { root: "packages/ui", tags: ["type:package", "scope:ui"] }, name: "ui", type: "lib" },
    web: { data: { root: "apps/web", tags: ["type:app"] }, name: "web", type: "app" },
  },
} satisfies ProjectGraph;

describe("dependency-boundary graph verifier", () => {
  test("applies the shared policy to every internal Nx project edge", () => {
    const violations = findDependencyBoundaryViolations(graph, constraints);

    expect(violations.map(({ constraint, source, target }) => [source, target, constraint?.sourceTag])).toEqual([
      ["admin", "web", "type:app"],
      ["shared", "ui", "scope:shared"],
    ]);
  });

  test("allows an application to depend on the baseline package scopes", () => {
    const allowedGraph: ProjectGraph = {
      ...graph,
      dependencies: { ...graph.dependencies, admin: [{ source: "admin", target: "ui", type: "static" }] },
    };

    expect(findDependencyBoundaryViolations(allowedGraph, constraints)).toEqual([
      expect.objectContaining({ source: "shared", target: "ui" }),
    ]);
  });

  test("loads the narrow shared policy and evaluates it normally", () => {
    const loaded = validateDependencyBoundaryPolicy({ dependencyConstraints: constraints });

    expect(findDependencyBoundaryViolations(graph, loaded)).toHaveLength(2);
  });

  test("rejects unsupported policy semantics instead of silently ignoring them", () => {
    expect(() =>
      validateDependencyBoundaryPolicy({
        dependencyConstraints: [
          {
            notDependOnLibsWithTags: ["type:app"],
            onlyDependOnLibsWithTags: ["scope:shared"],
            sourceTag: "scope:backend",
          },
        ],
      })
    ).toThrow("supports only sourceTag and onlyDependOnLibsWithTags for internal project dependency direction");
  });
});
