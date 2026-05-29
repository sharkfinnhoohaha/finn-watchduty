# Vane-corrected wind field — a Watch Duty proof of concept

Watch Duty animates a **smooth global wind model** over its maps — uniform
streamlines that don't know about terrain-channeled local flow. It *also* draws
real point observations from **weather vanes**. In complex terrain the two
frequently disagree, and during a fire the local truth is the one that matters.

This POC reconstructs a wind field **pinned to the real vanes** instead of
trusting the model alone — and shows, live, exactly where the model is wrong.

> Demo region: the **Santa Monica Mountains** (Calabasas / Topanga / Malibu
> Hills) — the area in the Watch Duty screenshot. Everything is retargetable
> from one config file.

## Where Watch Duty's vanes actually come from

Watch Duty's weather-station markers are **Synoptic Data** observations (the
aggregator formerly known as MesoWest). Synoptic fuses many networks —
**RAWS** (fire-weather stations on the ridges), **CWOP / personal** stations,
and **DOT / mesonets** — into one feed; that is why Watch Duty can show a vane
sitting on a Topanga ridge, not just at the nearest airport. (Synoptic
[publicly describes the partnership](https://synopticdata.com/blog/synoptic-supports-watch-dutys-wildfire-information-app/),
and Watch Duty's own
[help docs](https://support.watchduty.org/hc/en-us/articles/38227041151373-Can-I-add-my-home-weather-station-to-Watch-Duty)
walk through getting a home station in via CWOP → Synoptic.)

So this app reads vanes the same way Watch Duty does:

1. **Synoptic (preferred).** If `SYNOPTIC_TOKEN` is set, `/api/wind` issues one
   `stations/latest` query over the bbox across *all* networks — the same vanes
   Watch Duty would draw — then thins them to a sensible density for the demo.
   Get a free token from Synoptic's [Open Access program](https://synopticdata.com/open-access-program/).
2. **Keyless NWS fallback.** With no token it polls `api.weather.gov`, which
   re-serves many of the *same* RAWS (`…C1`) and mesonet stations Synoptic
   carries. The curated list in `app/data/region.ts` is the **mountain network** —
   ridge/canyon RAWS (Topanga `TPGC1`, Cheeseboro `CEEC1`, Malibu Hills `MBUC1`,
   Leo Carrillo `LCBC1`) plus the bracketing mesonets — and deliberately **drops
   the airport ASOS ring** (KLAX/KSMO/KVNY/…), which sits out in the flats and
   basin. The result reads like the zoomed-in Watch Duty view: the vanes you see
   are the ones on the terrain. (The Synoptic path ignores this list and returns
   the full bbox network, airports included — exactly what Watch Duty draws.)

## How the rest works

1. **Model background (the global-model stand-in)** — a coarse current-wind grid
   from Open-Meteo (`api.open-meteo.com`, no key). This stands in for Watch
   Duty's animated layer; the method is identical for any background field.
2. **Correction (Barnes objective analysis)** — interpolate each vane's *residual*
   against the model (obs − background) with a Gaussian radius of influence and
   add it back. The increment is `Σ(w·r) / (Σw + k)`: a proper weighted mean that
   relaxes to the model where vanes are sparse and **bends to honour the vanes**
   where they aren't.
3. **Visualization** — an animated particle flow over an Esri satellite basemap,
   coloured by speed. Toggle between **Model**, **Vane-corrected**, and
   **Disagreement** (`corrected − model`).

The panel quantifies the thesis: the biggest live **model ↔ vane gap**, plus a
per-station table of *model says X / vane says Y / off by Z*.

## Audit — five recommendations

The redesign here is the result of an audit. The flaws found and what was done:

1. **Use Watch Duty's real source (Synoptic), not just airport METARs.** The old
   build polled ten airport ASOS sites that *ring* the range — the flattest,
   most model-agreeable spots — so it sampled away from the ridges and
   *understated* its own thesis. **Fixed:** Synoptic adapter (token-gated) +
   keyless RAWS/mesonet vanes on the ridges.
2. **Stop dropping calm vanes.** A calm station reports speed 0 with a *null*
   direction; the old code threw those away, so real vanes vanished on light-wind
   days — exactly "the vanes aren't showing up." **Fixed:** calm vanes are kept
   (hollow dot, no arrow), units honour `unitCode`, and genuinely stale readings
   are flagged/dropped instead of shown as live.
3. **Fix the Barnes normalization.** Dividing by `max(Σw, 1)` meant the field
   never reached the observation even *at* a vane — contradicting "pinned to the
   vanes." **Fixed:** `Σ(w·r) / (Σw + k)` (proper weighted mean + density taper).
4. **Be honest about the model side, and disable meaningless modes.** "Windy" was
   asserted without a citation, and the background is actually Open-Meteo; also,
   with no model the "Disagreement" view is ~0 everywhere. **Fixed:** copy now
   says "global-model (Windy-class) stand-in," cites the source, and the
   Disagreement mode is disabled when the model is unavailable.
5. **Add QC + density, and weight by terrain (next).** The "biggest gap" headline
   has no quality control and the model grid was coarse (8×6). **Done:** denser
   12×8 grid, stale/calm handling, spatial thinning. **Recommended next:**
   per-vane QC, elevation-aware Barnes weighting (RAWS elevation from Synoptic),
   and precomputing the corrected field onto a grid so hundreds of vanes stay cheap.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- MapLibre GL — keyless Esri World Imagery satellite tiles
- Canvas particle engine, IDW + Barnes interpolation, wind colormap — hand-rolled
- Live data via `/api/wind`, which fans out to Synoptic **or** NWS + Open-Meteo,
  caches 5 min, and falls back to a bundled snapshot if every upstream is down

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

## Enabling the full Synoptic (Watch Duty) network

Without a token the app uses the keyless NWS mountain network above. To pull the
*full* Watch Duty network — including the CWOP/personal stations — add a Synoptic
token (free, [Open Access program](https://synopticdata.com/open-access-program/)):

```bash
cp .env.example .env.local           # then paste your token into .env.local
SYNOPTIC_TOKEN=… node scripts/check-synoptic.mjs   # verify it works for the bbox
npm run dev
```

For the deployed app, set `SYNOPTIC_TOKEN` in Vercel (**Settings → Environment
Variables**) and redeploy. The panel footer shows a `SYNOPTIC` / `NWS` badge so you
can confirm which source is live. `.env.local` is gitignored — the token never
lands in the repo.

Outbound access to `api.synopticdata.com` (if tokened), `api.weather.gov`,
`api.open-meteo.com`, and `server.arcgisonline.com` is required for live data and
tiles. If they're unreachable the map still renders from the committed snapshot.

## Retargeting

Edit `app/data/region.ts` — set the `bbox` and the station list, then optionally
regenerate the offline fallback:

```bash
node scripts/make-snapshot.mjs   # refreshes app/data/snapshot.json (keep station list in sync)
```

## Honest limitations

- The keyless NWS feed is a *subset* of Synoptic — it carries the RAWS and many
  mesonets but not most CWOP/personal stations. With `SYNOPTIC_TOKEN` set you get
  the full Watch Duty network; without it, the ridge coverage is good but thinner.
- Open-Meteo is a stand-in for Watch Duty's animated layer, not that layer itself
  (no public API). The reconciliation method is identical for any background.
- Single-pass Barnes with a horizontal Gaussian — no terrain/elevation weighting
  yet (see recommendation 5).
