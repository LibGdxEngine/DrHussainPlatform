"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { contentApi, type AlertRule, type AlertRuleChange, type ScoreBandSet } from "@/lib/api/emr/content";
import { Notice, type NoticeState } from "../../settings/components/Notice";
import { SettingsHeader } from "../../settings/components/SettingsHeader";
import { settingsError } from "../../settings/errors";
import { ActionButton } from "../../ui/Action";
import { ChipGroup } from "../../ui/ChipGroup";
import { TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { filterOptions } from "../data";
import type { RuleEdit, RuleFilter } from "../types";
import { MrsBandsRow } from "./MrsBandsRow";
import { RuleRow } from "./RuleRow";

const headers = ["ID", "Field", "Rule (editable threshold)", "Level", "Message to doctor", "On"];

/** Owns the loaded rules, unsaved edits and the save; every saved change becomes a new rule version. */
export function RulesBoard() {
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [mrs, setMrs] = useState<ScoreBandSet | null>(null);
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [edits, setEdits] = useState<Record<string, RuleEdit>>({});
  const [bandEdits, setBandEdits] = useState<string[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([contentApi.alertRules.list(), contentApi.scoreBands.get("mrs")]).then(
      ([list, bands]) => {
        if (cancelled) return;
        setRules(list);
        setMrs(bands);
      },
      (err: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: settingsError(err, "Could not load the rules.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const changed = useMemo(() => {
    if (!rules) return [];
    return rules.flatMap((rule): AlertRuleChange[] => {
      const edit = edits[rule.code];
      if (!edit) return [];
      const change: AlertRuleChange = { code: rule.code };
      if (edit.threshold_a !== undefined && edit.threshold_a !== rule.threshold_a) change.threshold_a = edit.threshold_a;
      if (edit.threshold_b !== undefined && edit.threshold_b !== rule.threshold_b) change.threshold_b = edit.threshold_b;
      if (edit.enabled !== undefined && edit.enabled !== rule.enabled) change.enabled = edit.enabled;
      return Object.keys(change).length > 1 ? [change] : [];
    });
  }, [rules, edits]);

  const savedBands = mrs?.current?.bands ?? [];
  const bandsChanged = bandEdits !== null && bandEdits.some((v, i) => v !== String(savedBands[i]?.min));
  const changeCount = changed.length + (bandsChanged ? 1 : 0);
  const shown = (rules ?? []).filter((r) => filter === "all" || r.level === filter);

  const edit = (code: string, change: RuleEdit) =>
    setEdits((prev) => ({ ...prev, [code]: { ...prev[code], ...change } }));

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      if (changed.length) await contentApi.alertRules.saveChanges(changed, note);
      if (bandsChanged && bandEdits) {
        const bands = savedBands.map((band, i) => ({ label: band.label, min: Number(bandEdits[i]) }));
        setMrs(await contentApi.scoreBands.save("mrs", bands, note));
      }
      setRules(await contentApi.alertRules.list());
      setEdits({});
      setBandEdits(null);
      setNote("");
      setNotice({
        tone: "ok",
        text: `Saved ${changeCount} ${changeCount === 1 ? "change" : "changes"}. Earlier versions are kept.`,
      });
    } catch (err) {
      setNotice({ tone: "error", text: settingsError(err, "Could not save the changes.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsHeader
        tab="rules"
        title="Alert rules"
        description="Each rule maps to a line in the forms spec (R1–R40, and more as the list grows). Change a cut-off here when guidelines change, with no developer needed. Every change is versioned and logged."
        actions={
          <>
            <span className="text-[13px] font-semibold text-warn-ink" aria-live="polite">
              {changeCount ? `${changeCount} unsaved ${changeCount === 1 ? "change" : "changes"}` : ""}
            </span>
            {changeCount ? (
              <TextInput
                className="w-60"
                placeholder="Reason for the change (optional)"
                aria-label="Reason for the change"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            ) : null}
            <ActionButton disabled={!changeCount || busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save changes"}
            </ActionButton>
          </>
        }
      />
      <Notice notice={notice} />
      <Panel aria-label="Rules" className="overflow-hidden">
        <ChipGroup
          label="Filters"
          options={filterOptions(rules ?? [])}
          value={filter}
          onChange={setFilter}
          className="flex-nowrap px-5 py-[18px]"
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "border-y border-line bg-canvas-2 px-2 py-2.5 text-start text-xs font-medium text-muted",
                      i === 0 && "ps-5",
                      i === headers.length - 1 && "pe-5",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const e = edits[r.code] ?? {};
                return (
                  <RuleRow
                    key={r.code}
                    rule={r}
                    a={r.threshold_a === null ? null : (e.threshold_a ?? r.threshold_a ?? "")}
                    b={r.threshold_b === null ? null : (e.threshold_b ?? r.threshold_b ?? "")}
                    enabled={e.enabled ?? r.enabled ?? true}
                    edited={changed.some((c) => c.code === r.code)}
                    onChangeA={(v) => edit(r.code, { threshold_a: v })}
                    onChangeB={(v) => edit(r.code, { threshold_b: v })}
                    onToggle={() => edit(r.code, { enabled: !(e.enabled ?? r.enabled ?? true) })}
                  />
                );
              })}
              {mrs?.current ? (
                <MrsBandsRow
                  bands={savedBands.map((band, i) => ({ label: band.label, min: bandEdits?.[i] ?? String(band.min) }))}
                  version={mrs.current.number}
                  edited={bandsChanged}
                  onChange={(index, value) =>
                    setBandEdits((prev) => {
                      const next = prev ?? savedBands.map((band) => String(band.min));
                      return next.map((v, i) => (i === index ? value : v));
                    })
                  }
                />
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="m-0 px-5 py-3.5 text-xs text-muted">
          {rules ? `Showing ${shown.length} of ${rules.length} rules.` : "Loading rules…"} Score bands appear as labels
          next to the score, not as alerts.
        </p>
      </Panel>
    </>
  );
}
