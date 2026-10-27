import { formatDay } from "../../format";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { formStatusText, formStatusTone, readAnswers, reasonLabel } from "../answers";
import type { LatestForm } from "../forms";

interface PatientFormPanelProps {
  form?: LatestForm;
  error?: string;
}

/** The history form the patient filled in on her phone: status, reasons for the visit and her own words. */
export function PatientFormPanel({ form, error }: PatientFormPanelProps) {
  const latest = form?.latest;
  const answered = form?.answered;
  const answers = readAnswers(answered?.answers);
  const olderAnswers = answered && latest && answered.id !== latest.id;

  return (
    <Panel aria-labelledby="hw" className="flex flex-col gap-2.5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hw" className="m-0 text-lg font-semibold">
          In her words &amp; reasons
        </h2>
        {form ? (
          <Pill tone={latest ? formStatusTone[latest.status] : "neutral"} size="xs" className="ms-auto">
            Patient form · {formStatusText(latest)}
          </Pill>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{error}</p>
      ) : !form ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !answered ? (
        <p className="m-0 text-[13px] text-muted">
          {latest ? "The patient has not completed her form yet." : "No patient form has been sent. Reception sends it when booking."}
        </p>
      ) : (
        <>
          {olderAnswers ? (
            <p className="m-0 text-xs text-muted">Answers below are from the form she completed {formatDay(answered.submitted_at)}.</p>
          ) : null}
          {answers.reasons.length ? (
            <div className="flex flex-wrap gap-1.5">
              {answers.reasons.map((r) => (
                <Pill key={r} tone="brand" size="sm">
                  {reasonLabel(r)}
                </Pill>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[13px] text-muted">No reason for the visit was ticked.</p>
          )}
          {answers.other_reason ? (
            <p className="m-0 text-sm">
              <span className="text-muted">Something else: </span>
              {answers.other_reason}
            </p>
          ) : null}
          {answers.notes ? (
            <p className="m-0 text-base leading-[1.8]">&ldquo;{answers.notes}&rdquo;</p>
          ) : (
            <p className="m-0 text-[13px] text-muted">She did not add anything in her own words.</p>
          )}
        </>
      )}
    </Panel>
  );
}
