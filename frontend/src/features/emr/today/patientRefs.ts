import type { PatientAlert } from "@/lib/api/emr/alerts";
import type { RequestedTest } from "@/lib/api/emr/orders";

export interface PatientRef {
  id: string;
  file_number: string;
  full_name: string;
}

/**
 * File numbers and names by patient id, from what the dashboard already loaded. Alerts and
 * requested tests carry the patient's name, so no patient record is opened just to label them.
 */
export function patientRefs(known: PatientRef[], alerts: PatientAlert[], tests: RequestedTest[]): Map<string, PatientRef> {
  const refs = new Map<string, PatientRef>();
  for (const a of alerts) refs.set(a.patient, { id: a.patient, file_number: a.file_number, full_name: a.patient_name });
  for (const t of tests) refs.set(t.patient, { id: t.patient, file_number: t.file_number, full_name: t.patient_name });
  for (const p of known) refs.set(p.id, p);
  return refs;
}
