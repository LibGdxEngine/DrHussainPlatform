"use client";

import type { AnswerRow, AnswerValue, CatalogueField, CatalogueOption, CatalogueQuestion } from "@/lib/api/emr/intake";
import { cn } from "@/lib/utils";
import { NOT_SURE, toggleIn } from "../logic";
import { ChoiceGroup, RadioList, ToggleChip, phoneInputClass, phoneTextareaClass } from "./controls";

type Spec = CatalogueQuestion | CatalogueField;
type Scalar = string | number | boolean | null;

interface FieldProps<S extends Spec = Spec> {
  spec: S;
  /** The id used for the label and the control. */
  inputId: string;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
}

// Options carry a string, or a 0-3 score for the mood questions; the controls key them by position.
const optionIds = (options: CatalogueOption[]) => options.map((o, i) => ({ id: String(i), label: o.label }));
const indexOf = (options: CatalogueOption[], value: unknown) => {
  const i = options.findIndex((o) => o.value === value);
  return i >= 0 ? String(i) : undefined;
};
const optionValue = (options: CatalogueOption[], id: string) => options[Number(id)].value as Scalar;

/** One choice: equal buttons for two or three short options, otherwise a list of radio rows. */
function SingleField({ spec, value, onChange }: FieldProps) {
  const options = spec.options ?? [];
  const short = options.length <= 3 && options.every((o) => o.label.length <= 14);
  const common = {
    label: spec.label,
    options: optionIds(options),
    value: indexOf(options, value),
    onChange: (id: string) => onChange(optionValue(options, id)),
  };
  return short ? <ChoiceGroup {...common} columns={options.length === 3 ? 3 : 2} /> : <RadioList {...common} />;
}

function MultiField({ spec, value, onChange }: FieldProps) {
  const options = spec.options ?? [];
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div role="group" aria-label={spec.label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const v = o.value as string;
        return (
          <ToggleChip key={String(v)} size="md" selected={chosen.includes(v)} onClick={() => onChange(toggleIn(chosen, v))}>
            {o.label}
          </ToggleChip>
        );
      })}
    </div>
  );
}

function NumberField({ spec, inputId, value, onChange }: FieldProps) {
  const notSure = "not_sure" in spec && spec.not_sure;
  const unsure = value === NOT_SURE;
  const width = String(spec.max ?? 999).length;
  return (
    <div className="flex gap-2">
      <input
        id={inputId}
        inputMode="numeric"
        maxLength={width}
        value={typeof value === "number" ? String(value) : ""}
        disabled={unsure}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? Number(digits) : undefined);
        }}
        className={cn(phoneInputClass, "flex-1 disabled:bg-canvas")}
      />
      {notSure ? (
        <button
          type="button"
          aria-pressed={unsure}
          onClick={() => onChange(unsure ? undefined : NOT_SURE)}
          className={cn(
            "min-h-[52px] cursor-pointer rounded-2xl px-3.5 text-sm",
            unsure ? "border-2 border-brand bg-brand-tint font-semibold text-brand-ink" : "border border-field bg-white",
          )}
        >
          Not sure
        </button>
      ) : null}
    </div>
  );
}

/** A 0–10 (or 0–7) scale as a grid of buttons, each at least 44 px. */
function ScaleField({ spec, value, onChange }: FieldProps) {
  const low = spec.min ?? 0;
  const high = spec.max ?? 10;
  const points = Array.from({ length: high - low + 1 }, (_, i) => low + i);
  const columns = points.length <= 6 ? points.length : Math.ceil(points.length / 2);
  return (
    <div role="radiogroup" aria-label={spec.label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {points.map((p) => {
        const on = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p)}
            className={cn(
              "min-h-12 cursor-pointer rounded-[14px] text-[17px]",
              on ? "bg-brand-ink font-bold text-white" : "border border-field bg-white text-ink",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function TextField({ spec, inputId, value, onChange }: FieldProps) {
  const max = spec.max_length ?? 500;
  const text = typeof value === "string" ? value : "";
  return max > 200 ? (
    <textarea id={inputId} rows={4} maxLength={max} value={text} onChange={(e) => onChange(e.target.value)} className={phoneTextareaClass} />
  ) : (
    <input id={inputId} maxLength={max} value={text} onChange={(e) => onChange(e.target.value)} className={phoneInputClass} />
  );
}

function DateField({ inputId, value, onChange }: FieldProps) {
  return (
    <input
      id={inputId}
      type="date"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={phoneInputClass}
    />
  );
}

function TickField({ spec, value, onChange }: FieldProps) {
  return (
    <ToggleChip selected={value === true} onClick={() => onChange(value === true ? undefined : true)}>
      {spec.label}
    </ToggleChip>
  );
}

/** One column of a repeating row: the same controls, smaller choices as chips. */
function RowField({ field, inputId, value, onChange }: { field: CatalogueField; inputId: string; value: Scalar | undefined; onChange: (v: Scalar | undefined) => void }) {
  if (field.type === "single") {
    const options = field.options ?? [];
    return (
      <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <ToggleChip key={String(o.value)} size="md" selected={o.value === value} onClick={() => onChange(o.value as Scalar)}>
            {o.label}
          </ToggleChip>
        ))}
      </div>
    );
  }
  if (field.type === "tick") {
    return (
      <ToggleChip size="md" selected={value === true} onClick={() => onChange(value !== true)}>
        {field.label}
      </ToggleChip>
    );
  }
  const props = { spec: field, inputId, value: value ?? undefined, onChange: (v: AnswerValue | undefined) => onChange(v as Scalar | undefined) };
  if (field.type === "number") return <NumberField {...props} />;
  if (field.type === "date") return <DateField {...props} />;
  return <TextField {...props} />;
}

const newRow = (fields: CatalogueField[]): AnswerRow =>
  Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.id, f.default as Scalar]));

/** Repeating rows (medicines, operations, relatives): each row's fields, remove, and add another. */
function RowsField({ spec, inputId, value, onChange }: FieldProps<CatalogueQuestion>) {
  const fields = spec.fields ?? [];
  const rows = Array.isArray(value) ? (value as AnswerRow[]) : [];
  const max = spec.max_rows ?? 20;
  const setRow = (index: number, row: AnswerRow) => onChange(rows.map((r, i) => (i === index ? row : r)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[18px] border border-line bg-white px-4 py-3.5">
          {fields.map((field) => {
            const id = `${inputId}-${i}-${field.id}`;
            return (
              <div key={field.id} className="flex flex-col gap-1.5">
                {field.type === "single" ? <span className="text-sm font-semibold">{field.label}</span> : null}
                {field.type !== "single" && field.type !== "tick" ? (
                  <label htmlFor={id} className="text-sm font-semibold">{field.label}</label>
                ) : null}
                <RowField
                  field={field}
                  inputId={id}
                  value={row[field.id] ?? undefined}
                  onChange={(v) => {
                    const next = { ...row };
                    if (v === undefined || v === "") delete next[field.id];
                    else next[field.id] = v;
                    setRow(i, next);
                  }}
                />
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="min-h-11 cursor-pointer self-start text-[13px] font-semibold text-muted underline"
          >
            Remove
          </button>
        </div>
      ))}
      {rows.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...rows, newRow(fields)])}
          className="min-h-[52px] cursor-pointer rounded-2xl border-[1.5px] border-brand bg-white px-4 text-sm font-semibold text-brand"
        >
          {rows.length ? "Add another" : "Add"}
        </button>
      ) : null}
    </div>
  );
}

/** The control for one catalogue question, chosen by its type. The MRS is asked by MrsStep. */
export function QuestionField(props: FieldProps<CatalogueQuestion>) {
  switch (props.spec.type) {
    case "single":
      return <SingleField {...props} />;
    case "multi":
      return <MultiField {...props} />;
    case "number":
      return <NumberField {...props} />;
    case "scale":
      return <ScaleField {...props} />;
    case "date":
      return <DateField {...props} />;
    case "tick":
      return <TickField {...props} />;
    case "rows":
      return <RowsField {...props} />;
    case "text":
      return <TextField {...props} />;
    default:
      return null;
  }
}

/** Question types whose label sits on the control itself, so no separate label is shown. */
export const labelledByControl = (spec: CatalogueQuestion) => spec.type === "tick";
/** Question types with a single input the label can point at. */
export const hasInput = (spec: CatalogueQuestion) => ["number", "text", "date"].includes(spec.type);
