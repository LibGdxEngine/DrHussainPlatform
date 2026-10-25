/** Every EMR screen lives under /emr. Keep hrefs here so screens never hardcode paths. */
export const emrRoutes = {
  signin: "/emr/signin",
  today: "/emr/today",
  patients: "/emr/patients",
  visit: "/emr/visit",
  exam: "/emr/exam",
  orders: "/emr/orders",
  docs: "/emr/docs",
  scan: "/emr/scan",
  msgs: "/emr/msgs",
  followup: "/emr/followup",
  appts: "/emr/appts",
  rules: "/emr/rules",
  templates: "/emr/settings/templates",
  prescriptions: "/emr/settings/prescriptions",
  leaflets: "/emr/settings/leaflets",
  labTests: "/emr/settings/lab-tests",
  clinic: "/emr/settings/clinic",
  audit: "/emr/audit",
  invite: "/emr/invite",
  intake: "/emr/intake",
} as const;

export type EmrRouteKey = keyof typeof emrRoutes;
