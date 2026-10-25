import { ReviewQueue } from "@/features/emr/review/components/ReviewQueue";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PageTitle } from "@/features/emr/shell/PageTitle";

export const metadata = { title: "Results review · V-Clinic EMR" };

export default function ResultsReviewPage() {
  return (
    <AppShell active="results" topbarStart={<PageTitle title="Results review" meta="Approve before anything is sent" />}>
      <ReviewQueue />
    </AppShell>
  );
}
