import type { Bbox } from "@/app/lib/types";

// The area in the Watch Duty screenshots: the Santa Monica Mountains, viewed
// wide enough to show the network of real weather vanes that Watch Duty draws
// across the range — not just the airports ringing it, but the ridge-top and
// canyon RAWS where terrain channels the wind and the global model is most wrong.
//
// DATA SOURCE NOTE
// ----------------
// Watch Duty's weather-vane markers come from **Synoptic Data** (the same
// aggregator behind MesoWest): RAWS, CWOP/personal stations, and DOT/mesonets —
// thousands of stations. The faithful way to reproduce them is the Synoptic
// `stations/latest` API over this bbox (see app/api/wind/route.ts; set
// SYNOPTIC_TOKEN). When no token is configured we approximate that network with
// the *keyless* NWS api.weather.gov feed, which re-serves many of the same RAWS
// and mesonet stations (the `…C1` RAWS, the 2-letter Caltrans/mesonet sites)
// alongside the airport ASOS/AWOS. Either way the goal is the same: vanes ON the
// ridges, where the model-vs-vane disagreement actually lives.
//
// Everything here is tunable — retarget the demo to any region by editing the
// bbox and the station list.

const bbox: Bbox = { west: -119.2, south: 33.88, east: -118.3, north: 34.34 };

export const REGION = {
  name: "Santa Monica Mountains",
  subtitle: "Calabasas · Topanga · Malibu Hills, CA",
  center: [-118.7, 34.1] as [number, number],
  zoom: 9.6,
  bbox,
  // Vanes to poll from the keyless NWS feed when no Synoptic token is set.
  // Coordinates are read live from the API — this list only selects which vanes.
  //
  // We deliberately keep this to the *mountain* network — ridge/canyon RAWS and
  // the nearby mesonets — and drop the airport ASOS ring (KLAX/KSMO/KVNY/…). The
  // airports sit out in the flats and basin; excluding them makes the keyless map
  // read like the zoomed-in Watch Duty view, where the vanes you see are the ones
  // actually on the terrain. (The Synoptic path ignores this list and returns the
  // full Watch Duty network for the bbox, airports included — see route.ts.)
  stationIds: [
    // Ridge-top & canyon RAWS — the interior vanes Watch Duty shows. TPGC1 is
    // the Topanga RAWS circled in the Watch Duty screenshot.
    "TPGC1", // Topanga (ridge above Topanga/Calabasas)
    "CEEC1", // Cheeseboro (hilltop, Agoura Hills)
    "MBUC1", // Malibu Hills (interior crest)
    "LCBC1", // Leo Carrillo (western coastal tip)
    // DOT / mesonet sites bracketing the range.
    "SV", // Simi Valley — Cochran
    "TO", // Thousand Oaks — Moorpark Rd
    "ER", // El Rio — Rio Mesa
  ],
  // Coarse model background grid (Open-Meteo points = lon × lat). Denser than the
  // original 8×6 so the model field — and the per-vane model sample used for the
  // disagreement readout — resolves the terrain a little better.
  modelGrid: { lon: 12, lat: 8 },
  // Default Barnes radius of influence (km).
  defaultRadiusKm: 20,
};
