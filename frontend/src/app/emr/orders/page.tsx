import { OrdersWorkspace } from "@/features/emr/orders/components/OrdersWorkspace";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";

export default function OrdersPage() {
  return (
    <AppShell active="patients" showPromo={false}>
      <PatientHeader
        tab="orders"
        meta="Uterus present · Allergy: penicillin · Peanut allergy: no · Migraine with aura"
      />
      <OrdersWorkspace />
    </AppShell>
  );
}
