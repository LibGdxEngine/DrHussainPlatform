import { cn } from "@/lib/utils";
import { inviteRoles, type InviteRole } from "../data";

interface RolePickerProps {
  value: InviteRole;
  onChange: (role: InviteRole) => void;
}

export function RolePicker({ value, onChange }: RolePickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span id="role-label" className="text-[13px] font-medium text-ink-2">Role</span>
      <div role="radiogroup" aria-labelledby="role-label" className="grid gap-2 sm:grid-cols-2">
        {inviteRoles.map((r) => {
          const on = r.id === value;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(r.id)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 rounded-2xl p-3 text-start",
                on
                  ? "border-[1.5px] border-brand bg-brand-tint text-brand-ink"
                  : "border border-field bg-white text-ink hover:border-brand",
              )}
            >
              <strong className="text-sm font-semibold">{r.label}</strong>
              <span className={cn("text-xs leading-normal", on ? "text-ok-ink" : "text-muted")}>{r.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
