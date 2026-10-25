import { IntakeCanvas } from "@/features/emr/intake/components/IntakeCanvas";

export const metadata = { title: "Patient intake form · V-Clinic" };

export default function IntakePage() {
  return (
    <div className="min-h-screen p-0 lg:p-8">
      <h1 className="sr-only">
        Patient intake form on mobile · link → reason for visit → steps → MRS → follow-up
      </h1>
      <IntakeCanvas />
    </div>
  );
}
