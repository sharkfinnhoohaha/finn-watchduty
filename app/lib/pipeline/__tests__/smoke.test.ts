// End-to-end smoke test: from raw observations through the obs pipeline
// (QC, height normalization, temporal harmonization, air-mass tagging) and the
// spatial analysis, producing a corrected field plus a co-registered confidence
// layer for a sample timestamp. Run via `npm test`.

import test from "node:test";
import assert from "node:assert/strict";

import { enrichObservations } from "../enrich";
import { analyzeField, buildConfidenceGrid } from "../analysis";
import { makeProjector } from "../../interpolate";
import { DEFAULT_CONFIG } from "../config";
import type { ElevationGrid, Station } from "../../types";
import type { InversionModel } from "../inversion";

const center: [number, number] = [-118.7, 34.1];
const inversion: InversionModel = () => 500;

// A moderate terrain plateau below the inversion: cells are "below".
const terrain: ElevationGrid = {
  lons: [-119.2, -118.75, -118.3],
  lats: [33.88, 34.11, 34.34],
  z: [350, 350, 350, 360, 360, 360, 350, 350, 350],
};

// A steady background flow (stands in for the model grid sampler).
const background = () => ({ u: 12, v: 3 });

function rawStations(): Station[] {
  const mk = (
    id: string,
    lon: number,
    lat: number,
    speedKmh: number,
    network: string,
    elevationM: number,
  ): Station => ({
    id, name: id, lon, lat, speedKmh, dirDeg: 250, gustKmh: speedKmh * 1.4,
    tempC: 16, observedAt: "", ageMin: 10, network, elevationM,
  });
  // A small cluster of consistent obs near the centre, one isolated obs, and
  // one above-inversion obs (which the rule will keep out of below cells).
  return [
    mk("R1", -118.62, 34.10, 18, "RAWS", 300),
    mk("R2", -118.66, 34.12, 21, "RAWS", 320),
    mk("A1", -118.60, 34.08, 16, "Airport ASOS/AWOS", 280),
    mk("C1", -118.64, 34.09, 20, "CWOP/personal", 300),
    mk("FAR", -119.10, 33.92, 19, "Mesonet", 300),
    mk("HIGH", -118.63, 34.11, 12, "RAWS", 900),
  ];
}

test("pipeline produces a finite corrected field and a valid confidence layer", () => {
  const proj = makeProjector(center[0], center[1]);
  const enriched = enrichObservations(rawStations(), DEFAULT_CONFIG, { terrain, inversion });

  // Every survivor is height-normalized, time-weighted, and air-mass tagged.
  assert.ok(enriched.stations.length >= 4, "most obs should survive QC and the window");
  for (const s of enriched.stations) {
    assert.equal(typeof s.speed10Kmh, "number");
    assert.ok(Number.isFinite(s.speed10Kmh!));
    assert.ok(["below", "above", "unknown"].includes(s.airMass!));
    assert.equal(typeof s.analysisWeight, "number");
  }
  assert.ok(Array.isArray(enriched.rejected));

  const analysis = analyzeField(background, enriched.stations, proj, DEFAULT_CONFIG, {
    terrain,
    inversion,
  });

  // Corrected field is finite everywhere we sample it.
  for (const [lon, lat] of [center, [-118.62, 34.1], [-119.0, 33.95]] as const) {
    const v = analysis.corrected(lon, lat);
    assert.ok(Number.isFinite(v.u) && Number.isFinite(v.v), `field finite at ${lon},${lat}`);
  }

  // Confidence layer: co-registered grid, all values in [0,1].
  const grid = buildConfidenceGrid(analysis.confidence, terrain.lons, terrain.lats);
  assert.equal(grid.c.length, terrain.lons.length * terrain.lats.length);
  for (const c of grid.c) assert.ok(c >= 0 && c <= 1, `confidence ${c} out of range`);

  // Confidence is higher inside the obs cluster than in the empty far corner.
  const near = analysis.confidence(-118.63, 34.105);
  const far = analysis.confidence(-119.18, 33.89);
  assert.ok(near > far, `cluster confidence ${near.toFixed(3)} should exceed corner ${far.toFixed(3)}`);
});

test("the corrected field bends toward the obs inside the cluster", () => {
  const proj = makeProjector(center[0], center[1]);
  const enriched = enrichObservations(rawStations(), DEFAULT_CONFIG, { terrain, inversion });
  const analysis = analyzeField(background, enriched.stations, proj, DEFAULT_CONFIG, {
    terrain,
    inversion,
  });
  // Cluster obs are stronger than the 12.4 km/h background magnitude, so the
  // corrected speed in the cluster should exceed the background there.
  const bgSpeed = Math.hypot(12, 3);
  const c = analysis.corrected(-118.63, 34.105);
  assert.ok(
    Math.hypot(c.u, c.v) > bgSpeed,
    "corrected wind in the cluster should rise toward the (stronger) obs",
  );
});
