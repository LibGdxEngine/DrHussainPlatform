import type { AlertRule } from "@/lib/api/emr/content";

export interface VitalsInput {
  bp1: string;
  bp2: string;
  height: string;
  weight: string;
  waist: string;
}

export interface VitalsAlert {
  tag: string;
  text: string;
  level: AlertRule["level"];
}

export interface VitalsResult {
  bpAvg: string;
  bmi: string;
  alerts: VitalsAlert[];
}

type Vital = "blood_pressure" | "bmi" | "waist";
type Check = "gt" | "gte" | "lt" | "lte";

/** A clinic alert rule checked against the examination, as the server checks it. */
export interface VitalRule {
  code: string;
  vital: Vital;
  check: Check;
  cutOff: number;
  /** Blood pressure only: the diastolic cut-off. */
  cutOffB: number | null;
  level: AlertRule["level"];
  message: string;
}

const COMPARE: Record<Check, (value: number, cutOff: number) => boolean> = {
  gt: (v, c) => v > c, gte: (v, c) => v >= c, lt: (v, c) => v < c, lte: (v, c) => v <= c,
};
const SYMBOL: Record<Check, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
const LEVEL_TEXT: Record<AlertRule["level"], string> = { red: "Red", amber: "Amber", reminder: "Reminder" };

const BP_PATTERN = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;

/** "144/92" → [144, 92]; anything else → null. */
export function parseBp(value: string): [number, number] | null {
  const m = BP_PATTERN.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function number(text: string | null | undefined): number | null {
  const value = Number((text ?? "").trim().replace(",", "."));
  return text && text.trim() && Number.isFinite(value) ? value : null;
}

/** The clinic's enabled vitals rules (R20, R21, R22 and any added later). Cut-offs not set yet are skipped. */
export function vitalRules(rules: AlertRule[]): VitalRule[] {
  return rules.flatMap((rule) => {
    const cutOff = number(rule.threshold_a);
    if (!rule.enabled || !rule.vital || !(rule.lab_check && rule.lab_check in COMPARE) || cutOff === null) return [];
    return [{
      code: rule.code, vital: rule.vital, check: rule.lab_check as Check, cutOff, cutOffB: number(rule.threshold_b),
      level: rule.level, message: rule.message,
    }];
  });
}

/** Halves round up, as the server rounds them. */
const roundHalfUp = (value: number) => Math.floor(value + 0.5);

/** Average BP over the readings taken (one counts alone), BMI, and the clinic rules they cross. */
export function computeVitals({ bp1, bp2, height, weight, waist }: VitalsInput, rules: VitalRule[]): VitalsResult {
  const readings = [parseBp(bp1), parseBp(bp2)].filter((r): r is [number, number] => r !== null);
  const average = readings.length
    ? [0, 1].map((i) => roundHalfUp(readings.reduce((sum, r) => sum + r[i], 0) / readings.length)) as [number, number]
    : null;
  const heightM = Number(height) / 100;
  const weightKg = Number(weight);
  const bmiValue = heightM > 0 && weightKg > 0 ? roundHalfUp((weightKg / (heightM * heightM)) * 10) / 10 : null;
  const waistCm = number(waist);

  const alerts: VitalsAlert[] = [];
  for (const rule of rules) {
    const compare = COMPARE[rule.check];
    const tag = `${LEVEL_TEXT[rule.level]} · ${rule.code}`;
    const symbol = SYMBOL[rule.check];
    if (rule.vital === "blood_pressure" && average) {
      const [sys, dia] = average;
      if (compare(sys, rule.cutOff) || (rule.cutOffB !== null && compare(dia, rule.cutOffB))) {
        const limit = rule.cutOffB !== null ? `${rule.cutOff}/${rule.cutOffB}` : `${rule.cutOff}`;
        alerts.push({ tag, level: rule.level, text: `BP ${sys}/${dia} ${symbol} ${limit}: ${rule.message}` });
      }
    } else if (rule.vital === "bmi" && bmiValue !== null && compare(bmiValue, rule.cutOff)) {
      alerts.push({ tag, level: rule.level, text: `BMI ${bmiValue.toFixed(1)} ${symbol} ${rule.cutOff}: ${rule.message}` });
    } else if (rule.vital === "waist" && waistCm !== null && compare(waistCm, rule.cutOff)) {
      alerts.push({ tag, level: rule.level, text: `Waist ${waistCm} cm ${symbol} ${rule.cutOff} cm: ${rule.message}` });
    }
  }
  return {
    bpAvg: average ? `${average[0]}/${average[1]}` : "–",
    bmi: bmiValue !== null ? bmiValue.toFixed(1) : "–",
    alerts,
  };
}
