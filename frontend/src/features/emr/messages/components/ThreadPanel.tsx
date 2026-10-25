"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { emrRoutes } from "@/features/emr/routes";
import { Panel } from "@/features/emr/ui/Panel";
import { TextArea } from "@/features/emr/ui/Fields";
import {
  attachmentOptions, initialAttachments, initialDraft, initialMessages, SENT_WHEN, SENT_WHO,
  type AttachmentId,
} from "../data";
import { MessageBubble } from "./MessageBubble";

export function ThreadPanel() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState(initialDraft);
  const [attached, setAttached] = useState(initialAttachments);

  const toggle = (id: AttachmentId) => setAttached((a) => ({ ...a, [id]: !a[id] }));

  const send = () => {
    if (!draft.trim()) return;
    const att = attachmentOptions.filter((o) => attached[o.id]).map((o) => `${o.name}.pdf`);
    setMessages((m) => [...m, { from: "doc", who: SENT_WHO, when: SENT_WHEN, text: draft, att }]);
    setDraft("");
    setAttached({});
  };

  return (
    <Panel aria-labelledby="th" className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3 border-b border-line-soft pb-4">
        <div className="flex flex-col gap-1">
          <h2 id="th" className="m-0 text-xl font-semibold">ليلى أحمد · نتايج الدم</h2>
          <span className="text-[13px] text-muted">
            <span dir="ltr" className="font-emr-mono">l•••••@gmail.com</span> · وافقت على التواصل بالإيميل 11 أكتوبر 2026 · المحادثة متسجلة في ملفها
          </span>
        </div>
        <Link
          href={emrRoutes.visit}
          className="ms-auto inline-flex min-h-[38px] flex-none items-center rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-ink no-underline"
        >
          افتح الملف
        </Link>
      </div>

      <ol className="m-0 flex flex-1 list-none flex-col gap-3.5 p-0">
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
      </ol>

      <div className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-canvas-2 p-3.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          الرد
          <TextArea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="resize-y leading-[1.7]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          إرفاق من الملف:
          {attachmentOptions.map((o) => {
            const on = !!attached[o.id];
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(o.id)}
                className={cn(
                  "min-h-[34px] cursor-pointer rounded-full border px-3 text-xs",
                  on
                    ? "border-brand bg-brand-tint font-semibold text-brand-ink"
                    : "border-field bg-white text-ink",
                )}
              >
                {on ? "✓ " : ""}
                {o.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={send}
            className="ms-auto min-h-11 cursor-pointer rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-ink"
          >
            ابعت
          </button>
        </div>
        <span className="text-xs text-muted">بيتبعت من إيميل العيادة. ردودها بترجع في نفس المحادثة وبتتسجل.</span>
      </div>
    </Panel>
  );
}
