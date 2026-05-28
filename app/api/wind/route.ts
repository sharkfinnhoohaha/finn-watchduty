import { NextResponse } from "next/server";
import { REGION } from "@/app/data/region";
import type { ModelGrid, Station, WindPayload } from "@/app/lib/types";
import snapshot from "@/app/data/snapshot.json";

// Cache upstream responses for 5 minutes — these are "latest observation" and
// "current model" endpoints that update on roughly that cadence.
export const revalidate = 300;

const UA =
  "finn-watchduty-poc (https://github.com/sharkfinnhoohaha/finn-watchduty; finlaybennett@gmail.com)";
const TIMEOUT_MS = 12_000;

/** Fetch the latest observation for each configured NWS station — the vanes. */
async function fetchStations(): Promise<{ stations: Station[]; warnings: string[] }> {
  const now = Date.now();
  const warnings: string[] = [];

  const results = await Promise.allSettled(
    REGION.stationIds.map(async (id) => {
      const res = await fetch(
        `https://api.weather.gov/stations/${id}/observations/latest`,
        {
          headers: { "User-Agent": UA, Accept: "application/geo+json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          next: { revalidate },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const p = json.properties ?? {};
      const coords = json.geometry?.coordinates as [number, number] | undefined;
      const speedKmh = p.windSpeed?.value;
      const dirDeg = p.windDirection?.value;
      // Calm or instrument-missing observations report null wind — skip them.
      if (!coords || speedKmh == null || dirDeg == null) {
        throw new Error("no wind in latest observation");
      }
      const station: Station = {
        id,
        name: p.stationName ?? id,
        lon: coords[0],
        lat: coords[1],
        speedKmh,
        dirDeg,
        gustKmh: p.windGust?.value ?? null,
        tempC: p.temperature?.value ?? null,
        observedAt: p.timestamp,
        ageMin: Math.round((now - new Date(p.timestamp).getTime()) / 60000),
      };
      return station;
    }),
  );

  const stations: Station[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") stations.push(r.value);
    else warnings.push(`${REGION.stationIds[i]}: ${String(r.reason).slice(0, 50)}`);
  });
  return { stations, warnings };
}

/** Fetch a coarse model wind field over the bbox — the "Windy" stand-in. */
async function fetchModel(): Promise<ModelGrid | null> {
  const { bbox, modelGrid } = REGION;
  const lons: number[] = [];
  const lats: number[] = [];
  for (let i = 0; i < modelGrid.lon; i++) {
    lons.push(bbox.west + ((bbox.east - bbox.west) * i) / (modelGrid.lon - 1));
  }
  for (let j = 0; j < modelGrid.lat; j++) {
    lats.push(bbox.south + ((bbox.north - bbox.south) * j) / (modelGrid.lat - 1));
  }

  // Row-major (lat outer, lon inner) so index = j * lons.length + i.
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
    return { lons, lats, u, v };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [stationsRes, model] = await Promise.all([fetchStations(), fetchModel()]);
    const warnings = [...stationsRes.warnings];
    if (!model) {
      warnings.push("Open-Meteo unavailable — corrected field falls back to observations only");
    }

    // Total failure: serve the bundled snapshot so the demo never goes blank.
    if (stationsRes.stations.length === 0 && !model) {
      return NextResponse.json({
        ...(snapshot as unknown as WindPayload),
        fallback: true,
        warnings: [...warnings, "all upstreams failed — serving bundled snapshot"],
      });
    }

    const payload: WindPayload = {
      generatedAt: new Date().toISOString(),
      bbox: REGION.bbox,
      center: REGION.center,
      zoom: REGION.zoom,
      stations: stationsRes.stations,
      model,
      sources: {
        observations: "NWS api.weather.gov — latest METAR/ASOS station observations",
        model: "Open-Meteo current 10 m wind — model background (Windy-equivalent)",
      },
      warnings,
      fallback: false,
    };
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({
      ...(snapshot as unknown as WindPayload),
      fallback: true,
      warnings: [`route error: ${String(e).slice(0, 80)} — serving bundled snapshot`],
    });
  }
}
