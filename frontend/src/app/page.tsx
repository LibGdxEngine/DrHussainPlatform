import { redirect } from "next/navigation";
import { emrRoutes } from "@/features/emr/routes";

/** The platform is the V-Clinic EMR: the root URL goes straight to its sign-in. */
export default function Home() {
  redirect(emrRoutes.signin);
}
