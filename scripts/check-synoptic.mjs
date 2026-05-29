// Quick check that a Synoptic token works for this region before you wire it
// into Vercel. Mirrors the bbox query in app/api/wind/route.ts.
//
// Usage:  SYNOPTIC_TOKEN=your_token node scripts/check-synoptic.mjs
//
// It prints how many vanes Synoptic returns over the demo bbox and a breakdown
// by network, so you can confirm you're getting the full Watch Duty network
// (RAWS · CWOP/personal · mesonet · airport) rather than the keyless subset.

const BBOX = { west: -119.2, south: 33.88, east: -118.3, north: 34.34 };
const NETS = { "1": "Airport ASOS/AWOS", "2": "RAWS", "65": "CWOP/personal" };

const token = process.env.SYNOPTIC_TOKEN;
if (!token) {
  console.error(
    "SYNOPTIC_TOKEN is not set.\n" +
      "  Get a free token: https://synopticdata.com/open-access-program/\n" +
      "  Then run:         SYNOPTIC_TOKEN=… node scripts/check-synoptic.mjs",
  );
  process.exit(1);
}

const { west, south, east, north } = BBOX;
const url =
  `https://api.synopticdata.com/v2/stations/latest` +
  `?bbox=${west},${south},${east},${north}` +
  `&vars=wind_speed,wind_direction,wind_gust,air_temp` +
  `&status=active&units=metric,speed|kph,temp|C&within=120&token=${token}`;

let res, json;
try {
  res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  json = await res.json().catch(() => ({}));
} catch (e) {
  console.error(`Could not reach Synoptic: ${e?.message ?? e}`);
  console.error("  Check network/proxy access to api.synopticdata.com (or the 15s timeout).");
  process.exit(1);
}
const summary = json.SUMMARY ?? {};

if (!res.ok || summary.RESPONSE_CODE !== 1) {
  console.error(`Synoptic rejected the request (HTTP ${res.status}).`);
  console.error(`  message: ${summary.RESPONSE_MESSAGE ?? "unknown"}`);
  console.error("  Check the token and that your account covers stations/latest.");
  process.exit(1);
}

const stations = json.STATION ?? [];
const withWind = stations.filter((s) => s.OBSERVATIONS?.wind_speed_value_1?.value != null);
const byNet = {};
for (const s of withWind) {
  const label = NETS[String(s.MNET_ID)] ?? `MNET ${s.MNET_ID}`;
  byNet[label] = (byNet[label] ?? 0) + 1;
}

console.log(`✅ Synoptic OK — ${withWind.length} vanes with wind over the bbox`);
for (const [net, n] of Object.entries(byNet).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}  ${net}`);
}
console.log(
  "\nNote: the live app drops stale observations and spatially thins this set," +
    "\nso the map shows fewer vanes than the raw count above.",
);
console.log("Set SYNOPTIC_TOKEN in Vercel (Settings → Environment Variables) to use this network in production.");
