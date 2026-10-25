import { emrRoutes } from "@/features/emr/routes";
import { ActionLink } from "@/features/emr/ui/Action";
import { Icon } from "@/features/emr/ui/icons";
import { OtpInput } from "./OtpInput";

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-subtle">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

interface VerificationPanelProps {
  email: string;
}

/** Step 2 of staff sign-in: passkey or authenticator code. */
export function VerificationPanel({ email }: VerificationPanelProps) {
  return (
    <section
      aria-label="Sign-in verification"
      className="flex flex-1 items-center justify-center rounded-[26px] bg-white p-6"
    >
      <div className="flex w-full max-w-[420px] flex-col gap-[22px]">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-ok-tint text-ok-ink">
            <Icon name="check" size={13} strokeWidth={3} />
          </span>
          Step 2 of 2 · password accepted
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[32px] font-bold">Confirm it&apos;s you</h2>
          <p className="m-0 text-[15px] text-muted">
            Signing in as{" "}
            <strong className="font-emr-mono font-semibold text-ink">{email}</strong>
          </p>
        </div>
        <ActionLink href={emrRoutes.today} size="lg">
          <Icon name="key" size={20} />
          Sign in with a passkey
        </ActionLink>
        <Divider>or enter a code</Divider>
        <OtpInput label="Authenticator app code" initial="481" />
        <ActionLink href={emrRoutes.today} variant="outline" size="lg">
          Verify code
        </ActionLink>
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Lost your passkey or phone?{" "}
          <a href={emrRoutes.signin} className="text-brand hover:text-brand-ink">
            Ask the clinic owner to reset it
          </a>
          . Recovery requires the doctor&apos;s approval.
        </p>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-canvas px-3.5 py-3 text-[13px] text-ink-3">
          <Icon name="lock" size={18} className="flex-none" />
          For security, you will be signed out after 15 minutes of inactivity.
        </div>
      </div>
    </section>
  );
}
