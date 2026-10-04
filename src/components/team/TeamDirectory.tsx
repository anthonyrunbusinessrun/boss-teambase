"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Dropdown } from "@/components/forms/Dropdown";
import { SearchInput } from "@/components/forms/Inputs";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/States";
import { Tag } from "@/components/shared/Tag";
import { MemberFormModal } from "./MemberFormModal";
import { OrgChart } from "./OrgChart";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { channelService, errorMessage } from "@/services";
import type { TeamMember } from "@/types/models";
import styles from "./Team.module.css";

export function TeamDirectory() {
  const { members, me, openProfile } = useApp();
  const toast = useToast();
  const router = useRouter();
  const memberParam = useSearchParams().get("member");

  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [role, setRole] = useState("all");
  const [adding, setAdding] = useState(false);
  const [chatBusy, setChatBusy] = useState<string | null>(null);

  // Deep link (?member=id) from search: open that profile, then tidy the URL.
  useEffect(() => {
    if (!memberParam) return;
    if (members.some((m) => m.id === memberParam)) openProfile(memberParam);
    router.replace("/team", { scroll: false });
  }, [memberParam, members, openProfile, router]);

  const departments = useMemo(() => Array.from(new Set(members.map((m) => m.department))).sort(), [members]);
  const roles = useMemo(() => Array.from(new Set(members.map((m) => m.role))).sort(), [members]);

  // A filter pointing at something that no longer exists (member edited or deleted) falls back to "all".
  const activeDept = dept === "all" || departments.includes(dept) ? dept : "all";
  const activeRole = role === "all" || roles.includes(role) ? role : "all";

  const q = query.trim().toLowerCase();
  const visible = members.filter(
    (m) =>
      (!q || [m.name, m.role, m.department, ...m.skills].some((f) => f.toLowerCase().includes(q))) &&
      (activeDept === "all" || m.department === activeDept) &&
      (activeRole === "all" || m.role === activeRole),
  );
  const filtering = !!q || activeDept !== "all" || activeRole !== "all";

  const clear = () => {
    setQuery("");
    setDept("all");
    setRole("all");
  };

  const chat = async (m: TeamMember) => {
    setChatBusy(m.id);
    try {
      const convo = await channelService.openDirect(m.id);
      router.push(`/channels?c=${convo.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setChatBusy(null);
    }
  };

  return (
    <div className={styles.page}>
      <Card variant="bento" as="section" flush className={styles.toolbar} aria-label="Find people">
        <SearchInput
          wrapperClassName={styles.toolbarSearch}
          placeholder="Search employees by name, role, or skill…"
          aria-label="Search employees by name, role, or skill"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.toolbarSelect}>
          <Dropdown
            ariaLabel="Filter by department"
            value={activeDept}
            onChange={setDept}
            options={[{ value: "all", label: "All Departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
        </div>
        <div className={styles.toolbarSelect}>
          <Dropdown
            ariaLabel="Filter by role"
            value={activeRole}
            onChange={setRole}
            options={[{ value: "all", label: "All Roles" }, ...roles.map((r) => ({ value: r, label: r }))]}
          />
        </div>
        <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
          Add Member
        </Button>
      </Card>

      {visible.length === 0 ? (
        <Card variant="neutral">
          <EmptyState
            icon={<UsersRound size={22} />}
            title={filtering ? "No one matches these filters" : "No team members yet"}
            description={filtering ? "Try a different name, role or skill, or clear the filters." : "Add your first team member to get started."}
            action={
              filtering ? (
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add Member
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className={styles.grid} aria-label={`${visible.length} team members`}>
          {visible.map((m) => (
            <li key={m.id}>
              <Card variant="neutral" as="article" flush interactive className={styles.memberCard} style={{ height: "100%" }}>
                <div className={styles.memberTop}>
                  <Avatar initials={m.initials} size={56} />
                  <Tag tone={m.status === "active" ? "active" : "offline"}>{m.status === "active" ? "Active" : "Offline"}</Tag>
                </div>
                <h3 className={styles.memberName}>
                  {m.name}
                  {m.id === me.id && <span className={styles.you}>You</span>}
                </h3>
                <p className={styles.memberRole}>{m.role}</p>
                <p className={styles.memberDept}>{m.department}</p>
                <div className={styles.memberActions}>
                  <Button variant="tint" onClick={() => chat(m)} disabled={m.id === me.id || chatBusy === m.id} title={m.id === me.id ? "That's you" : `Message ${m.name}`}>
                    Chat
                  </Button>
                  <Button variant="compact" style={{ height: 32 }} onClick={() => openProfile(m.id)}>
                    Profile
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <OrgChart members={members} />

      <MemberFormModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
