// Unit tests for the air-mass rule and the marine-layer regression: a foggy,
// below-inversion coastal obs must not drag a cell that represents terrain above
// the inversion. Run via `npm test`.

import test from "node:test";
import assert from "node:assert/strict";

import { classifyAirMass, canCorrect, tagStation } from "../airmass";
import { analyzeField } from "../analysis";
import { makeProjector } from "../../interpolate";
import { DEFAULT_CONFIG, type PipelineConfig } from "../config";
import type { ElevationGrid, Station } from "../../types";
import type { InversionModel } from "../inversion";

test("classifyAirMass splits on the inversion base, unknown when data is missing", () => {
  assert.equal(classifyAirMass(50, 400), "below");
  assert.equal(classifyAirMass(800, 400), "above");
  assert.equal(classifyAirMass(null, 400), "unknown");
  assert.equal(classifyAirMass(800, null), "unknown");
});

test("the air-mass rule forbids only strict below-vs-above pairings", () => {
  assert.equal(canCorrect("below", "above"), false);
  assert.equal(canCorrect("above", "below"), false);
  assert.equal(canCorrect("below", "below"), true);
  assert.equal(canCorrect("above", "above"), true);
  // Unknown is permissive: no evidence of a boundary to respect.
  assert.equal(canCorrect("unknown", "above"), true);
  assert.equal(canCorrect("below", "unknown"), true);
});

// A plateau terrain at 800 m everywhere: any cell is "above" a 400 m inversion.
const terrain800: ElevationGrid = {
  lons: [-119.2, -118.3],
  lats: [33.88, 34.34],
  z: [800, 800, 800, 800],
};

const inversion400: InversionModel = () => 400;

function foggyStation(): Station {
  // A coastal station sitting in marine-layer fog: low elevation, light wind.
  const s: Station = {
    id: "FOG", name: "Coastal fog", lon: -118.6, lat: 34.1,
    speedKmh: 2, dirDeg: 270, gustKmh: null, tempC: null,
    observedAt: "", ageMin: 0, network: "Mesonet",
    elevationM: 50, speed10Kmh: 2, analysisWeight: 1,
  };
  return tagStation(s, inversion400);
}

// Isolate the air-mass rule from vertical decorrelation by making the vertical
// length effectively infinite; only the rule should block the cross-boundary obs.
function isolatedConfig(): PipelineConfig {
  return {
    ...DEFAULT_CONFIG,
    analysis: {
      ...DEFAULT_CONFIG.analysis,
      decorrelationKm: 100,
      decorrelationVerticalM: 1e12,
      backgroundError: 0.5,
    },
  };
}

const background = () => ({ u: 10, v: 0 }); // steady 10 km/h flow
const proj = makeProjector(-118.7, 34.1);

test("regression: a below-inversion foggy obs does NOT alter an above-inversion cell", () => {
  const fog = foggyStation();
  assert.equal(fog.airMass, "below");

  const withRule = analyzeField(background, [fog], proj, isolatedConfig(), {
    terrain: terrain800,
    inversion: inversion400,
  });
  // The cell at the foggy station's location represents 800 m terrain (above).
  // The rule must block the below-inversion obs, leaving the background intact.
  const c = withRule.corrected(fog.lon, fog.lat);
  assert.ok(
    Math.abs(c.u - 10) < 1e-6,
    `above-inversion cell should keep the background (10), got ${c.u.toFixed(3)}`,
  );

  // Control: with no inversion model the same obs DOES drag the cell down,
  // confirming the test would fail without the rule.
  const noRule = analyzeField(background, [fog], proj, isolatedConfig(), {
    terrain: terrain800,
    inversion: null,
  });
  const c2 = noRule.corrected(fog.lon, fog.lat);
  assert.ok(
    c2.u < 6,
    `without the rule the foggy obs should drag the cell well below 10, got ${c2.u.toFixed(3)}`,
  );
});

test("an above-inversion obs DOES correct an above-inversion cell (rule is not blanket)", () => {
  const ridge: Station = tagStation(
    {
      id: "RDG", name: "Ridge", lon: -118.6, lat: 34.1,
      speedKmh: 2, dirDeg: 270, gustKmh: null, tempC: null,
      observedAt: "", ageMin: 0, network: "RAWS",
      elevationM: 800, speed10Kmh: 2, analysisWeight: 1,
    },
    inversion400,
  );
  assert.equal(ridge.airMass, "above");

  const out = analyzeField(background, [ridge], proj, isolatedConfig(), {
    terrain: terrain800,
    inversion: inversion400,
  });
  const c = out.corrected(ridge.lon, ridge.lat);
  assert.ok(c.u < 6, `same-air-mass obs should correct the cell, got ${c.u.toFixed(3)}`);
});

test("confidence is lower near the inversion base than far above it", () => {
  const ridge: Station = tagStation(
    {
      id: "RDG", name: "Ridge", lon: -118.6, lat: 34.1,
      speedKmh: 12, dirDeg: 270, gustKmh: null, tempC: null,
      observedAt: "", ageMin: 0, network: "RAWS",
      elevationM: 800, speed10Kmh: 12, analysisWeight: 1,
    },
    inversion400,
  );
  // Two plateaus: one right at the inversion (400 m), one well above (1200 m).
  const nearInv: ElevationGrid = { lons: terrain800.lons, lats: terrain800.lats, z: [400, 400, 400, 400] };
  const wellAbove: ElevationGrid = { lons: terrain800.lons, lats: terrain800.lats, z: [1200, 1200, 1200, 1200] };
  const cfg = isolatedConfig();
  const near = analyzeField(background, [ridge], proj, cfg, { terrain: nearInv, inversion: inversion400 });
  const far = analyzeField(background, [ridge], proj, cfg, { terrain: wellAbove, inversion: inversion400 });
  assert.ok(
    near.confidence(-118.6, 34.1) < far.confidence(-118.6, 34.1),
    "confidence should be suppressed near the inversion boundary",
  );
});
