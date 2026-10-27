import { OrdersScreen } from "@/features/emr/orders/components/OrdersScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Orders & prescriptions · V-Clinic EMR" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { patient } = await searchParams;

  return (
    <AppShell active="patients" showPromo={false}>
      <OrdersScreen fileNumber={Array.isArray(patient) ? patient[0] : patient} />
    </AppShell>
  );
}
