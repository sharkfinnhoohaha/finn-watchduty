// Step 7: blend as correction, not mean. Step 8: confidence field.
//
// At each observation we compute the obs-minus-background residual (after QC,
// height normalization, temporal harmonization, and air-mass tagging), then
// interpolate the *correction field* onto the grid with optimal-interpolation /
// 2DVar-style weighting and add it to the background. We never arithmetic-mean
// raw station values.
//
// The weighting is terrain aware: it decorrelates over a horizontal length, and
// faster vertically and across a ridgeline crest (a ridge between two points
// means they are often in different flow regimes). The air-mass rule is hard:
// an obs below the inversion contributes zero weight to a cell above it, and
// vice versa.
//
// Alongside the corrected field we produce a co-registered confidence field:
// high where obs are dense and the boundary layer is well mixed, low where obs
// are sparse, near the inversion, or across an air-mass boundary.
//
// Comments here avoid double dashes, using commas and colons.

import type { Sampler, Projector } from "../interpolate";
import type { ConfidenceGrid, ElevationGrid, Station, Vec } from "../types";
import type { PipelineConfig } from "./config";
import type { InversionModel } from "./inversion";
import { toVec } from "../wind";
import { classifyAirMass, canCorrect, type AirMass } from "./airmass";

/** Bilinear sampler over a scalar elevation grid, clamped at the edges. */
export function elevationSampler(grid: ElevationGrid): (lon: number, lat: number) => number {
  const { lons, lats, z } = grid;
  const nLon = lons.length;
  const locate = (arr: number[], val: number) => {
    if (val <= arr[0]) return { i: 0, f: 0 };
    if (val >= arr[arr.length - 1]) return { i: arr.length - 2, f: 1 };
    let i = 0;
    while (i < arr.length - 1 && arr[i + 1] < val) i++;
    return { i, f: (val - arr[i]) / (arr[i + 1] - arr[i]) };
  };
  const lerp = (p: number, q: number, f: number) => p + (q - p) * f;
  return (lon, lat) => {
    const a = locate(lons, lon);
    const b = locate(lats, lat);
    const at = (i: number, j: number) => z[j * nLon + i];
    return lerp(
      lerp(at(a.i, b.i), at(a.i + 1, b.i), a.f),
      lerp(at(a.i, b.i + 1), at(a.i + 1, b.i + 1), a.f),
      b.f,
    );
  };
}

type PreparedObs = {
  x: number;
  y: number;
  lon: number;
  lat: number;
  ru: number;
  rv: number;
  w0: number;
  elevationM: number | null;
  airMass: AirMass;
};

export type AnalysisField = {
  /** Background field after downscaling (corrects toward this). */
  background: Sampler;
  /** Corrected wind: background + interpolated, air-mass-aware correction. */
  corrected: Sampler;
  /** Correction increment alone (corrected minus background). */
  correction: Sampler;
  /** Confidence in [0,1], co-registered with the corrected field. */
  confidence: (lon: number, lat: number) => number;
};

/** Observation velocity from the 10 m-normalized speed and direction. */
function obsVec(s: Station): Vec {
  const speed = s.speed10Kmh ?? s.speedKmh;
  return toVec(speed, s.dirDeg ?? 0);
}

/**
 * Build the corrected field and its confidence field from enriched stations and
 * a (possibly downscaled) background. `terrain` and `inversion` enable the
 * vertical / air-mass weighting; with neither, the analysis degrades gracefully
 * to a horizontal terrain-blind correction.
 */
export function analyzeField(
  background: Sampler,
  stations: Station[],
  proj: Projector,
  cfg: PipelineConfig,
  opts: { terrain?: ElevationGrid | null; inversion?: InversionModel | null } = {},
): AnalysisField {
  const a = cfg.analysis;
  const L2 = a.decorrelationKm * a.decorrelationKm;
  const Lz2 = a.decorrelationVerticalM * a.decorrelationVerticalM;
  const terrainAt = opts.terrain ? elevationSampler(opts.terrain) : null;
  const inversion = opts.inversion ?? null;

  // Precompute each obs residual against the background and its analysis weight.
  const obs: PreparedObs[] = stations.map((s) => {
    const p = proj(s.lon, s.lat);
    const b = background(s.lon, s.lat);
    const o = obsVec(s);
    return {
      x: p.x,
      y: p.y,
      lon: s.lon,
      lat: s.lat,
      ru: o.u - b.u,
      rv: o.v - b.v,
      w0: s.analysisWeight ?? 1,
      elevationM: s.elevationM ?? null,
      airMass: (s.airMass as AirMass) ?? "unknown",
    };
  });

  const cellAirMass = (lon: number, lat: number, cellElev: number | null): AirMass => {
    if (!inversion) return "unknown";
    return classifyAirMass(cellElev, inversion(lon, lat));
  };

  // True when a ridge crest sits between the obs and the cell, sampled at the
  // path midpoint. A ridge between two points decorrelates the flow, so we
  // tighten the weight by the configured penalty when one is detected.
  const ridgeBetween = (
    aLon: number,
    aLat: number,
    aElev: number | null,
    bLon: number,
    bLat: number,
    bElev: number | null,
  ): boolean => {
    if (!terrainAt || aElev == null || bElev == null) return false;
    const midElev = terrainAt((aLon + bLon) / 2, (aLat + bLat) / 2);
    const higher = Math.max(aElev, bElev);
    // A crest at least 50 m above the higher endpoint counts as a ridge.
    return midElev > higher + 50;
  };

  type Accum = { su: number; sv: number; sw: number };
  const accumulate = (lon: number, lat: number): Accum => {
    const cellElev = terrainAt ? terrainAt(lon, lat) : null;
    const cellAir = cellAirMass(lon, lat, cellElev);
    const p = proj(lon, lat);
    let su = 0, sv = 0, sw = 0;
    for (const o of obs) {
      // Air-mass rule: skip obs that may not correct this cell.
      if (!canCorrect(o.airMass, cellAir)) continue;
      const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      let w = o.w0 * Math.exp(-d2 / L2);
      if (cellElev != null && o.elevationM != null) {
        const dz = o.elevationM - cellElev;
        w *= Math.exp(-(dz * dz) / Lz2);
        if (ridgeBetween(o.lon, o.lat, o.elevationM, lon, lat, cellElev)) {
          w /= a.ridgePenalty;
        }
      }
      su += w * o.ru;
      sv += w * o.rv;
      sw += w;
    }
    return { su, sv, sw };
  };

  const corrected: Sampler = (lon, lat) => {
    const b = background(lon, lat);
    if (obs.length === 0) return b;
    const { su, sv, sw } = accumulate(lon, lat);
    const denom = sw + a.backgroundError;
    return { u: b.u + su / denom, v: b.v + sv / denom };
  };

  const correction: Sampler = (lon, lat) => {
    if (obs.length === 0) return { u: 0, v: 0 };
    const { su, sv, sw } = accumulate(lon, lat);
    const denom = sw + a.backgroundError;
    return { u: su / denom, v: sv / denom };
  };

  const confidence = (lon: number, lat: number): number => {
    const { sw } = accumulate(lon, lat);
    // Obs density term: rises from 0 (no nearby usable obs) toward 1.
    const dens = sw / (sw + a.confidenceHalfWeight);
    // Mixed-layer term: low near the inversion base (the boundary is where the
    // blend is least trustworthy), 1 well away from it or when no inversion.
    let mixed = 1;
    if (inversion && terrainAt) {
      const base = inversion(lon, lat);
      if (base != null) {
        const dz = terrainAt(lon, lat) - base;
        mixed = 1 - Math.exp(-(dz * dz) / (a.inversionUncertaintyM * a.inversionUncertaintyM));
      }
    }
    return Math.max(0, Math.min(1, dens * mixed));
  };

  return { background, corrected, correction, confidence };
}

/** Sample a confidence field onto a grid, co-registered with the model grid. */
export function buildConfidenceGrid(
  confidence: (lon: number, lat: number) => number,
  lons: number[],
  lats: number[],
): ConfidenceGrid {
  const c = new Array<number>(lons.length * lats.length);
  for (let j = 0; j < lats.length; j++) {
    for (let i = 0; i < lons.length; i++) {
      c[j * lons.length + i] = confidence(lons[i], lats[j]);
    }
  }
  return { lons, lats, c };
}
