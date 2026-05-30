// Central, tunable configuration for the wind analysis pipeline.
//
// Everything a meteorologist might want to retune lives here: the background
// source, the analysis window, the averaging-period target, the decorrelation
// lengths, per-network anemometer heights, roughness fallbacks, and the QC
// thresholds. Nothing downstream hardcodes these values; each stage receives a
// PipelineConfig (or a slice of it) so the whole pipeline is reconfigurable
// from one object and, where useful, from environment variables.
//
// Style note: comments here avoid double dashes, using commas and colons.

/** Which background field the analysis corrects toward. */
export type BackgroundSource = "rtma" | "hrrr" | "openmeteo";

/** Whether the rendered layer represents sustained wind or peak gust. */
export type AveragingTarget = "sustained" | "gust";

/** Per-network anemometer measurement heights, metres above ground. */
export type NetworkHeights = {
  raws: number;
  asos: number;
  cwop: number;
  utility: number;
  /** Used when a station's network cannot be classified. */
  default: number;
};

/** Per-network native averaging periods, seconds, for harmonization. */
export type NetworkAveraging = {
  /** ASOS sustained wind: 2-minute average. */
  asosSustainedSec: number;
  /** ASOS gust: 5-second peak. */
  asosGustSec: number;
  /** RAWS: 10-minute average, reported hourly. */
  rawsSec: number;
  /** Utility tower telemetry, commonly near 5-minute. */
  utilitySec: number;
  /** CWOP varies widely; documented assumption. */
  cwopSec: number;
  /** Target averaging period the analysis harmonizes to, seconds. */
  targetSec: number;
};

export type QCConfig = {
  /** Reject if 10 m speed exceeds this hard ceiling, km/h (gross error). */
  maxSpeedKmh: number;
  /** Reject negative or non-finite speeds (always on; here for documentation). */
  rejectNonFinite: boolean;
  /** Buddy check: neighbour search radius, km. */
  buddyRadiusKm: number;
  /** Buddy check: minimum neighbours required to evaluate (else skip, not reject). */
  buddyMinNeighbours: number;
  /** Buddy check: reject if station deviates from the buddy median by more than
   *  this many km/h AND by more than buddyTolFactor times the buddy spread. */
  buddyTolKmh: number;
  buddyTolFactor: number;
  /** Persistence/sanity: reject if the reading is older than this, minutes. */
  maxAgeMin: number;
};

export type AnalysisConfig = {
  /** Horizontal decorrelation length, km (e-folding of the OI weight). */
  decorrelationKm: number;
  /** Vertical decorrelation length, m: shortens influence across elevation. */
  decorrelationVerticalM: number;
  /** Extra decorrelation tightening factor applied across a ridgeline crest. */
  ridgePenalty: number;
  /** Background error term in the OI denominator (relaxes to background where
   *  obs are sparse). Larger means the field trusts the background more. */
  backgroundError: number;
  /** Confidence saturation constant: effective obs weight at which confidence
   *  reaches roughly half. */
  confidenceHalfWeight: number;
  /** Mixed-layer depth scale, m: confidence decays within this distance of the
   *  inversion base (the boundary is where the blend is least trustworthy). */
  inversionUncertaintyM: number;
};

export type TemporalConfig = {
  /** Half-window around the analysis time within which obs are admitted, min. */
  windowMin: number;
  /** Time-decay e-folding, minutes: older obs are weighted lower. */
  decayMin: number;
  /** RAWS hourly obs are treated as a low-frequency anchor, not a high-frequency
   *  input; their analysis weight is multiplied by this (0..1). */
  anchorWeight: number;
};

export type PipelineConfig = {
  background: BackgroundSource;
  averaging: AveragingTarget;
  heights: NetworkHeights;
  periods: NetworkAveraging;
  qc: QCConfig;
  analysis: AnalysisConfig;
  temporal: TemporalConfig;
  /** Roughness length z0 fallback per network, metres, when land cover lookup
   *  is unavailable. Derived from WRF/HRRR roughness tables for typical siting. */
  roughnessFallbackM: {
    raws: number;
    asos: number;
    cwop: number;
    utility: number;
    default: number;
  };
  /** Inversion base elevation used by the air-mass tagger, metres. Stands in
   *  for an HRRR-derived value until the vertical profile is wired (see
   *  inversion.ts). Typical Southern California marine-layer top. */
  inversionBaseM: number;
};

const num = (env: string | undefined, fallback: number): number => {
  if (env == null) return fallback;
  const n = Number(env);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Default configuration. Reads a few high-value knobs from the environment so a
 * deployment can retune without a rebuild; everything else uses documented,
 * fire-weather-oriented defaults.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const background = (env.WIND_BACKGROUND_SOURCE as BackgroundSource) || "openmeteo";
  const averaging = (env.WIND_AVERAGING_TARGET as AveragingTarget) || "sustained";
  return {
    background,
    averaging,
    heights: {
      raws: num(env.WIND_HEIGHT_RAWS_M, 6.1), // 20 ft, NWS RAWS standard
      asos: num(env.WIND_HEIGHT_ASOS_M, 10), // 33 ft, ASOS/AWOS standard
      cwop: num(env.WIND_HEIGHT_CWOP_M, 10), // documented fallback when metadata missing
      utility: num(env.WIND_HEIGHT_UTILITY_M, 10), // per-station tower height overrides this
      default: num(env.WIND_HEIGHT_DEFAULT_M, 10),
    },
    periods: {
      asosSustainedSec: 120,
      asosGustSec: 5,
      rawsSec: 600,
      utilitySec: 300,
      cwopSec: 300,
      targetSec: num(env.WIND_TARGET_AVG_SEC, averaging === "gust" ? 5 : 120),
    },
    qc: {
      maxSpeedKmh: num(env.WIND_QC_MAX_KMH, 240),
      rejectNonFinite: true,
      buddyRadiusKm: num(env.WIND_QC_BUDDY_KM, 25),
      buddyMinNeighbours: 3,
      buddyTolKmh: num(env.WIND_QC_BUDDY_TOL_KMH, 25),
      buddyTolFactor: num(env.WIND_QC_BUDDY_FACTOR, 3),
      maxAgeMin: num(env.WIND_MAX_AGE_MIN, 240),
    },
    analysis: {
      decorrelationKm: num(env.WIND_DECORR_KM, 18),
      decorrelationVerticalM: num(env.WIND_DECORR_VERT_M, 400),
      ridgePenalty: num(env.WIND_RIDGE_PENALTY, 2),
      backgroundError: num(env.WIND_BG_ERROR, 0.5),
      confidenceHalfWeight: num(env.WIND_CONF_HALF, 1),
      inversionUncertaintyM: num(env.WIND_INVERSION_UNCERTAINTY_M, 150),
    },
    temporal: {
      // Wide enough to admit hourly RAWS plus ingest latency; time decay (below)
      // still down-weights the older obs within the window.
      windowMin: num(env.WIND_WINDOW_MIN, 120),
      decayMin: num(env.WIND_DECAY_MIN, 45),
      anchorWeight: num(env.WIND_ANCHOR_WEIGHT, 0.6),
    },
    roughnessFallbackM: {
      raws: num(env.WIND_Z0_RAWS_M, 0.1), // open shrubland/grass ridge siting
      asos: num(env.WIND_Z0_ASOS_M, 0.03), // airport short grass
      cwop: num(env.WIND_Z0_CWOP_M, 0.4), // suburban, roughest assumption
      utility: num(env.WIND_Z0_UTILITY_M, 0.1),
      default: num(env.WIND_Z0_DEFAULT_M, 0.1),
    },
    inversionBaseM: num(env.WIND_INVERSION_BASE_M, 500),
  };
}

/** Eagerly-evaluated default for call sites that do not thread a config. */
export const DEFAULT_CONFIG: PipelineConfig = loadConfig({});
