export type ProjectScope = "scope:web" | "scope:backend" | "scope:ui" | "scope:shared";

export const KEENKO_BOUNDARY_CONSTRAINTS: readonly {
  onlyDependOnLibsWithTags: readonly ProjectScope[];
  sourceTag: ProjectScope;
}[] = [
  { onlyDependOnLibsWithTags: ["scope:backend", "scope:ui", "scope:shared"], sourceTag: "scope:web" },
  { onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:backend" },
  { onlyDependOnLibsWithTags: ["scope:shared"], sourceTag: "scope:ui" },
  { onlyDependOnLibsWithTags: [], sourceTag: "scope:shared" },
];

export function allowedProjectScopes(scope: ProjectScope): readonly ProjectScope[] {
  const constraint = KEENKO_BOUNDARY_CONSTRAINTS.find(({ sourceTag }) => sourceTag === scope);
  if (constraint === undefined) {
    throw new Error(`Missing Keenko boundary constraint for ${scope}`);
  }
  return constraint.onlyDependOnLibsWithTags;
}
