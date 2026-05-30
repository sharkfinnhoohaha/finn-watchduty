// Observation enrichment orchestrator: the obs-space half of the pipeline.
//
// Runs the per-station stages in spec order: quality control (3), height
// normalization to 10 m (4), temporal harmonization (5), and air-mass tagging
// (6). The result is a set of observations that are comparable, height-matched,
// time-weighted, and tagged with their air mass, ready for the spatial analysis
// (7) and confidence (8) stages in analysis.ts.
//
// This stage is pure given its inputs (no network I/O), so it runs equally on
// the server route and in the end-to-end smoke test.
//
// Comments here avoid double dashes, using commas and colons.

import type { PipelineConfig } from "./config";
import type { ElevationGrid, RejectedStation, Station } from "../types";
import { runQC, type QCContext } from "./qc";
import { classifyNetwork, fallbackRoughness, type RoughnessProvider } from "./roughness";
import { normalizeStation } from "./heightNormalize";
import { harmonizeStation } from "./temporal";
import { tagStation } from "./airmass";
import { elevationSampler } from "./analysis";
import type { InversionModel } from "./inversion";

export type EnrichResult = {
  /** QC-passed, normalized, harmonized, air-mass-tagged observations. */
  stations: Station[];
  /** Stations dropped by QC, with reasons. */
  rejected: RejectedStation[];
  /** Stations admitted by QC but dropped by the temporal window. */
  outsideWindow: number;
};

export type EnrichOptions = {
  terrain?: ElevationGrid | null;
  inversion: InversionModel;
  roughness?: RoughnessProvider;
  qc?: QCContext;
};

/** Assign each station an elevation: keep a reported value, else sample terrain. */
function assignElevation(s: Station, terrain: ElevationGrid | null | undefined): Station {
  if (s.elevationM != null) return s;
  if (!terrain) return s;
  const sample = elevationSampler(terrain);
  return { ...s, elevationM: sample(s.lon, s.lat) };
}

export function enrichObservations(
  raw: Station[],
  cfg: PipelineConfig,
  opts: EnrichOptions,
): EnrichResult {
  const roughness = opts.roughness ?? fallbackRoughness(cfg);

  // Elevation first, so QC neighbours and later stages all see it.
  const located = raw.map((s) => assignElevation(s, opts.terrain));

  // 3. Quality control. Failing stations are dropped, not down-weighted.
  const { kept, rejected } = runQC(located, cfg, opts.qc);

  // 4. Height normalization to 10 m via the neutral log profile.
  const normalized = kept.map((s) => {
    const kind = classifyNetwork(s.network);
    const z0 = roughness(s.lon, s.lat, kind);
    return normalizeStation(s, z0, cfg);
  });

  // 5. Temporal harmonization and time-decay weighting (drops out-of-window).
  let outsideWindow = 0;
  const harmonized: Station[] = [];
  for (const s of normalized) {
    const h = harmonizeStation(s, cfg);
    if (h == null) {
      outsideWindow++;
      continue;
    }
    harmonized.push(h);
  }

  // 6. Air-mass tagging relative to the local inversion base.
  const tagged = harmonized.map((s) => tagStation(s, opts.inversion));

  return { stations: tagged, rejected, outsideWindow };
}
