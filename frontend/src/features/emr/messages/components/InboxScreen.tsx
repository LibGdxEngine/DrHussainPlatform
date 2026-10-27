"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { mailApi, type MailFilter, type MailFolder, type MailThread, type MailThreadDetail, type Mailbox } from "@/lib/api/emr/mail";
import { patientsApi, type Patient } from "@/lib/api/emr/patients";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { InboxList } from "./InboxList";
import { MailboxHeader, mailboxReady } from "./MailboxHeader";
import { MailboxSettings } from "./MailboxSettings";
import { ThreadPanel } from "./ThreadPanel";

interface InboxScreenProps {
  patientMrn?: string;
  threadId?: string;
  compose?: "case";
}

/** The clinic mailbox: every email in its thread, filed with the patient it belongs to. */
export function InboxScreen({ patientMrn, threadId, compose }: InboxScreenProps) {
  const [mailbox, setMailbox] = useState<Mailbox | null | undefined>(undefined);
  const [threads, setThreads] = useState<{ key: string; list: MailThread[]; total: number } | null>(null);
  const [selected, setSelected] = useState<MailThreadDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(threadId);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [filter, setFilter] = useState<MailFilter>("all");
  const [query, setQuery] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [unread, setUnread] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    mailApi.mailbox.get().then((m) => !cancelled && setMailbox(m), () => !cancelled && setMailbox(null));
    if (patientMrn) patientsApi.byFileNumber(patientMrn).then((p) => !cancelled && setPatient(p), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [patientMrn]);

  const key = `${folder}|${filter}|${query}|${patient?.id ?? ""}|${refresh}`;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([mailApi.threads.list(folder, filter, query.trim(), patient?.id), mailApi.threads.counts()]).then(
        ([page, counts]) => {
          if (cancelled) return;
          setThreads({ key, list: page.results, total: page.count });
          setUnread(counts.unread);
        },
        (err: unknown) => {
          if (!cancelled) setError(apiErrorMessage(err, "Could not load the mailbox."));
        },
      );
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [folder, filter, query, patient, refresh, key]);

  const list = threads?.key === key ? threads.list : null;
  const notShown = threads?.key === key ? threads.total - threads.list.length : 0;
  const openId = selectedId ?? (compose ? list?.[0]?.id : undefined);
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    mailApi.threads.get(openId).then(
      (detail) => {
        if (cancelled) return;
        setSelected(detail);
        setThreads((prev) => prev && { ...prev, list: prev.list.map((t) => (t.id === detail.id ? { ...t, unread: false } : t)) });
        // Opening marked it read on the server; refresh the unread count to match.
        mailApi.threads.counts().then((c) => !cancelled && setUnread(c.unread), () => undefined);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [openId]);

  async function sync() {
    setSyncing(true);
    try {
      await mailApi.mailbox.sync();
      // Mail is taken in by a background task; look again after it has had a moment.
      setTimeout(() => {
        setRefresh((r) => r + 1);
        mailApi.mailbox.get().then(setMailbox, () => undefined);
        setSyncing(false);
      }, 4000);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not check for mail."));
      setSyncing(false);
    }
  }

  const ready = mailboxReady(mailbox ?? null);
  const current = selected && selected.id === openId ? selected : null;

  return (
    <>
      <MailboxHeader
        mailbox={mailbox ?? null}
        unread={unread}
        syncing={syncing}
        onSync={() => void sync()}
        onSettings={() => setSettingsOpen((o) => !o)}
      />
      {error ? <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2.5 text-[13px] text-danger-ink">{error}</p> : null}
      {notShown > 0 ? (
        <p className="m-0 text-[13px] text-muted">
          Showing the newest {list?.length} of {threads?.total} threads. Search or filter to find older ones.
        </p>
      ) : null}

      {mailbox !== undefined && (settingsOpen || !ready) ? (
        <MailboxSettings
          key={mailbox?.address ?? "new"}
          mailbox={mailbox}
          onSaved={setMailbox}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <div className="grid flex-1 grid-cols-1 items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <InboxList
          threads={list}
          folder={folder}
          unread={unread}
          filter={filter}
          query={query}
          selectedId={openId}
          patientFilter={patient?.full_name}
          onFolder={(f) => {
            setFolder(f);
            setSelectedId(undefined);
          }}
          onFilter={setFilter}
          onQuery={setQuery}
          onSelect={setSelectedId}
          onClearPatient={() => setPatient(null)}
        />
        {current ? (
          <ThreadPanel
            key={current.id}
            thread={current}
            compose={compose}
            fromAddress={mailbox?.address || "the clinic mailbox"}
            onChanged={(next) => {
              setSelected(next);
              setRefresh((r) => r + 1);
            }}
          />
        ) : (
          <Panel className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="m-0 text-sm text-muted">Choose an email to read it here.</p>
            {folder !== "inbox" ? (
              <ActionButton variant="quiet" size="sm" onClick={() => setFolder("inbox")}>Back to inbox</ActionButton>
            ) : null}
          </Panel>
        )}
      </div>
    </>
  );
}
