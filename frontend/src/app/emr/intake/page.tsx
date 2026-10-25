import { IntakeCanvas } from "@/features/emr/intake/components/IntakeCanvas";

export const metadata = { title: "استمارة المريضة · V-Clinic" };

export default function IntakePage() {
  return (
    <div className="min-h-screen p-0 lg:p-8">
      <h1 className="sr-only">
        استمارة المريضة على الموبايل · اللينك ← سبب الزيارة ← الخطوات ← MRS ← المتابعة
      </h1>
      <IntakeCanvas />
    </div>
  );
}
