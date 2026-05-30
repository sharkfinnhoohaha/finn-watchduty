// Step 2: terrain downscaling.
//
// HRRR/RTMA at km scale do not resolve canyon channeling, gap acceleration, or
// nocturnal drainage flow, which is exactly where a fire-weather wind field
// matters most. The intended downscale is WindNinja, taking the km-scale
// background and a sub-100 m terrain model and producing a terrain-following
// fine field.
//
// WindNinja is a native solver and an out-of-process integration, so it is
// stubbed here behind a clean interface. The pipeline always runs the downscale
// step; today it is the identity (the background passes through unchanged), and
// swapping in WindNinja is a single factory change with no downstream edits.
//
// Comments here avoid double dashes, using commas and colons.

import type { Sampler } from "../interpolate";
import type { ElevationGrid } from "../types";
import type { PipelineConfig } from "./config";

/** A downscaler refines a coarse background sampler using a terrain model. */
export type Downscaler = (
  background: Sampler,
  terrain: ElevationGrid | null,
  cfg: PipelineConfig,
) => Sampler;

/** Identity downscaler: returns the background unchanged. */
export const identityDownscaler: Downscaler = (background) => background;

/**
 * WindNinja downscaler.
 *
 * STUB: WindNinja is not invoked in this pass. This returns the background
 * unchanged so the pipeline is complete and correct end to end. When wired,
 * this would run WindNinja over the terrain model and return a sampler over the
 * resulting sub-100 m field, with no change required at the call site.
 */
export const windNinjaDownscaler: Downscaler = (background, _terrain, _cfg) => {
  // TODO: invoke WindNinja with the terrain model and return a sampler over its
  // fine-resolution output.
  return background;
};

/** Select a downscaler. Defaults to identity until WindNinja is wired. */
export function selectDownscaler(useWindNinja = false): Downscaler {
  return useWindNinja ? windNinjaDownscaler : identityDownscaler;
}
