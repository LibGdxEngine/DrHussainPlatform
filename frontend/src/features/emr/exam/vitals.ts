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
}

export interface VitalsResult {
  bpAvg: string;
  bmi: string;
  alerts: VitalsAlert[];
}

const BP_PATTERN = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;

function parseBp(value: string): [number, number] | null {
  const m = BP_PATTERN.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Average BP, BMI and the yellow rule alerts (R20 BP, R21 BMI, R22 waist). */
export function computeVitals({ bp1, bp2, height, weight, waist }: VitalsInput): VitalsResult {
  const a = parseBp(bp1);
  const b = parseBp(bp2);
  let bpAvg = "–";
  let sys = 0;
  let dia = 0;
  if (a && b) {
    sys = Math.round((a[0] + b[0]) / 2);
    dia = Math.round((a[1] + b[1]) / 2);
    bpAvg = `${sys}/${dia}`;
  }

  const heightM = Number(height) / 100;
  const weightKg = Number(weight);
  const bmiNum = heightM > 0 && weightKg > 0 ? weightKg / (heightM * heightM) : 0;
  const bmi = bmiNum ? bmiNum.toFixed(1) : "–";

  const alerts: VitalsAlert[] = [];
  if (sys >= 140 || dia >= 90) {
    alerts.push({
      tag: "Amber · R20",
      text: `Average BP ${bpAvg}: recheck; treat before HRT or combined pills.`,
    });
  }
  if (bmiNum >= 30) {
    alerts.push({ tag: "Amber · R21", text: `BMI ${bmi}: transdermal route; cardiac and breast risk.` });
  }
  if (Number(waist) > 88) {
    alerts.push({ tag: "Amber · R22", text: `Waist ${waist} cm: metabolic risk. Insulin, HbA1c and lipids.` });
  }
  return { bpAvg, bmi, alerts };
}
