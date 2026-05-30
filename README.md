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
2. **Correction (objective analysis)** — interpolate each vane's *residual*
   against the background (obs − background) and add it back, so the field bends
   to honour the vanes where they exist and relaxes to the background where they
   are sparse. This is now the multi stage analysis pipeline below (QC, height
   normalization, temporal harmonization, air mass tagging, terrain aware optimal
   interpolation, confidence), not a single pass Barnes blend. See
   **Wind analysis pipeline** below.
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

## Wind analysis pipeline (rearchitected)

A fire weather review found that averaging raw observations across networks is
meteorologically invalid: stations measure at different anemometer heights,
report over different averaging periods, and a flat 2D blend ignores vertical
air mass structure (a station in marine layer fog should not be averaged with
one above the inversion). The field is now built as a terrain following model
background that observations *correct*, not a mean of stations. The stages live
in `app/lib/pipeline/`, each a separable module with a clear interface:

1. **Background field** (`background.ts`): the field the analysis corrects
   toward. Source is configurable: `rtma` (preferred, NOAA hourly ~2.5 km
   surface analysis), `hrrr` (3 km model), or `openmeteo` (the keyless working
   default). RTMA and HRRR are stubbed in this pass and fall back to Open-Meteo.
2. **Terrain downscaling** (`downscale.ts`): a WindNinja seam to resolve canyon
   channeling and gap flow at sub 100 m. Stubbed as identity in this pass; the
   pipeline always runs the step so WindNinja drops in without call site edits.
3. **Observation QC** (`qc.ts`): respects MADIS QC flags, runs a buddy check
   against neighbours and a persistence/sanity check, and *rejects* failing
   stations (logged, surfaced in the payload) rather than silently zero
   weighting them. Raw CWOP is never blended unchecked.
4. **Height normalization** (`heightNormalize.ts`, `roughness.ts`): every obs is
   normalized to 10 m via the neutral log wind profile
   `u_10 = u_meas * ln(10 / z0) / ln(z_meas / z0)`, with per network heights
   (RAWS 6.1 m, ASOS 10 m, CWOP and utility from metadata) and a roughness `z0`
   from land cover (NLCD/WRF table seam, network keyed fallback for now).
5. **Temporal harmonization** (`temporal.ts`): one analysis time, a configurable
   window with exponential time decay, averaging period harmonized to a single
   target (sustained or gust) via a Durst gust factor curve, and RAWS hourly
   treated as a low frequency anchor rather than a high frequency input.
6. **Air mass tagging** (`airmass.ts`, `inversion.ts`): each obs and each grid
   cell is tagged below or above the local inversion base (an HRRR profile seam,
   a configured marine layer height for now). The rule is hard: a below
   inversion obs may not correct an above inversion cell, or vice versa.
7. **Correction, not mean** (`analysis.ts`): the obs minus background residual is
   interpolated back onto the grid with optimal interpolation style weighting and
   terrain aware decorrelation (shorter vertically and across a ridgeline crest),
   then added to the background. Raw station values are never arithmetic averaged.
8. **Confidence field** (`analysis.ts`): a co registered 0..1 layer, low where
   obs are sparse, near the inversion, or across an air mass boundary, high where
   obs are dense and the boundary layer is well mixed. The renderer exposes it as
   a **Confidence** view.

Everything is configurable in `app/lib/pipeline/config.ts` (background source,
analysis window, averaging target, decorrelation lengths, heights, roughness,
QC thresholds), with high value knobs also read from environment variables. The
consumer contract is unchanged: `/api/wind` still serves a `WindPayload` and the
renderer still consumes samplers; the payload only gains additive fields
(`terrain`, `inversionBaseM`, `rejected`, `backgroundSource`, `averagingTarget`).

Tests live in `app/lib/pipeline/__tests__/` and run with `npm test` (Node type
stripping, no extra dependencies): height normalization against hand computed
values, the air mass rule including the marine layer regression (a foggy coastal
obs must not drag a cell above the inversion), and an end to end smoke test that
produces a field plus a confidence layer.

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
npm test             # pipeline unit + smoke tests (Node type stripping, no deps)
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
