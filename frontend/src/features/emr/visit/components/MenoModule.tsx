import { cn } from "@/lib/utils";
import { mrsItems, mrsMax, mrsScale } from "../../intake/data";
import { formatDay } from "../../format";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import {
  mrsBand,
  mrsDomainKeys,
  mrsDomainLabel,
  mrsDomainMax,
  mrsDomainScores,
  type MrsDomainKey,
} from "../answers";
import { NotRecorded } from "./HistoryModules";

function MrsBar({ domain, score }: { domain: MrsDomainKey; score: number }) {
  const max = mrsDomainMax(domain);
  const band = mrsBand(domain, score);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex text-[13px]">
        <span>{mrsDomainLabel[domain]}</span>
        <span className="ms-auto text-muted">
          <strong className="text-ink">{score}</strong> / {max} · {band.label}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-[#dcebe1] bg-[repeating-linear-gradient(45deg,#dcebe1_0_3px,#fff_3px_6px)]">
        <div
          className={cn("h-full rounded-full", band.label === "Severe" ? "bg-brand-ink" : "bg-brand-mid")}
          style={{ width: `${Math.round((score / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

interface MenoModuleProps {
  /** The 11 item scores, or null when the scale was not answered. */
  scores: number[] | null;
  submittedAt?: string | null;
}

export function MenoModule({ scores, submittedAt }: MenoModuleProps) {
  const domains = mrsDomainScores(scores);
  if (!scores || !domains) {
    return <NotRecorded title="Menopause Rating Scale" note="The patient did not answer the MRS questions on this form." />;
  }
  const total = scores.reduce((s, v) => s + v, 0);
  const band = mrsBand("total", total);
  return (
    <div className="grid grid-cols-2 gap-4">
      <Panel variant="outline" aria-labelledby="mrs" className="flex flex-col gap-3 rounded-[18px] p-[18px]">
        <h3 id="mrs" className="m-0 text-[15px] font-semibold">
          MRS · {formatDay(submittedAt)}
        </h3>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[44px] font-bold leading-none">{total}</span>
          <span className="text-[15px] text-muted">/ {mrsMax}</span>
          <Pill tone={band.tone} className="ms-auto">
            {band.label}
          </Pill>
        </div>
        {mrsDomainKeys.map((d) => (
          <MrsBar key={d} domain={d} score={domains[d]} />
        ))}
        <span className="text-[13px] text-muted">Scores over time are on the Trends &amp; follow-up tab.</span>
      </Panel>
      <Panel variant="outline" aria-labelledby="mrs-items" className="flex flex-col gap-1 rounded-[18px] p-[18px]">
        <h3 id="mrs-items" className="m-0 mb-1 text-[15px] font-semibold">
          Her answers, item by item
        </h3>
        <ol className="m-0 flex list-none flex-col p-0 text-[13px]">
          {mrsItems.map((item, i) => {
            const score = scores[i];
            return (
              <li key={item} className="flex gap-3 border-b border-line-soft py-1.5 last:border-b-0">
                <span className="min-w-0 flex-1">{item}</span>
                <span className={cn("shrink-0 font-semibold", score >= 3 && "text-danger-ink")}>
                  {score === undefined ? "—" : `${score} · ${mrsScale[score] ?? ""}`}
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}
