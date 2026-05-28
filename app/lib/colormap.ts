// Wind-speed colour ramp (input in mph), tuned to read like a wind map:
// calm slate-blue → teal → green → yellow → orange → red.

type RGB = [number, number, number];
type Stop = { v: number; c: RGB };

const STOPS: Stop[] = [
  { v: 0, c: [60, 78, 112] },
  { v: 5, c: [44, 127, 184] },
  { v: 10, c: [65, 182, 196] },
  { v: 15, c: [120, 198, 121] },
  { v: 20, c: [194, 230, 110] },
  { v: 25, c: [254, 217, 118] },
  { v: 30, c: [253, 141, 60] },
  { v: 40, c: [240, 59, 32] },
  { v: 55, c: [189, 0, 38] },
];

export function speedColor(mph: number): RGB {
  if (mph <= STOPS[0].v) return STOPS[0].c;
  const last = STOPS[STOPS.length - 1];
  if (mph >= last.v) return last.c;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (mph <= b.v) {
      const f = (mph - a.v) / (b.v - a.v);
      return [
        a.c[0] + (b.c[0] - a.c[0]) * f,
        a.c[1] + (b.c[1] - a.c[1]) * f,
        a.c[2] + (b.c[2] - a.c[2]) * f,
      ];
    }
  }
  return last.c;
}

export function rgbCss(c: RGB, alpha = 1): string {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
}

/** Normalized ramp: t in [0,1] across the full colour range. */
export function rampColor(t: number): RGB {
  return speedColor(Math.max(0, Math.min(1, t)) * STOPS[STOPS.length - 1].v);
}

/** CSS linear-gradient spanning the normalized ramp, for the legend bar. */
export function rampGradientCss(): string {
  const n = 24;
  const parts: string[] = [];
  for (let i = 0; i <= n; i++) {
    parts.push(`${rgbCss(rampColor(i / n))} ${((100 * i) / n).toFixed(0)}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
