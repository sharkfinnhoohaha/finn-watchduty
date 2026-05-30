// Shared domain types for the wind-field proof of concept.

import type { BackgroundSource, AveragingTarget } from "./pipeline/config";

/** A 2-D wind vector in geographic components (km/h). u = eastward, v = northward. */
export type Vec = { u: number; v: number };

export type Bbox = { west: number; south: number; east: number; north: number };

/** A single ground-truth observation — a Watch Duty "weather vane". */
export type Station = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Sustained wind speed, km/h. */
  speedKmh: number;
  /**
   * Meteorological direction the wind blows FROM, degrees (0 = N, 90 = E).
   * Null when the observation is calm/variable (no resolvable direction).
   */
  dirDeg: number | null;
  /** Gust, km/h, if reported. */
  gustKmh: number | null;
  /** Air temperature, °C, if reported. */
  tempC: number | null;
  /** ISO timestamp of the observation. */
  observedAt: string;
  /** Minutes since the observation was taken. */
  ageMin: number;
  /** Network/kind label for the vane (e.g. "RAWS", "Airport ASOS", "Mesonet"). */
  network?: string;

  // ---- pipeline enrichment (all optional, additive) --------------------
  // Populated by the analysis pipeline (app/lib/pipeline). Older payloads and
  // the bundled snapshot omit these; consumers must treat them as optional.

  /** Station elevation, metres above sea level, when known. */
  elevationM?: number | null;
  /** Anemometer measurement height used for normalization, metres AGL. */
  measHeightM?: number;
  /** Aerodynamic roughness length z0 at the site, metres. */
  roughnessZ0?: number;
  /** Wind speed normalized to 10 m via the neutral log profile, km/h. */
  speed10Kmh?: number;
  /** Gust normalized to 10 m, km/h, when a gust is reported. */
  gust10Kmh?: number | null;
  /** Position relative to the local inversion base: which air mass the obs is in. */
  airMass?: "below" | "above" | "unknown";
  /** Inversion base elevation used when tagging this obs, metres. */
  inversionBaseM?: number | null;
  /** Combined analysis weight (time decay times anchor factor), 0..1+. */
  analysisWeight?: number;
  /** True when this obs is a low-frequency anchor (e.g. RAWS hourly) rather
   *  than a high-frequency input. */
  isAnchor?: boolean;
  /** Quality-control outcome. Stations that fail QC are not shipped in
   *  `stations`; this records the verdict for those that pass. */
  qc?: { passed: boolean; flags: string[]; reason?: string };
};

/** A station rejected by quality control, with the reason, for logging/UI. */
export type RejectedStation = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  reason: string;
  flags: string[];
};

/**
 * Co-registered confidence/uncertainty field, on the same grid layout as
 * ModelGrid. Values are 0..1: high where obs are dense and the boundary layer
 * is well mixed, low where obs are sparse, near the inversion, or across an
 * air-mass boundary.
 */
export type ConfidenceGrid = {
  lons: number[];
  lats: number[];
  /** Confidence in [0,1], row-major: index = latIndex * lons.length + lonIndex. */
  c: number[];
};

/** Terrain elevation sampled on a grid, metres above sea level. Row-major. */
export type ElevationGrid = {
  lons: number[];
  lats: number[];
  z: number[];
};

/**
 * Coarse background field sampled from a weather model (the "Windy" stand-in).
 * Stored as separate u/v arrays in row-major order: index = latIndex * lons.length + lonIndex.
 */
export type ModelGrid = {
  lons: number[]; // ascending longitudes
  lats: number[]; // ascending latitudes
  u: number[]; // km/h
  v: number[]; // km/h
};

export type WindPayload = {
  generatedAt: string;
  bbox: Bbox;
  center: [number, number]; // [lon, lat]
  zoom: number;
  stations: Station[];
  model: ModelGrid | null;
  sources: {
    observations: string;
    model: string;
    /** Which observation provider produced the vanes (undefined ⇒ snapshot/NWS). */
    obsKind?: "synoptic" | "nws";
  };
  warnings: string[];
  /** True when served from the bundled snapshot because every upstream failed. */
  fallback: boolean;

  // ---- pipeline outputs (all optional, additive) -----------------------

  /** Terrain elevation grid, for the air-mass rule and ridge-aware weighting. */
  terrain?: ElevationGrid | null;
  /** Inversion base elevation for this analysis, metres, when derived. */
  inversionBaseM?: number | null;
  /** Stations rejected by QC, for logging and an honest UI count. */
  rejected?: RejectedStation[];
  /** Background source actually used (rtma | hrrr | openmeteo). */
  backgroundSource?: BackgroundSource;
  /** Whether the rendered layer is sustained wind or gust. */
  averagingTarget?: AveragingTarget;
};

/** Which field the visualization is currently rendering. */
export type FieldMode = "model" | "corrected" | "difference" | "confidence";
