// Generates app/data/snapshot.json from live data. The snapshot is the
// last-resort fallback the /api/wind route serves if every upstream is down,
// so the demo never renders blank. Re-run with: node scripts/make-snapshot.mjs
//
// This mirrors the *keyless NWS* adapter in app/api/wind/route.ts (the Synoptic
// path needs a token). Region constants are inlined here to keep the script
// runnable as plain ESM (no TS loader); keep them in sync with app/data/region.ts.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REGION = {
  center: [-118.7, 34.1],
  zoom: 9.6,
  bbox: { west: -119.2, south: 33.88, east: -118.3, north: 34.34 },
  stationIds: [
    // Ridge & canyon RAWS (the interior vanes Watch Duty shows).
    "TPGC1", "CEEC1", "MBUC1", "LCBC1",
    // DOT / mesonet valley sites.
    "SV", "TO", "ER",
    // Airport ASOS/AWOS ring.
    "KSMO", "KVNY", "KBUR", "KWHP", "KLAX", "KHHR", "KCMA", "KNTD", "KOXR",
  ],
  modelGrid: { lon: 12, lat: 8 },
};

const UA = "finn-watchduty-poc (https://github.com/sharkfinnhoohaha/finn-watchduty; finlaybennett@gmail.com)";
const MAX_AGE_MIN = 240;

const toKmh = (v, u) => {
  if (v == null) return null;
  if (u?.includes("m_s")) return v * 3.6;
  if (u?.includes("mile") || u?.includes("mph")) return v * 1.609344;
  if (u?.includes("knot") || u?.includes("kt")) return v * 1.852;
  return v;
};
const toC = (v, u) => {
  if (v == null) return null;
  if (u?.includes("degF")) return ((v - 32) * 5) / 9;
  if (u?.includes("K")) return v - 273.15;
  return v;
};
const nwsNetwork = (id) =>
  /^K[A-Z]{3}$/.test(id) ? "Airport ASOS/AWOS" : /C1$/.test(id) ? "RAWS" : "Mesonet";

async function fetchStations() {
  const now = Date.now();
  const settled = await Promise.allSettled(
    REGION.stationIds.map(async (id) => {
      const r = await fetch(`https://api.weather.gov/stations/${id}/observations/latest`, {
        headers: { "User-Agent": UA, Accept: "application/geo+json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const p = j.properties ?? {};
      const coords = j.geometry?.coordinates;
      const speedKmh = toKmh(p.windSpeed?.value, p.windSpeed?.unitCode);
      if (!coords || speedKmh == null) throw new Error("no wind");
      const ageMin = Math.round((now - new Date(p.timestamp).getTime()) / 60000);
      if (ageMin > MAX_AGE_MIN) throw new Error(`stale (${ageMin} min)`);
      return {
        id,
        name: p.stationName ?? id,
        lon: coords[0],
        lat: coords[1],
        speedKmh,
        dirDeg: p.windDirection?.value ?? null,
        gustKmh: toKmh(p.windGust?.value, p.windGust?.unitCode),
        tempC: toC(p.temperature?.value, p.temperature?.unitCode),
        observedAt: p.timestamp,
        ageMin,
        network: nwsNetwork(id),
      };
    }),
  );
  return settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
}

async function fetchModel() {
  const { bbox, modelGrid } = REGION;
  const lons = [];
  const lats = [];
  for (let i = 0; i < modelGrid.lon; i++) lons.push(bbox.west + ((bbox.east - bbox.west) * i) / (modelGrid.lon - 1));
  for (let j = 0; j < modelGrid.lat; j++) lats.push(bbox.south + ((bbox.north - bbox.south) * j) / (modelGrid.lat - 1));
  const latArr = [];
  const lonArr = [];
  for (let j = 0; j < lats.length; j++) for (let i = 0; i < lons.length; i++) { latArr.push(lats[j]); lonArr.push(lons[i]); }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latArr.join(",")}&longitude=${lonArr.join(",")}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return null;
  const j = await r.json();
  const pts = Array.isArray(j) ? j : [j];
  const u = [];
  const v = [];
  for (const pt of pts) {
    const c = pt.current ?? {};
    const sp = c.wind_speed_10m ?? 0;
    const dr = ((c.wind_direction_10m ?? 0) * Math.PI) / 180;
    u.push(-sp * Math.sin(dr));
    v.push(-sp * Math.cos(dr));
  }
  return { lons, lats, u, v };
}

const [stations, model] = await Promise.all([fetchStations(), fetchModel()]);
const payload = {
  generatedAt: new Date().toISOString(),
  bbox: REGION.bbox,
  center: REGION.center,
  zoom: REGION.zoom,
  stations,
  model,
  sources: {
    observations: "NWS api.weather.gov — keyless RAWS · mesonet · airport observations (Synoptic stand-in)",
    model: "Open-Meteo current 10 m wind — coarse global-model background (Windy-class stand-in)",
  },
  warnings: [],
  fallback: false,
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "data", "snapshot.json");
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log(`snapshot: ${stations.length} stations, model=${model ? `${model.u.length} pts` : "none"} -> ${out}`);
