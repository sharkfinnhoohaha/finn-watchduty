// Spatial sampling helpers for the wind field: the model-grid sampler, the
// observations-only IDW fallback, the local projector, and difference/scale
// utilities.
//
// The corrected field itself (background plus an air-mass-aware, terrain-aware
// optimal-interpolation correction) lives in app/lib/pipeline/analysis.ts; this
// module provides the pieces it and the renderer build on. The old single-pass
// Barnes corrected sampler has been superseded by that pipeline.

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
