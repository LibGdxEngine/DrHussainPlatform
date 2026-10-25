import { emrRoutes } from "../routes";

export type SettingsTab = "rules" | "templates" | "prescriptions" | "leaflets" | "labTests" | "clinic" | "users";

/** Clinic settings sections. Each one is content the clinic edits without a developer. */
export const settingsTabs: { id: SettingsTab; label: string; href: string }[] = [
  { id: "rules", label: "Alert rules and score bands", href: emrRoutes.rules },
  { id: "templates", label: "Email templates", href: emrRoutes.templates },
  { id: "prescriptions", label: "Prescriptions", href: emrRoutes.prescriptions },
  { id: "leaflets", label: "Leaflets", href: emrRoutes.leaflets },
  { id: "labTests", label: "Lab tests and targets", href: emrRoutes.labTests },
  { id: "clinic", label: "Clinic details", href: emrRoutes.clinic },
  { id: "users", label: "Users and permissions", href: emrRoutes.audit },
];
