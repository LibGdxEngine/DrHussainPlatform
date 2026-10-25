import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import type { InviteRole } from "../types";
import { RolePicker } from "./RolePicker";

interface UserDetailsPanelProps {
  role: InviteRole;
  onRoleChange: (role: InviteRole) => void;
}

export function UserDetailsPanel({ role, onRoleChange }: UserDetailsPanelProps) {
  return (
    <Panel aria-labelledby="ud" className="flex flex-col gap-3.5 p-5">
      <h2 id="ud" className="m-0 text-lg font-semibold">
        User details
      </h2>
      <Field label="Full name">
        <TextInput defaultValue="Sara Mahmoud" />
      </Field>
      <Field label="Email">
        <TextInput defaultValue="nurse.vclinic@gmail.com" />
      </Field>
      <Field label="Mobile">
        <TextInput defaultValue="+20 10 •••• 4412" />
      </Field>
      <RolePicker value={role} onChange={onRoleChange} />
      <Field label="Sign-in method">
        <SelectInput>
          <option>Password + authenticator app</option>
          <option>Passkey</option>
        </SelectInput>
      </Field>
      <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
        The invite is sent by email and expires after 48 hours. Two-step verification must be set up on first sign-in. This addition is recorded in the audit log.
      </p>
    </Panel>
  );
}
