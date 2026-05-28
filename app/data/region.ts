import type { Bbox } from "@/app/lib/types";

// The area in the Watch Duty screenshots: the Santa Monica Mountains, viewed
// wide enough to show the ring of real weather vanes (NWS stations) that
// surround the range — Santa Monica, Van Nuys, Burbank, Malibu/Pt Mugu,
// Camarillo, LAX. The model "knows" the ridges only as smooth terrain; the
// vanes are the ground truth this POC corrects toward.
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
  // NWS observation stations ringing the range. Coordinates are read live from
  // the API — this list only selects which vanes to poll.
  stationIds: [
    "KSMO", // Santa Monica
    "KVNY", // Van Nuys
    "KBUR", // Burbank
    "KWHP", // Whiteman (Pacoima)
    "KLAX", // Los Angeles Intl
    "KHHR", // Hawthorne
    "KCMA", // Camarillo
    "KNTD", // Point Mugu NAS (western tip of the range)
    "KOXR", // Oxnard
    "KSZP", // Santa Paula
  ],
  // Coarse model background grid (Open-Meteo points = lon × lat).
  modelGrid: { lon: 8, lat: 6 },
  // Default Barnes radius of influence (km).
  defaultRadiusKm: 20,
};
