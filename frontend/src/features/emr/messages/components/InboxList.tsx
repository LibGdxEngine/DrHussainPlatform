import { cn } from "@/lib/utils";
import type { MailFilter, MailFolder, MailThread } from "@/lib/api/emr/mail";
import { SearchBox } from "../../shell/SearchBox";
import { ChipGroup } from "../../ui/ChipGroup";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { folders, inboxFilters, initialOf, mailDate } from "../data";

interface InboxListProps {
  threads: MailThread[] | null;
  folder: MailFolder;
  unread: number;
  filter: MailFilter;
  query: string;
  selectedId?: string;
  patientFilter?: string;
  onFolder: (f: MailFolder) => void;
  onFilter: (f: MailFilter) => void;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onClearPatient: () => void;
}

function ThreadItem({ t, active, onSelect }: { t: MailThread; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer gap-3 rounded-2xl border-0 p-3 text-start text-ink",
        active ? "bg-brand-tint" : "bg-transparent hover:bg-canvas",
      )}
    >
      <span
        className={cn(
          "flex size-[40px] flex-none items-center justify-center rounded-full font-bold",
          t.patient ? "bg-white text-brand-deep" : "bg-line-soft text-ink-3",
        )}
      >
        {initialOf(t.contact_name ?? "", t.contact_email ?? "")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2">
          <strong className={cn("truncate text-sm", t.unread ? "font-bold" : "font-semibold")}>
            {t.contact_name || t.contact_email}
          </strong>
          {t.unread ? <span className="size-2 flex-none rounded-full bg-brand" aria-label="Unread" /> : null}
          <span className="ms-auto flex-none text-xs text-muted">{mailDate(t.last_message_at)}</span>
        </span>
        <span className={cn("truncate text-[13px]", t.unread ? "font-semibold text-ink" : "text-ink-2")} dir="auto">
          {t.subject || "(no subject)"}
        </span>
        <span className="truncate text-xs text-muted" dir="auto">{t.preview}</span>
        <span className="mt-0.5 flex flex-wrap gap-1.5">
          {t.patient ? (
            <Pill tone="brand" size="xs">{t.patient.full_name} · {t.patient.file_number}</Pill>
          ) : t.suggested_patient ? (
            <Pill tone="amber" size="xs">Possible match: {t.suggested_patient.full_name}</Pill>
          ) : (
            <Pill tone="neutral" size="xs">Not matched</Pill>
          )}
          {t.has_attachments ? <Pill tone="neutral" size="xs">📎 Attachments</Pill> : null}
        </span>
      </span>
    </button>
  );
}

/** Folder tabs, search, filters and the thread list of the clinic mailbox. */
export function InboxList(props: InboxListProps) {
  const { threads, folder, unread, filter, query, selectedId, patientFilter } = props;

  return (
    <Panel aria-label="Mailbox" className="flex flex-col gap-3 px-3.5 py-4">
      <nav aria-label="Folders" className="flex flex-wrap gap-1 border-b border-line-soft px-1 pb-2">
        {folders.map((f) => {
          const on = f.id === folder;
          const n = f.id === "inbox" ? unread : 0;
          return (
            <button
              key={f.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => props.onFolder(f.id)}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 text-[13px]",
                on ? "bg-brand-ink font-semibold text-white" : "bg-transparent font-medium text-muted hover:text-ink",
              )}
            >
              {f.label}
              {n > 0 ? (
                <span className={cn("rounded-full px-1.5 text-[11px]", on ? "bg-white/20" : "bg-brand-tint text-brand-ink")}>
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <SearchBox
        className="flex-none px-1"
        label="Search mail"
        placeholder="Search sender, subject, patient or file number"
        value={query}
        onChange={props.onQuery}
      />
      <ChipGroup label="Filter" options={inboxFilters} value={filter} onChange={props.onFilter} className="px-1" />
      {patientFilter ? (
        <div className="mx-1 flex items-center gap-2 rounded-[14px] bg-brand-wash px-3 py-2 text-[13px] text-brand-ink">
          Showing emails for <strong>{patientFilter}</strong>
          <button
            type="button"
            onClick={props.onClearPatient}
            className="ms-auto cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-brand"
          >
            Show all
          </button>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {threads === null ? (
          <p className="m-0 px-4 py-8 text-center text-[13px] text-muted">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="m-0 rounded-2xl bg-canvas px-4 py-8 text-center text-[13px] text-muted">No emails here.</p>
        ) : (
          threads.map((t) => (
            <ThreadItem key={t.id} t={t} active={t.id === selectedId} onSelect={() => props.onSelect(t.id)} />
          ))
        )}
      </div>
    </Panel>
  );
}
