"use client";

import { intakeApi, type IntakeForm, type IntakeFormDetail, type IntakeFormKind } from "@/lib/api/emr/intake";

export interface LatestForm {
  /** The newest form of this kind, whatever its status. */
  latest?: IntakeForm;
  /** The newest completed form of this kind, with its answers. */
  answered?: IntakeFormDetail;
}

async function loadLatestForm(patient: string, kind: IntakeFormKind): Promise<LatestForm> {
  const forms = (await intakeApi.list({ patient })).filter((f) => f.kind === kind); // newest first
  const complete = forms.find((f) => f.status === "complete");
  return { latest: forms[0], answered: complete ? await intakeApi.get(complete.id) : undefined };
}

export const loadHistoryForm = (patient: string) => loadLatestForm(patient, "full");
export const loadFollowUpForm = (patient: string) => loadLatestForm(patient, "followup");
