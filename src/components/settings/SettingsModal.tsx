"use client";

import { Button } from "@/components/buttons/Button";
import { Dropdown } from "@/components/forms/Dropdown";
import { Field } from "@/components/forms/Field";
import { Switch } from "@/components/forms/Switch";
import { Modal } from "@/components/modals/Modal";
import { Avatar } from "@/components/shared/Avatar";
import { Segmented } from "@/components/shared/Segmented";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage } from "@/services";
import { formatUtcOffset } from "@/lib/time";
import { ZONES, zoneAbbr } from "@/lib/zones";
import type { NotificationPrefs, Settings } from "@/types/models";
import styles from "./SettingsModal.module.css";

const NOTIFICATION_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "messages", label: "Messages and channels", description: "New messages in your channels and direct messages." },
  { key: "tasks", label: "Task assignments", description: "When a task is assigned to you or changes status." },
  { key: "meetings", label: "Meeting reminders", description: "Scheduled meetings and upcoming agenda items." },
  { key: "budget", label: "Budget requests", description: "Budget requests that need your review." },
];

/** Basic settings, applied as you change them. Kept small on purpose. */
export function SettingsModal() {
  const { settingsOpen, closeSettings, settings, updateSettings, me, openProfile } = useApp();
  const toast = useToast();

  const apply = async (changes: Parameters<typeof updateSettings>[0], message = "Settings updated") => {
    try {
      await updateSettings(changes);
      toast.success(message);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const now = new Date();
  const zoneOptions = ZONES.map((z) => ({
    value: z.id,
    label: `${z.city} · ${zoneAbbr(z, now)} (${formatUtcOffset(now, z.tz)})`,
  }));

  return (
    <Modal
      open={settingsOpen}
      onClose={closeSettings}
      title="Settings"
      subtitle="Changes apply right away."
      size="md"
      footer={
        <Button variant="outline" onClick={closeSettings}>
          Done
        </Button>
      }
    >
      <div className={styles.account}>
        <Avatar initials={me.initials} size={40} />
        <div className={styles.accountText}>
          <div className={styles.accountName}>{me.name}</div>
          <div className={styles.accountRole}>
            {me.role} · {me.department}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            closeSettings();
            openProfile();
          }}
        >
          Edit profile
        </Button>
      </div>

      <section className={styles.section} aria-labelledby="set-tz">
        <h3 className={styles.sectionTitle} id="set-tz">
          Time zones
        </h3>
        <p className={styles.sectionText}>The two clocks pinned in the header. Events are shown in your primary time zone.</p>
        <div className={styles.zones}>
          <Field label="Primary">
            <Dropdown
              ariaLabel="Primary time zone"
              value={settings.primaryZoneId}
              options={zoneOptions}
              onChange={(v) => apply({ primaryZoneId: v }, "Primary time zone updated")}
            />
          </Field>
          <Field label="Secondary">
            <Dropdown
              ariaLabel="Secondary time zone"
              value={settings.secondaryZoneId}
              options={zoneOptions}
              onChange={(v) => apply({ secondaryZoneId: v }, "Secondary time zone updated")}
            />
          </Field>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="set-appearance">
        <h3 className={styles.sectionTitle} id="set-appearance">
          Appearance
        </h3>
        <p className={styles.sectionText}>Teambase ships in the dark theme.</p>
        <div className={styles.rows + " " + styles.divided}>
          <div style={{ padding: "6px 0 12px" }}>
            <Segmented<Settings["theme"] | "light">
              ariaLabel="Theme"
              tone="blue"
              value={settings.theme}
              onChange={() => undefined}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light", disabled: true, title: "Light theme hasn't been designed yet" },
              ]}
            />
            <p className={styles.note}>Light theme isn&apos;t designed yet.</p>
          </div>
          <Switch
            label="Reduce motion"
            description="Turn off transitions and animations."
            checked={settings.reduceMotion}
            onChange={(v) => apply({ reduceMotion: v })}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="set-notifs">
        <h3 className={styles.sectionTitle} id="set-notifs">
          Notifications
        </h3>
        <p className={styles.sectionText}>Choose what shows up in the bell.</p>
        <div className={styles.rows + " " + styles.divided}>
          {NOTIFICATION_ROWS.map((row) => (
            <Switch
              key={row.key}
              label={row.label}
              description={row.description}
              checked={settings.notifications[row.key]}
              onChange={(v) => apply({ notifications: { [row.key]: v } })}
            />
          ))}
        </div>
      </section>
    </Modal>
  );
}
