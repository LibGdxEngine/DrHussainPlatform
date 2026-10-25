import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { visitTypes } from "../data";

function ChannelCheckbox({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2.5">
      <input type="checkbox" defaultChecked className="size-[17px] accent-brand" />
      {children}
    </label>
  );
}

/** "احجز زيارة" panel: patient, slot, visit type and form-link channels. */
export function BookingForm() {
  return (
    <Panel aria-labelledby="bk" className="flex flex-col gap-3.5 p-5">
      <h2 id="bk" className="m-0 text-lg font-semibold">
        احجز زيارة
      </h2>
      <Field label="المريضة">
        <TextInput defaultValue="ليلى أحمد · VC-000203 · مواليد 2 نوفمبر 1981" />
      </Field>
      <div className="rounded-[14px] bg-warn-wash px-3.5 py-3 text-[13px] leading-[1.7] text-[#5a3d00]">
        فيه اسم شبهه متسجل: <strong>ليلى أحمد</strong>، VC-000142، مواليد 14 مارس 1974. اتأكد من تاريخ الميلاد قبل
        الحجز.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="التاريخ">
          <TextInput defaultValue="الأربع 21 أكتوبر" />
        </Field>
        <Field label="الساعة">
          <TextInput defaultValue="11:00" />
        </Field>
      </div>
      <Field label="نوع الزيارة">
        <SelectInput>
          {visitTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </SelectInput>
      </Field>
      <fieldset className="m-0 flex flex-col gap-2 rounded-2xl border border-line px-3.5 py-3 text-sm">
        <legend className="px-1.5 text-[13px] font-semibold">ابعت لينك الاستمارة عن طريق</legend>
        <ChannelCheckbox>
          رسالة SMS على <span dir="ltr">•••• 7730</span>
        </ChannelCheckbox>
        <ChannelCheckbox>
          إيميل على{" "}
          <span dir="ltr" className="font-emr-mono text-[13px]">
            l•••••@yahoo.com
          </span>
        </ChannelCheckbox>
      </fieldset>
      <div className="rounded-2xl rounded-es-sm bg-brand-tint px-3.5 py-3 text-[13px] leading-[1.8] text-brand-ink">
        <span className="text-[11px] text-ok-ink">شكل الرسالة</span>
        <br />
        V-Clinic: من فضلك املي الاستمارة قبل زيارتك يوم الأربع 21 أكتوبر الساعة 11:00. هتاخد حوالي 10 دقايق: [لينك
        آمن]
      </div>
      <ActionLink href={emrRoutes.appts} className="min-h-[50px] w-full">
        احجز وابعت اللينك
      </ActionLink>
      <span className="text-xs text-muted">لو الاستمارة ماخلصتش، بيتبعت تذكير أوتوماتيك قبلها بيومين.</span>
    </Panel>
  );
}
