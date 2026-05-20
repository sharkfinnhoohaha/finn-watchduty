# Approach to Watch Duty

An approach-plate-styled portfolio / job application by Finn Bennett, targeted at Watch Duty.

The site presents Finn's background — commercial pilot, designer/dev, civic news operator — as if it were a Jeppesen RNAV approach plate. Briefing strip, descent profile, frequency band, Ventura County sectional, signal chain, capability rose, pre-flight checklist.

Built on the Overlook Strategy design system (paper-100 / ink-900 / tide-500).

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- `next/font/google` for Inter, Libre Caslon Text, JetBrains Mono
- No Tailwind — inline styles + CSS variables, intentional for this surface
- Web Audio API for the KOXR Morse ident + radio handshake (no audio assets)
- Live KOXR METAR via `aviationweather.gov` proxied through `app/api/metar`

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build sanity check
```

## Deploy

This project is configured for one-click deploy to Vercel:

```bash
vercel --prod
```

## Suggested domain

`watchduty.finnbennett.com` (subdomain on Finn's personal domain)
