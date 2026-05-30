// Step 6: vertical / air-mass tagging and the air-mass rule.
//
// This is the highest-priority correctness fix. A surface blend that ignores
// vertical structure will average a coastal station sitting in marine-layer fog
// with a ridge-top station above the inversion, producing a field that is wrong
// in both places. We tag each observation, and each grid cell, with its
// position relative to the local inversion base, and enforce a hard rule: an
// observation below the inversion must not correct a cell above it, and vice
// versa.
//
// This module is pure logic with no I/O, so the rule is cheap to unit test.
//
// Comments here avoid double dashes, using commas and colons.

import type { Station } from "../types";
import type { InversionModel } from "./inversion";

/** Which side of the inversion a point sits on. */
export type AirMass = "below" | "above" | "unknown";

/**
 * Classify an elevation relative to an inversion base. A null elevation or a
 * null inversion base (well-mixed column, no cap) yields "unknown", which the
 * rule treats permissively: an unknown obs may correct any cell, since we have
 * no evidence of an air-mass boundary to respect.
 */
export function classifyAirMass(
  elevationM: number | null | undefined,
  inversionBaseM: number | null,
): AirMass {
  if (elevationM == null || inversionBaseM == null) return "unknown";
  return elevationM < inversionBaseM ? "below" : "above";
}

/**
 * The air-mass rule: may an observation in air mass `obs` correct a grid cell
 * in air mass `cell`?
 *
 * Allowed when they are in the same air mass, or when either side is unknown
 * (no evidence of a boundary). Forbidden only when one is strictly "below" and
 * the other strictly "above": the marine-layer-fog vs above-inversion case.
 */
export function canCorrect(obs: AirMass, cell: AirMass): boolean {
  if (obs === "unknown" || cell === "unknown") return true;
  return obs === cell;
}

/** Tag a station with its elevation-relative air mass using an inversion model. */
export function tagStation(station: Station, inversion: InversionModel): Station {
  const inversionBaseM = inversion(station.lon, station.lat);
  const airMass = classifyAirMass(station.elevationM, inversionBaseM);
  return { ...station, inversionBaseM, airMass };
}
