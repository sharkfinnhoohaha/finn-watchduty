// Step 4: height normalization.
//
// Stations measure wind at different anemometer heights (RAWS at 6.1 m, ASOS at
// 10 m, CWOP and utility towers vary), so their raw speeds are not comparable
// and must not be blended as-is. We normalize every observation to a common
// 10 m reference using the neutral logarithmic wind profile:
//
//     u_10 = u_meas * ln(10 / z0) / ln(z_meas / z0)
//
// where z0 is the aerodynamic roughness length at the site. The neutral
// assumption holds in the high-wind, well-mixed regime that matters most for
// fire spread; it degrades across stable inversions, which is handled
// separately by the air-mass tagging step (see airmass.ts). This module is
// pure math with no I/O so it is cheap to unit test.
//
// Comments here avoid double dashes, using commas and colons.

import type { PipelineConfig } from "./config";
import type { Station } from "../types";
import { classifyNetwork, type NetworkKind } from "./roughness";

/** Reference height all observations are normalized to, metres. */
export const REFERENCE_HEIGHT_M = 10;

/**
 * Neutral log-profile scaling factor from a measurement height to 10 m.
 *
 * Returns ln(10 / z0) / ln(z_meas / z0). Guards the degenerate cases where the
 * measurement height equals the roughness length (log of 1 is 0) or inputs are
 * non-physical, returning 1 (no change) so a bad height never amplifies a gust
 * into a hazardously wrong reading.
 */
export function logProfileFactor(measHeightM: number, z0M: number): number {
  if (!(measHeightM > 0) || !(z0M > 0)) return 1;
  if (measHeightM <= z0M) return 1; // below the roughness sublayer: do not extrapolate
  const denom = Math.log(measHeightM / z0M);
  if (Math.abs(denom) < 1e-9) return 1;
  return Math.log(REFERENCE_HEIGHT_M / z0M) / denom;
}

/** Normalize a single speed (any units) from z_meas to 10 m. */
export function normalizeSpeed(speed: number, measHeightM: number, z0M: number): number {
  return speed * logProfileFactor(measHeightM, z0M);
}

/**
 * Resolve the anemometer measurement height for a station. Prefers an explicit
 * per-station height (utility tower height, CWOP metadata) when present on the
 * record, then the per-network default, then the global default.
 */
export function measurementHeight(
  station: Station,
  kind: NetworkKind,
  cfg: PipelineConfig,
): number {
  if (station.measHeightM != null && station.measHeightM > 0) return station.measHeightM;
  switch (kind) {
    case "raws":
      return cfg.heights.raws;
    case "asos":
      return cfg.heights.asos;
    case "cwop":
      return cfg.heights.cwop;
    case "utility":
      return cfg.heights.utility;
    default:
      return cfg.heights.default;
  }
}

/**
 * Return a copy of the station with speed and gust normalized to 10 m, plus the
 * height and roughness used recorded for transparency. Direction is unchanged.
 */
export function normalizeStation(
  station: Station,
  z0M: number,
  cfg: PipelineConfig,
): Station {
  const kind = classifyNetwork(station.network);
  const measHeightM = measurementHeight(station, kind, cfg);
  const factor = logProfileFactor(measHeightM, z0M);
  return {
    ...station,
    measHeightM,
    roughnessZ0: z0M,
    speed10Kmh: station.speedKmh * factor,
    gust10Kmh: station.gustKmh == null ? null : station.gustKmh * factor,
  };
}
