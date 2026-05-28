# Vane-corrected wind field — a Watch Duty proof of concept

Watch Duty overlays a **global wind model** (Windy) on its maps — smooth,
uniform streamlines that don't know about terrain-channeled local flow. The app
*also* surfaces real point observations from nearby **weather vanes**. In complex
terrain the two frequently disagree, and during a fire the local truth is the one
that matters.

This POC reconstructs a wind field that is **pinned to the real vanes** instead of
trusting the model alone — and shows, live, exactly where the model is wrong.

> Demo region: the **Santa Monica Mountains** (Calabasas / Topanga / Malibu
> Hills) — the area in the Watch Duty screenshots. Everything is retargetable
> from one config file.

## How it works

1. **Vanes (ground truth)** — latest observations from the NWS stations ringing
   the range (`api.weather.gov`, no API key). Each vane's speed/direction/temp is
   drawn on the map.
2. **Model background (the "Windy" stand-in)** — a coarse current-wind grid from
   Open-Meteo (`api.open-meteo.com`, no API key).
3. **Correction (Barnes objective analysis)** — interpolate each vane's *residual*
   against the model (obs − background) with a Gaussian, tunable radius of
   influence, and add it back onto the model. The field bends to the vanes where
   there's ground truth and relaxes to the model where there isn't.
4. **Visualization** — an animated particle flow (the Windy-style look) over an
   Esri satellite basemap, coloured by speed. Toggle between:
   - **Model** — the raw model field.
   - **Vane-corrected** — model nudged toward the live vanes.
   - **Disagreement** — `corrected − model`, so the gap glows where it's largest.

The panel quantifies the thesis: the biggest live **model ↔ vane gap**, plus a
per-station table of *Windy says X / vane says Y / off by Z*.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- MapLibre GL — keyless Esri World Imagery satellite tiles
- Canvas particle engine, IDW + Barnes interpolation, wind colormap — all hand-rolled, no extra deps
- Live data via a server route (`/api/wind`) that fans out to NWS + Open-Meteo,
  caches for 5 min, and falls back to a bundled snapshot if every upstream is down

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

Outbound access to `api.weather.gov`, `api.open-meteo.com`, and
`server.arcgisonline.com` is required for live data and tiles. If they're
unreachable the map still renders from the committed snapshot.

## Retargeting

Edit `app/data/region.ts` — set the `bbox` and the list of NWS `stationIds` for a
new area, then optionally regenerate the offline fallback:

```bash
node scripts/make-snapshot.mjs   # refreshes app/data/snapshot.json (keep station list in sync)
```

## Honest limitations

- NWS stations are mostly airport ASOS/AWOS — they *ring* the mountains rather
  than sit on the ridges, so the interior is the model's guess corrected at a
  distance. That sparsity is part of the story; RAWS (via Synoptic, token-gated)
  would densify it and is an easy drop-in upgrade.
- Open-Meteo is a stand-in for Windy, not Windy itself (no public API). The method
  is identical for any background field.
- Single-pass Barnes with a horizontal Gaussian — no terrain/elevation weighting
  yet. A clear next step.
