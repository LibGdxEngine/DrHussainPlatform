"use client";

import { useEffect, useState } from "react";
import { contentApi, type Prescription, type PrescriptionVersion } from "@/lib/api/emr/content";
import { formatDay } from "../../format";
import { ActionButton } from "../../ui/Action";
import { Field, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { settingsError } from "../errors";
import { Notice, type NoticeState } from "./Notice";
import { SettingsHeader } from "./SettingsHeader";

const empty = { drug: "", dose: "", directions: "", note: "" };

/** The clinic's prescription list: the doctor picks from it in review. Items are archived, never deleted. */
export function PrescriptionsScreen() {
  const [items, setItems] = useState<Prescription[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;
    contentApi.prescriptions.list(showArchived).then(
      (list) => !cancelled && setItems(list),
      (err: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: settingsError(err, "Could not load the prescriptions.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [showArchived]);

  const replace = (next: Prescription) =>
    setItems((prev) => (prev ?? []).map((p) => (p.id === next.id ? next : p)).filter((p) => showArchived || !p.archived));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const created = await contentApi.prescriptions.create(draft);
      setItems((prev) => [...(prev ?? []), created]);
      setDraft(empty);
      setNotice({ tone: "ok", text: `Added ${created.drug}.` });
    } catch (err) {
      setNotice({ tone: "error", text: settingsError(err, "Could not add the prescription.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsHeader
        tab="prescriptions"
        title="Prescriptions"
        description="Each item is a drug, dose and directions the doctor can offer in a results email. The list is checked monthly against the guidelines; if they disagree, the guideline wins. Every change is dated and kept."
        actions={
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        }
      />
      <Notice notice={notice} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel aria-label="Prescription list" className="flex flex-col gap-3 p-5">
          {!items ? <p className="m-0 text-[13px] text-muted">Loading…</p> : null}
          {items && !items.length ? (
            <p className="m-0 text-[13px] text-muted">No prescriptions yet. Add the clinic&apos;s common prescriptions on the right.</p>
          ) : null}
          {(items ?? []).map((item) => (
            <PrescriptionRow key={item.id} item={item} onSaved={replace} onError={setNotice} />
          ))}
        </Panel>
        <Panel aria-labelledby="np" className="flex flex-col gap-3 p-5">
          <h2 id="np" className="m-0 text-lg font-semibold">Add a prescription</h2>
          <form className="flex flex-col gap-3" onSubmit={add}>
            <Field label="Drug">
              <TextInput required value={draft.drug} onChange={(e) => setDraft({ ...draft, drug: e.target.value })} />
            </Field>
            <Field label="Dose">
              <TextInput value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} />
            </Field>
            <Field label="Directions">
              <TextInput value={draft.directions} onChange={(e) => setDraft({ ...draft, directions: e.target.value })} />
            </Field>
            <Field label="Source (optional)">
              <TextInput
                placeholder="e.g. Guideline, Oct 2026"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </Field>
            <ActionButton type="submit" disabled={busy} className="self-start">Add</ActionButton>
          </form>
        </Panel>
      </div>
    </>
  );
}

interface PrescriptionRowProps {
  item: Prescription;
  onSaved: (item: Prescription) => void;
  onError: (notice: NoticeState) => void;
}

function PrescriptionRow({ item, onSaved, onError }: PrescriptionRowProps) {
  const [form, setForm] = useState({ drug: item.drug, dose: item.dose ?? "", directions: item.directions ?? "", note: "" });
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<PrescriptionVersion[] | null>(null);
  const dirty = form.drug !== item.drug || form.dose !== (item.dose ?? "") || form.directions !== (item.directions ?? "");

  async function save(changes: Parameters<typeof contentApi.prescriptions.update>[1]) {
    setBusy(true);
    try {
      const saved = await contentApi.prescriptions.update(item.id, changes);
      onSaved(saved);
      setForm((f) => ({ ...f, note: "" }));
      if (history) setHistory(await contentApi.prescriptions.history(item.id));
      const done = changes.archived === undefined
        ? `Saved ${saved.drug} (v${saved.version}).`
        : `${saved.archived ? "Archived" : "Restored"} ${saved.drug}.`;
      onError({ tone: "ok", text: done });
    } catch (err) {
      onError({ tone: "error", text: settingsError(err, "Could not save the prescription.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line p-3.5">
      <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_1.4fr]">
        <TextInput aria-label="Drug" value={form.drug} onChange={(e) => setForm({ ...form, drug: e.target.value })} />
        <TextInput aria-label="Dose" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
        <TextInput
          aria-label="Directions"
          value={form.directions}
          onChange={(e) => setForm({ ...form, directions: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-emr-mono">v{item.version}</span>
        <span>
          {formatDay(item.changed_at)}
          {item.changed_by_name ? ` · ${item.changed_by_name}` : ""}
        </span>
        {item.archived ? <Pill tone="neutral" size="xs">Archived</Pill> : null}
        {dirty ? (
          <TextInput
            className="min-h-9 w-56"
            placeholder="Reason (optional)"
            aria-label="Reason for the change"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        ) : null}
        <span className="ms-auto flex gap-2">
          <ActionButton
            size="sm"
            disabled={!dirty || busy}
            onClick={() => void save({ drug: form.drug, dose: form.dose, directions: form.directions, note: form.note })}
          >
            Save
          </ActionButton>
          <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => void save({ archived: !item.archived })}>
            {item.archived ? "Restore" : "Archive"}
          </ActionButton>
          <ActionButton
            variant="quiet"
            size="sm"
            onClick={async () => setHistory(history ? null : await contentApi.prescriptions.history(item.id))}
          >
            {history ? "Hide history" : "History"}
          </ActionButton>
        </span>
      </div>
      {history ? (
        <ul className="m-0 flex flex-col gap-1 ps-4 text-xs text-ink-3">
          {history.map((v) => (
            <li key={v.id}>
              <span className="font-emr-mono">v{v.number}</span> · {formatDay(v.created_at)} · {v.drug}
              {v.dose ? `, ${v.dose}` : ""}
              {v.directions ? `, ${v.directions}` : ""}
              {v.note ? ` (${v.note})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
