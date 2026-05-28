// Wind vector math and unit helpers.
//
// Meteorological convention: wind direction is the compass bearing the wind
// blows FROM. The velocity vector therefore points toward (dir + 180°).

import type { Vec } from "./types";

const DEG = Math.PI / 180;
export const KMH_TO_MPH = 0.621371;

export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const kmhToMph = (k: number): number => k * KMH_TO_MPH;

/** (speed, direction-from) → velocity components (eastward u, northward v). */
export function toVec(speedKmh: number, dirFromDeg: number): Vec {
  const r = dirFromDeg * DEG;
  return { u: -speedKmh * Math.sin(r), v: -speedKmh * Math.cos(r) };
}

/** Velocity components → speed and meteorological direction-from (0..360°). */
export function toSpeedDir(u: number, v: number): { speed: number; dir: number } {
  const speed = Math.hypot(u, v);
  let dir = Math.atan2(-u, -v) / DEG;
  if (dir < 0) dir += 360;
  return { speed, dir };
}

export const speed = (v: Vec): number => Math.hypot(v.u, v.v);

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/** Nearest 16-point compass label for a direction-from bearing. */
export function compass(dirDeg: number): string {
  const i = Math.round((((dirDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}

/** Smallest absolute angular difference between two bearings (0..180°). */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}
