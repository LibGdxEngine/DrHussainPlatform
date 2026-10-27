"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { arrivalStatus, countArrived, requestedFiles, type RequestedFile } from "../data";

/** Tests requested for visit 2 and whether each arrived (clinic scan / email) or was entered. */
export function RequestedFilesPanel() {
  const [files, setFiles] = useState<RequestedFile[]>(requestedFiles);
  const arrived = countArrived(files);

  const markEmail = (id: string) =>
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, status: "email" } : f)));

  return (
    <Panel aria-labelledby="rq" className="flex flex-col p-5">
      <div className="mb-1.5 flex items-center">
        <h2 id="rq" className="m-0 text-lg font-semibold">
          Requested for Visit 2
        </h2>
        <span className="ms-auto text-xs text-muted">
          {arrived} of {files.length} received
        </span>
      </div>
      {files.map((f, i) => {
        const st = arrivalStatus[f.status];
        return (
          <div
            key={f.id}
            className={cn(
              "flex flex-wrap items-center gap-2 py-2.5 text-sm",
              i < files.length - 1 && "border-b border-line-soft",
            )}
          >
            <span className="font-medium">{f.name}</span>
            <Pill tone={st.tone} size="xs" className="ms-auto">
              {st.label}
            </Pill>
            {f.status === "pending" ? (
              <span className="flex w-full gap-3 text-xs">
                <Link
                  href={emrRoutes.patients}
                  className="font-semibold text-brand no-underline"
                >
                  Choose patient to scan
                </Link>
                <button
                  type="button"
                  onClick={() => markEmail(f.id)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-ink-2"
                >
                  Link from email
                </button>
              </span>
            ) : null}
          </div>
        );
      })}
      <ActionLink
        href={emrRoutes.patients}
        variant="outline"
        size="sm"
        className="mt-3"
      >
        Choose patient to scan
      </ActionLink>
    </Panel>
  );
}
