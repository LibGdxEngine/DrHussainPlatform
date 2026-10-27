"use client";

import { useEffect, useState } from "react";
import { resultsApi, type LabTest } from "@/lib/api/emr/results";
import { ActionButton } from "../../ui/Action";
import { TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Switch } from "../../ui/Switch";
import { Td, Th, Table } from "../../ui/Table";
import { settingsError } from "../errors";
import { Notice, type NoticeState } from "./Notice";
import { SettingsHeader } from "./SettingsHeader";

const kindLabel: Record<NonNullable<LabTest["kind"]>, string> = {
  numeric: "Number",
  qualitative: "Detected / not",
  text: "Report text",
};

/** The test catalog: the clinic's optimal targets, the tracked key values and each lab's names for a test. */
export function LabTestsScreen() {
  const [tests, setTests] = useState<LabTest[] | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;
    resultsApi.tests().then(
      (list) => !cancelled && setTests(list),
      (err: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: settingsError(err, "Could not load the tests.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SettingsHeader
        tab="labTests"
        title="Lab tests and targets"
        description="Optimal targets shade values in the key values panel; they are not alerts. Tracked tests appear for typing in. Lab names tell the reader that “S. Ferritin” and “Ferritin (CLIA)” are the same test, so earlier results are found."
      />
      <Notice notice={notice} />
      <Panel aria-label="Tests" className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                {["Test", "Unit", "Optimal low", "Optimal high", "Target text", "Names labs use", "Tracked", ""].map((h) => (
                  <Th key={h} tinted>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!tests ? (
                <tr><Td colSpan={8} className="text-muted">Loading…</Td></tr>
              ) : null}
              {(tests ?? []).map((t) => (
                <LabTestRow
                  key={t.id}
                  test={t}
                  onSaved={(next) => setTests((prev) => (prev ?? []).map((x) => (x.id === next.id ? next : x)))}
                  onNotice={setNotice}
                />
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>
    </>
  );
}

interface LabTestRowProps {
  test: LabTest;
  onSaved: (test: LabTest) => void;
  onNotice: (notice: NoticeState) => void;
}

function LabTestRow({ test, onSaved, onNotice }: LabTestRowProps) {
  const initial = {
    unit: test.default_unit ?? "",
    low: test.optimal_low ? String(Number(test.optimal_low)) : "",
    high: test.optimal_high ? String(Number(test.optimal_high)) : "",
    text: test.optimal_text ?? "",
    aliases: (test.aliases ?? []).join(", "),
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k]);
  const numeric = test.kind === "numeric";

  async function save(changes: Parameters<typeof resultsApi.updateTest>[1]) {
    setBusy(true);
    try {
      const saved = await resultsApi.updateTest(test.id, changes);
      onSaved(saved);
      onNotice({ tone: "ok", text: `Saved ${saved.name}.` });
    } catch (err) {
      onNotice({ tone: "error", text: settingsError(err, `Could not save ${test.name}.`) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="align-top">
      <Td>
        <span className="font-semibold">{test.name}</span>
        <span className="block text-[11px] text-subtle">{kindLabel[test.kind ?? "numeric"]} · {test.code}</span>
      </Td>
      <Td><TextInput aria-label={`${test.name} unit`} className="w-24" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Td>
      <Td>
        {numeric ? <TextInput aria-label={`${test.name} optimal low`} inputMode="decimal" className="w-20" value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} /> : "—"}
      </Td>
      <Td>
        {numeric ? <TextInput aria-label={`${test.name} optimal high`} inputMode="decimal" className="w-20" value={form.high} onChange={(e) => setForm({ ...form, high: e.target.value })} /> : "—"}
      </Td>
      <Td><TextInput aria-label={`${test.name} target text`} className="w-36" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Td>
      <Td className="min-w-[220px]">
        <TextInput aria-label={`${test.name} names used by labs`} value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
      </Td>
      <Td>
        <Switch checked={Boolean(test.tracked)} disabled={busy} label={`Track ${test.name}`} onChange={(next) => void save({ tracked: next })} />
      </Td>
      <Td>
        <ActionButton
          size="sm"
          disabled={!dirty || busy}
          onClick={() =>
            void save({
              default_unit: form.unit,
              optimal_low: numeric && form.low ? form.low : null,
              optimal_high: numeric && form.high ? form.high : null,
              optimal_text: form.text,
              aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
            })
          }
        >
          Save
        </ActionButton>
      </Td>
    </tr>
  );
}
