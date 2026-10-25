import { OrdersWorkspace } from "@/features/emr/orders/components/OrdersWorkspace";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";

export default function OrdersPage() {
  return (
    <AppShell active="patients" showPromo={false}>
      <PatientHeader
        tab="orders"
        meta="الرحم موجود · حساسية: بنسلين · حساسية فول سوداني: لا · صداع نصفي مع أورة"
      />
      <OrdersWorkspace />
    </AppShell>
  );
}
