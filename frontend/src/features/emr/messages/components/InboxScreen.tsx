"use client";

import { useState } from "react";
import { patients } from "../../patients/data";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import {
  filterThreads, folders, initialMailbox, initialThreads, unreadCount,
  type EmailThread, type FolderId, type InboxFilter, type MailboxAccount, type PatientRef,
} from "../data";
import { InboxList } from "./InboxList";
import { MailboxHeader } from "./MailboxHeader";
import { MailboxSettings } from "./MailboxSettings";
import { ThreadPanel } from "./ThreadPanel";

/** Mail that arrives on "Sync now" in the preview, to show new mail landing in the inbox. */
const syncedThread: EmailThread = {
  id: "t-new-lab",
  folder: "inbox",
  subject: "Results ready · Laila Ahmed",
  contact: { name: "Al Borg Lab", email: "results@alborglab.com", initial: "A" },
  suggestion: { mrn: "VC-000142", name: "Laila Ahmed" },
  date: "13 Oct",
  preview: "HbA1c and Lp(a) for Laila Ahmed are attached.",
  unread: true,
  messages: [
    {
      from: "pt",
      who: "Al Borg Lab → Dr. Gohar",
      when: "13 Oct 2026 · just now",
      text: "HbA1c and Lp(a) for Laila Ahmed are attached.",
      att: ["Laila Ahmed HbA1c Lp(a).pdf"],
    },
  ],
};

interface InboxScreenProps {
  patientMrn?: string;
  compose?: "case";
}

export function InboxScreen({ patientMrn, compose }: InboxScreenProps) {
  const [account, setAccount] = useState<MailboxAccount | null>(initialMailbox);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => filterThreads(initialThreads, "inbox", "all", "", patientMrn)[0]?.id,
  );
  // The thread open on arrival counts as read.
  const [threads, setThreads] = useState(() =>
    initialThreads.map((t) => (t.id === selectedId ? { ...t, unread: false } : t)),
  );
  const [folder, setFolder] = useState<FolderId>("inbox");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [patientFilter, setPatientFilter] = useState(patientMrn);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const visible = filterThreads(threads, folder, filter, query, patientFilter);
  const selected = threads.find((t) => t.id === selectedId && t.folder === folder);
  const folderUnread = Object.fromEntries(folders.map((f) => [f.id, unreadCount(threads, f.id)])) as Record<FolderId, number>;
  const filterPatient: PatientRef | undefined = patientFilter
    ? (() => {
        const p = patients.find((x) => x.mrn === patientFilter);
        return p ? { mrn: p.mrn, name: p.name } : undefined;
      })()
    : undefined;

  const update = (id: string, patch: Partial<EmailThread>) =>
    setThreads((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const select = (id: string) => {
    setSelectedId(id);
    update(id, { unread: false });
  };

  const sync = () => {
    if (!account) return;
    setSyncing(true);
    setTimeout(() => {
      setThreads((list) => (list.some((t) => t.id === syncedThread.id) ? list : [syncedThread, ...list]));
      setAccount((a) => (a ? { ...a, lastSync: "just now" } : a));
      setSyncing(false);
    }, 1200);
  };

  return (
    <>
      <MailboxHeader
        account={account}
        unread={folderUnread.inbox}
        syncing={syncing}
        onSync={sync}
        onSettings={() => setSettingsOpen((o) => !o)}
      />

      {settingsOpen || !account ? (
        <MailboxSettings
          account={account}
          onConnect={(provider, address) => {
            setAccount({ provider, address, lastSync: "just now", connectedSince: "13 Oct 2026" });
            setSettingsOpen(false);
          }}
          onDisconnect={() => {
            setAccount(null);
            setSelectedId(undefined);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {account ? (
        <div className="grid flex-1 grid-cols-1 items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <InboxList
            threads={visible}
            folder={folder}
            folderUnread={folderUnread}
            filter={filter}
            query={query}
            selectedId={selected?.id}
            patientFilter={filterPatient}
            onFolder={(f) => {
              setFolder(f);
              setSelectedId(filterThreads(threads, f, filter, query, patientFilter)[0]?.id);
            }}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={select}
            onClearPatient={() => setPatientFilter(undefined)}
          />
          {selected ? (
            <ThreadPanel
              key={selected.id}
              thread={selected}
              compose={selected.id === selectedId && selected.patient?.mrn === patientMrn ? compose : undefined}
              fromAddress={account.address}
              onMatch={(patient) => update(selected.id, { patient, suggestion: patient ? undefined : selected.suggestion })}
              onArchive={() => {
                update(selected.id, { folder: "archive" });
                setSelectedId(undefined);
              }}
            />
          ) : (
            <Panel className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="m-0 text-sm text-muted">Choose an email to read it here.</p>
              {folder !== "inbox" ? (
                <ActionButton variant="quiet" size="sm" onClick={() => setFolder("inbox")}>
                  Back to inbox
                </ActionButton>
              ) : null}
            </Panel>
          )}
        </div>
      ) : (
        <Panel className="flex min-h-[200px] items-center justify-center p-6 text-center text-sm text-muted">
          Connect the doctor&apos;s mailbox to see the whole inbox here.
        </Panel>
      )}
    </>
  );
}
