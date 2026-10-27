import { cn } from "@/lib/utils";
import type { BandTone } from "../metrics";

const LEFT = 100;
const RIGHT = 580;
const BASELINE = 200;
const HEIGHT = 180;
/** At most this many x labels, so dates do not overlap. */
const MAX_LABELS = 6;

const bandFill: Record<BandTone, string> = {
  danger: "fill-danger-tint",
  warn: "fill-warn-tint",
  ok: "fill-ok-tint",
};

interface TrendChartProps {
  /** Oldest first. */
  points: { label: string; value: number }[];
  range: { min: number; max: number };
  band?: { from: number; to: number; tone: BandTone };
  ariaLabel: string;
}

const fmt = (n: number) => String(Number(n.toPrecision(3)));

/** 680x240 line chart with an optional shaded reference band, area fill, and labelled points. */
export function TrendChart({ points, range, band, ariaLabel }: TrendChartProps) {
  const span = range.max - range.min || 1;
  const clamp = (v: number) => Math.min(range.max, Math.max(range.min, v));
  const y = (v: number) => BASELINE - ((clamp(v) - range.min) / span) * HEIGHT;
  const x = (i: number) => (points.length === 1 ? (LEFT + RIGHT) / 2 : LEFT + (i * (RIGHT - LEFT)) / (points.length - 1));
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(points.length / MAX_LABELS);
  const bandTop = band ? y(band.to) : 0;
  const bandHeight = band ? Math.max(0, y(band.from) - bandTop) : 0;
  const lastX = x(points.length - 1);

  return (
    <svg viewBox="0 0 680 240" width="100%" role="img" aria-label={ariaLabel} className="block [direction:ltr]">
      {band ? (
        <rect x="60" y={bandTop.toFixed(1)} width="600" height={bandHeight.toFixed(1)} rx="8" className={bandFill[band.tone]} />
      ) : null}
      <line x1="60" y1="20" x2="660" y2="20" className="stroke-line-soft" />
      <line x1="60" y1="110" x2="660" y2="110" className="stroke-line-soft" />
      <line x1="60" y1="200" x2="660" y2="200" className="stroke-field" />
      {[
        [24, range.max],
        [114, (range.min + range.max) / 2],
        [204, range.min],
      ].map(([ty, label]) => (
        <text key={ty} x="48" y={ty} textAnchor="end" fontSize="12" className="fill-subtle">
          {fmt(label)}
        </text>
      ))}
      {points.length > 1 ? (
        <>
          <polygon points={`${line} ${lastX.toFixed(1)},200 ${LEFT},200`} className="fill-brand/10" />
          <polyline
            points={line}
            fill="none"
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-brand"
          />
        </>
      ) : null}
      {points.map((p, i) => {
        const last = i === points.length - 1;
        // The latest date always shows; others are thinned so none crowd it.
        const showLabel = last || (i % labelEvery === 0 && points.length - 1 - i >= labelEvery);
        return (
          <g key={i}>
            <circle
              cx={x(i).toFixed(1)}
              cy={y(p.value).toFixed(1)}
              r={last ? 8 : 7}
              className={cn(last ? "fill-brand-ink" : "fill-white stroke-brand")}
              strokeWidth={last ? undefined : 3}
            />
            <text
              x={x(i).toFixed(1)}
              y={(y(p.value) - 16).toFixed(1)}
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              className="fill-ink"
            >
              {fmt(p.value)}
            </text>
            {showLabel ? (
              <text x={x(i).toFixed(1)} y="228" textAnchor="middle" fontSize="12" className="fill-muted font-emr">
                {p.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
