import { cn } from "@/lib/utils";

const control =
  "min-h-11 w-full rounded-[14px] border border-field bg-white px-3.5 text-sm text-ink outline-none focus:border-brand";

interface FieldProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + control stack used by every form in the EMR. */
export function Field({ label, className, children }: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px] font-medium text-ink-2", className)}>
      {label}
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function SelectInput({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "px-3", className)} {...props} />;
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "py-3 leading-relaxed", className)} {...props} />;
}
