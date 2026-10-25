import { JourneyTracker } from "../../journey/components/JourneyTracker";
import { RequestedFilesPanel } from "../../journey/components/RequestedFilesPanel";
import { initialJourney } from "../../journey/data";
import { AppShell } from "../../shell/AppShell";
import { PatientHeader } from "../../shell/PatientHeader";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { patientMeta, visitAlerts } from "../data";
import { AlertsPanel } from "./AlertsPanel";
import { ModuleTabs } from "./ModuleTabs";
import { DocumentsPanel, EmailsPanel, KeyValuesPanel, SentOrdersPanel } from "./SidePanels";

export function VisitScreen() {
  return (
    <AppShell active="patients">
      <PatientHeader
        tab="summary"
        meta={patientMeta}
        actions={
          <>
            <ActionLink href={emrRoutes.orders} size="md">
              New prescription
            </ActionLink>
            <ActionLink href={emrRoutes.orders} variant="quiet" size="md">
              Order labs / imaging
            </ActionLink>
            <ActionLink href={emrRoutes.msgs} variant="quiet" size="md">
              Email results
            </ActionLink>
            <ActionLink href={`${emrRoutes.msgs}?compose=case`} variant="quiet" size="md">
              Request case by email
            </ActionLink>
          </>
        }
      />
      <JourneyTracker steps={initialJourney} />
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-4">
        <div className="flex flex-col gap-4">
          <AlertsPanel alerts={visitAlerts} />
          <Panel aria-labelledby="hw" className="flex flex-col gap-2.5 p-5">
            <h2 id="hw" className="m-0 text-lg font-semibold">
              In her words & goals
            </h2>
            <p className="m-0 text-base leading-[1.8]">
              &quot;Night sweats and I can&apos;t sleep. Also some itching.&quot;{" "}
              <span className="text-sm text-muted">Wants:</span> to sleep through the night and feel like herself at work again.
            </p>
            <p className="m-0 text-[13px] text-muted">
              Last felt well: about 2 years ago, after her father fell ill · Worse with: wine, stress
            </p>
          </Panel>
          <ModuleTabs />
        </div>
        <div className="flex flex-col gap-4">
          <RequestedFilesPanel />
          <DocumentsPanel />
          <KeyValuesPanel />
          <SentOrdersPanel />
          <EmailsPanel />
        </div>
      </div>
    </AppShell>
  );
}
