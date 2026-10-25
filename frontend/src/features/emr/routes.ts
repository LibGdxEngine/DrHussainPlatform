/** Every EMR screen lives under /emr. Keep hrefs here so screens never hardcode paths. */
export const emrRoutes = {
  signin: "/emr/signin",
  today: "/emr/today",
  patients: "/emr/patients",
  visit: "/emr/visit",
  exam: "/emr/exam",
  orders: "/emr/orders",
  docs: "/emr/docs",
  msgs: "/emr/msgs",
  followup: "/emr/followup",
  appts: "/emr/appts",
  rules: "/emr/rules",
  audit: "/emr/audit",
  invite: "/emr/invite",
  intake: "/emr/intake",
} as const;

export type EmrRouteKey = keyof typeof emrRoutes;
