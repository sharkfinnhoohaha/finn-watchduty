// Step 3: observation quality control.
//
// Raw observations, especially CWOP/personal stations, contain gross errors,
// stuck sensors, and badly sited anemometers. We never blend raw values. This
// stage applies, in order:
//
//   1. MADIS QC flags: where a MADIS quality flag is available, respect it and
//      reject anything flagged bad (we prefer MADIS-QC'd obs over raw CWOP).
//   2. Gross-error / sanity check: non-finite, negative, or absurdly high
//      speeds, and stale readings, are rejected.
//   3. Persistence check: if a prior reading is available, reject implausible
//      jumps (a sensor that leaps from calm to gale between cycles).
//   4. Buddy check: compare each station against its neighbours and reject an
//      outlier that disagrees with the local consensus beyond tolerance.
//
// Failing stations are rejected outright, not silently down-weighted to zero,
// and every rejection is logged with a reason. This module is the only place
// allowed to drop a station for quality reasons.
//
// Comments here avoid double dashes, using commas and colons.

import type { PipelineConfig } from "./config";
import type { RejectedStation, Station } from "../types";

/** Optional external signals QC can consult, injected so QC stays testable. */
export type QCContext = {
  /** MADIS (or provider) QC verdict for a station id, when available. */
  madisFlag?: (station: Station) => "accepted" | "suspect" | "rejected" | null;
  /** Prior accepted 10 m-equivalent speed (km/h) for a station id, for the
   *  persistence check. Absent means no history is available. */
  priorSpeedKmh?: (station: Station) => number | null;
  /** Sink for rejection logs; defaults to console.warn. */
  log?: (message: string) => void;
};

export type QCResult = { kept: Station[]; rejected: RejectedStation[] };

const km = (a: Station, b: Station): number => {
  const kx = 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const ky = 110.57;
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky);
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Run the QC suite. Returns kept stations (with qc set) and rejections. */
export function runQC(
  stations: Station[],
  cfg: PipelineConfig,
  ctx: QCContext = {},
): QCResult {
  const log = ctx.log ?? ((m: string) => console.warn(`[wind-qc] ${m}`));
  const q = cfg.qc;

  const reject = (s: Station, reason: string, flags: string[]): RejectedStation => {
    log(`rejected ${s.id} (${s.name}): ${reason}`);
    return { id: s.id, name: s.name, lon: s.lon, lat: s.lat, reason, flags };
  };

  const kept: Station[] = [];
  const rejected: RejectedStation[] = [];

  // First pass: MADIS flags, gross error, staleness, persistence. Buddy check
  // runs afterward against only the survivors so a bad station cannot poison
  // its neighbours' consensus.
  const survivors: Station[] = [];
  for (const s of stations) {
    const flags: string[] = [];

    const madis = ctx.madisFlag?.(s);
    if (madis === "rejected") {
      rejected.push(reject(s, "MADIS QC flag: rejected", ["madis:rejected"]));
      continue;
    }
    if (madis === "suspect") flags.push("madis:suspect");
    if (madis === "accepted") flags.push("madis:accepted");

    if (q.rejectNonFinite && !Number.isFinite(s.speedKmh)) {
      rejected.push(reject(s, "non-finite speed", [...flags, "gross:nonfinite"]));
      continue;
    }
    if (s.speedKmh < 0) {
      rejected.push(reject(s, "negative speed", [...flags, "gross:negative"]));
      continue;
    }
    if (s.speedKmh > q.maxSpeedKmh) {
      rejected.push(
        reject(s, `speed ${s.speedKmh.toFixed(0)} km/h exceeds ceiling ${q.maxSpeedKmh}`, [
          ...flags,
          "gross:ceiling",
        ]),
      );
      continue;
    }
    if (s.ageMin > q.maxAgeMin) {
      rejected.push(reject(s, `stale: ${s.ageMin} min old`, [...flags, "sanity:stale"]));
      continue;
    }

    const prior = ctx.priorSpeedKmh?.(s);
    if (prior != null && Number.isFinite(prior)) {
      // A physically implausible jump between cycles: more than 80 km/h change
      // flags a likely sensor fault. Tolerance is intentionally loose; this
      // catches stuck-then-spiking sensors, not normal gust variability.
      if (Math.abs(s.speedKmh - prior) > 80) {
        rejected.push(
          reject(s, `persistence: jumped ${Math.abs(s.speedKmh - prior).toFixed(0)} km/h`, [
            ...flags,
            "persistence:jump",
          ]),
        );
        continue;
      }
    }

    survivors.push({ ...s, qc: { passed: true, flags } });
  }

  // Buddy check against surviving neighbours.
  for (const s of survivors) {
    const neighbours = survivors.filter((o) => o.id !== s.id && km(s, o) <= q.buddyRadiusKm);
    if (neighbours.length < q.buddyMinNeighbours) {
      // Not enough buddies to judge: keep, but record that it was unchecked.
      kept.push({ ...s, qc: { passed: true, flags: [...(s.qc?.flags ?? []), "buddy:skipped"] } });
      continue;
    }
    const speeds = neighbours.map((o) => o.speedKmh);
    const med = median(speeds);
    const spread = median(speeds.map((x) => Math.abs(x - med))) || 1; // MAD, floored
    const dev = Math.abs(s.speedKmh - med);
    if (dev > q.buddyTolKmh && dev > q.buddyTolFactor * spread) {
      rejected.push(
        reject(
          s,
          `buddy check: ${s.speedKmh.toFixed(0)} vs local median ${med.toFixed(0)} km/h`,
          [...(s.qc?.flags ?? []), "buddy:outlier"],
        ),
      );
      continue;
    }
    kept.push({ ...s, qc: { passed: true, flags: [...(s.qc?.flags ?? []), "buddy:ok"] } });
  }

  return { kept, rejected };
}
