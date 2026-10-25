import type { Mailbox } from "@/lib/api/emr/mail";
import { formatDay } from "../../format";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";

interface MailboxHeaderProps {
  mailbox: Mailbox | null;
  unread: number;
  syncing: boolean;
  onSync: () => void;
  onSettings: () => void;
}

export function mailboxReady(mailbox: Mailbox | null): mailbox is Mailbox {
  return Boolean(mailbox?.enabled && mailbox.address && mailbox.imap_host);
}

/** Which clinic mailbox is connected, when it was last checked, and any connection problem. */
export function MailboxHeader({ mailbox, unread, syncing, onSync, onSettings }: MailboxHeaderProps) {
  const ready = mailboxReady(mailbox);
  return (
    <Panel as="header" className="flex flex-wrap items-center gap-4 px-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-bold">Inbox</h1>
        {ready ? (
          <span className="text-sm text-muted">
            <span className="font-emr-mono font-medium text-ink-2">{mailbox.address}</span> · clinic mail server ·{" "}
            {syncing
              ? "Checking for mail…"
              : mailbox.last_synced_at
                ? `Checked ${formatDay(mailbox.last_synced_at)} ${new Date(mailbox.last_synced_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                : "Not checked yet"}
          </span>
        ) : (
          <span className="text-sm text-muted">The clinic mailbox is not set up</span>
        )}
        {mailbox?.last_error ? (
          <span role="alert" className="text-xs text-danger-ink">Last check failed: {mailbox.last_error}</span>
        ) : null}
      </div>
      <Pill tone={ready ? "ok" : "amber"} size="md">{ready ? "● Connected" : "Not connected"}</Pill>
      {ready && unread > 0 ? <Pill tone="brand" size="md">{unread} unread</Pill> : null}
      <div className="ms-auto flex gap-2">
        {ready ? (
          <ActionButton variant="quiet" size="md" onClick={onSync} disabled={syncing}>
            {syncing ? "Checking…" : "Check for mail"}
          </ActionButton>
        ) : null}
        <ActionButton variant={ready ? "quiet" : "primary"} size="md" onClick={onSettings}>
          {ready ? "Mailbox settings" : "Set up mailbox"}
        </ActionButton>
      </div>
    </Panel>
  );
}
