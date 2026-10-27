"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/features/emr/ui/Action";
import { Field, TextArea, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { cn } from "@/lib/utils";
import { alertsApi, type PatientAlert } from "@/lib/api/emr/alerts";
import { contentApi, type Prescription } from "@/lib/api/emr/content";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { ordersApi, type Order, type OrderKind } from "@/lib/api/emr/orders";
import type { Patient } from "@/lib/api/emr/patients";
import {
  addTests, issueErrorMessage, orderBody, rxDeliveries, setTests, testCode, testDeliveries, testSets, testsTitle,
  type DeliveryChoice, type MedicineLine, type TestLine,
} from "../data";
import { printableOrderHtml, printHtml } from "../print";
import { BlockAlert } from "./BlockAlert";
import { DeliveryFieldset } from "./DeliveryFieldset";
import { MedicationCard } from "./MedicationCard";
import { SentLog } from "./SentLog";
import { TestChip } from "./TestChip";
import { TestSetButton } from "./TestSetButton";

type Notice = { tone: "ok" | "error"; text: string };

interface OrdersWorkspaceProps {
  patient: Patient;
  /** Only the doctor issues orders; null while the role is loading. */
  isLead: boolean | null;
  clinicName: string;
}

export function OrdersWorkspace({ patient, isLead, clinicName }: OrdersWorkspaceProps) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<PatientAlert[] | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Prescription[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [tests, setTestLines] = useState<TestLine[]>([]);
  const [otherTest, setOtherTest] = useState("");
  const [testDelivery, setTestDelivery] = useState<DeliveryChoice>("email_lab");
  const [labEmail, setLabEmail] = useState("");
  const [testNotes, setTestNotes] = useState("");

  const [meds, setMeds] = useState<MedicineLine[]>([]);
  const [draft, setDraft] = useState({ drug: "", dose: "", directions: "" });
  const [rxDelivery, setRxDelivery] = useState<DeliveryChoice>("print");
  const [rxNotes, setRxNotes] = useState("");

  const [issuing, setIssuing] = useState<OrderKind | null>(null);
  const [notices, setNotices] = useState<Partial<Record<OrderKind, Notice>>>({});

  useEffect(() => {
    let cancelled = false;
    ordersApi.list(patient.id).then(
      (list) => {
        if (!cancelled) setOrders([...list].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      (err: unknown) => {
        if (!cancelled) setOrdersError(apiErrorMessage(err, "Could not load the sent log."));
      },
    );
    alertsApi.list({ patient: patient.id, status: "open" }).then(
      (page) => {
        if (!cancelled) setAlerts(page.results.filter((a) => a.level === "red"));
      },
      (err: unknown) => {
        if (!cancelled) setAlertsError(apiErrorMessage(err, "Could not check the patient's alerts."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  useEffect(() => {
    if (!isLead) return;
    let cancelled = false;
    contentApi.prescriptions.list().then(
      (list) => {
        if (!cancelled) setCatalog(list);
      },
      (err: unknown) => {
        if (!cancelled) setCatalogError(apiErrorMessage(err, "Could not load the clinic's prescription list."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isLead]);

  const ticked = tests.filter((t) => t.checked).length;
  const noEmail = patient.email ? undefined : "no email on file";
  // The lab address last used for this patient, offered so it need not be retyped.
  const lastLab = useMemo(
    () => orders?.find((o) => o.kind === "tests" && o.delivery === "email" && o.sent_to && o.sent_to !== patient.email)?.sent_to,
    [orders, patient.email],
  );

  const print = (order: Order) => printHtml(printableOrderHtml(order, patient, clinicName));

  async function issue(kind: OrderKind) {
    const delivery = kind === "tests" ? testDelivery : rxDelivery;
    setIssuing(kind);
    setNotices((n) => ({ ...n, [kind]: undefined }));
    try {
      const order = await ordersApi.issue(orderBody({
        patient: patient.id,
        kind,
        delivery,
        labEmail,
        title: kind === "tests" ? testsTitle(tests) : "Prescription",
        notes: kind === "tests" ? testNotes : rxNotes,
        tests,
        medicines: meds,
      }));
      setOrders((list) => [order, ...(list ?? [])]);
      if (kind === "tests") {
        setTestLines([]);
        setTestNotes("");
      } else {
        setMeds([]);
        setRxNotes("");
      }
      if (order.delivery === "print") print(order);
      const how = order.delivery === "email" ? `queued to ${order.sent_to}` : order.delivery === "print" ? "ready to print" : "recorded";
      setNotices((n) => ({ ...n, [kind]: { tone: "ok", text: `${order.title}: ${how}.` } }));
    } catch (err) {
      setNotices((n) => ({ ...n, [kind]: { tone: "error", text: issueErrorMessage(err, "Could not issue it. Try again.") } }));
    } finally {
      setIssuing(null);
    }
  }

  function addOther() {
    const name = otherTest.trim();
    if (!name) return;
    setTestLines((t) => addTests(t, [{ code: testCode(name), name }]));
    setOtherTest("");
  }

  function toggleCatalog(item: Prescription) {
    setMeds((list) => list.some((m) => m.prescription_item === item.id)
      ? list.filter((m) => m.prescription_item !== item.id)
      : [...list, { prescription_item: item.id, drug: item.drug, dose: item.dose ?? "", directions: item.directions ?? "" }]);
  }

  const alertBlock = alertsError ? (
    <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2.5 text-[13px] text-danger-ink">{alertsError}</p>
  ) : (
    (alerts ?? []).map((a) => <BlockAlert key={a.id} alert={a} fileNumber={patient.file_number} />)
  );

  if (isLead !== true) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-2 p-5">
            <h2 className="m-0 text-lg font-semibold">Orders & prescriptions</h2>
            <p className="m-0 text-sm text-muted">
              {isLead === null
                ? "Checking your access…"
                : "Only the doctor issues lab requests and prescriptions. Everything issued for this patient is listed here."}
            </p>
          </Panel>
          {alertBlock}
        </div>
        <SentLog orders={orders} error={ordersError} onPrint={print} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel aria-labelledby="lr" className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1">
            <h2 id="lr" className="m-0 text-lg font-semibold">Lab, imaging and pathology requests</h2>
            <span className="text-[13px] text-muted">One click adds a full set. Untick any test you don&apos;t need.</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {testSets.map((s) => (
              <TestSetButton
                key={s.name}
                name={s.name}
                count={s.ids.length}
                selected={s.ids.every((id) => tests.some((t) => t.code === id && t.checked))}
                onAdd={() => setTestLines((t) => addTests(t, setTests(s)))}
              />
            ))}
          </div>
          {tests.length ? (
            <div className="flex flex-wrap gap-2">
              {tests.map((t) => (
                <TestChip
                  key={t.code}
                  name={t.name}
                  checked={t.checked}
                  onToggle={() => setTestLines((list) => list.map((l) => (l.code === t.code ? { ...l, checked: !l.checked } : l)))}
                />
              ))}
            </div>
          ) : null}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
          >
            <Field label="Another test" className="min-w-[220px] flex-1">
              <TextInput value={otherTest} onChange={(e) => setOtherTest(e.target.value)} maxLength={128} placeholder="Test name" />
            </Field>
            <ActionButton type="submit" variant="quiet" size="sm" className="mb-1" disabled={!otherTest.trim()}>
              + Add
            </ActionButton>
          </form>
          <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
            <strong className="text-ink">{ticked} {ticked === 1 ? "test" : "tests"} selected</strong>
            {ticked ? ` · ${testsTitle(tests)}` : ""}
          </p>
        </Panel>

        <Panel aria-labelledby="rx" className="flex flex-col gap-2.5 p-5">
          <h2 id="rx" className="m-0 mb-1 text-lg font-semibold">Prescription</h2>
          {alertBlock}
          {catalogError ? (
            <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2.5 text-[13px] text-danger-ink">{catalogError}</p>
          ) : catalog === null ? (
            <p className="m-0 text-[13px] text-muted">Loading the clinic&apos;s prescription list…</p>
          ) : catalog.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">The clinic&apos;s prescription list is empty. Type the medicine below.</p>
          ) : (
            catalog.map((item) => (
              <MedicationCard
                key={item.id}
                drug={item.drug}
                dose={item.dose}
                directions={item.directions}
                checked={meds.some((m) => m.prescription_item === item.id)}
                onToggle={() => toggleCatalog(item)}
              />
            ))
          )}
          {meds.filter((m) => !m.prescription_item).map((m, i) => (
            <div key={`${m.drug}-${i}`} className="flex items-center gap-3 rounded-2xl border-[1.5px] border-brand bg-brand-wash px-4 py-3">
              <span className="flex min-w-0 flex-col gap-[3px]">
                <strong className="text-sm font-semibold">
                  {m.drug}
                  {m.dose ? <span className="font-normal"> · {m.dose}</span> : null}
                </strong>
                {m.directions ? <span className="text-[13px] text-muted">{m.directions}</span> : null}
              </span>
              <ActionButton
                variant="quiet"
                size="sm"
                className="ms-auto"
                aria-label={`Remove ${m.drug}`}
                onClick={() => setMeds((list) => list.filter((x) => x !== m))}
              >
                Remove
              </ActionButton>
            </div>
          ))}
          <form
            className="grid gap-2.5 rounded-2xl border border-line p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.drug.trim()) return;
              setMeds((list) => [...list, { prescription_item: null, ...draft }]);
              setDraft({ drug: "", dose: "", directions: "" });
            }}
          >
            <Field label="Medicine">
              <TextInput value={draft.drug} maxLength={255} onChange={(e) => setDraft((d) => ({ ...d, drug: e.target.value }))} />
            </Field>
            <Field label="Dose">
              <TextInput value={draft.dose} maxLength={255} onChange={(e) => setDraft((d) => ({ ...d, dose: e.target.value }))} />
            </Field>
            <Field label="Directions">
              <TextInput value={draft.directions} onChange={(e) => setDraft((d) => ({ ...d, directions: e.target.value }))} />
            </Field>
            <ActionButton type="submit" variant="quiet" size="sm" className="mb-1" disabled={!draft.drug.trim()}>
              + Add
            </ActionButton>
          </form>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel aria-labelledby="sd" className="flex flex-col gap-3.5 p-5">
          <h2 id="sd" className="m-0 text-lg font-semibold">Send</h2>
          <DeliveryFieldset
            legend="Lab request"
            name="lab"
            options={testDeliveries}
            value={testDelivery}
            onChange={setTestDelivery}
            unavailable={{ email_patient: noEmail }}
          >
            {testDelivery === "email_lab" ? (
              <Field label="Lab email address" className="mt-1">
                <TextInput type="email" value={labEmail} onChange={(e) => setLabEmail(e.target.value)} placeholder="lab@example.com" />
                {lastLab && !labEmail ? (
                  <button
                    type="button"
                    onClick={() => setLabEmail(lastLab)}
                    className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs font-semibold text-brand"
                  >
                    Use {lastLab}
                  </button>
                ) : null}
              </Field>
            ) : null}
            <Field label="Note on the request (optional)" className="mt-1">
              <TextArea rows={2} value={testNotes} maxLength={4000} onChange={(e) => setTestNotes(e.target.value)} />
            </Field>
          </DeliveryFieldset>
          <IssueButton
            busy={issuing === "tests"}
            disabled={issuing !== null || ticked === 0 || (testDelivery === "email_lab" && !labEmail.trim())}
            label={ticked === 0 ? "Choose tests to request" : `Send lab request (${ticked})`}
            onClick={() => void issue("tests")}
          />
          <NoticeLine notice={notices.tests} />

          <DeliveryFieldset
            legend="Prescription"
            name="rx"
            options={rxDeliveries}
            value={rxDelivery}
            onChange={setRxDelivery}
            unavailable={{ email_patient: noEmail }}
          >
            <Field label="Note on the prescription (optional)" className="mt-1">
              <TextArea rows={2} value={rxNotes} maxLength={4000} onChange={(e) => setRxNotes(e.target.value)} />
            </Field>
          </DeliveryFieldset>
          {alerts && alerts.length > 0 && meds.length > 0 ? (
            <p className="m-0 text-xs font-semibold text-danger-ink">
              This patient has {alerts.length} open red {alerts.length === 1 ? "alert" : "alerts"}. Review before prescribing.
            </p>
          ) : null}
          <IssueButton
            busy={issuing === "prescription"}
            disabled={issuing !== null || meds.length === 0}
            label={meds.length === 0 ? "Add medicines to prescribe" : `Issue prescription (${meds.length})`}
            onClick={() => void issue("prescription")}
          />
          <NoticeLine notice={notices.prescription} />
          <span className="text-xs text-muted">Every copy is logged with date, method and recipient.</span>
        </Panel>
        <SentLog orders={orders} error={ordersError} onPrint={print} />
      </div>
    </div>
  );
}

function IssueButton({ busy, disabled, label, onClick }: { busy: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <ActionButton size="lg" disabled={disabled} onClick={onClick}>
      {busy ? "Sending…" : label}
    </ActionButton>
  );
}

function NoticeLine({ notice }: { notice?: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "m-0 rounded-xl px-3 py-2.5 text-[13px]",
        notice.tone === "error" ? "bg-danger-tint text-danger-ink" : "bg-ok-tint text-ok-ink",
      )}
    >
      {notice.text}
    </p>
  );
}
