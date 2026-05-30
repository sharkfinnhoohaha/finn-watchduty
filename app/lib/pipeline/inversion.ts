// Step 6 (support): inversion base height.
//
// The air-mass rule needs to know the elevation of the temperature inversion
// that caps the boundary layer (the marine-layer top, on the California coast).
// The rigorous source is the HRRR vertical temperature profile sampled at the
// observation location: walk the profile upward and find the base of the lowest
// layer where temperature increases with height. That GRIB profile fetch is an
// external integration; until it is wired we use a configured constant that
// stands in for a typical marine-layer top. The InversionModel interface is the
// seam where the HRRR profile lookup slots in.
//
// Comments here avoid double dashes, using commas and colons.

import type { PipelineConfig } from "./config";

/** An inversion model returns the inversion base elevation (m ASL) at a point,
 *  or null when no capping inversion is present (well-mixed column). */
export type InversionModel = (lon: number, lat: number) => number | null;

/** Constant inversion base from config. Stands in for an HRRR-derived value. */
export function fixedInversion(cfg: PipelineConfig): InversionModel {
  return () => cfg.inversionBaseM;
}

/**
 * HRRR-profile inversion model.
 *
 * STUB: deriving the inversion base from the HRRR vertical temperature profile
 * is not wired in this pass. When integrated, this would fetch the column at
 * (lon,lat), find the lowest height where dT/dz > 0, and return that elevation
 * (or null if the column is well mixed). For now it defers to the configured
 * constant so the air-mass rule is fully functional and testable.
 */
export function hrrrInversion(cfg: PipelineConfig): InversionModel {
  // TODO: sample the HRRR vertical temperature profile and locate the inversion
  // base per column instead of returning a domain-wide constant.
  const fixed = fixedInversion(cfg);
  return (lon, lat) => fixed(lon, lat);
}
