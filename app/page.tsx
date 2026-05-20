'use client';

import { useEffect, useState } from 'react';

type Update = {
  t: string;
  s: string;
  tag?: string;
  personal?: boolean;
  pivot?: boolean;
};

const TIMELINE: Update[] = [
  { t: '2018·11·08 · 14:24', s: 'Brush fire reported near Boeing Santa Susana, Simi Valley.', tag: 'IGNITION' },
  { t: '2018·11·08 · 18:30', s: 'Fire jumps the 118 freeway. 8,000 ac.' },
  { t: '2018·11·08 · 21:00', s: 'Mandatory evac: Bell Canyon, Oak Park, Hidden Hills.' },
  { t: '2018·11·09 · 03:30', s: 'Fire crosses the 101 freeway.' },
  { t: '2018·11·09 · 06:00', s: 'Fire enters Malibu hills. Winds 55 mph.' },
  { t: '2018·11·09 · 11:00', s: 'Fire reaches Pacific Coast Highway.' },
  { t: '2018·11·13', s: 'Containment 35% · 91,572 ac.' },
  { t: '2018·11·21', s: '100% contained · 96,949 ac · 1,643 structures.', tag: 'CLOSED' },
  { t: '2018·11·22', s: '1 of 1,643 returns. Address withheld.', personal: true, tag: 'SUBSCRIBER' },
  { t: '2024', s: 'That 1 earns Commercial / IFR. KOXR.', personal: true },
  { t: '2026 · 05', s: 'That 1 files this advisory.', personal: true, pivot: true },
];

const STATS = [
  { label: 'Reported', value: '11·08·18 · 14:24' },
  { label: 'Contained', value: '11·21·18' },
  { label: 'Final size', value: '96,949 ac' },
  { label: 'Structures', value: '1,643', hot: true },
  { label: 'Fatalities', value: '3' },
  { label: 'Cause', value: 'SCE equipment' },
];

// Woolsey-like perimeter — stylized organic blob, not literal GIS.
// Anchored to a 900×520 viewBox.
const PERIMETER_PATH =
  'M 232 122 C 285 100 348 112 388 142 C 425 174 450 212 470 250 C 492 292 494 332 482 370 C 470 408 444 438 412 458 C 378 478 338 480 302 470 C 264 458 232 432 208 400 C 188 370 178 332 180 292 C 182 252 196 212 214 178 C 222 156 226 138 232 122 Z';

const IGNITION = { x: 245, y: 128 };
const SUBSCRIBER = { x: 322, y: 296 };

export default function Page() {
  const [now, setNow] = useState('— — — —');
  const [progress, setProgress] = useState(0);     // 0..1 perimeter draw
  const [revealed, setRevealed] = useState(0);     // count of timeline entries revealed
  const [booted, setBooted] = useState(false);

  // Boot
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Live UTC clock — small data-anchor
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const z = (n: number) => String(n).padStart(2, '0');
      setNow(`${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}Z`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Perimeter draw animation (~2.6s)
  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const dur = 2600;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / dur);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setProgress(eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reveal timeline entries one-by-one
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= TIMELINE.length) clearInterval(id);
    }, 380);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="alert" data-booted={booted ? 'on' : 'off'}>
      <div className="alertBar">
        <span className="badge">
          <span className="badgeDot" aria-hidden="true" />
          ACTIVE ADVISORY
        </span>
        <span className="alertBarMid">VEGETATION FIRE · CONTAINED · APPLICATION OPEN</span>
        <span className="alertBarRight mono">{now}</span>
      </div>

      <article className="card incident" aria-labelledby="incident-name">
        <header className="head">
          <p className="kicker">INCIDENT REPORT · WD-2018-11-08</p>
          <h1 id="incident-name" className="incidentName">Woolsey&nbsp;Fire</h1>
          <p className="location">Ventura &amp; Los Angeles Counties · California</p>
        </header>

        <dl className="stats">
          {STATS.map((s) => (
            <div className="stat" key={s.label}>
              <dt>{s.label}</dt>
              <dd className={s.hot ? 'hot' : ''}>{s.value}</dd>
            </div>
          ))}
        </dl>

        <section className="body">
          <IncidentMap progress={progress} />
          <UpdateFeed revealed={revealed} />
        </section>
      </article>

      <article className="card filedBy" aria-labelledby="filer-name">
        <p className="kicker">FILED BY</p>
        <h2 id="filer-name" className="filerName">Finn Bennett</h2>
        <p className="filerMeta mono">
          college student
          <span className="sep">·</span>
          commercial / IFR pilot
          <span className="sep">·</span>
          web developer
          <span className="sep">·</span>
          KOXR · 34.27°N 119.23°W
        </p>

        <div className="statement">
          <p><span className="quiet">This is the fire that</span> reached my house<span className="quiet">.</span></p>
          <p><span className="quiet">I have</span> a summer in 2026<span className="quiet">.</span></p>
          <p className="hot">I&apos;d like to help build the alert that arrives in time.</p>
        </div>

        <footer className="contact mono">
          <a href="mailto:finn@overlookstrategy.com">finn@overlookstrategy.com</a>
          <span className="sep">·</span>
          <span className="forwd">for Watch&nbsp;Duty</span>
        </footer>
      </article>
    </main>
  );
}

function IncidentMap({ progress }: { progress: number }) {
  const dash = 1 - progress;
  return (
    <div className="map" aria-label="Woolsey Fire perimeter">
      <svg viewBox="0 0 900 520" preserveAspectRatio="xMidYMid meet" className="mapSvg">
        <defs>
          <pattern id="hatchMtn" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink)" strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
          <pattern id="hatchFire" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--fire)" strokeOpacity="0.18" strokeWidth="1" />
          </pattern>
          <radialGradient id="ignitionGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--fire)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--fire)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Santa Monica Mountains hatched — a single ridge band */}
        <path d="M 0 200 Q 220 160 480 210 T 900 230 L 900 280 Q 700 250 460 290 T 0 270 Z" fill="url(#hatchMtn)" />
        <text x="700" y="186" className="lbl place">SANTA MONICA MTNS</text>

        {/* Pacific Ocean band */}
        <rect x="0" y="440" width="900" height="80" fill="var(--ink)" opacity="0.04" />
        <path
          d="M 0 430 Q 200 422 420 438 T 900 460"
          fill="none"
          stroke="var(--ink)"
          strokeOpacity="0.4"
          strokeWidth="1"
        />
        <text x="20" y="490" className="lbl ocean">PACIFIC OCEAN</text>

        {/* 118 freeway */}
        <line x1="0" y1="80" x2="900" y2="115" stroke="var(--ink)" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="3 3" />
        <text x="620" y="106" className="lbl road">118 ▸ FREEWAY</text>

        {/* 101 freeway */}
        <line x1="0" y1="320" x2="900" y2="290" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1" />
        <text x="620" y="312" className="lbl road">101 ▸ VENTURA</text>

        {/* PCH */}
        <path d="M 0 460 Q 220 454 420 468 T 900 478" fill="none" stroke="var(--ink)" strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="2 2" />
        <text x="730" y="454" className="lbl road">PCH ▸ 1</text>

        {/* Place labels */}
        <text x="210" y="62" className="lbl place">SIMI VALLEY</text>
        <text x="540" y="200" className="lbl place">HIDDEN HILLS</text>
        <text x="120" y="358" className="lbl place">AGOURA</text>
        <text x="500" y="440" className="lbl place">MALIBU</text>

        {/* Fire perimeter — fill */}
        <path
          d={PERIMETER_PATH}
          fill="url(#hatchFire)"
          opacity={progress}
          style={{ transition: 'opacity 600ms ease-out' }}
        />
        {/* Fire perimeter — stroke (drawn in via dasharray) */}
        <path
          d={PERIMETER_PATH}
          fill="none"
          stroke="var(--fire)"
          strokeWidth="1.5"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={dash}
        />

        {/* KOXR — the airport the filer flies from. Anchors the aviation thread. */}
        <g opacity="0.7">
          <polygon points="80,135 92,148 80,162 68,148" fill="none" stroke="var(--ink)" strokeWidth="0.8" />
          <line x1="80" y1="135" x2="80" y2="162" stroke="var(--ink)" strokeWidth="0.4" />
          <line x1="68" y1="148" x2="92" y2="148" stroke="var(--ink)" strokeWidth="0.4" />
          <text x="80" y="180" textAnchor="middle" className="lbl place">KOXR</text>
          <text x="80" y="192" textAnchor="middle" className="lbl coord">OXNARD · 119.23°W</text>
        </g>

        {/* Ignition point */}
        <circle cx={IGNITION.x} cy={IGNITION.y} r="22" fill="url(#ignitionGlow)" opacity={Math.min(1, progress * 3)} />
        <circle cx={IGNITION.x} cy={IGNITION.y} r="3.5" fill="var(--fire)" opacity={Math.min(1, progress * 3)} />
        <text x={IGNITION.x + 8} y={IGNITION.y - 6} className="lbl ignition" opacity={Math.min(1, progress * 3)}>
          IGNITION · 14:24
        </text>

        {/* Subscriber pin — fades in after perimeter completes */}
        <g
          transform={`translate(${SUBSCRIBER.x}, ${SUBSCRIBER.y})`}
          opacity={progress > 0.85 ? 1 : 0}
          style={{ transition: 'opacity 700ms ease-out 150ms' }}
        >
          <circle r="14" fill="none" stroke="var(--ink)" strokeOpacity="0.4" className="pinPulse" />
          <circle r="5" fill="var(--ink)" stroke="var(--paper)" strokeWidth="1.4" />
          <line x1="0" y1="-22" x2="0" y2="-8" stroke="var(--ink)" strokeWidth="0.8" />
          <text x="10" y="-18" className="lbl subscriber">SUBSCRIBER · 1 / 1,643</text>
        </g>

        {/* Coordinate ticks */}
        <text x="14" y="18" className="lbl coord">34°20′N</text>
        <text x="14" y="514" className="lbl coord">34°00′N</text>
        <text x="820" y="18" className="lbl coord">118°45′W</text>

        {/* Scale */}
        <g transform="translate(740, 502)">
          <line x1="0" y1="0" x2="120" y2="0" stroke="var(--ink)" strokeOpacity="0.6" strokeWidth="1" />
          <line x1="0" y1="-3" x2="0" y2="3" stroke="var(--ink)" strokeOpacity="0.6" />
          <line x1="60" y1="-3" x2="60" y2="3" stroke="var(--ink)" strokeOpacity="0.6" />
          <line x1="120" y1="-3" x2="120" y2="3" stroke="var(--ink)" strokeOpacity="0.6" />
          <text x="60" y="-6" textAnchor="middle" className="lbl coord">10 NM</text>
        </g>

        {/* North arrow */}
        <g transform="translate(860, 38)">
          <polygon points="0,-12 4,4 0,1 -4,4" fill="var(--ink)" opacity="0.65" />
          <text x="0" y="18" textAnchor="middle" className="lbl coord">N</text>
        </g>
      </svg>
    </div>
  );
}

function UpdateFeed({ revealed }: { revealed: number }) {
  return (
    <div className="feed" aria-label="Incident updates">
      <p className="feedHead mono">
        <span className="feedHeadDot" /> LIVE FEED · {TIMELINE.length} ENTRIES
      </p>
      <ol className="updates">
        {TIMELINE.map((u, i) => (
          <li
            key={i}
            className={[
              'update',
              i < revealed ? 'in' : '',
              u.personal ? 'personal' : '',
              u.pivot ? 'pivot' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="t mono">{u.t}</span>
            <span className="s">{u.s}</span>
            {u.tag && <span className="tag mono">{u.tag}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
