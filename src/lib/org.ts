import type { ID, TeamMember } from "@/types/models";

/** All members below `id` in the reporting tree (used to prevent reporting loops). */
export function getDescendantIds(members: TeamMember[], id: ID): Set<ID> {
  const out = new Set<ID>();
  const walk = (parent: ID) => {
    for (const m of members) {
      if (m.managerId === parent && !out.has(m.id)) {
        out.add(m.id);
        walk(m.id);
      }
    }
  };
  walk(id);
  return out;
}

export interface OrgNode {
  member: TeamMember;
  children: OrgNode[];
}

/** Build the org-chart forest from `managerId` links (multiple roots are allowed). */
export function buildOrgTree(members: TeamMember[]): OrgNode[] {
  const ids = new Set(members.map((m) => m.id));
  const build = (m: TeamMember): OrgNode => ({
    member: m,
    children: members.filter((c) => c.managerId === m.id).map(build),
  });
  return members.filter((m) => !m.managerId || !ids.has(m.managerId)).map(build);
}
