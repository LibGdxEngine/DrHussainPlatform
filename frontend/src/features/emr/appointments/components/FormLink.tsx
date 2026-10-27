"use client";

import { useState } from "react";
import { ActionButton } from "../../ui/Action";

/** Copy text, reporting whether the browser allowed it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface FormLinkProps {
  link: string;
  /** Whether the link was already copied for the user (null: not tried). */
  copied?: boolean | null;
}

/** A patient form link shown once, to paste into WhatsApp. */
export function FormLink({ link, copied: initiallyCopied = null }: FormLinkProps) {
  const [copied, setCopied] = useState<boolean | null>(initiallyCopied);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label="Patient form link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-9 min-w-0 flex-1 rounded-[12px] border border-field bg-white px-3 font-emr-mono text-xs text-ink outline-none"
        />
        <ActionButton size="sm" variant="quiet" onClick={() => copyText(link).then(setCopied)}>
          {copied ? "Copied" : "Copy"}
        </ActionButton>
      </div>
      <span className="text-xs text-muted">
        {copied === false
          ? "Could not copy automatically: select the link and copy it."
          : "Paste it into WhatsApp. Making a new link stops this one working."}
      </span>
    </div>
  );
}
