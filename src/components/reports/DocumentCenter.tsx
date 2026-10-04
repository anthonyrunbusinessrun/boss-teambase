"use client";

import { useState } from "react";
import { FileText, FileX } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Segmented } from "@/components/shared/Segmented";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { Tag } from "@/components/shared/Tag";
import { UploadReportModal } from "./UploadReportModal";
import { useParamSelection } from "@/hooks/useParamSelection";
import { useNow } from "@/hooks/useNow";
import { useResource } from "@/hooks/useResource";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, reportService } from "@/services";
import { dateKey, formatKeyMonthYear, formatKeyShort, isoWeek } from "@/lib/time";
import { cx } from "@/lib/utils";
import type { ReportTemplate } from "@/types/models";
import styles from "./DocumentCenter.module.css";

type Tab = "all" | "custom";

export function DocumentCenter() {
  const templates = useResource(reportService.templates);
  const [paramSel, setSel] = useParamSelection("template");
  const [tab, setTab] = useState<Tab>("all");
  const [uploading, setUploading] = useState(false);

  if (templates.loading) return <LoadingState label="Loading templates…" />;
  if (templates.error || !templates.data) return <ErrorState message={templates.error ?? "Couldn't load templates."} onRetry={templates.reload} />;

  const all = templates.data;
  const custom = all.filter((t) => t.kind === "custom");
  const visible = tab === "custom" ? custom : all;
  const selected = visible.find((t) => t.id === paramSel) ?? visible[0];

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <div className={styles.head}>
          <h2 className={styles.heading}>Available Company Templates</h2>
          <Segmented<Tab>
            ariaLabel="Template filter"
            tone="blue"
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All Templates" },
              { value: "custom", label: `Custom (${custom.length})` },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <Card variant="neutral">
            <EmptyState
              icon={<FileX size={22} />}
              title="No custom templates yet"
              description="Upload a report to add your own template to the Document Center."
              action={
                <Button variant="outline" onClick={() => setUploading(true)}>
                  Upload report
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className={styles.grid} aria-label="Templates">
            {visible.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} selected={t.id === selected?.id} onSelect={() => setSel(t.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <Preview template={selected} />
      ) : (
        <Card variant="royal" as="aside">
          <EmptyState title="Nothing to preview" description="Pick a template to see it here." />
        </Card>
      )}

      <UploadReportModal
        open={uploading}
        onClose={() => setUploading(false)}
        onSaved={(tpl) => {
          void templates.reload();
          setTab("all");
          setSel(tpl.id);
        }}
      />
    </div>
  );
}

function TemplateCard({ template: t, selected, onSelect }: { template: ReportTemplate; selected: boolean; onSelect: () => void }) {
  return (
    <Card variant="neutral" as="article" flush interactive selected={selected} className={styles.tplCard} aria-label={t.name}>
      <div className={styles.tplTop}>
        <span className={cx(styles.tile, t.kind === "standard" ? styles.tileStandard : styles.tileCustom)} aria-hidden="true">
          <FileText size={20} />
        </span>
        <span className={styles.tplDate}>{formatKeyShort(t.updatedAt)}</span>
      </div>
      <h3 className={styles.tplName}>{t.name}</h3>
      <p className={styles.tplDesc}>{t.description}</p>
      <div className={styles.tplFoot}>
        <Button variant="ghost" onClick={onSelect} aria-label={`Preview draft of ${t.name}`}>
          Preview Draft
        </Button>
        <Button variant={selected ? "primary" : "outline"} onClick={onSelect} aria-pressed={selected} aria-label={`Use ${t.name} template`}>
          Use Template
        </Button>
      </div>
    </Card>
  );
}

function Preview({ template: t }: { template: ReportTemplate }) {
  const toast = useToast();
  const { primaryZone } = useApp();
  const now = useNow();
  const [busy, setBusy] = useState(false);

  const todayKey = now ? dateKey(now, primaryZone.tz) : null;
  const dateLine = todayKey ? `Date: ${formatKeyMonthYear(todayKey)} | Week ${isoWeek(todayKey)}` : "Date: …";

  const createDraft = async () => {
    setBusy(true);
    try {
      const draft = await reportService.createDraft(t.id);
      toast.success(`Draft “${draft.title}” created`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="royal" as="aside" flush className={styles.preview} aria-label="Live template preview">
      <div className={styles.previewHead}>
        <div>
          <h2 className={styles.previewTitle}>Live Template Preview</h2>
          <p className={styles.previewSub}>
            {t.name} {t.version}
          </p>
        </div>
        <Tag tone={t.kind === "standard" ? "standard" : "custom"}>{t.kind === "standard" ? "Standard" : "Custom"}</Tag>
      </div>

      <div id="print-sheet" className={styles.sheet}>
        <h3 className={styles.docTitle}>{t.documentTitle}</h3>
        <p className={styles.docDate} suppressHydrationWarning>
          {dateLine}
        </p>
        {t.sections.map((s, i) => (
          <section key={s.heading} className={styles.docSection}>
            <h4 className={styles.docHeading} data-print-heading>
              {i + 1}. {s.heading}
            </h4>
            {s.body && <p className={styles.docBody}>{s.body}</p>}
            {s.table && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{s.table.columns[0]}</th>
                    <th scope="col">{s.table.columns[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map(([a, b]) => (
                    <tr key={a}>
                      <td style={{ fontWeight: 400 }}>{a}</td>
                      <td>{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      <div className={styles.previewActions}>
        <Button variant="outline" onClick={() => window.print()}>
          Export PDF
        </Button>
        <Button variant="primary" onClick={createDraft} disabled={busy}>
          {busy ? "Creating…" : "Create Draft"}
        </Button>
      </div>
    </Card>
  );
}
