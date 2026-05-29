import { NextResponse } from "next/server";
import { REGION } from "@/app/data/region";
import type { ModelGrid, Station, WindPayload } from "@/app/lib/types";
import snapshot from "@/app/data/snapshot.json";

// Cache upstream responses for 5 minutes — these are "latest observation" and
// "current model" endpoints that update on roughly that cadence.
export const revalidate = 300;
// Render per request so SYNOPTIC_TOKEN and the live upstreams are read at runtime
// (not frozen at build time) — setting the token in the deploy env takes effect
// without a rebuild. The upstream fetches are still cached for `revalidate` s.
export const dynamic = "force-dynamic";

const UA =
  "finn-watchduty-poc (https://github.com/sharkfinnhoohaha/finn-watchduty; finlaybennett@gmail.com)";
const TIMEOUT_MS = 12_000;
// Older than this and we treat a vane as offline rather than draw a stale reading
// as if it were live — a real hazard on a fire map.
const MAX_AGE_MIN = 240;
// Keep the live vane network bounded so the Barnes pass and particle advection
// stay cheap even when Synoptic returns hundreds of stations over the bbox.
const MAX_SYNOPTIC_STATIONS = 48;
const MIN_SPACING_KM = 2.2;

// ---- unit handling --------------------------------------------------------
// NWS reports wind in km/h and temp in °C today, but the unitCode is part of the
// payload and can change per station — respect it rather than assume.
function toKmh(value: number | null | undefined, unitCode?: string): number | null {
  if (value == null) return null;
  if (unitCode?.includes("m_s")) return value * 3.6;
  if (unitCode?.includes("mile") || unitCode?.includes("mph")) return value * 1.609344;
  if (unitCode?.includes("knot") || unitCode?.includes("kt")) return value * 1.852;
  return value; // km_h-1 (default)
}
function toC(value: number | null | undefined, unitCode?: string): number | null {
  if (value == null) return null;
  if (unitCode?.includes("degF")) return ((value - 32) * 5) / 9;
  if (unitCode?.includes("K")) return value - 273.15;
  return value; // degC (default)
}

/** Coarse network label for an NWS station, inferred from its id/name. */
function nwsNetwork(id: string): string {
  if (/^K[A-Z]{3}$/.test(id)) return "Airport ASOS/AWOS";
  if (/C1$/.test(id)) return "RAWS";
  return "Mesonet";
}

// ---- ground-truth vanes (Synoptic preferred, NWS keyless fallback) --------

/**
 * Synoptic Data — Watch Duty's actual weather-station provider. One bbox query
 * returns *every* vane Watch Duty would draw (RAWS, CWOP/personal, mesonet),
 * which is the whole point. Enabled when SYNOPTIC_TOKEN is set.
 */
async function fetchFromSynoptic(token: string): Promise<{ stations: Station[]; warnings: string[] }> {
  const now = Date.now();
  const { west, south, east, north } = REGION.bbox;
  const url =
    `https://api.synopticdata.com/v2/stations/latest` +
    `?bbox=${west},${south},${east},${north}` +
    `&vars=wind_speed,wind_direction,wind_gust,air_temp` +
    `&status=active&units=speed|kph,temp|C&within=120&token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate } });
  if (!res.ok) throw new Error(`Synoptic HTTP ${res.status}`);
  const json = await res.json();
  const raw = (json.STATION ?? []) as Array<Record<string, unknown>>;

  const NETS: Record<string, string> = { "1": "Airport ASOS/AWOS", "2": "RAWS", "65": "CWOP/personal" };
  const parsed: Station[] = [];
  for (const st of raw) {
    const obs = (st.OBSERVATIONS ?? {}) as Record<string, { value?: number; date_time?: string }>;
    const ws = obs.wind_speed_value_1?.value;
    if (ws == null) continue; // no wind sensor / no recent wind reading
    const ts = obs.wind_speed_value_1?.date_time ?? new Date(now).toISOString();
    const ageMin = Math.round((now - new Date(ts).getTime()) / 60000);
    if (ageMin > MAX_AGE_MIN) continue;
    parsed.push({
      id: String(st.STID),
      name: String(st.NAME ?? st.STID),
      lon: Number(st.LONGITUDE),
      lat: Number(st.LATITUDE),
      speedKmh: ws,
      dirDeg: obs.wind_direction_value_1?.value ?? null,
      gustKmh: obs.wind_gust_value_1?.value ?? null,
      tempC: obs.air_temp_value_1?.value ?? null,
      observedAt: ts,
      ageMin,
      network: NETS[String(st.MNET_ID)] ?? "Mesonet",
    });
  }

  // Thin to a manageable density, but let the fire-weather RAWS win any spacing
  // tie over a nearby personal station — they're the stations that matter most
  // on a fire map. (Stable sort keeps Synoptic's order within each tier.)
  parsed.sort((a, b) => (a.network === "RAWS" ? 0 : 1) - (b.network === "RAWS" ? 0 : 1));
  const stations = decimate(parsed, MIN_SPACING_KM, MAX_SYNOPTIC_STATIONS);
  const warnings =
    stations.length < parsed.length
      ? [`Synoptic returned ${parsed.length} vanes; thinned to ${stations.length} for the demo`]
      : [];
  return { stations, warnings };
}

/** Fetch the latest observation for each configured NWS station — keyless. */
async function fetchFromNws(): Promise<{ stations: Station[]; warnings: string[] }> {
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
      const speedKmh = toKmh(p.windSpeed?.value, p.windSpeed?.unitCode);
      // A *calm* vane reports speed 0 with a null direction — that is a real,
      // showable observation (and often the biggest disagreement with a windy
      // model), so we keep it. We only drop a vane when the wind sensor itself
      // reports nothing, or the reading is stale.
      if (!coords || speedKmh == null) {
        throw new Error("no wind in latest observation");
      }
      const observedAt = p.timestamp;
      const ageMin = Math.round((now - new Date(observedAt).getTime()) / 60000);
      if (ageMin > MAX_AGE_MIN) throw new Error(`stale (${ageMin} min)`);
      const station: Station = {
        id,
        name: p.stationName ?? id,
        lon: coords[0],
        lat: coords[1],
        speedKmh,
        dirDeg: p.windDirection?.value ?? null,
        gustKmh: toKmh(p.windGust?.value, p.windGust?.unitCode),
        tempC: toC(p.temperature?.value, p.temperature?.unitCode),
        observedAt,
        ageMin,
        network: nwsNetwork(id),
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

/** Greedy spatial thinning: keep stations ≥ minKm apart, up to `cap`. */
function decimate(stations: Station[], minKm: number, cap: number): Station[] {
  const kept: Station[] = [];
  const kx = 111.32 * Math.cos((REGION.center[1] * Math.PI) / 180);
  const ky = 110.57;
  for (const s of stations) {
    if (kept.length >= cap) break;
    const ok = kept.every((k) => {
      const dx = (s.lon - k.lon) * kx;
      const dy = (s.lat - k.lat) * ky;
      return Math.hypot(dx, dy) >= minKm;
    });
    if (ok) kept.push(s);
  }
  return kept;
}

const NWS_SOURCE = "NWS api.weather.gov — keyless RAWS · mesonet observations (Synoptic stand-in)";

async function fetchStations(): Promise<{
  stations: Station[];
  warnings: string[];
  source: string;
  kind: "synoptic" | "nws";
}> {
  const token = process.env.SYNOPTIC_TOKEN;
  if (token) {
    try {
      const r = await fetchFromSynoptic(token);
      return {
        ...r,
        source: "Synoptic Data stations/latest — Watch Duty's weather-vane network (RAWS · CWOP · mesonet)",
        kind: "synoptic",
      };
    } catch (e) {
      const r = await fetchFromNws();
      return {
        stations: r.stations,
        warnings: [...r.warnings, `Synoptic failed (${String(e).slice(0, 40)}) — fell back to NWS`],
        source: NWS_SOURCE,
        kind: "nws",
      };
    }
  }
  const r = await fetchFromNws();
  return { ...r, source: NWS_SOURCE, kind: "nws" };
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
        observations: stationsRes.source,
        model: "Open-Meteo current 10 m wind — coarse global-model background (Windy-class stand-in)",
        obsKind: stationsRes.kind,
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
