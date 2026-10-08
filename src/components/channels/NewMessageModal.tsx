"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Modal } from "@/components/modals/Modal";
import { SearchInput } from "@/components/forms/Inputs";
import { Avatar, PresenceDot } from "@/components/shared/Avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { useResource } from "@/hooks/useResource";
import { useRealtime } from "@/providers/RealtimeProvider";
import { channelService } from "@/services";
import type { ID } from "@/types/models";
import styles from "./Channels.module.css";

interface NewMessageModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen member; the caller opens (or creates) the conversation. */
  onPick: (memberId: ID) => void | Promise<void>;
}

export function NewMessageModal({ open, onClose, onPick }: NewMessageModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="New message" subtitle="Start a private conversation with a teammate." size="sm">
      {open && <Picker onPick={onPick} />}
    </Modal>
  );
}

function Picker({ onPick }: { onPick: NewMessageModalProps["onPick"] }) {
  const people = useResource(channelService.directory);
  const rt = useRealtime();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<ID | null>(null);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (people.data ?? []).filter((m) => !q || [m.name, m.role, m.department].some((f) => f.toLowerCase().includes(q))), [people.data, q]);

  if (people.loading) return <LoadingState label="Loading people…" />;
  if (people.error || !people.data) return <ErrorState message={people.error ?? "Couldn't load people."} onRetry={people.reload} />;
  if (people.data.length === 0) {
    return <EmptyState icon={<Users size={22} />} title="No one else has registered yet" description="Teammates appear here once they've created and verified their Teambase account." />;
  }

  return (
    <div>
      <SearchInput placeholder="Search by name or role…" aria-label="Search people" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
      {shown.length === 0 ? (
        <p className={styles.pickerEmpty}>No one matches “{query.trim()}”.</p>
      ) : (
        <ul className={styles.pickerList} aria-label="People you can message">
          {shown.map((m) => {
            const live = rt.ready ? rt.isOnline(m.id) : m.online;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={styles.pickerRow}
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(m.id);
                    try {
                      await onPick(m.id);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <Avatar initials={m.initials} size={36} />
                  <span className={styles.memberText}>
                    <span className={styles.memberName}>{m.name}</span>
                    <span className={styles.memberRole}>
                      {m.role} · {m.department}
                    </span>
                  </span>
                  <PresenceDot online={live} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
