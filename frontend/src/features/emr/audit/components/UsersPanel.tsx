import Image from "next/image";
import Link from "next/link";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { clinicUsers, patientsNote } from "../data";
import type { ClinicUser } from "../types";
import { cn } from "@/lib/utils";

function Avatar({ avatar }: { avatar: ClinicUser["avatar"] }) {
  if (avatar.kind === "photo") {
    return (
      <Image
        src="/emr/dr-gohar.webp"
        alt=""
        width={44}
        height={44}
        className="size-11 flex-none rounded-full object-cover object-[50%_8%]"
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-11 flex-none items-center justify-center rounded-full font-bold",
        avatar.className,
      )}
    >
      {avatar.letter}
    </span>
  );
}

function UserRow({ user }: { user: ClinicUser }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-canvas-2 p-3">
      <Avatar avatar={user.avatar} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="text-sm font-semibold">{user.name}</strong>
        <span className="truncate font-emr-mono text-xs text-muted">{user.email}</span>
      </span>
      <span className="flex flex-col items-end gap-1 text-xs text-muted">
        <Pill tone={user.roleTone} size="sm" className="py-0.5">
          {user.roleLabel}
        </Pill>
        {user.meta.kind === "inviteLink" ? (
          <Link href={emrRoutes.invite} className="font-semibold text-brand">
            {user.meta.text}
          </Link>
        ) : (
          user.meta.text
        )}
      </span>
    </div>
  );
}

export function UsersPanel() {
  return (
    <Panel aria-labelledby="us" className="flex flex-col gap-3 p-5">
      <div className="flex items-center">
        <h2 id="us" className="m-0 text-lg font-semibold">
          المستخدمين
        </h2>
        <ActionLink href={emrRoutes.invite} size="sm" className="ms-auto min-h-[38px] px-4">
          + ادعُ مستخدم
        </ActionLink>
      </div>
      {clinicUsers.map((u) => (
        <UserRow key={u.id} user={u} />
      ))}
      <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">{patientsNote}</p>
    </Panel>
  );
}
