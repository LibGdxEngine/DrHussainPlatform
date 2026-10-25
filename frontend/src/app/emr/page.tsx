import { redirect } from "next/navigation";
import { emrRoutes } from "@/features/emr/routes";

export default function EmrIndexPage() {
  redirect(emrRoutes.signin);
}
