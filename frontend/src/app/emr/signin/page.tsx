import { SignInHero } from "@/features/emr/signin/components/SignInHero";
import { VerificationPanel } from "@/features/emr/signin/components/VerificationPanel";

export default function SignInPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-5 bg-canvas p-5 lg:my-8 lg:min-h-[900px] lg:flex-row lg:rounded-[32px] lg:shadow-frame">
      <SignInHero />
      <VerificationPanel email="hsgohar@gmail.com" />
    </div>
  );
}
