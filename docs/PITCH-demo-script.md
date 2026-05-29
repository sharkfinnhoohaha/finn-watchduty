# Demo Script — Vane-Corrected Wind for Watch Duty

A ~12–15 minute walkthrough built around the live POC. Goal: get the team to see the model↔vane
**gap** in their own product, then see a low-risk, stack-native way to surface it.

**Links to have open**
- POC app → `https://finn-watchduty.vercel.app`
- Explainer → `https://finn-watchduty.vercel.app/explainer.html`
- Watch Duty app → `https://app.watchduty.org` (same region, ideally during/after a wind event)
- Technical brief → `docs/PITCH-technical-brief.md`

**Prep**
- Both apps centered on the **Santa Monica Mountains** (Calabasas · Topanga · Malibu Hills).
- POC: confirm the footer badge reads **SYNOPTIC** (token wired) so the full ~60-vane network shows;
  if it reads **NWS**, say "this is the keyless subset; with the Synoptic token it's the full network."
- Have the original Watch Duty screenshot (the circled Topanga vane) on the first slide.

---

## Beat 0 — The hook (30s)
> "Watch Duty shows two wind pictures on the same map: a smooth animated model, and real weather
> vanes. On a ridge, they often disagree — and right now the animation is presented as if it were
> ground truth. When a fire is moving, that gap matters. I built a working version that shows it."

Show the annotated screenshot: the model streaks vs. the circled Topanga vane.

## Beat 1 — Prove it in *their* app (2 min)
In Watch Duty, turn on the wind layer + weather stations near Topanga. Point out a vane whose arrow
disagrees with the streamlines around it.
> "This isn't hypothetical — it's in the app today. The smooth layer can't see the ridge."

## Beat 2 — POC: "Model" (1 min)
Switch to the POC, **Model** mode.
> "Same area. This is the smooth global model — one direction everywhere. Looks authoritative,
> can't see terrain."

## Beat 3 — POC: "Vane-corrected" (2 min)
Switch to **Vane-corrected**. Point at the on-ridge RAWS + CWOP arrows.
> "Now the field is pinned to the real Synoptic vanes — the same network you already use — and
> relaxes back to the model where there are no stations. Watch it bend around the ridge vanes."

Nudge the **vane influence radius** slider.
> "One tunable: how far each vane's correction reaches before it trusts the model again."

## Beat 4 — POC: "Disagreement" — the payoff (2–3 min)
Switch to **Disagreement**.
> "This is the one I'd ship first. Particles flow with the *real* wind, so direction stays honest —
> and the map **glows where the model disagrees with your own vanes**. It never claims a made-up
> field is truth; it just flags where the pretty animation is wrong."

Call out a hot/glowing patch over a ridge or canyon.

## Beat 5 — The panel (1 min)
Point to the **typical (median) model↔vane gap** headline and the per-station table.
> "We headline the *median* gap, not the single worst station, so one noisy backyard sensor can't
> hijack the story. The table is your vanes vs. the model, station by station."

Point to the **SYNOPTIC** badge.
> "Live, from Synoptic's `stations/latest` over this bbox — RAWS, CWOP, mesonet. The exact network
> you draw."

## Beat 6 — The explainer (1 min)
Open `/explainer.html`. Scroll the three animated panels and the before/after.
> "A shareable one-pager — concept, the problem, and the fix — for anyone on your team who isn't in
> the room."

## Beat 7 — How it fits your stack (2 min)
Open the technical brief's mapping table.
> "Here's why this is small: my map is **MapLibre GL JS** — an API-compatible fork of your
> **Mapbox GL JS**. The overlay is a **canvas/custom layer** that runs in your **Capacitor** webview
> on all three platforms. The math is **pure TypeScript**, no dependencies. The data is **Synoptic**,
> which you already pay for. No new language, renderer, or vendor — a TS module plus one Mapbox layer."

## Beat 8 — The ask (1 min)
> "I'd love to open a **feature-flagged PR** for Phase 1 — the disagreement overlay only. It doesn't
> touch your model layer, uses data you already have, and is reversible behind a flag. Can I get
> 30 minutes with whoever owns the map?"

---

## Q&A — likely objections and answers
- **"We can't present a derived field as fact."** → "Agreed — Phase 1 is *only* the disagreement/
  confidence overlay. It flags uncertainty against your own vanes; it never replaces the model."
- **"Personal stations are noisy."** → "Median gap, calm/stale handling, and spatial thinning are
  already in. We can also source the headline from RAWS/mesonet only."
- **"Mobile performance?"** → "2-D canvas at ~60 vanes is cheap in the webview. If you want density,
  there's a GPU/Mapbox-custom-layer path."
- **"Who maintains it?"** → "One TS module + your existing Synoptic + Mapbox. I'll contribute it and
  document it — Python/TS, the stack you onboard volunteers on."
- **"Does it work offline / when feeds drop?"** → "Yes — it degrades to a bundled snapshot so the map
  never goes blank."

## If the network is down during the demo
- The POC falls back to a **bundled snapshot** (badge shows `SNAPSHOT`) — still fully interactive.
- The **explainer** is fully self-contained (animations are local) and needs no network.
