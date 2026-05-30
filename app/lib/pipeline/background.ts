// Step 1: the background field.
//
// The analysis corrects a terrain-following model background, it does not
// average stations. The background source is configurable:
//
//   rtma      RTMA/URMA, NOAA's hourly ~2.5 km surface analysis. Preferred when
//             accessible because it already assimilates obs with terrain-aware
//             analysis. STUB in this pass.
//   hrrr      HRRR 3 km model wind. STUB in this pass.
//   openmeteo Open-Meteo current 10 m wind, keyless. The working default and a
//             stand-in for any global-model background.
//
// Each provider returns a ModelGrid in the existing row-major layout so the
// downstream sampler and renderer are unchanged. When a preferred source is not
// wired (returns null), the factory falls back to Open-Meteo.
//
// Comments here avoid double dashes, using commas and colons.

import type { BackgroundSource, PipelineConfig } from "./config";
import type { Bbox, ModelGrid } from "../types";

const TIMEOUT_MS = 12_000;

export type GridSpec = { lon: number; lat: number };

export type BackgroundResult = {
  grid: ModelGrid;
  source: string;
  kind: BackgroundSource;
};

/** A background provider fetches a model wind grid over the bbox, or null if
 *  the source is unavailable / not wired. */
export type BackgroundProvider = (
  bbox: Bbox,
  spec: GridSpec,
  revalidate: number,
) => Promise<BackgroundResult | null>;

/** Build ascending lon/lat axes spanning the bbox at the requested resolution. */
export function buildAxes(bbox: Bbox, spec: GridSpec): { lons: number[]; lats: number[] } {
  const lons: number[] = [];
  const lats: number[] = [];
  for (let i = 0; i < spec.lon; i++) {
    lons.push(bbox.west + ((bbox.east - bbox.west) * i) / (spec.lon - 1));
  }
  for (let j = 0; j < spec.lat; j++) {
    lats.push(bbox.south + ((bbox.north - bbox.south) * j) / (spec.lat - 1));
  }
  return { lons, lats };
}

/** Open-Meteo current 10 m wind over the grid. Keyless, the working default. */
export const openMeteoBackground: BackgroundProvider = async (bbox, spec, revalidate) => {
  const { lons, lats } = buildAxes(bbox, spec);
  const latArr: number[] = [];
  const lonArr: number[] = [];
  for (let j = 0; j < lats.length; j++) {
    for (let i = 0; i < lons.length; i++) {
      latArr.push(lats[j]);
      lonArr.push(lons[i]);
    }
  }
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latArr.join(",")}` +
      `&longitude=${lonArr.join(",")}` +
      `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const points = Array.isArray(json) ? json : [json];
    const u = new Array<number>(points.length);
    const v = new Array<number>(points.length);
    for (let k = 0; k < points.length; k++) {
      const c = points[k].current ?? {};
      const sp = c.wind_speed_10m ?? 0;
      const dr = ((c.wind_direction_10m ?? 0) * Math.PI) / 180;
      u[k] = -sp * Math.sin(dr);
      v[k] = -sp * Math.cos(dr);
    }
    return {
      grid: { lons, lats, u, v },
      source: "Open-Meteo current 10 m wind, coarse global-model background (Windy-class stand-in)",
      kind: "openmeteo",
    };
  } catch {
    return null;
  }
};

/**
 * RTMA/URMA background. STUB: the GRIB fetch and decode are not wired in this
 * pass. Returns null so the factory falls back to Open-Meteo. When integrated,
 * this fetches the ~2.5 km hourly surface analysis over the bbox and resamples
 * it onto the grid; it is the preferred source because it already assimilates
 * obs with terrain-aware analysis.
 */
export const rtmaBackground: BackgroundProvider = async () => {
  // TODO: fetch and decode RTMA/URMA UGRD/VGRD over the bbox.
  return null;
};

/**
 * HRRR 3 km background. STUB: the GRIB fetch and decode are not wired in this
 * pass. Returns null so the factory falls back to Open-Meteo. When integrated,
 * this fetches HRRR 10 m UGRD/VGRD and resamples onto the grid; HRRR also
 * supplies the vertical temperature profile used for inversion detection.
 */
export const hrrrBackground: BackgroundProvider = async () => {
  // TODO: fetch and decode HRRR 10 m UGRD/VGRD over the bbox.
  return null;
};

const PROVIDERS: Record<BackgroundSource, BackgroundProvider> = {
  rtma: rtmaBackground,
  hrrr: hrrrBackground,
  openmeteo: openMeteoBackground,
};

/**
 * Fetch the configured background, falling back to Open-Meteo if the preferred
 * source is not wired or is unreachable. Returns null only if every attempt
 * fails (the route then degrades to an obs-only field).
 */
export async function fetchBackground(
  bbox: Bbox,
  spec: GridSpec,
  cfg: PipelineConfig,
  revalidate: number,
): Promise<BackgroundResult | null> {
  const primary = PROVIDERS[cfg.background] ?? openMeteoBackground;
  const result = await primary(bbox, spec, revalidate);
  if (result) return result;
  if (cfg.background !== "openmeteo") {
    return openMeteoBackground(bbox, spec, revalidate);
  }
  return null;
}
