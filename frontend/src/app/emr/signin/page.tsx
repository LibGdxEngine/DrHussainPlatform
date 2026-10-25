import { PasswordPanel } from "@/features/emr/signin/components/PasswordPanel";
import { SignInHero } from "@/features/emr/signin/components/SignInHero";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-5 bg-canvas p-5 lg:my-8 lg:min-h-[900px] lg:flex-row lg:rounded-[32px] lg:shadow-frame">
      <SignInHero />
      <PasswordPanel returnTo={Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl} />
    </div>
  );
}
