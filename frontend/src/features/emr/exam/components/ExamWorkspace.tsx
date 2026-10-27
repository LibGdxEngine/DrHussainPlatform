"use client";

import { useEffect, useMemo, useState } from "react";
import { contentApi } from "@/lib/api/emr/content";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { examinationsApi, type Examination } from "@/lib/api/emr/examinations";
import type { Patient } from "@/lib/api/emr/patients";
import { formFrom, newForm, toFields, type ExamForm } from "../form";
import { computeVitals, vitalRules, type VitalRule } from "../vitals";
import { ExamAside } from "./ExamAside";
import { ExamMain } from "./ExamMain";

/** The doctor's examination of one patient: record a new one or edit an earlier one, with every save kept. */
export function ExamWorkspace({ patient }: { patient: Patient }) {
  const [exams, setExams] = useState<Examination[] | null>(null);
  const [rules, setRules] = useState<VitalRule[]>([]);
  const [form, setForm] = useState<ExamForm>(() => newForm());
  const [editing, setEditing] = useState<Examination | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [alertsKey, setAlertsKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    examinationsApi.list(patient.id).then((items) => {
      if (cancelled) return;
      setExams(items);
      setForm(newForm(items[0]));
    }).catch((err: unknown) => { if (!cancelled) setError(apiErrorMessage(err, "Could not load examinations.")); });
    // The live warnings use the clinic's own cut-offs; without them the server still raises the alerts on save.
    contentApi.alertRules.list().then((all) => { if (!cancelled) setRules(vitalRules(all)); }, () => undefined);
    return () => { cancelled = true; };
  }, [patient.id]);

  const vitals = useMemo(() => computeVitals(form, rules), [form, rules]);

  function change(changes: Partial<ExamForm>) {
    setForm((previous) => ({ ...previous, ...changes }));
    setNotice(null);
  }

  function open(exam: Examination) {
    setEditing(exam);
    setForm(formFrom(exam));
    setError(null);
    setNotice(null);
    setConflict(false);
  }

  function startNew() {
    setEditing(undefined);
    setForm(newForm(exams?.[0]));
    setError(null);
    setNotice(null);
    setConflict(false);
  }

  async function reload() {
    setBusy(true);
    try {
      const items = await examinationsApi.list(patient.id);
      setExams(items);
      setEditing(undefined);
      setForm(newForm(items[0]));
      setConflict(false);
      setError(null);
      setNotice("Examinations reloaded.");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not reload examinations."));
    } finally { setBusy(false); }
  }

  async function save() {
    const result = toFields(form);
    if ("problem" in result) { setError(result.problem); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = editing
        ? await examinationsApi.update(editing.id, editing.version, result.fields)
        : await examinationsApi.create(patient.id, result.fields);
      setExams((previous) => [saved, ...(previous ?? []).filter((exam) => exam.id !== saved.id)]
        .sort((a, b) => (b.examined_on ?? "").localeCompare(a.examined_on ?? "")));
      setEditing(saved);
      setForm(formFrom(saved));
      setAlertsKey((n) => n + 1);
      setNotice(editing ? "Changes saved." : "Examination saved.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EXAMINATION_CONFLICT") setConflict(true);
      setError(apiErrorMessage(err, "Could not save the examination."));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4">
      <ExamMain form={form} onChange={change} vitals={vitals} />
      <ExamAside form={form} onChange={change} vitals={vitals} patientId={patient.id} alertsKey={alertsKey}
        exams={exams} editing={editing} busy={busy} canSave={exams !== null} error={error} notice={notice}
        conflict={conflict} onSave={() => void save()} onNew={startNew} onOpen={open} onReload={() => void reload()} />
    </div>
  );
}
