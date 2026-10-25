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
      <div className="relative z-20 flex max-w-[330px] flex-col gap-3.5">
        <span className="self-start rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ok-ink">
          سجل طبي للموظفين
        </span>
        <h1 className="m-0 text-balance text-4xl font-bold leading-tight tracking-tight lg:text-[44px]">
          سجلات المرضى لفريق رعاية V-Clinic
        </h1>
        <p className="m-0 text-base leading-[1.7] text-ink-2">
          للموظفين المصرّح لهم بس. كل دخول وكل فتح ملف وكل تعديل بيتسجّل.
        </p>
      </div>
      <Image
        src="/emr/dr-gohar-cutout.png"
        alt="د. جوهر"
        width={640}
        height={800}
        priority
        className="absolute -left-2.5 bottom-0 z-10 h-[78%] w-auto drop-shadow-[0_20px_30px_rgb(14_59_39/0.18)]"
      />
      <div className="relative z-20 mt-auto flex flex-col gap-2.5">
        <div className="flex flex-col gap-1 self-start rounded-2xl bg-white/85 px-[18px] py-3.5">
          <strong className="text-[15px] font-semibold">د. ح. جوهر</strong>
          <span className="text-[13px] text-ink-3">استشاري أمراض النساء وسن اليأس</span>
        </div>
        <span dir="ltr" className="text-right font-emr-mono text-[13px] text-ink-2">
          records.vclinicgohar.com
        </span>
        <span className="text-[13px] text-ink-2">للمرضى: ده مش بوابة المريض.</span>
      </div>
    </section>
  );
}
