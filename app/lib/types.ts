// Shared domain types for the wind-field proof of concept.

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
};

/** Which field the visualization is currently rendering. */
export type FieldMode = "model" | "corrected" | "difference";
