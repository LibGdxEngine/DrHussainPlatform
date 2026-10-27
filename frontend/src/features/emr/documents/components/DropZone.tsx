"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png";

interface DropZoneProps {
  /** Without a handler the zone is a static prompt (scan station mock-up). */
  onFiles?: (files: File[]) => void;
  busy?: boolean;
  hint?: string;
}

export function DropZone({ onFiles, busy = false, hint }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const live = Boolean(onFiles) && !busy;

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length && onFiles) onFiles(files);
  }

  return (
    <div
      role={onFiles ? "button" : undefined}
      tabIndex={onFiles ? 0 : undefined}
      aria-disabled={onFiles ? busy : undefined}
      aria-label={onFiles ? "Upload scans" : undefined}
      onClick={() => live && input.current?.click()}
      onKeyDown={(e) => {
        if (live && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        if (!live) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!live) return;
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-3xl border-2 border-dashed border-hatch bg-brand-wash p-[22px] text-center",
        live && "cursor-pointer hover:border-brand focus-visible:border-brand focus-visible:outline-none",
        over && "border-brand bg-brand-tint",
        busy && "opacity-70",
      )}
    >
      {/* Upload glyph is local: the shared icon set has no equivalent. */}
      <svg
        aria-hidden="true"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-brand"
      >
        <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <strong className="text-[15px] font-semibold">{busy ? "Uploading…" : "Drop scans here"}</strong>
      <span className="text-[13px] text-muted">
        {hint ?? "PDF, JPG or PNG. Choose the category, date and name after uploading."}
      </span>
      {onFiles ? (
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      ) : null}
    </div>
  );
}
