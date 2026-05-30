// Unit tests for height normalization: the neutral log wind profile.
// Run via `npm test`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  logProfileFactor,
  normalizeSpeed,
  measurementHeight,
  normalizeStation,
  REFERENCE_HEIGHT_M,
} from "../heightNormalize";
import { DEFAULT_CONFIG } from "../config";
import type { Station } from "../../types";

const near = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

test("factor is exactly 1 at the reference height regardless of z0", () => {
  near(logProfileFactor(REFERENCE_HEIGHT_M, 0.1), 1);
  near(logProfileFactor(REFERENCE_HEIGHT_M, 0.03), 1);
});

test("RAWS 6.1 m over open shrubland (z0 = 0.1 m) matches the hand computation", () => {
  // u_10 = u_meas * ln(10/z0) / ln(z_meas/z0)
  const expected = Math.log(10 / 0.1) / Math.log(6.1 / 0.1); // ~1.12023
  near(logProfileFactor(6.1, 0.1), expected);
  near(normalizeSpeed(20, 6.1, 0.1), 20 * expected);
  // Normalizing a below-10 m anemometer scales the speed up.
  assert.ok(logProfileFactor(6.1, 0.1) > 1);
});

test("a tall tower above 10 m scales the speed down", () => {
  const expected = Math.log(10 / 0.1) / Math.log(30 / 0.1);
  near(logProfileFactor(30, 0.1), expected);
  assert.ok(logProfileFactor(30, 0.1) < 1);
});

test("rougher terrain (larger z0) pulls a 6.1 m reading further from 10 m", () => {
  const open = logProfileFactor(6.1, 0.03);
  const rough = logProfileFactor(6.1, 0.4);
  assert.ok(rough > open, "rougher site needs a larger up-correction");
});

test("degenerate inputs are guarded (no extrapolation below the roughness layer)", () => {
  near(logProfileFactor(0.05, 0.1), 1); // z_meas <= z0
  near(logProfileFactor(0, 0.1), 1);
  near(logProfileFactor(6.1, 0), 1);
});

test("measurementHeight prefers per-station height, then network default", () => {
  const base: Station = {
    id: "X", name: "X", lon: 0, lat: 0, speedKmh: 10, dirDeg: 0,
    gustKmh: null, tempC: null, observedAt: "", ageMin: 0, network: "RAWS",
  };
  // No explicit height: RAWS default 6.1 m.
  assert.equal(measurementHeight(base, "raws", DEFAULT_CONFIG), 6.1);
  // Explicit tower height wins (utility station with metadata).
  assert.equal(
    measurementHeight({ ...base, measHeightM: 24 }, "utility", DEFAULT_CONFIG),
    24,
  );
});

test("normalizeStation records the height and roughness used and scales gust too", () => {
  const s: Station = {
    id: "TPGC1", name: "Topanga", lon: -118.6, lat: 34.1, speedKmh: 18, dirDeg: 250,
    gustKmh: 30, tempC: 15, observedAt: "", ageMin: 10, network: "RAWS",
  };
  const out = normalizeStation(s, 0.1, DEFAULT_CONFIG);
  const f = Math.log(10 / 0.1) / Math.log(6.1 / 0.1);
  assert.equal(out.measHeightM, 6.1);
  assert.equal(out.roughnessZ0, 0.1);
  near(out.speed10Kmh!, 18 * f);
  near(out.gust10Kmh!, 30 * f);
  // Direction is untouched by height normalization.
  assert.equal(out.dirDeg, 250);
});
