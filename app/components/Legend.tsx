"use client";

import { rampGradientCss } from "@/app/lib/colormap";

export function Legend({
  scale,
  unit = "mph",
  caption,
}: {
  scale: number;
  unit?: string;
  caption: string;
}) {
  // Confidence and other unitless scales (0..1) read better with one decimal;
  // wind speed reads better as a whole number.
  const decimals = unit === "" ? 1 : 0;
  const fmt = (n: number) => n.toFixed(decimals);
  const suffix = unit ? ` ${unit}` : "";
  return (
    <div className="legend">
      <div className="legend-caption">{caption}</div>
      <div className="legend-bar" style={{ background: rampGradientCss() }} />
      <div className="legend-ticks mono">
        <span>0</span>
        <span>{fmt(scale / 2)}</span>
        <span>{fmt(scale)}{suffix}</span>
      </div>
    </div>
  );
}
