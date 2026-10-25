import { visitLabel, type VisitKey } from "@/features/emr/journey/data";
import { ScanStation } from "@/features/emr/scan/components/ScanStation";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PageTitle } from "@/features/emr/shell/PageTitle";

export const metadata = { title: "Scanning · V-Clinic EMR" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const visit = one(sp.visit);
  const tab = one(sp.tab);

  return (
    <AppShell
      active="scan"
      showPromo={false}
      topbarStart={<PageTitle title="Scanning" meta="Reception: Visit 2 and 3 files · Doctor: old files" />}
    >
      <ScanStation
        initialTab={tab === "bulk" ? "bulk" : "visit"}
        initialMrn={one(sp.patient)}
        initialVisit={visit && visit in visitLabel ? (visit as VisitKey) : undefined}
      />
    </AppShell>
  );
}
