import { cn } from "@/lib/utils";
import type { BandTone } from "../data";

const X = [100, 340, 580] as const;
const BASELINE = 200;
const HEIGHT = 180;

const bandFill: Record<BandTone, string> = {
  danger: "fill-danger-tint",
  warn: "fill-warn-tint",
  ok: "fill-ok-tint",
  none: "fill-none",
};

interface TrendChartProps {
  /** Three readings: baseline, 6 weeks, 3 months. */
  values: readonly [number, number, number];
  range: { min: number; max: number };
  band: { from: number; to: number; tone: BandTone };
  xLabels: readonly [string, string, string];
  ariaLabel: string;
}

/** 680x240 line chart with a shaded reference band, area fill, and labelled points. */
export function TrendChart({ values, range, band, xLabels, ariaLabel }: TrendChartProps) {
  const y = (v: number) => BASELINE - ((v - range.min) / (range.max - range.min)) * HEIGHT;
  const points = values.map((v, i) => `${X[i]},${y(v).toFixed(1)}`).join(" ");
  const bandTop = y(band.to);
  const bandHeight = Math.max(0, y(band.from) - bandTop);
  const mid = Math.round((range.min + range.max) / 2);

  return (
    <svg viewBox="0 0 680 240" width="100%" role="img" aria-label={ariaLabel} className="block [direction:ltr]">
      <rect x="60" y={bandTop.toFixed(1)} width="600" height={bandHeight.toFixed(1)} rx="8" className={bandFill[band.tone]} />
      <line x1="60" y1="20" x2="660" y2="20" className="stroke-line-soft" />
      <line x1="60" y1="110" x2="660" y2="110" className="stroke-line-soft" />
      <line x1="60" y1="200" x2="660" y2="200" className="stroke-field" />
      {[
        [24, range.max],
        [114, mid],
        [204, range.min],
      ].map(([ty, label]) => (
        <text key={ty} x="48" y={ty} textAnchor="end" fontSize="12" className="fill-subtle">
          {label}
        </text>
      ))}
      <polygon points={`${points} 580,200 100,200`} className="fill-brand/10" />
      <polyline
        points={points}
        fill="none"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-brand"
      />
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <g key={i}>
            <circle
              cx={X[i]}
              cy={y(v).toFixed(1)}
              r={last ? 8 : 7}
              className={cn(last ? "fill-brand-ink" : "fill-white stroke-brand")}
              strokeWidth={last ? undefined : 3}
            />
            <text
              x={X[i]}
              y={(y(v) - 16).toFixed(1)}
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              className="fill-ink"
            >
              {v}
            </text>
            <text x={X[i]} y="228" textAnchor="middle" fontSize="12" className="fill-muted font-emr">
              {xLabels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
