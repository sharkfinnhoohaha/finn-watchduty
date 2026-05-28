"use client";

import { rampGradientCss } from "@/app/lib/colormap";

export function Legend({ scaleMph, caption }: { scaleMph: number; caption: string }) {
  return (
    <div className="legend">
      <div className="legend-caption">{caption}</div>
      <div className="legend-bar" style={{ background: rampGradientCss() }} />
      <div className="legend-ticks mono">
        <span>0</span>
        <span>{(scaleMph / 2).toFixed(0)}</span>
        <span>{scaleMph.toFixed(0)} mph</span>
      </div>
    </div>
  );
}
