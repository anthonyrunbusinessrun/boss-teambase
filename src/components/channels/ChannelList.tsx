import { PresenceDot } from "@/components/shared/Avatar";
import { cx } from "@/lib/utils";
import type { Conversation } from "@/types/models";
import styles from "./Channels.module.css";

interface ChannelListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Favorites · Channels · Direct Messages (design §6.13). */
export function ChannelList({ conversations, selectedId, onSelect }: ChannelListProps) {
  const favorites = conversations.filter((c) => c.favorite);
  const channels = conversations.filter((c) => c.type === "channel" && !c.favorite);
  const dms = conversations.filter((c) => c.type === "dm" && !c.favorite);

  const row = (c: Conversation) => {
    const active = c.id === selectedId;
    return (
      <li key={c.id}>
        <button
          type="button"
          className={cx(styles.row, active && styles.rowActive, c.unread > 0 && !active && styles.rowUnread)}
          aria-current={active ? "true" : undefined}
          onClick={() => onSelect(c.id)}
        >
          {c.type === "dm" && <PresenceDot online={!!c.peer?.online} />}
          <span className={styles.rowName}>{c.type === "channel" ? `# ${c.name}` : c.name}</span>
          {c.unread > 0 && !active && (
            <span className={styles.unreadBadge} aria-label={`${c.unread} unread`}>
              {c.unread}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <nav className={styles.list} aria-label="Conversations">
      <section className={styles.group} aria-labelledby="grp-fav">
        <h2 id="grp-fav" className={`section-label ${styles.groupLabel}`}>
          Favorites
        </h2>
        {favorites.length ? <ul>{favorites.map(row)}</ul> : <p className={styles.groupHint}>Pin a channel to keep it here.</p>}
      </section>
      <section className={styles.group} aria-labelledby="grp-ch">
        <h2 id="grp-ch" className={`section-label ${styles.groupLabel}`}>
          Channels
        </h2>
        <ul>{channels.map(row)}</ul>
      </section>
      <section className={styles.group} aria-labelledby="grp-dm">
        <h2 id="grp-dm" className={`section-label ${styles.groupLabel}`}>
          Direct Messages
        </h2>
        <ul>{dms.map(row)}</ul>
      </section>
    </nav>
  );
}
