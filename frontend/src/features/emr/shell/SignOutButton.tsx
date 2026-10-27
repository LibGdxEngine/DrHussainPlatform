"use client";

import { signOut } from "next-auth/react";
import { emrRoutes } from "../routes";
import { Icon } from "../ui/icons";

/** Ends the staff session, then returns to the sign-in screen. */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: emrRoutes.signin })}
      className="flex min-h-[46px] cursor-pointer items-center gap-3 rounded-[14px] border-0 bg-transparent px-3.5 text-start text-[15px] font-medium text-muted hover:bg-canvas hover:text-ink"
    >
      <Icon name="logout" />
      Sign out
    </button>
  );
}
