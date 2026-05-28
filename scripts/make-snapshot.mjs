// Generates app/data/snapshot.json from live data. The snapshot is the
// last-resort fallback the /api/wind route serves if every upstream is down,
// so the demo never renders blank. Re-run with: node scripts/make-snapshot.mjs
//
// Region constants are inlined here to keep the script runnable as plain ESM
// (no TS loader); keep them in sync with app/data/region.ts.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REGION = {
  center: [-118.7, 34.1],
  zoom: 9.6,
  bbox: { west: -119.2, south: 33.88, east: -118.3, north: 34.34 },
  stationIds: [
    "KSMO", "KVNY", "KBUR", "KWHP", "KLAX",
    "KHHR", "KCMA", "KNTD", "KOXR", "KSZP",
  ],
  modelGrid: { lon: 8, lat: 6 },
};

const UA = "finn-watchduty-poc (https://github.com/sharkfinnhoohaha/finn-watchduty; finlaybennett@gmail.com)";

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
      if (!coords || p.windSpeed?.value == null || p.windDirection?.value == null) {
        throw new Error("no wind");
      }
      return {
        id,
        name: p.stationName ?? id,
        lon: coords[0],
        lat: coords[1],
        speedKmh: p.windSpeed.value,
        dirDeg: p.windDirection.value,
        gustKmh: p.windGust?.value ?? null,
        tempC: p.temperature?.value ?? null,
        observedAt: p.timestamp,
        ageMin: Math.round((now - new Date(p.timestamp).getTime()) / 60000),
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
    observations: "NWS api.weather.gov — latest METAR/ASOS station observations",
    model: "Open-Meteo current 10 m wind — model background (Windy-equivalent)",
  },
  warnings: [],
  fallback: false,
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "data", "snapshot.json");
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log(`snapshot: ${stations.length} stations, model=${model ? `${model.u.length} pts` : "none"} -> ${out}`);
