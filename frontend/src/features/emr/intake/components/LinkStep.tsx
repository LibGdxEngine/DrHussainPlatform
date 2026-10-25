import { emrRoutes } from "../../routes";
import { Icon } from "../../ui/icons";
import { otpInitial } from "../data";
import { OtpInput } from "./OtpInput";
import { PhoneBody, PhoneFooter, PhoneFrame } from "./PhoneFrame";

/** A: opening the one-time link and verifying identity. */
export function LinkStep() {
  return (
    <PhoneFrame label="A · Opening the link and verifying">
      <div className="flex items-center gap-2.5 bg-white px-6 pb-[18px] pt-[22px]">
        <span className="flex size-[34px] items-center justify-center rounded-full border-[3px] border-brand text-sm font-extrabold text-brand">
          V
        </span>
        <strong className="text-[17px] font-bold">V-Clinic</strong>
      </div>
      <PhoneBody className="gap-5 px-6 py-7">
        <div className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[28px] font-bold leading-[1.35]">Hello, Laila</h2>
          <p className="m-0 text-base leading-[1.7] text-ink-3">
            This is the form for your visit on <strong className="text-ink">Tuesday 13 Oct, 09:30</strong>. It takes
            about 10 minutes, and you can save and finish later.
          </p>
        </div>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          Date of birth
          <input
            defaultValue="14 / 03 / 1974"
            className="min-h-[54px] w-full rounded-2xl border-[1.5px] border-field bg-white px-4 text-[17px] outline-none focus:border-brand"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold">
            Code sent by SMS to <span>•••• 4821</span>
          </span>
          <OtpInput initial={otpInitial} />
          <button type="button" className="cursor-pointer self-start text-sm font-semibold text-brand">
            Resend code
          </button>
        </div>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          Form language
          <select className="min-h-[54px] w-full rounded-2xl border-[1.5px] border-field bg-white px-3.5 text-base">
            <option>English</option>
            <option>Arabic</option>
          </select>
        </label>
        <div className="mt-auto flex items-start gap-2.5 rounded-2xl bg-brand-tint p-3.5 text-[13px] leading-[1.7] text-brand-deep">
          <Icon name="lock" size={18} className="mt-0.5 flex-none" />
          This link is for you only. You will only see your own forms, results and emails.
        </div>
      </PhoneBody>
      <PhoneFooter next={{ label: "Start the form", href: emrRoutes.intake }} />
    </PhoneFrame>
  );
}
