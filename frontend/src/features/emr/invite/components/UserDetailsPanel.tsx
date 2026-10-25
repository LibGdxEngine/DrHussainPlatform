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
        بيانات المستخدم
      </h2>
      <Field label="الاسم بالكامل">
        <TextInput defaultValue="سارة محمود" />
      </Field>
      <Field label="الإيميل">
        <TextInput dir="ltr" defaultValue="nurse.vclinic@gmail.com" />
      </Field>
      <Field label="الموبايل">
        <TextInput dir="ltr" defaultValue="+20 10 •••• 4412" className="text-right" />
      </Field>
      <RolePicker value={role} onChange={onRoleChange} />
      <Field label="طريقة الدخول">
        <SelectInput>
          <option>باسورد + تطبيق التحقق</option>
          <option>Passkey</option>
        </SelectInput>
      </Field>
      <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
        الدعوة بتوصل بالإيميل وتنتهي بعد 48 ساعة. أول دخول لازم يتفعّل فيه التحقق بخطوتين. الإضافة دي بتتسجل في سجل المراجعة.
      </p>
    </Panel>
  );
}
