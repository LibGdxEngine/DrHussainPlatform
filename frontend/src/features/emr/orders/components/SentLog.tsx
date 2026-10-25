import { Panel } from "@/features/emr/ui/Panel";
import { sentLog } from "../data";

export function SentLog() {
  return (
    <Panel aria-labelledby="sl" className="flex flex-col gap-3 p-5">
      <h2 id="sl" className="m-0 text-lg font-semibold">Sent log</h2>
      {sentLog.map((e) => (
        <div key={e.title} className="flex gap-3 text-sm leading-relaxed">
          <span className="mt-1.5 size-2.5 flex-none rounded-full bg-brand" />
          <span>
            <strong className="font-semibold">{e.title}</strong>
            <br />
            <span className="text-xs text-muted">{e.detail}</span>
          </span>
        </div>
      ))}
    </Panel>
  );
}
