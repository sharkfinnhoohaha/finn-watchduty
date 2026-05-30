// Step 4 (support): aerodynamic roughness length z0 per station.
//
// The log-profile normalization needs a roughness length at each site. The
// rigorous source is a land-cover dataset: NLCD (National Land Cover Database)
// or the WRF/HRRR roughness lookup tables, sampled at the station coordinate
// and mapped to z0. That raster lookup is an external integration; until it is
// wired we fall back to a documented per-network default that reflects typical
// siting (RAWS on open shrubland ridges, ASOS on mown airport grass, CWOP in
// rougher suburban settings). The interface below is the seam where the NLCD or
// WRF table lookup slots in without touching the rest of the pipeline.
//
// Comments here avoid double dashes, using commas and colons.

import type { PipelineConfig } from "./config";

/** Coarse network family used to pick heights and roughness defaults. */
export type NetworkKind = "raws" | "asos" | "cwop" | "utility" | "default";

/** Map a free-text network label onto a NetworkKind. */
export function classifyNetwork(network?: string): NetworkKind {
  const n = (network ?? "").toLowerCase();
  if (n.includes("raws")) return "raws";
  if (n.includes("asos") || n.includes("awos") || n.includes("airport")) return "asos";
  if (n.includes("cwop") || n.includes("personal")) return "cwop";
  if (n.includes("utility") || n.includes("tower")) return "utility";
  return "default";
}

/**
 * A roughness provider returns z0 (metres) for a coordinate. The default
 * implementation is network-keyed fallbacks; a future NLCD/WRF provider would
 * implement the same signature and read a land-cover raster instead.
 */
export type RoughnessProvider = (
  lon: number,
  lat: number,
  kind: NetworkKind,
) => number;

/** Documented per-network fallback provider, sourced from PipelineConfig. */
export function fallbackRoughness(cfg: PipelineConfig): RoughnessProvider {
  const r = cfg.roughnessFallbackM;
  return (_lon, _lat, kind) => {
    switch (kind) {
      case "raws":
        return r.raws;
      case "asos":
        return r.asos;
      case "cwop":
        return r.cwop;
      case "utility":
        return r.utility;
      default:
        return r.default;
    }
  };
}

/**
 * Land-cover roughness provider (NLCD or WRF/HRRR tables).
 *
 * STUB: the raster lookup is not wired in this pass. This returns null to signal
 * "no land-cover value available", so callers fall back to fallbackRoughness.
 * Wiring NLCD here is a clean drop-in: sample the land-cover class at (lon,lat),
 * map the class to z0 via the standard table, and return it.
 */
export function landCoverRoughness(): (lon: number, lat: number) => number | null {
  // TODO: integrate NLCD or the WRF/HRRR roughness table raster lookup.
  return () => null;
}
