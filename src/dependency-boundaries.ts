import path from "node:path"; // oxlint-disable-line effect/noNodeBuiltinImport -- CLI adapter resolves the project-owned policy from the current workspace.
import { pathToFileURL } from "node:url";

/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNodeBuiltinImport, effect/noNullish, effect/noRuntimeTypeof, effect/noThrowStatement, effect/noUnknownParameters, eslint/require-unicode-regexp, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- This CLI boundary loads project-owned TypeScript policy and Nx's untyped runtime graph module, reproduces Nx 23.2.1's flagless tag regexes, then reports verification failures synchronously to its caller. */
import { createProjectGraphAsync, type ProjectGraph } from "@nx/devkit";

export interface DependencyConstraint {
  readonly onlyDependOnLibsWithTags: readonly string[];
  readonly sourceTag: string;
}

export interface DependencyBoundaryViolation {
  readonly constraint: DependencyConstraint | undefined;
  readonly source: string;
  readonly sourceTags: readonly string[];
  readonly target: string;
  readonly targetTags: readonly string[];
}

export const findDependencyBoundaryViolations = (
  graph: ProjectGraph,
  constraints: readonly DependencyConstraint[]
): readonly DependencyBoundaryViolation[] => {
  const violations: DependencyBoundaryViolation[] = [];

  for (const [source, dependencies] of Object.entries(graph.dependencies)) {
    const sourceNode = graph.nodes[source];
    if (sourceNode === undefined) continue;
    const sourceTags = sourceNode.data.tags ?? [];
    const matchingConstraints = constraints.filter(({ sourceTag }) => matchesProjectTag(sourceTag, sourceTags));

    for (const { target } of dependencies) {
      const targetNode = graph.nodes[target];
      if (targetNode === undefined) continue;
      const targetTags = targetNode.data.tags ?? [];
      if (matchingConstraints.length === 0) {
        violations.push({ constraint: undefined, source, sourceTags, target, targetTags });
        continue;
      }
      for (const constraint of matchingConstraints) {
        if (constraint.onlyDependOnLibsWithTags.some((tag) => matchesProjectTag(tag, targetTags))) continue;
        violations.push({ constraint, source, sourceTags, target, targetTags });
      }
    }
  }

  return violations;
};

export const matchesProjectTag = (pattern: string, projectTags: readonly string[]) => {
  if (pattern === "*") return true;
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    const matcher = new RegExp(pattern.slice(1, -1));
    return projectTags.some((tag) => matcher.test(tag));
  }
  if (pattern.includes("*")) {
    // Nx 23.2.1 maps every wildcard run (and `.*`) to `.*` without interpreting other glob syntax.
    const mappedWildcards = pattern.split(/(?:\.\*)|\*+/u).join(".*");
    const matcher = new RegExp(`^${new RegExp(mappedWildcards).source}$`);
    return projectTags.some((tag) => matcher.test(tag));
  }
  return projectTags.includes(pattern);
};

export const validateDependencyBoundaryPolicy = (
  value: unknown,
  policyPath = "tools/dependency-boundaries.ts"
): readonly DependencyConstraint[] => {
  if (!isPolicyModule(value))
    throw new Error(
      `Invalid dependency-boundary policy in ${policyPath}. The shared Keenko graph policy supports only sourceTag and onlyDependOnLibsWithTags for internal project dependency direction.`
    );
  return value.dependencyConstraints;
};

export const verifyWorkspaceDependencyBoundaries = async (policyPath = "tools/dependency-boundaries.ts") => {
  const policyModule: unknown = await import(pathToFileURL(path.resolve(policyPath)).href);
  const dependencyConstraints = validateDependencyBoundaryPolicy(policyModule, policyPath);
  const graph = await createProjectGraphAsync({ exitOnError: false });
  const violations = findDependencyBoundaryViolations(graph, dependencyConstraints);
  if (violations.length === 0) return;

  const diagnostics = violations.map(({ constraint, source, sourceTags, target, targetTags }) => {
    const requirement =
      constraint === undefined
        ? "no dependency constraint matches the source project"
        : `${constraint.sourceTag} may depend only on [${constraint.onlyDependOnLibsWithTags.join(", ") || "no internal projects"}]`;
    return `- ${source} [${sourceTags.join(", ")}] -> ${target} [${targetTags.join(", ")}]: ${requirement}`;
  });
  throw new Error(`Forbidden Nx project dependencies:\n${diagnostics.join("\n")}`);
};

const isPolicyModule = (value: unknown): value is { dependencyConstraints: readonly DependencyConstraint[] } => {
  if (typeof value !== "object" || value === null || !("dependencyConstraints" in value)) return false;
  const { dependencyConstraints } = value;
  return (
    Array.isArray(dependencyConstraints) &&
    dependencyConstraints.every(
      (constraint: unknown) =>
        typeof constraint === "object" &&
        constraint !== null &&
        Reflect.ownKeys(constraint).length === 2 &&
        Reflect.ownKeys(constraint).every((key) => key === "sourceTag" || key === "onlyDependOnLibsWithTags") &&
        "sourceTag" in constraint &&
        typeof constraint.sourceTag === "string" &&
        "onlyDependOnLibsWithTags" in constraint &&
        Array.isArray(constraint.onlyDependOnLibsWithTags) &&
        constraint.onlyDependOnLibsWithTags.every((tag: unknown) => typeof tag === "string")
    )
  );
};
