import Link from "next/link";
import { cn } from "@/lib/utils";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { emrRoutes } from "../../routes";
import { documentSlots, emails, keyValues, sentOrders } from "../data";

export function DocumentsPanel() {
  return (
    <Panel aria-labelledby="dc" className="flex flex-col p-5">
      <div className="mb-1.5 flex items-center">
        <h2 id="dc" className="m-0 text-lg font-semibold">
          Documents
        </h2>
        <ActionLink
          href={`${emrRoutes.scan}?patient=VC-000142&visit=v2`}
          variant="outline"
          size="sm"
          className="ms-auto min-h-[34px] border px-3 text-xs"
        >
          + Scan / upload
        </ActionLink>
      </div>
      {documentSlots.map((d, i) => (
        <Link
          key={d.name}
          href={emrRoutes.docs}
          className={cn(
            "flex py-[11px] text-sm text-ink no-underline",
            i < documentSlots.length - 1 ? "border-b border-line-soft" : "pb-0.5",
          )}
        >
          <span>{d.name}</span>
          <span className="ms-auto text-[13px] text-muted">{d.meta}</span>
        </Link>
      ))}
    </Panel>
  );
}

const kvGrid = "grid grid-cols-3";

export function KeyValuesPanel() {
  return (
    <Panel aria-labelledby="kv" className="flex flex-col gap-1 p-5">
      <h2 id="kv" className="m-0 mb-2 text-lg font-semibold">
        Key values (transcribed from scans)
      </h2>
      <div className={cn(kvGrid, "px-2.5 py-1.5 text-xs text-muted")}>
        <span>Test</span>
        <span>Result</span>
        <span>Optimal</span>
      </div>
      {keyValues.map((r) => (
        <div
          key={r.name}
          className={cn(kvGrid, "rounded-[10px] px-2.5 py-[9px] text-[13px]", r.out && "bg-warn-tint")}
        >
          <span>{r.name}</span>
          <strong className="font-semibold">{r.result}</strong>
          <span>{r.ideal}</span>
        </div>
      ))}
      <p className="m-0 mt-1.5 text-xs text-muted">Outside optimal = shaded, not an alert.</p>
    </Panel>
  );
}

export function SentOrdersPanel() {
  return (
    <Panel aria-labelledby="os" className="flex flex-col gap-3 p-5">
      <h2 id="os" className="m-0 text-lg font-semibold">
        Orders & prescriptions sent
      </h2>
      {sentOrders.map((o) => (
        <div key={o.title} className="text-sm leading-relaxed">
          <strong className="font-semibold">{o.title}</strong>
          <br />
          <span className="text-xs text-muted">{o.meta}</span>
        </div>
      ))}
    </Panel>
  );
}

export function EmailsPanel() {
  return (
    <Panel
      aria-labelledby="re"
      className="flex flex-col gap-3 bg-[radial-gradient(130%_120%_at_90%_0%,#2f8a5c_0%,#14583a_55%,#0e3b27_100%)] p-5 text-white"
    >
      <h2 id="re" className="m-0 text-lg font-semibold">
        Results emails
      </h2>
      {emails.map((m) => (
        <div
          key={m.meta}
          className={cn(
            "rounded-[14px] p-3 text-[13px] leading-[1.7]",
            m.from === "doctor" ? "bg-white/10" : "bg-white text-ink",
          )}
        >
          <span className={cn("text-[11px]", m.from === "doctor" ? "text-mint-2" : "text-muted")}>
            {m.meta}
          </span>
          <br />
          {m.text}
        </div>
      ))}
      <ActionLink href={`${emrRoutes.msgs}?patient=VC-000142`} variant="white" size="sm" className="min-h-10 self-start px-4">
        Reply in thread
      </ActionLink>
    </Panel>
  );
}
