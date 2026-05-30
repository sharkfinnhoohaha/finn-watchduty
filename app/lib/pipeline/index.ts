// Public surface of the wind analysis pipeline.
//
// Stage map (each stage is a separable module with a clear interface):
//   1. background.ts   model background field (RTMA/HRRR stubbed, Open-Meteo)
//   2. downscale.ts    terrain downscaling (WindNinja stubbed, identity)
//   3. qc.ts           observation quality control (MADIS, buddy, persistence)
//   4. heightNormalize.ts + roughness.ts   normalize obs to 10 m
//   5. temporal.ts     temporal harmonization and time-decay weighting
//   6. airmass.ts + inversion.ts   vertical / air-mass tagging and the rule
//   7. analysis.ts     optimal-interpolation correction (not a mean)
//   8. analysis.ts     co-registered confidence field
//   enrich.ts          obs-space orchestrator (stages 3 to 6)
//
// Comments here avoid double dashes, using commas and colons.

export * from "./config";
export * from "./background";
export * from "./downscale";
export * from "./roughness";
export * from "./heightNormalize";
export * from "./qc";
export * from "./temporal";
export * from "./inversion";
export * from "./airmass";
export * from "./terrain";
export * from "./analysis";
export * from "./enrich";
