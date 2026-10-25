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
              روشتة جديدة
            </ActionLink>
            <ActionLink href={emrRoutes.orders} variant="quiet" size="md">
              اطلب تحاليل / أشعة
            </ActionLink>
            <ActionLink href={emrRoutes.msgs} variant="quiet" size="md">
              ابعت النتايج بالإيميل
            </ActionLink>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-4">
        <div className="flex flex-col gap-4">
          <AlertsPanel alerts={visitAlerts} />
          <Panel aria-labelledby="hw" className="flex flex-col gap-2.5 p-5">
            <h2 id="hw" className="m-0 text-lg font-semibold">
              كلامها وأهدافها
            </h2>
            <p className="m-0 text-base leading-[1.8]">
              &quot;عرق بالليل ومش عارفة أنام. وكمان شوية هرش.&quot;{" "}
              <span className="text-sm text-muted">عايزة:</span> تنام الليل كله وترجع تحس إنها نفسها في الشغل.
            </p>
            <p className="m-0 text-[13px] text-muted">
              آخر مرة حسّت إنها كويسة: من حوالي سنتين، بعد تعب والدها · بيزيد مع: النبيذ، الضغط النفسي
            </p>
          </Panel>
          <ModuleTabs />
        </div>
        <div className="flex flex-col gap-4">
          <DocumentsPanel />
          <KeyValuesPanel />
          <SentOrdersPanel />
          <EmailsPanel />
        </div>
      </div>
    </AppShell>
  );
}
