"use client";

import { intakeApi, type IntakeForm, type IntakeFormDetail, type IntakeFormKind } from "@/lib/api/emr/intake";

export interface LatestForm {
  /** The newest form of this kind, whatever its status. */
  latest?: IntakeForm;
  /** The newest form of any kind: what the header's "Patient form" status describes. */
  latestAny?: IntakeForm;
  /** The newest completed form of this kind, with its answers. */
  answered?: IntakeFormDetail;
}

/** Picks the forms to show from the patient's forms, newest first. */
export function pickForms(all: IntakeForm[], kind: IntakeFormKind) {
  const forms = all.filter((f) => f.kind === kind);
  return { latest: forms[0], latestAny: all[0], complete: forms.find((f) => f.status === "complete") };
}

async function loadLatestForm(patient: string, kind: IntakeFormKind): Promise<LatestForm> {
  const { latest, latestAny, complete } = pickForms(await intakeApi.list({ patient }), kind);
  return { latest, latestAny, answered: complete ? await intakeApi.get(complete.id) : undefined };
}

export const loadHistoryForm = (patient: string) => loadLatestForm(patient, "full");
export const loadFollowUpForm = (patient: string) => loadLatestForm(patient, "followup");
