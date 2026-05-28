// Spatial interpolation of a wind field from sparse station observations.
//
// The premise of this POC: a global model (Open-Meteo, standing in for Windy)
// gives a smooth background field that ignores terrain-channeled local flow,
// while the real vanes (NWS stations) are sparse but truthful. We reconcile the
// two with single-pass Barnes objective analysis — interpolate the observation
// residuals (obs − background) and add them back onto the background. The field
// bends to the vanes near a station and relaxes to the model where there is no
// ground truth.

import type { Bbox, ModelGrid, Station, Vec } from "./types";
import { toVec } from "./wind";

export type Sampler = (lon: number, lat: number) => Vec;

/** Local equirectangular projection to kilometres about an anchor point. */
export type Projector = (lon: number, lat: number) => { x: number; y: number };

export function makeProjector(lon0: number, lat0: number): Projector {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.57;
  return (lon, lat) => ({ x: (lon - lon0) * kx, y: (lat - lat0) * ky });
}

/** Bilinear sampler over the coarse model grid, clamped at the edges. */
export function modelSampler(grid: ModelGrid): Sampler {
  const { lons, lats, u, v } = grid;
  const nLon = lons.length;
  const idx = (i: number, j: number) => j * nLon + i;

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
    const sample = (g: number[]) =>
      lerp(
        lerp(g[idx(a.i, b.i)], g[idx(a.i + 1, b.i)], a.f),
        lerp(g[idx(a.i, b.i + 1)], g[idx(a.i + 1, b.i + 1)], a.f),
        b.f,
      );
    return { u: sample(u), v: sample(v) };
  };
}

type StationVec = { x: number; y: number; vec: Vec };

/** Velocity for a station, treating a calm/variable (null-direction) vane as a
 *  zero vector — which is the physically correct contribution to the field. */
export function stationVec(s: Station): Vec {
  return toVec(s.speedKmh, s.dirDeg ?? 0);
}

function project(stations: Station[], proj: Projector): StationVec[] {
  return stations.map((s) => {
    const p = proj(s.lon, s.lat);
    return { x: p.x, y: p.y, vec: stationVec(s) };
  });
}

/**
 * Inverse-distance-weighted interpolation of the station vectors themselves —
 * the "observations only" reconstruction (no model). Used as the background
 * when no model field is available.
 */
export function idwSampler(
  stations: Station[],
  proj: Projector,
  power = 3,
  smoothingKm = 0.6,
): Sampler {
  const svs = project(stations, proj);
  const s2 = smoothingKm * smoothingKm;
  return (lon, lat) => {
    if (svs.length === 0) return { u: 0, v: 0 };
    const p = proj(lon, lat);
    let su = 0, sv = 0, sw = 0;
    for (const s of svs) {
      const d2 = (s.x - p.x) ** 2 + (s.y - p.y) ** 2 + s2;
      const w = 1 / Math.pow(d2, power / 2);
      su += w * s.vec.u;
      sv += w * s.vec.v;
      sw += w;
    }
    return { u: su / sw, v: sv / sw };
  };
}

// Background pseudo-weight `k` in the Barnes denominator (Σw + k). It plays the
// role of a single far-away "the model is probably right here" observation: as
// the real vane weights Σw fall toward zero in data-sparse interior, the
// increment relaxes to the background; where Σw ≫ k (at and near a vane) the
// increment approaches the true weighted-mean residual, so the field actually
// bends to honour the vanes. The previous code divided by max(Σw, 1), which
// could exceed Σw even right next to a station and so systematically *under*-
// applied each vane's correction — the field never reached the observation it
// was supposed to be pinned to.
const BACKGROUND_WEIGHT = 0.5;

/**
 * Barnes-corrected field: background + Gaussian-weighted interpolation of the
 * observation residuals. `radiusKm` is the e-folding radius of influence.
 * The increment is Σ(w·r) / (Σw + k): a proper weighted mean of the residuals,
 * tapered toward zero (relax to background) wherever the vanes are sparse.
 */
export function correctedSampler(
  background: Sampler,
  stations: Station[],
  proj: Projector,
  radiusKm = 18,
): Sampler {
  const residuals = stations.map((s) => {
    const p = proj(s.lon, s.lat);
    const b = background(s.lon, s.lat);
    const obs = stationVec(s);
    return { x: p.x, y: p.y, ru: obs.u - b.u, rv: obs.v - b.v };
  });
  const r2 = radiusKm * radiusKm;
  return (lon, lat) => {
    const b = background(lon, lat);
    if (residuals.length === 0) return b;
    const p = proj(lon, lat);
    let su = 0, sv = 0, sw = 0;
    for (const r of residuals) {
      const d2 = (r.x - p.x) ** 2 + (r.y - p.y) ** 2;
      const w = Math.exp(-d2 / r2);
      su += w * r.ru;
      sv += w * r.rv;
      sw += w;
    }
    const denom = sw + BACKGROUND_WEIGHT;
    return { u: b.u + su / denom, v: b.v + sv / denom };
  };
}

/** The correction itself: corrected − background. */
export function differenceSampler(background: Sampler, corrected: Sampler): Sampler {
  return (lon, lat) => {
    const b = background(lon, lat);
    const c = corrected(lon, lat);
    return { u: c.u - b.u, v: c.v - b.v };
  };
}

/** Robust upper bound on field speed (95th percentile) for colour scaling. */
export function estimateMaxSpeed(sampler: Sampler, bbox: Bbox, n = 24): number {
  const speeds: number[] = [];
  for (let j = 0; j <= n; j++) {
    const lat = bbox.south + ((bbox.north - bbox.south) * j) / n;
    for (let i = 0; i <= n; i++) {
      const lon = bbox.west + ((bbox.east - bbox.west) * i) / n;
      const s = sampler(lon, lat);
      speeds.push(Math.hypot(s.u, s.v));
    }
  }
  speeds.sort((a, b) => a - b);
  return speeds[Math.floor(speeds.length * 0.95)] || 1;
}
