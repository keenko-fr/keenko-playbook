import { describe, expect, test } from "bun:test";

import type { ProjectGraph } from "@nx/devkit";

import { findConstraintsFor } from "../node_modules/@nx/eslint-plugin/dist/src/utils/runtime-lint-utils.js";
import {
  findDependencyBoundaryViolations,
  type DependencyConstraint,
  matchesProjectTag,
  validateDependencyBoundaryPolicy,
} from "./dependency-boundaries.js";

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

  test("matches exact, wildcard, glob, and regex source tags like pinned Nx", () => {
    const project = graph.nodes.admin;
    const patterns = ["type:app", "scope:*", "*", "/^scope:(admin|ops)$/", "scope:ops"];
    const projectWithScope = { ...project, data: { ...project.data, tags: ["type:app", "scope:admin"] } };

    for (const sourceTag of patterns) {
      const nxMatches = findConstraintsFor([{ onlyDependOnLibsWithTags: [], sourceTag }], projectWithScope).length > 0;
      expect(matchesProjectTag(sourceTag, projectWithScope.data.tags)).toBe(nxMatches);
    }
  });

  test("uses patterned target tags and rejects the same unmatched relationship", () => {
    const scopedConstraints = [{ onlyDependOnLibsWithTags: ["scope:*"], sourceTag: "type:app" }];
    const allowedGraph: ProjectGraph = {
      ...graph,
      dependencies: { ...graph.dependencies, admin: [{ source: "admin", target: "ui", type: "static" }], shared: [] },
    };
    const rejectedGraph: ProjectGraph = {
      ...graph,
      dependencies: { ...graph.dependencies, admin: [{ source: "admin", target: "web", type: "static" }], shared: [] },
    };

    expect(findDependencyBoundaryViolations(allowedGraph, scopedConstraints)).toEqual([]);
    expect(findDependencyBoundaryViolations(rejectedGraph, scopedConstraints)).toEqual([
      expect.objectContaining({ source: "admin", target: "web" }),
    ]);
  });
});
