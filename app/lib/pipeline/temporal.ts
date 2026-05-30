// Step 5: temporal harmonization.
//
// Stations report at different cadences and over different averaging periods:
// ASOS gives a 2-minute sustained wind plus a 5-second gust, RAWS gives a
// 10-minute average once an hour, utility towers report near 5-minute, and CWOP
// varies. Blending them as-if-equal mixes incompatible quantities. This stage:
//
//   1. Defines a single analysis time and admits only obs within a configurable
//      window around it.
//   2. Weights obs by age with an exponential time decay (older counts less).
//   3. Harmonizes the averaging period to a single target (sustained or gust)
//      using a Durst-style gust-factor curve, so every speed represents the
//      same duration before it enters the blend.
//   4. Treats RAWS hourly obs as a low-frequency anchor (a slowly-varying bias
//      reference), not a high-frequency input, by down-weighting them.
//
// Comments here avoid double dashes, using commas and colons.

import type { PipelineConfig } from "./config";
import type { Station } from "../types";
import { classifyNetwork, type NetworkKind } from "./roughness";

/** Resolve the analysis time. Defaults to now; overridable for reproducibility. */
export function analysisTime(override?: string | number | Date): Date {
  return override == null ? new Date() : new Date(override);
}

/**
 * Durst-style gust-factor curve: ratio of the speed averaged over `sec` to the
 * mean hourly (3600 s) speed. Used to convert a speed from one averaging period
 * to another. Values approximate the Durst (1960) / ESDU curve; shorter
 * durations resolve higher peaks.
 */
const DURST: Array<{ sec: number; g: number }> = [
  { sec: 1, g: 1.61 },
  { sec: 3, g: 1.55 },
  { sec: 5, g: 1.52 },
  { sec: 10, g: 1.43 },
  { sec: 60, g: 1.18 },
  { sec: 120, g: 1.12 },
  { sec: 600, g: 1.06 },
  { sec: 3600, g: 1.0 },
];

export function gustFactor(sec: number): number {
  if (sec <= DURST[0].sec) return DURST[0].g;
  const last = DURST[DURST.length - 1];
  if (sec >= last.sec) return last.g;
  for (let i = 0; i < DURST.length - 1; i++) {
    const a = DURST[i];
    const b = DURST[i + 1];
    if (sec <= b.sec) {
      // Interpolate in log(sec), where the curve is closer to linear.
      const f = (Math.log(sec) - Math.log(a.sec)) / (Math.log(b.sec) - Math.log(a.sec));
      return a.g + (b.g - a.g) * f;
    }
  }
  return last.g;
}

/** Native averaging period (seconds) for a network family. */
export function nativePeriodSec(kind: NetworkKind, cfg: PipelineConfig): number {
  switch (kind) {
    case "asos":
      return cfg.periods.asosSustainedSec;
    case "raws":
      return cfg.periods.rawsSec;
    case "utility":
      return cfg.periods.utilitySec;
    case "cwop":
      return cfg.periods.cwopSec;
    default:
      return cfg.periods.targetSec;
  }
}

/** Convert a speed from a source averaging period to the target period. */
export function harmonizePeriod(speed: number, sourceSec: number, targetSec: number): number {
  if (!(speed > 0)) return speed;
  return speed * (gustFactor(targetSec) / gustFactor(sourceSec));
}

/** Exponential time-decay weight in [0,1] for an obs `relAgeMin` from analysis. */
export function timeDecayWeight(relAgeMin: number, cfg: PipelineConfig): number {
  return Math.exp(-Math.abs(relAgeMin) / cfg.temporal.decayMin);
}

/**
 * Harmonize one station to the analysis time and target averaging period, and
 * assign its combined analysis weight. Operates on the 10 m-normalized speed
 * (speed10Kmh) produced by the height step; if that is absent it falls back to
 * the raw speed. Returns null when the obs falls outside the analysis window.
 */
export function harmonizeStation(
  station: Station,
  cfg: PipelineConfig,
): Station | null {
  if (station.ageMin > cfg.temporal.windowMin) return null;

  const kind = classifyNetwork(station.network);
  const sourceSec = nativePeriodSec(kind, cfg);
  const targetSec = cfg.periods.targetSec;

  const base10 = station.speed10Kmh ?? station.speedKmh;
  let harmonized: number;
  if (cfg.averaging === "gust") {
    // Prefer a reported gust (already a short-duration peak); else synthesize a
    // gust from the sustained speed via the gust-factor curve.
    const gust10 = station.gust10Kmh ?? null;
    harmonized = gust10 != null ? harmonizePeriod(gust10, cfg.periods.asosGustSec, targetSec)
                                : harmonizePeriod(base10, sourceSec, targetSec);
  } else {
    harmonized = harmonizePeriod(base10, sourceSec, targetSec);
  }

  // RAWS hourly is a low-frequency anchor, not a high-frequency input.
  const isAnchor = kind === "raws";
  const decay = timeDecayWeight(station.ageMin, cfg);
  const analysisWeight = decay * (isAnchor ? cfg.temporal.anchorWeight : 1);

  return {
    ...station,
    speed10Kmh: harmonized,
    isAnchor,
    analysisWeight,
  };
}
