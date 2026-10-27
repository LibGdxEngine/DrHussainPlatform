"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { documentsApi, type DocumentSlot, type PatientDocument } from "@/lib/api/emr/documents";
import { mailApi } from "@/lib/api/emr/mail";
import { ordersApi, type Order } from "@/lib/api/emr/orders";
import { resultsApi } from "@/lib/api/emr/results";
import { formatDay } from "../../format";
import { usePatientResource } from "../../journey/usePatientResource";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { latestValues } from "../labValues";

const loadDocuments = (patient: string) => documentsApi.list(patient).then((page) => page.results);
const loadKeyValues = async (patient: string) => {
  const [values, tests] = await Promise.all([resultsApi.history(patient), resultsApi.tests()]);
  return latestValues(values.results, tests);
};
const loadOrders = (patient: string) => ordersApi.list(patient);
const loadThreads = (patient: string) =>
  mailApi.threads.list("inbox", "all", undefined, patient).then((page) => page.results);

/** Loading, error and empty states shared by the side panels. */
function PanelState({ error, loading, empty }: { error?: string; loading: boolean; empty: string | false }) {
  if (error) return <p role="alert" className="m-0 text-[13px] text-danger-ink">{error}</p>;
  if (loading) return <p className="m-0 text-[13px] text-muted">Loading…</p>;
  return empty ? <p className="m-0 text-[13px] text-muted">{empty}</p> : null;
}

const slots: { id: DocumentSlot; name: string }[] = [
  { id: "lab", name: "Lab results" },
  { id: "us", name: "Ultrasound" },
  { id: "rad", name: "Other imaging" },
  { id: "path", name: "Pathology" },
  { id: "paper", name: "Old paper notes" },
  { id: "letter", name: "Letters" },
];

function slotMeta(docs: PatientDocument[]): string {
  if (!docs.length) return "None";
  const latest = docs
    .map((d) => d.document_date || d.created_at)
    .sort()
    .at(-1);
  return `${docs.length} · Latest ${formatDay(latest)}`;
}

export function DocumentsPanel({ patientId, mrn, scanHref }: { patientId: string; mrn: string; scanHref: string }) {
  const documents = usePatientResource(patientId, loadDocuments, "Could not load the documents.");
  const docs = documents.data;
  const docsHref = `${emrRoutes.docs}?patient=${encodeURIComponent(mrn)}`;
  return (
    <Panel aria-labelledby="dc" className="flex flex-col p-5">
      <div className="mb-1.5 flex items-center">
        <h2 id="dc" className="m-0 text-lg font-semibold">
          Documents
        </h2>
        <ActionLink href={scanHref} variant="outline" size="sm" className="ms-auto min-h-[34px] border px-3 text-xs">
          + Scan / upload
        </ActionLink>
      </div>
      <PanelState error={documents.error} loading={!docs} empty={false} />
      {docs
        ? slots.map((s, i) => (
            <Link
              key={s.id}
              href={docsHref}
              className={cn(
                "flex py-[11px] text-sm text-ink no-underline",
                i < slots.length - 1 ? "border-b border-line-soft" : "pb-0.5",
              )}
            >
              <span>{s.name}</span>
              <span className="ms-auto text-[13px] text-muted">{slotMeta(docs.filter((d) => d.slot === s.id))}</span>
            </Link>
          ))
        : null}
    </Panel>
  );
}

const kvGrid = "grid grid-cols-[1.2fr_1fr_1fr]";

export function KeyValuesPanel({ patientId }: { patientId: string }) {
  const keyValues = usePatientResource(patientId, loadKeyValues, "Could not load the results.");
  const rows = keyValues.data;
  return (
    <Panel aria-labelledby="kv" className="flex flex-col gap-1 p-5">
      <h2 id="kv" className="m-0 mb-2 text-lg font-semibold">
        Key values (latest results)
      </h2>
      <PanelState
        error={keyValues.error}
        loading={!rows}
        empty={rows?.length === 0 && "No results read or typed in yet."}
      />
      {rows?.length ? (
        <>
          <div className={cn(kvGrid, "px-2.5 py-1.5 text-xs text-muted")}>
            <span>Test</span>
            <span>Result</span>
            <span>Optimal</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              className={cn(kvGrid, "rounded-[10px] px-2.5 py-[9px] text-[13px]", r.out && "bg-warn-tint")}
            >
              <span className="flex flex-col">
                {r.name}
                <span className="text-[11px] text-muted">{formatDay(r.date)}</span>
              </span>
              <strong className="font-semibold">{r.result}</strong>
              <span>{r.optimal}</span>
            </div>
          ))}
          <p className="m-0 mt-1.5 text-xs text-muted">Outside optimal = shaded, not an alert.</p>
        </>
      ) : null}
    </Panel>
  );
}

function deliveryText(order: Order): string {
  if (order.delivery === "email") {
    const status = order.email_status === "failed" ? " (failed)" : order.email_status === "queued" ? " (queued)" : "";
    return `Emailed${order.sent_to ? ` to ${order.sent_to}` : ""}${status}`;
  }
  return order.delivery === "print" ? "Printed for the patient" : "Done in clinic";
}

export function SentOrdersPanel({ patientId, mrn }: { patientId: string; mrn: string }) {
  const orders = usePatientResource(patientId, loadOrders, "Could not load the orders.");
  const list = orders.data?.slice(0, 5);
  return (
    <Panel aria-labelledby="os" className="flex flex-col gap-3 p-5">
      <h2 id="os" className="m-0 text-lg font-semibold">
        Orders &amp; prescriptions sent
      </h2>
      <PanelState error={orders.error} loading={!list} empty={list?.length === 0 && "Nothing sent yet."} />
      {list?.map((o) => (
        <div key={o.id} className="text-sm leading-relaxed">
          <strong className="font-semibold">
            {o.kind === "prescription" ? "Prescription" : "Lab request"}: {o.title}
          </strong>
          <br />
          <span className={cn("text-xs", o.email_status === "failed" ? "text-danger-ink" : "text-muted")}>
            {deliveryText(o)} · {formatDay(o.created_at)}
            {o.issued_by_name ? ` · ${o.issued_by_name}` : ""}
          </span>
        </div>
      ))}
      {orders.data && orders.data.length > 5 ? (
        <Link href={`${emrRoutes.orders}?patient=${encodeURIComponent(mrn)}`} className="text-[13px] text-brand">
          All {orders.data.length} orders
        </Link>
      ) : null}
    </Panel>
  );
}

export function EmailsPanel({ patientId, mrn }: { patientId: string; mrn: string }) {
  const threads = usePatientResource(patientId, loadThreads, "Could not load the emails.");
  const list = threads.data?.slice(0, 3);
  const msgsHref = `${emrRoutes.msgs}?patient=${encodeURIComponent(mrn)}`;
  return (
    <Panel
      aria-labelledby="re"
      className="flex flex-col gap-3 bg-[radial-gradient(130%_120%_at_90%_0%,#2f8a5c_0%,#14583a_55%,#0e3b27_100%)] p-5 text-white"
    >
      <h2 id="re" className="m-0 text-lg font-semibold">
        Emails
      </h2>
      {threads.error ? (
        <p role="alert" className="m-0 rounded-[14px] bg-white p-3 text-[13px] text-danger-ink">{threads.error}</p>
      ) : !list ? (
        <p className="m-0 text-[13px] text-mint-2">Loading…</p>
      ) : !list.length ? (
        <p className="m-0 text-[13px] text-mint-2">No emails with this patient yet.</p>
      ) : (
        list.map((t) => (
          <Link
            key={t.id}
            href={`${msgsHref}&thread=${encodeURIComponent(t.id)}`}
            className={cn(
              "rounded-[14px] p-3 text-[13px] leading-[1.7] no-underline",
              t.has_inbound ? "bg-white text-ink" : "bg-white/10 text-white",
            )}
          >
            <span className={cn("text-[11px]", t.has_inbound ? "text-muted" : "text-mint-2")}>
              {t.has_inbound ? "From the patient" : "Clinic → Patient"} · {formatDay(t.last_message_at)}
              {t.unread ? " · unread" : ""}
            </span>
            <br />
            <strong className="font-semibold">{t.subject || "(no subject)"}</strong>
            {t.preview ? (
              <>
                <br />
                {t.preview}
              </>
            ) : null}
          </Link>
        ))
      )}
      <ActionLink href={msgsHref} variant="white" size="sm" className="min-h-10 self-start px-4">
        Open emails
      </ActionLink>
    </Panel>
  );
}
