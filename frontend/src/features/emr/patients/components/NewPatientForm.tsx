import { emrRoutes } from "@/features/emr/routes";
import { ActionLink } from "@/features/emr/ui/Action";
import { Field, SelectInput, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";

export function NewPatientForm() {
  return (
    <Panel aria-labelledby="np" className="flex flex-col gap-3.5 p-[22px]">
      <h2 id="np" className="m-0 text-[19px] font-semibold">
        مريضة جديدة
      </h2>
      <Field label="الاسم بالكامل">
        <TextInput />
      </Field>
      <Field label="تاريخ الميلاد">
        <TextInput placeholder="يوم / شهر / سنة" />
      </Field>
      <Field label="الموبايل">
        <TextInput dir="ltr" placeholder="+20" className="text-right" />
      </Field>
      <Field label="الإيميل">
        <TextInput dir="ltr" />
      </Field>
      <Field label="لغة الاستمارة">
        <SelectInput defaultValue="ar">
          <option value="ar">العربي</option>
          <option value="en">English</option>
        </SelectInput>
      </Field>
      <Field label="الدكتور المحوِّل (اختياري)">
        <TextInput />
      </Field>
      <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
        رقم الملف بيتعمل أوتوماتيك. السيستم هينبهك لو فيه اسم وتاريخ ميلاد شبههم متسجلين قبل كده.
      </p>
      <ActionLink href={emrRoutes.today} className="min-h-12">
        احفظ واحجز زيارة
      </ActionLink>
    </Panel>
  );
}
