# For Watch Duty

A job application for Watch Duty by Finn Bennett — formatted as a Watch Duty
incident report for the **Woolsey Fire** of November 2018, which reached his
house.

The reader sees a live alert form on screen: the perimeter draws itself, the
timeline streams in, and a `SUBSCRIBER · 1 / 1,643` pin appears inside the burn
area. The applicant only appears at the bottom as **FILED BY**.

The fire is the lede. The application is the postscript.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Hand-drawn SVG incident map with `pathLength`-normalized stroke animation
- `next/font/google` — Inter, Libre Caslon Text, JetBrains Mono
- Zero CSS framework, no UI library, no external deps beyond Next

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```
