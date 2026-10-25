import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { answers } from "../data";

export function PatientAnswers() {
  return (
    <Panel aria-labelledby="fa" className="flex flex-col gap-2.5 p-5">
      <h2 id="fa" className="m-0 mb-1 text-[17px] font-semibold">
        Her follow-up answers
      </h2>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        {answers.map((a) => (
          <div
            key={a.label}
            className={cn(
              "rounded-xl p-2.5",
              a.emphasis === "warn" ? "bg-warn-wash" : "bg-canvas-2",
              a.wide && "col-span-full",
            )}
          >
            <span className="text-[11px] text-muted">{a.label}</span>
            <br />
            <strong
              className={cn(
                a.quote ? "font-medium" : "font-semibold",
                a.emphasis === "good" && "text-ok-ink",
              )}
            >
              {a.value}
            </strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}
