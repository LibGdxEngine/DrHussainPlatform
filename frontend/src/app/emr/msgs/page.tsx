import { ConversationList } from "@/features/emr/messages/components/ConversationList";
import { ThreadPanel } from "@/features/emr/messages/components/ThreadPanel";
import { AppShell } from "@/features/emr/shell/AppShell";

export default function MessagesPage() {
  return (
    <AppShell active="msgs">
      <div className="grid flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <ConversationList />
        <ThreadPanel />
      </div>
    </AppShell>
  );
}
