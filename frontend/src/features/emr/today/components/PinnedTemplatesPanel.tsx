"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { contentApi, type EmailTemplate } from "@/lib/api/emr/content";
import { emrRoutes } from "@/features/emr/routes";
import { templateHref, templateStatus } from "@/features/emr/settings/templateStatus";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";

/** The email templates the doctor pinned, one click from the home page into the editor. */
export function PinnedTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    contentApi.templates.list({ pinned: true }).then(
      (list) => !cancelled && setTemplates(list),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel variant="outline" aria-labelledby="pt" className="flex flex-col px-5 py-[18px]">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 id="pt" className="m-0 text-lg font-semibold">
          Pinned templates
        </h2>
        <Link href={emrRoutes.templates} className="ms-auto text-[13px] font-medium text-brand-ink no-underline">
          All templates
        </Link>
      </div>
      {failed ? <p className="m-0 text-[13px] text-muted">Could not load the templates.</p> : null}
      {!failed && !templates ? <p className="m-0 text-[13px] text-muted">Loading…</p> : null}
      {templates && !templates.length ? (
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          No pinned templates. Open a template and choose “Pin to home page”.
        </p>
      ) : null}
      {templates?.map((t, i) => {
        const s = templateStatus(t);
        return (
          <Link
            key={t.id}
            href={templateHref(emrRoutes.templates, t.id)}
            className={cn(
              "flex flex-wrap items-center gap-2 py-2.5 text-ink no-underline hover:text-brand-ink",
              i < templates.length - 1 && "border-b border-line-soft",
            )}
          >
            <span className="text-sm font-semibold">{t.name}</span>
            {t.language === "ar" ? <Pill tone="neutral" size="xs">Arabic</Pill> : null}
            <Pill tone={s.tone} size="xs" className="ms-auto">{s.text}</Pill>
          </Link>
        );
      })}
    </Panel>
  );
}
