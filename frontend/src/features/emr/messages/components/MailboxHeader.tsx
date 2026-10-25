import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { mailProviders, type MailboxAccount } from "../data";

interface MailboxHeaderProps {
  account: MailboxAccount | null;
  unread: number;
  syncing: boolean;
  onSync: () => void;
  onSettings: () => void;
}

/** Connected-account strip above the inbox: which mailbox is synced and when. */
export function MailboxHeader({ account, unread, syncing, onSync, onSettings }: MailboxHeaderProps) {
  const provider = account ? mailProviders.find((p) => p.id === account.provider) : undefined;

  return (
    <Panel as="header" className="flex flex-wrap items-center gap-4 px-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-bold">Inbox</h1>
        {account ? (
          <span className="text-sm text-muted">
            <span className="font-emr-mono font-medium text-ink-2">{account.address}</span> · {provider?.label} ·{" "}
            {syncing ? "Syncing…" : `Synced ${account.lastSync}`}
          </span>
        ) : (
          <span className="text-sm text-muted">No mailbox connected</span>
        )}
      </div>
      {account ? (
        <Pill tone="ok" size="md">
          ● Connected
        </Pill>
      ) : (
        <Pill tone="amber" size="md">
          Not connected
        </Pill>
      )}
      {account && unread > 0 ? (
        <Pill tone="brand" size="md">
          {unread} unread
        </Pill>
      ) : null}
      <div className="ms-auto flex gap-2">
        {account ? (
          <ActionButton variant="quiet" size="md" onClick={onSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </ActionButton>
        ) : null}
        <ActionButton variant={account ? "quiet" : "primary"} size="md" onClick={onSettings}>
          {account ? "Mailbox settings" : "Connect mailbox"}
        </ActionButton>
      </div>
    </Panel>
  );
}
