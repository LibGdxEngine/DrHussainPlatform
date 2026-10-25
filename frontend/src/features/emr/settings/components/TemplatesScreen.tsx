"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  contentApi, type EmailTemplate, type EmailTemplateVersion, type Leaflet, type Placeholder, type TemplateKind,
  type TemplatePreview,
} from "@/lib/api/emr/content";
import { formatDay } from "../../format";
import { ActionButton } from "../../ui/Action";
import { ChipGroup } from "../../ui/ChipGroup";
import { Field, TextArea, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { settingsError } from "../errors";
import { Notice, type NoticeState } from "./Notice";
import { SettingsHeader } from "./SettingsHeader";

const kindLabel: Record<TemplateKind, string> = {
  results: "Normal results",
  menopause: "Menopause / perimenopause",
  follow_up: "Follow-up comparison",
  infection: "Infections and STIs",
  pathology: "Pathology",
  smear: "Cervical smear",
  reply: "Replies about prescriptions",
};
const kindOrder = Object.keys(kindLabel) as TemplateKind[];
type LanguageFilter = "en" | "ar";
const languages: { id: LanguageFilter; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ar", label: "Arabic" },
];

function status(template: EmailTemplate): { tone: "ok" | "amber" | "danger"; text: string } {
  if (!template.approved) return { tone: "danger", text: "Not approved" };
  if (template.latest && template.latest.number !== template.approved.number) {
    return { tone: "amber", text: `v${template.approved.number} approved · v${template.latest.number} draft` };
  }
  return { tone: "ok", text: `v${template.approved.number} approved` };
}

/** Email templates: the clinic's wording for every results email, versioned and approved by the doctor. */
export function TemplatesScreen() {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [leaflets, setLeaflets] = useState<Leaflet[]>([]);
  const [language, setLanguage] = useState<LanguageFilter>("en");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([contentApi.templates.list(), contentApi.placeholders(), contentApi.leaflets.list()]).then(
      ([list, names, files]) => {
        if (cancelled) return;
        setTemplates(list);
        setPlaceholders(names);
        setLeaflets(files);
      },
      (err: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: settingsError(err, "Could not load the templates.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // In the order the list shows them: by email type, then the template's own order.
  const shown = useMemo(
    () =>
      (templates ?? [])
        .filter((t) => t.language === language)
        .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [templates, language],
  );
  const selected = shown.find((t) => t.id === selectedId) ?? shown[0] ?? null;
  const unapproved = (templates ?? []).filter((t) => !t.approved && t.language === "en").length;

  const replace = (next: EmailTemplate) =>
    setTemplates((prev) => {
      const list = prev ?? [];
      return list.some((t) => t.id === next.id) ? list.map((t) => (t.id === next.id ? next : t)) : [...list, next];
    });

  return (
    <>
      <SettingsHeader
        tab="templates"
        title="Email templates"
        description="The clinic's wording for each results email. The guidelines decide the clinical content; these templates decide the patient wording. Drafts are only ever built from an approved version, and every version is kept with its date."
        actions={
          unapproved ? (
            <span className="text-[13px] font-semibold text-warn-ink">{unapproved} templates still need approved wording</span>
          ) : null
        }
      />
      <Notice notice={notice} />
      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)_minmax(0,0.9fr)]">
        <Panel aria-label="Templates" className="flex flex-col gap-3 p-4">
          <ChipGroup label="Language" options={languages} value={language} onChange={setLanguage} />
          {!templates ? <p className="m-0 text-[13px] text-muted">Loading…</p> : null}
          {templates && !shown.length ? (
            <p className="m-0 text-[13px] text-muted">No Arabic templates yet. Open an English one and choose “Add Arabic version”.</p>
          ) : null}
          {kindOrder.map((kind) => {
            const group = shown.filter((t) => t.kind === kind);
            if (!group.length) return null;
            return (
              <div key={kind} className="flex flex-col gap-1">
                <h2 className="m-0 px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{kindLabel[kind]}</h2>
                {group.map((t) => {
                  const s = status(t);
                  const active = t.id === selected?.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1 rounded-xl border-0 px-3 py-2 text-start text-[13px]",
                        active ? "bg-brand-tint text-brand-ink" : "bg-transparent text-ink-2 hover:bg-canvas",
                      )}
                    >
                      <span className={cn(active && "font-semibold")}>{t.name}</span>
                      <Pill tone={s.tone} size="xs" className="self-start">{s.text}</Pill>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Panel>
        {selected ? (
          <TemplateEditor
            key={selected.id}
            template={selected}
            placeholders={placeholders}
            leaflets={leaflets}
            hasArabic={(templates ?? []).some((t) => t.key === selected.key && t.language === "ar")}
            onSaved={replace}
            onArabicCreated={(t) => {
              replace(t);
              setLanguage("ar");
              setSelectedId(t.id);
            }}
          />
        ) : null}
      </div>
    </>
  );
}

interface TemplateEditorProps {
  template: EmailTemplate;
  placeholders: Placeholder[];
  leaflets: Leaflet[];
  hasArabic: boolean;
  onSaved: (template: EmailTemplate) => void;
  onArabicCreated: (template: EmailTemplate) => void;
}

function TemplateEditor({ template, placeholders, leaflets, hasArabic, onSaved, onArabicCreated }: TemplateEditorProps) {
  const latest = template.latest;
  const [subject, setSubject] = useState(latest?.subject ?? "");
  const [body, setBody] = useState(latest?.body ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [history, setHistory] = useState<EmailTemplateVersion[] | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = subject !== (latest?.subject ?? "") || body !== (latest?.body ?? "");
  const latestUnapproved = latest && (!template.approved || template.approved.number !== latest.number);

  useEffect(() => {
    let cancelled = false;
    contentApi.templates.history(template.id).then((list) => !cancelled && setHistory(list), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [template.id, historyKey]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      contentApi.templates.preview(subject, body).then((p) => !cancelled && setPreview(p), () => undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subject, body]);

  function insert(name: string) {
    const area = bodyRef.current;
    const token = `{{${name}}}`;
    const start = area?.selectionStart ?? body.length;
    const end = area?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function run(action: () => Promise<EmailTemplate>, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await action();
      onSaved(saved);
      setHistoryKey((k) => k + 1);
      setNotice({ tone: "ok", text: done });
      return saved;
    } catch (err) {
      setNotice({ tone: "error", text: settingsError(err, "Could not save the template.") });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const save = (approve: boolean) =>
    run(
      () => contentApi.templates.saveVersion(template.id, { subject, body, note, approve }),
      approve ? "Saved and approved. New drafts use this wording." : "Saved as a draft. Approve it to use it in emails.",
    ).then((saved) => saved && setNote(""));

  async function addArabic() {
    setBusy(true);
    setNotice(null);
    try {
      const created = await contentApi.templates.create({
        key: template.key, language: "ar", name: `${template.name} (Arabic)`, kind: template.kind,
        part: template.part, section_key: template.section_key, sort_order: template.sort_order,
        subject: latest?.subject ?? "", body: latest?.body ?? "",
      });
      onArabicCreated(created);
    } catch (err) {
      setNotice({ tone: "error", text: settingsError(err, "Could not add the Arabic version.") });
    } finally {
      setBusy(false);
    }
  }

  const toggleLeaflet = (id: string) => {
    const current = template.default_leaflets ?? [];
    const next = current.includes(id) ? current.filter((l) => l !== id) : [...current, id];
    void run(() => contentApi.templates.update(template.id, { default_leaflets: next }), "Default leaflets saved.");
  };

  return (
    <>
      <Panel aria-labelledby="tpl" className="flex flex-col gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="tpl" className="m-0 text-lg font-semibold">{template.name}</h2>
          <Pill tone="neutral" size="xs">{template.language === "ar" ? "Arabic" : "English"}</Pill>
          {template.part !== "full" ? <Pill tone="brand" size="xs">{template.part}</Pill> : null}
        </div>
        <Field label="Subject">
          <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} dir="auto" />
        </Field>
        <Field label="Wording">
          <TextArea
            ref={bodyRef}
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            dir="auto"
            className="font-emr-mono text-[13px]"
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Insert</span>
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((p) => (
              <button
                key={p.name}
                type="button"
                title={p.description}
                onClick={() => insert(p.name)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 font-emr-mono text-[11px]",
                  p.filled === "review" ? "border-warn-line bg-warn-wash text-warn-ink" : "border-line bg-canvas text-ink-3",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="m-0 text-xs leading-[1.7] text-muted">
            Grey items fill in automatically. Amber items come from what the doctor picks in review. Write
            {" "}<span className="font-emr-mono">[[repeat interval]]</span> for anything clinical the doctor must type in;
            a draft with an open blank cannot be sent.
          </p>
        </div>
        <Field label="Reason for the change (optional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Master copy, Oct 2026" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="quiet" disabled={!dirty || busy} onClick={() => void save(false)}>Save draft</ActionButton>
          <ActionButton disabled={(!dirty && !latestUnapproved) || busy || Boolean(preview?.errors.length)} onClick={() => void save(true)}>
            {dirty ? "Save and approve" : `Approve v${latest?.number ?? ""}`}
          </ActionButton>
          {template.language === "en" && !hasArabic ? (
            <ActionButton variant="quiet" disabled={busy} onClick={() => void addArabic()}>Add Arabic version</ActionButton>
          ) : null}
        </div>
        <Notice notice={notice} />
        {leaflets.length ? (
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 text-[13px] font-medium text-ink-2">Attach by default</legend>
            {leaflets.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={(template.default_leaflets ?? []).includes(l.id)}
                  disabled={busy}
                  onChange={() => toggleLeaflet(l.id)}
                />
                {l.title}
              </label>
            ))}
            <span className="text-xs text-muted">The doctor can still add or remove leaflets in review.</span>
          </fieldset>
        ) : null}
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel aria-labelledby="pv" className="flex flex-col gap-3 p-5">
          <h2 id="pv" className="m-0 text-lg font-semibold">Preview with a sample patient</h2>
          {preview?.errors.length ? <Notice notice={{ tone: "error", text: preview.errors.join(" ") }} /> : null}
          <div className="rounded-2xl border border-line bg-canvas-2 p-4">
            <p className="m-0 mb-2 text-[13px] font-semibold" dir="auto">{preview?.subject || "(no subject)"}</p>
            <PreviewText text={preview?.body ?? ""} />
          </div>
          {preview?.open_slots.length ? (
            <p className="m-0 text-xs text-warn-ink">
              The doctor fills in: {preview.open_slots.join(", ")}.
            </p>
          ) : null}
        </Panel>
        <Panel aria-labelledby="hist" className="flex flex-col gap-2 p-5">
          <h2 id="hist" className="m-0 text-lg font-semibold">History</h2>
          {(history ?? []).map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-2 text-[13px]">
              <span className="font-emr-mono font-semibold">v{v.number}</span>
              <span className="text-ink-3">
                {formatDay(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ""}{v.note ? ` · ${v.note}` : ""}
              </span>
              {v.approved ? <Pill tone="ok" size="xs">Approved {formatDay(v.approved_at)}</Pill> : null}
              <ActionButton
                variant="quiet"
                size="sm"
                className="ms-auto"
                onClick={() => {
                  setSubject(v.subject ?? "");
                  setBody(v.body);
                }}
              >
                Load into editor
              </ActionButton>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

/** Email text with the doctor's [[blanks]] highlighted. */
function PreviewText({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]]*\]\])/g);
  return (
    <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.7] text-ink-2" dir="auto">
      {parts.map((part, i) =>
        part.startsWith("[[") ? (
          <mark key={i} className="rounded bg-warn-tint px-1 text-warn-ink">{part.slice(2, -2)}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
