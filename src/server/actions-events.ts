/** Publishing helpers for live board updates (the same live connection that carries presence and chat). */
import { hub } from "./realtime";
import type { CompanyId, ID, TeamMember } from "@/types/models";

const who = (me: Pick<TeamMember, "id" | "name">) => ({ by: me.name.trim().split(/\s+/)[0] || me.name, byId: me.id });

/** Board work changed. Everyone connected hears it — the board is shared by the whole workspace. */
export function publishTasks(companyId: CompanyId, change: "created" | "updated" | "deleted", taskIds: ID[], me: Pick<TeamMember, "id" | "name">) {
  if (!taskIds.length) return;
  hub.emit({ type: "task", change, companyId, taskIds: taskIds.slice(0, 200), ...who(me) }, "all");
}

export function publishSprint(companyId: CompanyId, change: "created" | "updated" | "deleted" | "started" | "completed", sprintId: ID, me: Pick<TeamMember, "id" | "name">) {
  hub.emit({ type: "sprint", change, companyId, sprintId, ...who(me) }, "all");
}
