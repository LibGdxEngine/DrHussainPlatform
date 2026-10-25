import { emrRoutes } from "../../routes";
import { Icon } from "../../ui/icons";
import { otpInitial } from "../data";
import { OtpInput } from "./OtpInput";
import { PhoneBody, PhoneFooter, PhoneFrame } from "./PhoneFrame";

/** A: opening the one-time link and verifying identity. */
export function LinkStep() {
  return (
    <PhoneFrame label="أ · فتح اللينك والتحقق">
      <div className="flex items-center gap-2.5 bg-white px-6 pb-[18px] pt-[22px]">
        <span className="flex size-[34px] items-center justify-center rounded-full border-[3px] border-brand text-sm font-extrabold text-brand">
          V
        </span>
        <strong className="text-[17px] font-bold">V-Clinic</strong>
      </div>
      <PhoneBody className="gap-5 px-6 py-7">
        <div className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[28px] font-bold leading-[1.35]">أهلاً يا ليلى</h2>
          <p className="m-0 text-base leading-[1.7] text-ink-3">
            دي استمارة زيارتك يوم <strong className="text-ink">الثلاثاء 13 أكتوبر، 09:30</strong>. هتاخد حوالي 10
            دقايق، وتقدري تحفظي وتكمّلي بعدين.
          </p>
        </div>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          تاريخ ميلادك
          <input
            dir="ltr"
            defaultValue="14 / 03 / 1974"
            className="min-h-[54px] w-full rounded-2xl border-[1.5px] border-field bg-white px-4 text-right text-[17px] outline-none focus:border-brand"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold">
            الكود اللي وصلك SMS على <span dir="ltr">•••• 4821</span>
          </span>
          <OtpInput initial={otpInitial} />
          <button type="button" className="cursor-pointer self-start text-sm font-semibold text-brand">
            ابعتيلي الكود تاني
          </button>
        </div>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          لغة الاستمارة
          <select className="min-h-[54px] w-full rounded-2xl border-[1.5px] border-field bg-white px-3.5 text-base">
            <option>العربي</option>
            <option>English</option>
          </select>
        </label>
        <div className="mt-auto flex items-start gap-2.5 rounded-2xl bg-brand-tint p-3.5 text-[13px] leading-[1.7] text-brand-deep">
          <Icon name="lock" size={18} className="mt-0.5 flex-none" />
          اللينك ده ليكي إنتي بس. مش هتشوفي غير استماراتك ونتايجك وإيميلاتك.
        </div>
      </PhoneBody>
      <PhoneFooter next={{ label: "ابدأي الاستمارة", href: emrRoutes.intake }} />
    </PhoneFrame>
  );
}
