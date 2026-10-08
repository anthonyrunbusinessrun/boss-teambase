"use client";

import { useState } from "react";
import { MessageSquare, UserRound } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Avatar, PresenceDot } from "@/components/shared/Avatar";
import { useApp } from "@/providers/AppProvider";
import { useRealtime } from "@/providers/RealtimeProvider";
import { cx } from "@/lib/utils";
import type { ChannelMember, ID } from "@/types/models";
import styles from "./Channels.module.css";

/**
 * The people in this conversation — registered accounts only, each with a live online/offline dot.
 * Every member is selectable: it opens their card, from which you can start a private 1-on-1 conversation.
 */
export function MembersPanel({ members, onMessage }: { members: ChannelMember[]; onMessage: (memberId: ID) => void }) {
  const { me, openProfile } = useApp();
  const rt = useRealtime();
  const [openId, setOpenId] = useState<ID | null>(null);

  // Live presence once the connection is up; the server's snapshot until then.
  const online = (m: ChannelMember) => (rt.ready ? rt.isOnline(m.id) : m.online);
  const onlineCount = members.filter(online).length;

  return (
    <>
      <p className="section-label">
        Members — {onlineCount} online
      </p>
      {members.length === 0 ? (
        <p className={styles.membersEmpty}>No registered members yet.</p>
      ) : (
        <ul className={styles.members}>
          {members.map((m) => {
            const isOpen = openId === m.id;
            const isMe = m.id === me.id;
            const live = online(m);
            return (
              <li key={m.id} className={styles.memberItem}>
                <button
                  type="button"
                  className={cx(styles.member, isOpen && styles.memberOpen)}
                  aria-expanded={isOpen}
                  aria-controls={`member-card-${m.id}`}
                  onClick={() => setOpenId(isOpen ? null : m.id)}
                >
                  <Avatar initials={m.initials} size={36} />
                  <span className={styles.memberText}>
                    <span className={styles.memberName}>
                      {m.name}
                      {isMe && <span className={styles.you}> (you)</span>}
                    </span>
                    <span className={styles.memberRole}>{m.role}</span>
                  </span>
                  <PresenceDot online={live} />
                </button>
                {isOpen && (
                  <div className={styles.memberCard} id={`member-card-${m.id}`} role="group" aria-label={`${m.name}'s details`}>
                    <dl className={styles.memberFacts}>
                      <div>
                        <dt>Status</dt>
                        <dd className={live ? styles.onlineText : undefined}>{live ? "Online" : "Offline"}</dd>
                      </div>
                      <div>
                        <dt>Department</dt>
                        <dd>{m.department}</dd>
                      </div>
                    </dl>
                    <div className={styles.memberActions}>
                      {isMe ? (
                        <span className={styles.thatsYou}>This is you</span>
                      ) : (
                        <Button variant="primary" size="sm" icon={<MessageSquare size={14} />} onClick={() => onMessage(m.id)}>
                          Send message
                        </Button>
                      )}
                      <Button variant="outline" size="sm" icon={<UserRound size={14} />} onClick={() => openProfile(m.id)}>
                        View profile
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
