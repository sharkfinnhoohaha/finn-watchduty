# For Watch Duty

A minimalist, single-page application for Watch Duty by Finn Bennett.

Three signals from one operator — web, flight, public information.
Each headline emits its own signature pulse across an ember-field canvas:

- **web** → grid (cardinal-axis ripple)
- **flight** → radar sweep
- **public information** → triple alert beat

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- `next/font/google` — Inter, Libre Caslon Text, JetBrains Mono
- No framework CSS; just plain CSS + a hand-written 2D canvas (Halton-distributed
  embers, Gaussian band falloff, per-pulse anisotropic masks)

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```
