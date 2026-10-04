"use client";

import { useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Modal } from "@/components/modals/Modal";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/States";
import { useApp } from "@/providers/AppProvider";
import { buildOrgTree, type OrgNode } from "@/lib/org";
import { cx } from "@/lib/utils";
import type { TeamMember } from "@/types/models";
import styles from "./Team.module.css";

/** Reporting structure built from each member's `managerId`. Click a node to open their profile. */
export function OrgChart({ members }: { members: TeamMember[] }) {
  const { openProfile } = useApp();
  const [expanded, setExpanded] = useState(false);
  const tree = useMemo(() => buildOrgTree(members), [members]);

  return (
    <Card variant="neutral" as="section" flush className={styles.chartCard} aria-labelledby="org-title">
      <div className={styles.chartHead}>
        <div>
          <h2 id="org-title" className={styles.chartTitle}>
            Organizational Chart
          </h2>
          <p className={styles.chartSub}>Reporting structure &amp; team hierarchy</p>
        </div>
        <Button variant="compact" icon={<Maximize2 size={13} />} onClick={() => setExpanded(true)}>
          Expand Chart
        </Button>
      </div>
      <div className={styles.chartScroll}>
        <Chart tree={tree} onOpen={openProfile} />
      </div>

      <Modal open={expanded} onClose={() => setExpanded(false)} title="Organizational Chart" subtitle="Reporting structure & team hierarchy" size="xl">
        <div className={cx(styles.chartScroll, styles.chartScrollTall)} style={{ marginTop: 0 }}>
          <Chart tree={tree} onOpen={(id) => { setExpanded(false); openProfile(id); }} />
        </div>
      </Modal>
    </Card>
  );
}

function Chart({ tree, onOpen }: { tree: OrgNode[]; onOpen: (id: string) => void }) {
  if (tree.length === 0) {
    return <EmptyState title="No one on the chart yet" description="Add team members and choose who they report to." />;
  }
  return (
    <div className={styles.chartInner}>
      <ul className={styles.tree} aria-label="Organizational chart">
        {tree.map((n) => (
          <Branch key={n.member.id} node={n} root onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function Branch({ node, root, onOpen }: { node: OrgNode; root?: boolean; onOpen: (id: string) => void }) {
  const { member } = node;
  return (
    <li>
      <button type="button" className={cx(styles.node, root && styles.nodeRoot)} onClick={() => onOpen(member.id)} aria-label={`${member.name}, ${member.role}. Open profile`}>
        <Avatar initials={member.initials} size={44} />
        <span>
          <span className={styles.nodeName} style={{ display: "block" }}>
            {member.name}
          </span>
          <span className={styles.nodeRole} style={{ display: "block" }}>
            {member.role}
          </span>
        </span>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <Branch key={c.member.id} node={c} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}
