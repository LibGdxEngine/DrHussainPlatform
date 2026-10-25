import Image from "next/image";
import { Logo } from "@/features/emr/shell/Logo";

/** Left (brand) half of the staff sign-in screen. */
export function SignInHero() {
  return (
    <section
      aria-label="V-Clinic"
      className="relative flex min-h-[320px] flex-1 flex-col gap-7 overflow-hidden rounded-[26px] bg-gradient-to-br from-mint-1 to-mint-2 p-8 lg:flex-[1.1] lg:p-11"
    >
      <Logo size="hero" className="relative z-20" />
      <div className="relative z-20 flex max-w-[330px] flex-col gap-3.5 md:max-w-[min(330px,50%)]">
        <span className="self-start rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ok-ink">
          Staff medical record
        </span>
        <h1 className="m-0 text-balance text-4xl font-bold leading-tight tracking-tight lg:text-[44px]">
          Patient records for the V-Clinic care team
        </h1>
        <p className="m-0 text-base leading-[1.7] text-ink-2">
          Authorised staff only. Every sign-in, record opened and edit is logged.
        </p>
      </div>
      <Image
        src="/emr/dr-gohar-cutout.png"
        alt="Dr. Gohar"
        width={640}
        height={800}
        priority
        className="absolute -end-2.5 bottom-0 z-10 hidden h-[78%] w-auto max-w-[46%] object-contain object-bottom drop-shadow-[0_20px_30px_rgb(14_59_39/0.18)] md:block"
      />
      <div className="relative z-20 mt-auto flex max-w-full flex-col gap-2.5 md:max-w-[50%]">
        <div className="flex flex-col gap-1 self-start rounded-2xl bg-white/85 px-[18px] py-3.5">
          <strong className="text-[15px] font-semibold">Dr. H. Gohar</strong>
          <span className="text-[13px] text-ink-3">Consultant gynaecologist and menopause specialist</span>
        </div>
        <span className="font-emr-mono text-[13px] text-ink-2">
          records.vclinicgohar.com
        </span>
        <span className="text-[13px] text-ink-2">Patients: this is not the patient portal.</span>
      </div>
    </section>
  );
}
