// Terrain elevation support for the air-mass rule and ridge-aware weighting.
//
// The analysis needs an elevation at every grid cell and every station. We use
// the keyless Open-Meteo elevation API (Copernicus DEM, ~90 m), sampled on the
// analysis grid and at the station coordinates. This is the terrain model the
// air-mass tagging and ridge decorrelation read; it is also the surface a
// WindNinja downscale would refine against once wired.
//
// Comments here avoid double dashes, using commas and colons.

import type { Bbox, ElevationGrid } from "../types";
import type { GridSpec } from "./background";
import { buildAxes } from "./background";

const TIMEOUT_MS = 12_000;
const MAX_POINTS = 100; // Open-Meteo elevation accepts up to 100 coordinates per call

/** Fetch elevations (metres) for arbitrary points. Batches to the API limit. */
export async function fetchPointElevations(
  lons: number[],
  lats: number[],
  revalidate: number,
): Promise<number[] | null> {
  if (lons.length !== lats.length) throw new Error("lons/lats length mismatch");
  const out: number[] = [];
  for (let start = 0; start < lons.length; start += MAX_POINTS) {
    const slLon = lons.slice(start, start + MAX_POINTS);
    const slLat = lats.slice(start, start + MAX_POINTS);
    try {
      const url =
        `https://api.open-meteo.com/v1/elevation?latitude=${slLat.join(",")}` +
        `&longitude=${slLon.join(",")}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const el = json.elevation as number[] | undefined;
      if (!Array.isArray(el) || el.length !== slLon.length) return null;
      out.push(...el);
    } catch {
      return null;
    }
  }
  return out;
}

/** Fetch a terrain elevation grid over the bbox at the requested resolution. */
export async function fetchElevationGrid(
  bbox: Bbox,
  spec: GridSpec,
  revalidate: number,
): Promise<ElevationGrid | null> {
  const { lons, lats } = buildAxes(bbox, spec);
  const lonArr: number[] = [];
  const latArr: number[] = [];
  for (let j = 0; j < lats.length; j++) {
    for (let i = 0; i < lons.length; i++) {
      lonArr.push(lons[i]);
      latArr.push(lats[j]);
    }
  }
  const z = await fetchPointElevations(lonArr, latArr, revalidate);
  if (!z) return null;
  return { lons, lats, z };
}
