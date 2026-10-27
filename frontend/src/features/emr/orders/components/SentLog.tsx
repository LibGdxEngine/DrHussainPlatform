import { formatDay } from "@/features/emr/format";
import { ActionButton } from "@/features/emr/ui/Action";
import { Panel, PanelHeading } from "@/features/emr/ui/Panel";
import { Pill, type PillTone } from "@/features/emr/ui/Pill";
import type { Order } from "@/lib/api/emr/orders";
import { deliveryLabel } from "../data";

const emailTone: Record<string, { label: string; tone: PillTone }> = {
  queued: { label: "Email queued", tone: "amber" },
  sent: { label: "Email sent", tone: "ok" },
  failed: { label: "Email failed", tone: "danger" },
};

interface SentLogProps {
  orders: Order[] | null;
  error: string | null;
  onPrint: (order: Order) => void;
}

/** Every request and prescription issued for this patient, newest first. */
export function SentLog({ orders, error, onPrint }: SentLogProps) {
  return (
    <Panel aria-labelledby="sl" className="flex flex-col gap-3 p-5">
      <PanelHeading id="sl" aside={orders ? `${orders.length} issued` : undefined}>Sent log</PanelHeading>
      {error ? (
        <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2.5 text-[13px] text-danger-ink">{error}</p>
      ) : orders === null ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Nothing has been requested or prescribed for this patient yet.</p>
      ) : (
        orders.map((o) => {
          const email = emailTone[o.email_status];
          const items = o.kind === "tests"
            ? o.tests.map((t) => t.name)
            : o.medicines.map((m) => [m.drug, m.dose].filter(Boolean).join(" "));
          return (
            <div key={o.id} className="flex gap-3 text-sm leading-relaxed">
              <span className="mt-1.5 size-2.5 flex-none rounded-full bg-brand" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <strong className="font-semibold">{o.title}</strong>
                <span className="text-xs text-muted">
                  {deliveryLabel[o.delivery]}
                  {o.sent_to ? ` to ${o.sent_to}` : ""} · {formatDay(o.created_at)}
                  {o.issued_by_name ? ` · ${o.issued_by_name}` : ""}
                </span>
                {items.length ? <span className="text-xs text-ink-3">{items.join(", ")}</span> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {email ? <Pill tone={email.tone} size="xs">{email.label}</Pill> : null}
                  <ActionButton variant="quiet" size="sm" className="min-h-7 px-2.5 text-xs" onClick={() => onPrint(o)}>
                    Print copy
                  </ActionButton>
                </div>
              </div>
            </div>
          );
        })
      )}
    </Panel>
  );
}
