'use client';

import { useState, useEffect } from 'react';
import { useBootSequence, useScrollBoot } from './lib/useBootSequence';
import { useScrollProgress, useActiveSection } from './lib/useScrollProgress';
import { useMetar, formatConditions } from './lib/useMetar';
import { playKoxrIdent, playHandshake } from './lib/audio';

// =============================================================================
// REVEAL — IntersectionObserver-driven fade/translate on scroll-in
// =============================================================================
function Reveal({
  children,
  as: As = 'div',
  className = '',
  style = {},
  threshold = 0.15,
  stagger = false,
}: {
  children: React.ReactNode;
  as?: 'div' | 'section' | 'header';
  className?: string;
  style?: React.CSSProperties;
  threshold?: number;
  stagger?: boolean;
}) {
  const { ref, booted } = useScrollBoot<HTMLElement>();
  const cls = stagger ? 'reveal-stagger' : 'reveal';
  const combined = `${cls}${className ? ' ' + className : ''}`;
  return (
    <As
      ref={ref as never}
      className={combined}
      data-reveal={booted ? 'on' : 'off'}
      data-threshold={threshold}
      style={style}
    >
      {children}
    </As>
  );
}

// Section ids in order (used by the pinned rail)
const SECTION_IDS = [
  'briefing',
  'descent',
  'frequency',
  'sectional',
  'signal-chain',
  'wind-rose',
  'checklist',
] as const;
const SECTION_LABELS: Record<string, string> = {
  briefing: 'Briefing',
  descent: 'Descent',
  frequency: 'Frequency',
  sectional: 'Sectional',
  'signal-chain': 'Signal Chain',
  'wind-rose': 'Wind Rose',
  checklist: 'Clearance',
};

// =============================================================================
// DESIGN TOKENS (Overlook Strategy)
// =============================================================================
const C = {
  bg: '#fbfaf7',       // paper-100
  bgElev: '#ffffff',   // paper-50
  bgSunk: '#f2f4f2',   // paper-200
  border: '#e2e4e1',   // paper-300
  ink: '#0e2439',      // ink-900
  inkMuted: '#1f3d5a', // ink-700
  caption: '#555450',  // fog-700
  fog: '#eceae4',      // fog-100
  accent: '#4a9d97',   // tide-500
  accentDeep: '#2f6e7b', // pacific-600
  warm: '#916b3a',     // sand-600
  signal: '#c85a3f',   // signal-sunset
};

// =============================================================================
// PRIMITIVES
// =============================================================================
type MonoProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

const Mono = ({ children, className = '', style = {} }: MonoProps) => (
  <span
    className={className}
    style={{
      fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
      letterSpacing: '0.05em',
      ...style,
    }}
  >
    {children}
  </span>
);

const Serif = ({ children, className = '', style = {} }: MonoProps) => (
  <span
    className={className}
    style={{
      fontFamily: "var(--font-libre-caslon), Georgia, serif",
      ...style,
    }}
  >
    {children}
  </span>
);

const Eyebrow = ({
  children,
  tone = 'caption',
}: {
  children: React.ReactNode;
  tone?: 'caption' | 'inverse';
}) => (
  <p
    style={{
      fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
      fontSize: 10,
      letterSpacing: '0.28em',
      textTransform: 'uppercase',
      color: tone === 'inverse' ? '#8fc4c1' : C.caption,
      margin: 0,
    }}
  >
    {children}
  </p>
);

const Hairline = ({
  color = C.ink,
  opacity = 1,
}: {
  color?: string;
  opacity?: number;
}) => (
  <div style={{ height: 1, background: color, opacity, width: '100%' }} />
);

// Boxed monospace data cell — Jeppesen briefing strip vibe
const DataCell = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) => (
  <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.border}` }}>
    <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
      {label}
    </Mono>
    <div style={{ marginTop: 4 }}>
      <Mono style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
        {value}
      </Mono>
    </div>
    {sub && (
      <div style={{ marginTop: 2 }}>
        <Mono style={{ fontSize: 10, color: C.inkMuted }}>{sub}</Mono>
      </div>
    )}
  </div>
);

// =============================================================================
// SECTION 0 — TOP RIBBON
// =============================================================================
function PinnedRail({ phase }: { phase: number }) {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const z = (n: number) => String(n).padStart(2, '0');
      setClock(`${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}Z`);
    };
    tick();
    const i = setInterval(tick, 30000);
    return () => clearInterval(i);
  }, []);

  const active = useActiveSection(SECTION_IDS as readonly string[] as string[]);
  const on = phase >= 1;
  const activeIdx = active ? SECTION_IDS.indexOf(active as typeof SECTION_IDS[number]) : -1;
  const pageLabel = activeIdx >= 0 ? String(activeIdx + 1).padStart(2, '0') : '00';

  return (
    <header
      className={`pinned-rail${on ? ' ribbon-power' : ''}`}
      data-boot={on ? 'on' : 'off'}
      style={{
        fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
        fontSize: 10,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 24,
          padding: '12px 24px',
        }}
      >
        <span style={{ color: '#8fc4c1', whiteSpace: 'nowrap' }}>
          FBN-26-05 // PG {pageLabel}/07
        </span>
        <nav
          className="rail-anchors"
          style={{ display: 'flex', gap: 18, overflowX: 'auto', flex: 1, justifyContent: 'center' }}
        >
          {SECTION_IDS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? 'true' : 'false'}
              style={{ whiteSpace: 'nowrap' }}
            >
              {SECTION_LABELS[id]}
            </a>
          ))}
        </nav>
        <span style={{ color: '#8fc4c1', display: 'flex', gap: 14, whiteSpace: 'nowrap' }}>
          <span>34°16′N 119°13′W</span>
          <span className="scramble">{clock || '— — — — —'}</span>
        </span>
      </div>
    </header>
  );
}

// =============================================================================
// SECTION 1 — BRIEFING STRIP HERO
// =============================================================================
function BriefingStrip({ phase }: { phase: number }) {
  const { data: metar } = useMetar();
  const condStr = metar ? formatConditions(metar) : null;
  return (
    <section id="briefing" className="section-viewport section-tight" style={{ padding: '6vh 24px 8vh', background: C.bg }}>
      {/* Top procedural identifier line */}
      <div
        data-boot={phase >= 2 ? 'on' : 'off'}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
          paddingBottom: 16,
        }}
      >
        <div>
          <Eyebrow>RNAV (GPS) RWY 25 — UNCONTROLLED APPROACH</Eyebrow>
          <h1
            className="section-headline"
            style={{
              color: C.ink,
              margin: '16px 0 0 0',
              maxWidth: '14ch',
            }}
          >
            <em>Approach to</em>{' '}
            <span style={{ fontWeight: 700 }}>WATCH&nbsp;DUTY</span>
          </h1>
          <p className="section-lead" style={{ marginTop: 24, maxWidth: 620 }}>
            Filed by{' '}
            <span style={{ color: C.ink, fontWeight: 500 }}>Finn Bennett.</span>{' '}
            Commercial pilot. Designer. Operator of a hyperlocal civic news
            publication in fire country. This page is structured as a
            Jeppesen approach plate because the work itself is procedural and
            the trajectory has a destination.
          </p>
        </div>

        {/* Right rail identifier card — like the chart index box */}
        <div
          className="koxr-card"
          onMouseEnter={() => playKoxrIdent()}
          onFocus={() => playKoxrIdent()}
          tabIndex={0}
          aria-label="KOXR Morse identifier — hover to play"
          style={{
            border: `1px solid ${C.ink}`,
            padding: 16,
            minWidth: 240,
            background: C.bgElev,
            outline: 'none',
          }}
        >
          <Mono style={{ fontSize: 9, letterSpacing: '0.2em', color: C.caption }}>
            FILED FROM
          </Mono>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Mono style={{ fontSize: 22, color: C.ink, fontWeight: 600 }}>
              KOXR
            </Mono>
            <Mono style={{ fontSize: 9, color: C.accentDeep, letterSpacing: '0.2em' }}>
              ─── ─··─ ·─·
            </Mono>
          </div>
          <div style={{ marginTop: 2 }}>
            <Mono style={{ fontSize: 11, color: C.inkMuted }}>
              OXNARD / VENTURA CO, CA
            </Mono>
          </div>
          <div style={{ height: 1, background: C.border, margin: '12px 0' }} />
          <Mono style={{ fontSize: 9, letterSpacing: '0.2em', color: C.caption }}>
            CALLSIGN
          </Mono>
          <div style={{ marginTop: 6 }}>
            <Mono style={{ fontSize: 18, color: C.ink, fontWeight: 600 }}>
              N-FINN-1
            </Mono>
          </div>
          <div style={{ marginTop: 10 }}>
            <Mono style={{ fontSize: 8, letterSpacing: '0.2em', color: C.caption }}>
              HOVER FOR IDENT
            </Mono>
          </div>
        </div>
      </div>

      {/* The four-cell briefing block — comms, navaids, approach, position */}
      <div
        className="briefing-cells"
        data-boot={phase >= 3 ? 'on' : 'off'}
        style={{
          marginTop: 8,
          border: `1px solid ${C.ink}`,
          display: 'grid',
          background: C.bgElev,
        }}
      >
        <div>
          <Mono
            style={{
              fontSize: 9,
              letterSpacing: '0.2em',
              color: C.bg,
              background: C.ink,
              padding: '4px 12px',
              display: 'block',
            }}
          >
            COMMS
          </Mono>
          <DataCell label="EMAIL" value="finn@overlookstrategy.com" />
          <DataCell label="WEB" value="overlookstrategy.com" />
          <DataCell label="CIVIC" value="pierandpoint.com" />
        </div>
        <div>
          <Mono
            style={{
              fontSize: 9,
              letterSpacing: '0.2em',
              color: C.bg,
              background: C.ink,
              padding: '4px 12px',
              display: 'block',
            }}
          >
            APPROACH NAVAIDS
          </Mono>
          <DataCell label="RATING" value="COMM / IFR" sub="ASEL — issued 2024" />
          <DataCell label="EDUCATION" value="BERKLEE ONLINE" sub="MUSIC SUPV" />
          <DataCell label="HOME BASE" value="VENTURA CA" sub="THOMAS FIRE COUNTRY" />
        </div>
        <div>
          <Mono
            style={{
              fontSize: 9,
              letterSpacing: '0.2em',
              color: C.bg,
              background: C.ink,
              padding: '4px 12px',
              display: 'block',
            }}
          >
            FLEET
          </Mono>
          <DataCell label="OVERLOOK STRATEGY" value="BRAND / WEB" />
          <DataCell label="OVERLOOK AUDIO" value="MIX / MASTER / HW" sub="RIPTIDE MIDI PEDAL" />
          <DataCell label="PIER AND POINT" value="HYPERLOCAL NEWS" sub="VENTURA COUNTY" />
        </div>
        <div>
          <Mono
            style={{
              fontSize: 9,
              letterSpacing: '0.2em',
              color: C.bg,
              background: C.ink,
              padding: '4px 12px',
              display: 'block',
            }}
          >
            INTENT
          </Mono>
          <div style={{ padding: 12, height: 'calc(100% - 22px)' }}>
            <Mono style={{ fontSize: 11, color: C.ink, lineHeight: 1.6 }}>
              CONTRIBUTE TO WATCH DUTY IN ANY CAPACITY:
              <br />
              — VC/SB REPORTER
              <br />
              — AIR-OPS DOMAIN
              <br />
              — MARKETING/DESIGN
              <br />
              CONTINUING APPROACH:
              <br />
              <span style={{ color: C.accentDeep, fontWeight: 600 }}>
                CAL FIRE PILOT
              </span>
            </Mono>
          </div>
        </div>
      </div>

      {/* MSA-style minimums block */}
      <div
        className="briefing-mins"
        data-boot={phase >= 4 ? 'on' : 'off'}
        style={{
          marginTop: 16,
          display: 'grid',
          gap: 0,
          border: `1px solid ${C.border}`,
          background: C.bgSunk,
        }}
      >
        <div style={{ padding: 12, borderRight: `1px solid ${C.border}` }}>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
            VFR MINIMUMS
          </Mono>
          <div style={{ marginTop: 4 }}>
            <Mono style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>
              CEILING 1500 / VIS 3SM
            </Mono>
          </div>
          <div style={{ marginTop: 2 }}>
            <Mono style={{ fontSize: 10, color: C.inkMuted }}>
              CREATIVE MODE — LOOK OUTSIDE, FEEL THE DAY
            </Mono>
          </div>
        </div>
        <div style={{ padding: 12, borderRight: `1px solid ${C.border}` }}>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
            IFR MINIMUMS
          </Mono>
          <div style={{ marginTop: 4 }}>
            <Mono style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>
              DH 200 / RVR 1800
            </Mono>
          </div>
          <div style={{ marginTop: 2 }}>
            <Mono style={{ fontSize: 10, color: C.inkMuted }}>
              STRUCTURED MODE — TRUST THE INSTRUMENTS
            </Mono>
          </div>
        </div>
        <div style={{ padding: 12 }}>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
            CURRENT CONDITIONS — KOXR
          </Mono>
          <div style={{ marginTop: 4 }}>
            <Mono style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>
              {condStr ?? 'TUNING…'}
            </Mono>
          </div>
          <div style={{ marginTop: 2 }}>
            <Mono style={{ fontSize: 10, color: C.accentDeep }}>
              {metar ? 'LIVE — AVIATIONWEATHER.GOV' : 'MISSION READY — REQUEST CLEARANCE'}
            </Mono>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 2 — DESCENT PROFILE
// =============================================================================
function DescentProfile() {
  // Waypoints from IAF to MAP, with continuing approach beyond
  const waypoints = [
    { x: 60, y: 50, id: 'BRKLE', alt: 'FL180', label: 'Berklee Online', sub: 'MUSIC SUPV / SCRIPT ANALYSIS' },
    { x: 200, y: 90, id: 'OVRLK', alt: '14,000', label: 'Overlook Strategy', sub: 'BRAND + WEB DEV AGENCY' },
    { x: 360, y: 140, id: 'AUDIO', alt: '10,000', label: 'Overlook Audio', sub: 'MIX / MASTER / RIPTIDE MIDI' },
    { x: 520, y: 195, id: 'COMM', alt: '6,000', label: 'Commercial Rating', sub: 'KOXR — IFR / ASEL — 2024' },
    { x: 680, y: 245, id: 'P&PNT', alt: '3,000', label: 'Pier and Point', sub: 'VENTURA COUNTY CIVIC NEWS' },
    { x: 830, y: 285, id: 'WTCH', alt: '1,500', label: 'Watch Duty', sub: 'FINAL APPROACH FIX', accent: true },
    { x: 970, y: 320, id: 'CFIRE', alt: 'TDZ', label: 'Cal Fire Pilot', sub: 'MISSED APPROACH — PINNACLE', accent: true, future: true },
  ];

  const W = 1040;
  const H = 380;

  const { ref, booted } = useScrollBoot<HTMLElement>();
  const { ref: progressRef, progress: scrollProgress } = useScrollProgress<HTMLElement>();
  const setRefs = (el: HTMLElement | null) => {
    (ref as (e: HTMLElement | null) => void)(el);
    progressRef(el);
  };

  return (
    <section
      id="descent"
      ref={setRefs}
      data-boot={booted ? 'on' : 'off'}
      className="section-viewport"
      style={{ background: C.bg, padding: '12vh 24px 12vh' }}
    >
      <Reveal>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Eyebrow>PROFILE VIEW — DESCENT TRAJECTORY</Eyebrow>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
            PG 02 / 07
          </Mono>
        </div>
        <Hairline />
        <h2 className="section-headline" style={{ color: C.ink, margin: '24px 0 12px 0', maxWidth: '18ch' }}>
          From <em>cruise altitude</em> to touchdown.
        </h2>
        <p className="section-lead" style={{ marginBottom: 32 }}>
          Each waypoint is a project shipped. The descent is real: every step down
          is more local, more specific, more public-safety adjacent.
        </p>
      </Reveal>

      <div
        style={{
          border: `1px solid ${C.ink}`,
          background: C.bgElev,
          padding: 24,
          overflowX: 'auto',
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', minWidth: 720 }}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 20"
                fill="none"
                stroke={C.fog}
                strokeWidth="0.5"
              />
            </pattern>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <polygon points="0 0, 8 4, 0 8" fill={C.ink} />
            </marker>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" opacity="0.6" />

          {/* Altitude labels (Y axis) */}
          {[
            { y: 50, label: 'FL180' },
            { y: 140, label: '10,000' },
            { y: 245, label: '3,000' },
            { y: 320, label: 'TDZ' },
          ].map((tick) => (
            <g key={tick.label}>
              <line x1="0" y1={tick.y} x2={W} y2={tick.y} stroke={C.border} strokeWidth="0.5" strokeDasharray="2 4" />
              <text x="6" y={tick.y - 4} fill={C.caption} fontSize="9" fontFamily="JetBrains Mono" letterSpacing="0.1em">
                {tick.label}
              </text>
            </g>
          ))}

          {/* Descent line — step-down between waypoints (animated draw-in) */}
          <polyline
            className="descent-path"
            data-drawn={booted ? 'true' : 'false'}
            points={waypoints.map((w) => `${w.x},${w.y}`).join(' ')}
            fill="none"
            stroke={C.ink}
            strokeWidth="1.5"
          />

          {/* Scroll-driven plane traversing the path */}
          {(() => {
            const t = Math.min(1, Math.max(0, (scrollProgress - 0.22) / (0.84 - 0.22)));
            const segCount = waypoints.length - 1;
            const segF = t * segCount;
            const seg = Math.min(segCount - 1, Math.floor(segF));
            const localT = segF - seg;
            const p0 = waypoints[seg];
            const p1 = waypoints[seg + 1];
            const x = p0.x + (p1.x - p0.x) * localT;
            const y = p0.y + (p1.y - p0.y) * localT;
            const angleDeg = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
            const activeIdx = Math.min(segCount, Math.round(segF));
            return (
              <g>
                {/* Highlighted active waypoint ring */}
                <circle
                  cx={waypoints[activeIdx].x}
                  cy={waypoints[activeIdx].y}
                  r="14"
                  fill="none"
                  stroke={C.accent}
                  strokeWidth="1.5"
                  opacity={booted ? 0.7 : 0}
                  style={{ transition: 'cx 90ms linear, cy 90ms linear, opacity 240ms ease-out' }}
                />
                {/* Plane icon */}
                <g
                  className="descent-plane"
                  transform={`translate(${x},${y}) rotate(${angleDeg})`}
                  opacity={booted ? 1 : 0}
                >
                  <polygon
                    points="-8,-4 8,0 -8,4 -4,0"
                    fill={C.accentDeep}
                    stroke={C.bg}
                    strokeWidth="0.8"
                  />
                </g>
                {/* Altitude readout following the plane */}
                <g transform={`translate(${x + 16}, ${y - 14})`} opacity={booted ? 0.95 : 0} style={{ transition: 'opacity 240ms ease-out' }}>
                  <rect x="0" y="-8" width="62" height="14" fill={C.ink} />
                  <text x="6" y="2" fontSize="8" fontFamily="JetBrains Mono" fontWeight="600" fill={C.bg} letterSpacing="0.1em">
                    {waypoints[activeIdx].alt}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* Highlight the final segment (Watch Duty → Cal Fire) */}
          <line
            x1={waypoints[5].x}
            y1={waypoints[5].y}
            x2={waypoints[6].x}
            y2={waypoints[6].y}
            stroke={C.accent}
            strokeWidth="2"
            strokeDasharray="4 3"
          />

          {/* Waypoints */}
          {waypoints.map((w, idx) => (
            <g
              key={w.id}
              className="descent-waypoint"
              data-drawn={booted ? 'true' : 'false'}
              style={{ ['--wp' as never]: idx } as React.CSSProperties}
            >
              {/* Vertical drop line */}
              <line
                x1={w.x}
                y1={w.y}
                x2={w.x}
                y2={H - 24}
                stroke={C.border}
                strokeWidth="0.5"
              />
              {/* Waypoint marker — triangle for waypoints, hollow circle for the FAF */}
              {w.id === 'WTCH' ? (
                <>
                  <circle cx={w.x} cy={w.y} r="9" fill={C.bg} stroke={C.accent} strokeWidth="2" />
                  <circle cx={w.x} cy={w.y} r="4" fill={C.accent} />
                </>
              ) : w.future ? (
                <polygon
                  points={`${w.x},${w.y - 8} ${w.x + 8},${w.y + 6} ${w.x - 8},${w.y + 6}`}
                  fill={C.bg}
                  stroke={C.accent}
                  strokeWidth="1.5"
                />
              ) : (
                <polygon
                  points={`${w.x},${w.y - 7} ${w.x + 7},${w.y + 5} ${w.x - 7},${w.y + 5}`}
                  fill={C.ink}
                />
              )}

              {/* Identifier label */}
              <rect
                x={w.x - 28}
                y={w.y - 30}
                width="56"
                height="14"
                fill={C.bgElev}
                stroke={C.ink}
                strokeWidth="0.5"
              />
              <text
                x={w.x}
                y={w.y - 20}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="9"
                fontWeight="600"
                fill={C.ink}
                letterSpacing="0.1em"
              >
                {w.id}
              </text>

              {/* Bottom label on x-axis */}
              <text
                x={w.x}
                y={H - 8}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="8"
                fill={C.caption}
                letterSpacing="0.1em"
              >
                {w.label.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Direction arrow at the bottom */}
          <line
            x1="20"
            y1={H - 24}
            x2={W - 20}
            y2={H - 24}
            stroke={C.ink}
            strokeWidth="0.5"
            markerEnd="url(#arrowhead)"
          />
        </svg>

        {/* Legend below the chart */}
        <div
          className="desc-legend"
          style={{
            display: 'grid',
            gap: 16,
            marginTop: 24,
            paddingTop: 16,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div>
            <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
              IAF — INITIAL APPROACH FIX
            </Mono>
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, marginTop: 6, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
              Berklee Online enrollment. The point where creative training met
              structural training and decided to operate at both.
            </p>
          </div>
          <div>
            <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
              FAF — FINAL APPROACH FIX
            </Mono>
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, marginTop: 6, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
              Watch Duty contribution. The point where local civic news
              operation, design system fluency, and aviation literacy converge.
            </p>
          </div>
          <div>
            <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
              MISSED APPROACH PROCEDURE
            </Mono>
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, marginTop: 6, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
              <span style={{ color: C.accentDeep, fontWeight: 600 }}>Cal Fire pilot.</span>{' '}
              Continued course. The trajectory does not end at Watch Duty. It
              passes through it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 3 — FREQUENCY BAND (audio → aviation VHF)
// =============================================================================
function FrequencyBand() {
  // Markers placed on the long horizontal track. Position is a percentage along the track (0..100).
  const operatingPoints = [
    { x: 6,  label: '40Hz',       sub: 'kick drum / Distressor input' },
    { x: 16, label: '440Hz',      sub: 'A4 / reference pitch' },
    { x: 28, label: '3kHz',       sub: 'vocal presence / Voxbox' },
    { x: 40, label: '16kHz',      sub: 'air band / mix bus shimmer' },
    { x: 58, label: '108.20 MHz', sub: 'VTU VORTAC (Ventura)' },
    { x: 70, label: '121.50 MHz', sub: 'aviation emergency' },
    { x: 80, label: '125.35 MHz', sub: 'KOXR CTAF' },
    { x: 92, label: '134.15 MHz', sub: 'SoCal Approach' },
  ];

  const { ref: progressRef, progress } = useScrollProgress<HTMLElement>();
  const { ref: bootRef, booted } = useScrollBoot<HTMLElement>();
  const setRefs = (el: HTMLElement | null) => {
    progressRef(el);
    (bootRef as (e: HTMLElement | null) => void)(el);
  };
  // Map scroll progress (0..1) to a horizontal pan offset. We let the inner
  // scroll from a small overshoot left (0%) to a small overshoot right (-180%) of viewport.
  // Use middle 70% of progress for the actual pan so there's a hold at start/end.
  const t = Math.min(1, Math.max(0, (progress - 0.1) / 0.8));
  const translatePct = -t * 180; // viewport-width units

  return (
    <section id="frequency" ref={setRefs} data-boot={booted ? 'on' : 'off'} className="hscroll-outer" style={{ background: C.bg }}>
      <div className="hscroll-sticky">
        <div style={{ width: '100%', padding: '0 0 0 24px' }}>
          {/* Section header — stays in view through the whole pan */}
          <Reveal>
            <div style={{ paddingRight: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, maxWidth: 1200 }}>
                <Eyebrow>FREQUENCY DOMAIN — OPERATING BAND</Eyebrow>
                <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>
                  PG 03 / 07 — SCROLL TO TUNE
                </Mono>
              </div>
              <h2 className="section-headline" style={{ color: C.ink, margin: '16px 0 12px 0', maxWidth: '14ch' }}>
                <em>Everything</em> is signal.
              </h2>
              <p className="section-lead" style={{ marginBottom: 32, maxWidth: 720 }}>
                Music runs on the audio band. Aviation runs on VHF. Civic news is
                information transmission at the county scale. One operator, one
                spectrum, three contexts. Keep scrolling to tune.
              </p>
            </div>
          </Reveal>

          {/* The long horizontal track */}
          <div
            className="hscroll-track"
            style={{
              transform: `translateX(${translatePct}vw)`,
              width: 'max-content',
              borderTop: `1px solid ${C.ink}`,
              borderBottom: `1px solid ${C.ink}`,
              background: C.bgElev,
              padding: '64px 0',
              marginTop: 24,
              position: 'relative',
            }}
          >
            {/* Audio region */}
            <div
              style={{
                width: '120vw',
                background: `linear-gradient(90deg, ${C.bgSunk} 0%, ${C.fog} 100%)`,
                borderRight: `1px dashed ${C.ink}`,
                position: 'relative',
                height: 80,
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <Mono style={{ position: 'absolute', top: -24, left: 24, fontSize: 9, letterSpacing: '0.25em', color: C.caption }}>
                AUDIO BAND — 20Hz / 20kHz (LOG)
              </Mono>
            </div>
            {/* Aviation region */}
            <div
              style={{
                width: '120vw',
                background: `linear-gradient(90deg, ${C.fog} 0%, ${C.bgSunk} 100%)`,
                position: 'relative',
                height: 80,
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <Mono style={{ position: 'absolute', top: -24, right: 24, fontSize: 9, letterSpacing: '0.25em', color: C.caption }}>
                AVIATION VHF — 108 / 137 MHz
              </Mono>
            </div>
            {/* Operating point markers — positioned across the 240vw track */}
            {operatingPoints.map((p, i) => (
              <div
                key={p.label}
                className="freq-marker"
                style={{
                  position: 'absolute',
                  left: `${p.x / 100 * 240}vw`,
                  top: 64,
                  bottom: 64,
                  width: 1,
                  background: C.ink,
                  ['--m' as never]: i,
                } as React.CSSProperties}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -3,
                    left: -4,
                    width: 9,
                    height: 9,
                    background: C.accent,
                    border: `1px solid ${C.ink}`,
                    borderRadius: '50%',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: -56,
                    left: -70,
                    width: 140,
                    textAlign: 'center',
                  }}
                >
                  <Mono style={{ fontSize: 11, color: C.ink, fontWeight: 600, letterSpacing: '0.05em' }}>
                    {p.label}
                  </Mono>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: C.caption, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
                      {p.sub}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Progress indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', maxWidth: 1200, marginTop: 80, paddingRight: 24 }}>
            <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.25em' }}>
              20Hz ━━━━━━━━━━━━━━━━━━ 136 MHz
            </Mono>
            <Mono style={{ fontSize: 9, color: C.accentDeep, letterSpacing: '0.25em' }}>
              {(t * 100).toFixed(0)}% TUNED
            </Mono>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 4 — SECTIONAL EXCERPT (territory map)
// =============================================================================
function SectionalExcerpt() {
  const { ref, booted } = useScrollBoot<HTMLElement>();
  return (
    <section id="sectional" ref={ref} data-boot={booted ? 'on' : 'off'} className="section-viewport" style={{ background: C.bg, padding: '12vh 24px 12vh' }}>
      <Reveal>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Eyebrow>PLAN VIEW — VENTURA COUNTY SECTIONAL</Eyebrow>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>PG 04 / 07</Mono>
        </div>
        <Hairline />
        <h2 className="section-headline" style={{ color: C.ink, margin: '24px 0 12px 0', maxWidth: '20ch' }}>
          <em>Two systems</em> of authoritative cartography.
        </h2>
        <p className="section-lead" style={{ marginBottom: 32 }}>
          FAA sectional below, Pier and Point coverage overlay above. Where they
          intersect is where Watch Duty already operates.
        </p>
      </Reveal>

      <div
        className="sectional-grid"
        style={{
          border: `1px solid ${C.ink}`,
          background: C.bgElev,
          padding: 24,
          display: 'grid',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* The sectional itself */}
        <div style={{ position: 'relative', aspectRatio: '4/3', background: '#f6f4ee', border: `1px solid ${C.border}` }}>
          <svg viewBox="0 0 800 600" style={{ width: '100%', height: '100%' }}>
            <defs>
              <pattern id="hatchTerrain" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={C.warm} strokeOpacity="0.18" strokeWidth="1" />
              </pattern>
              <pattern id="hatchFire" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke={C.signal} strokeOpacity="0.35" strokeWidth="1" />
              </pattern>
            </defs>

            {/* Mountains (Topa Topa / Los Padres) */}
            <path d="M 0 120 Q 200 80 400 130 T 800 150 L 800 0 L 0 0 Z" fill="url(#hatchTerrain)" />
            <path d="M 0 140 Q 200 110 400 150 T 800 170" fill="none" stroke={C.warm} strokeOpacity="0.5" strokeWidth="0.8" />

            {/* Coastline */}
            <path
              d="M 0 380 Q 100 360 200 380 T 380 410 Q 480 440 600 470 T 800 510"
              fill="none"
              stroke={C.ink}
              strokeWidth="1.5"
            />
            <path
              d="M 0 380 Q 100 360 200 380 T 380 410 Q 480 440 600 470 T 800 510 L 800 600 L 0 600 Z"
              fill={C.accentDeep}
              opacity="0.08"
            />

            {/* Channel Islands (Anacapa, Santa Cruz, Santa Rosa stylized) */}
            <ellipse cx="280" cy="540" rx="32" ry="8" fill={C.warm} opacity="0.4" />
            <ellipse cx="430" cy="555" rx="60" ry="12" fill={C.warm} opacity="0.4" />
            <ellipse cx="620" cy="565" rx="40" ry="10" fill={C.warm} opacity="0.4" />

            {/* Class D airspace — magenta dashed rings (real sectional convention) */}
            {/* KOXR */}
            <circle cx="290" cy="395" r="50" fill="none" stroke="#a8327a" strokeWidth="1.2" strokeDasharray="3 3" />
            <text x="290" y="380" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fontWeight="600" fill={C.ink}>KOXR</text>
            <text x="290" y="392" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill={C.ink}>OXNARD</text>
            <text x="290" y="403" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill="#a8327a">125.35</text>

            {/* KCMA */}
            <circle cx="365" cy="380" r="42" fill="none" stroke="#a8327a" strokeWidth="1.2" strokeDasharray="3 3" />
            <text x="365" y="368" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fontWeight="600" fill={C.ink}>KCMA</text>
            <text x="365" y="380" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill={C.ink}>CAMARILLO</text>

            {/* KSBA */}
            <circle cx="120" cy="320" r="48" fill="none" stroke="#a8327a" strokeWidth="1.2" strokeDasharray="3 3" />
            <text x="120" y="308" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fontWeight="600" fill={C.ink}>KSBA</text>
            <text x="120" y="320" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill={C.ink}>SANTA BARBARA</text>

            {/* VTU VORTAC */}
            <polygon points="225,355 235,355 240,365 230,375 220,365" fill="none" stroke={C.accentDeep} strokeWidth="1" />
            <circle cx="230" cy="365" r="2" fill={C.accentDeep} />
            <text x="245" y="368" fontSize="9" fontFamily="JetBrains Mono" fill={C.accentDeep}>VTU 108.20</text>

            {/* Fire perimeters — historical reference */}
            <path
              d="M 80 175 Q 180 165 270 195 Q 350 220 380 200 Q 420 175 450 195 Q 500 230 540 215 Q 580 195 540 170 Q 480 155 400 140 Q 300 130 200 145 Q 130 155 80 175 Z"
              fill="url(#hatchFire)"
              stroke={C.signal}
              strokeWidth="0.8"
              strokeOpacity="0.6"
            />
            <text x="290" y="185" fontSize="8" fontFamily="JetBrains Mono" fill={C.signal} fontWeight="600" letterSpacing="0.1em">
              THOMAS FIRE — DEC 2017 — 281,893 AC
            </text>

            <path
              d="M 380 230 Q 440 220 490 245 Q 520 265 510 285 Q 480 295 440 285 Q 400 270 380 250 Z"
              fill="url(#hatchFire)"
              stroke={C.signal}
              strokeWidth="0.8"
              strokeOpacity="0.6"
            />
            <text x="450" y="245" fontSize="7" fontFamily="JetBrains Mono" fill={C.signal} fontWeight="600">
              MOUNTAIN FIRE — NOV 2024
            </text>

            {/* Pier and Point coverage overlay — county boundary */}
            <path
              d="M 60 100 L 700 80 L 720 200 L 680 320 L 600 420 L 500 450 L 380 460 L 280 450 L 160 430 L 80 380 L 60 280 Z"
              fill={C.accent}
              fillOpacity="0.08"
              stroke={C.accent}
              strokeWidth="1.5"
              strokeDasharray="6 3"
            />
            <text x="380" y="105" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fontWeight="600" fill={C.accentDeep} letterSpacing="0.15em">
              PIER AND POINT — COVERAGE AREA
            </text>

            {/* Coordinate ticks (corner) */}
            <text x="8" y="14" fontSize="7" fontFamily="JetBrains Mono" fill={C.caption}>34°30′N</text>
            <text x="8" y="595" fontSize="7" fontFamily="JetBrains Mono" fill={C.caption}>33°45′N</text>
            <text x="730" y="14" fontSize="7" fontFamily="JetBrains Mono" fill={C.caption}>119°00′W</text>

            {/* Scale bar */}
            <g transform="translate(580, 580)">
              <line x1="0" y1="0" x2="160" y2="0" stroke={C.ink} strokeWidth="1" />
              <line x1="0" y1="-3" x2="0" y2="3" stroke={C.ink} strokeWidth="1" />
              <line x1="80" y1="-3" x2="80" y2="3" stroke={C.ink} strokeWidth="1" />
              <line x1="160" y1="-3" x2="160" y2="3" stroke={C.ink} strokeWidth="1" />
              <text x="80" y="-7" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill={C.ink}>20 NM</text>
            </g>

            {/* North arrow */}
            <g transform="translate(750, 50)">
              <polygon points="0,-15 5,5 0,0 -5,5" fill={C.ink} />
              <text x="0" y="20" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fontWeight="600" fill={C.ink}>N</text>
            </g>
          </svg>
        </div>

        {/* Legend / narrative column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
            <Mono style={{ fontSize: 9, letterSpacing: '0.2em', color: C.caption }}>
              LEGEND
            </Mono>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 14, height: 14, marginTop: 3, border: `1.5px dashed #a8327a`, borderRadius: '50%' }} />
            <div>
              <Mono style={{ fontSize: 10, color: C.ink, fontWeight: 600 }}>CLASS D AIRSPACE</Mono>
              <p style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 1.5, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
                KOXR (home), KCMA, KSBA. The towers I talk to.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 14, height: 14, marginTop: 3, background: `repeating-linear-gradient(45deg, ${C.signal} 0, ${C.signal} 1px, transparent 1px, transparent 3px)`, opacity: 0.6, border: `0.5px solid ${C.signal}` }} />
            <div>
              <Mono style={{ fontSize: 10, color: C.ink, fontWeight: 600 }}>HISTORICAL FIRE PERIMETER</Mono>
              <p style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 1.5, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
                Thomas (2017), Mountain (2024). The reason this isn't theoretical.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 14, height: 14, marginTop: 3, background: C.accent, opacity: 0.3, border: `1.5px dashed ${C.accent}` }} />
            <div>
              <Mono style={{ fontSize: 10, color: C.ink, fontWeight: 600 }}>PIER AND POINT COVERAGE</Mono>
              <p style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 1.5, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
                Daily civic news for the same polygon Watch Duty alerts on.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 14, height: 14, marginTop: 3, border: `1px solid ${C.accentDeep}`, transform: 'rotate(45deg)' }} />
            <div>
              <Mono style={{ fontSize: 10, color: C.ink, fontWeight: 600 }}>VTU VORTAC</Mono>
              <p style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 1.5, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
                Ventura. 108.20 MHz. Morse: …— ··— ·—
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 5 — SIGNAL CHAIN (skills as DAW chain)
// =============================================================================
function SignalChain() {
  const { ref, booted } = useScrollBoot<HTMLElement>();
  const chain = [
    {
      stage: 'INPUT',
      label: 'Raw Material',
      items: [
        { k: 'TRAINING', v: 'COMM/IFR · Berklee · self-taught dev' },
        { k: 'GEOGRAPHY', v: 'Ventura — coastal, fire-prone' },
        { k: 'TASTE', v: 'Nordic-coastal · editorial · restrained' },
      ],
    },
    {
      stage: 'PROCESS',
      label: 'Practice Loops',
      items: [
        { k: 'OVERLOOK STRATEGY', v: 'Brand systems · web' },
        { k: 'OVERLOOK AUDIO', v: 'Mix/master · Riptide MIDI' },
        { k: 'PIER AND POINT', v: 'Civic editorial ops' },
      ],
    },
    {
      stage: 'OUTPUT',
      label: 'Deliverables',
      items: [
        { k: 'SHIPPED WEBSITES', v: 'Næsbjerg · Rustler · Three Altitudes' },
        { k: 'MIXES + HARDWARE', v: 'Indie/alt-pop records · MIDI pedal R&D' },
        { k: 'PUBLIC INFORMATION', v: 'Daily VC civic news, vetted' },
      ],
    },
  ];

  return (
    <section id="signal-chain" ref={ref} data-boot={booted ? 'on' : 'off'} className="section-viewport" style={{ background: C.bg, padding: '12vh 24px 12vh' }}>
      <Reveal>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Eyebrow>SIGNAL CHAIN — INPUT / PROCESS / OUTPUT</Eyebrow>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>PG 05 / 07</Mono>
        </div>
        <Hairline />
        <h2 className="section-headline" style={{ color: C.ink, margin: '24px 0 32px 0', maxWidth: '18ch' }}>
          The way a <em>clean mix</em> gets made.
        </h2>
      </Reveal>

      <div
        className="signal-grid"
        style={{
          display: 'grid',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        {chain.map((c, idx) => (
          <div key={c.stage} style={{ display: 'contents' }}>
            <div
              style={{
                border: `1px solid ${C.ink}`,
                background: C.bgElev,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  background: C.ink,
                  color: C.bg,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Mono style={{ fontSize: 11, letterSpacing: '0.25em', fontWeight: 600 }}>
                  {c.stage}
                </Mono>
                <Mono style={{ fontSize: 9, color: '#8fc4c1', letterSpacing: '0.15em' }}>
                  {String(idx + 1).padStart(2, '0')}
                </Mono>
              </div>
              <div style={{ padding: 16, flex: 1 }}>
                <p style={{ fontFamily: "var(--font-libre-caslon), Georgia, serif", fontSize: 18, fontStyle: 'italic', color: C.ink, margin: 0, marginBottom: 16 }}>
                  {c.label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {c.items.map((item) => (
                    <div key={item.k}>
                      <Mono style={{ fontSize: 9, letterSpacing: '0.2em', color: C.accentDeep }}>
                        {item.k}
                      </Mono>
                      <p style={{ fontSize: 13, color: C.ink, margin: '4px 0 0 0', lineHeight: 1.4, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
                        {item.v}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {idx < chain.length - 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="16" height="20" viewBox="0 0 16 20">
                  <line x1="0" y1="10" x2="14" y2="10" stroke={C.ink} strokeWidth="1" />
                  <polygon points="10,6 16,10 10,14" fill={C.ink} />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6, marginTop: 24, maxWidth: 720, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <Mono style={{ fontSize: 9, letterSpacing: '0.2em', color: C.caption, marginRight: 8 }}>
          BUS NOTE
        </Mono>
        The chain compounds. Aviation training disciplines the brand work.
        Brand discipline cleans the audio production. Audio production trains the ear
        that reads civic information for tone. Civic information is rehearsal for
        Watch Duty.
      </p>
    </section>
  );
}

// =============================================================================
// SECTION 6 — WIND ROSE / SKILL POLAR
// =============================================================================
function WindRose() {
  const { ref, booted } = useScrollBoot<HTMLElement>();
  // 8 cardinal/intercardinal bars representing skill distribution
  // The polar shape doubles as a wind rose (aviation) and EQ polar plot (audio)
  const spokes = [
    { angle: 0, mag: 95, label: 'AVIATION', sub: 'COMM/IFR' },
    { angle: 45, mag: 88, label: 'BRAND', sub: 'TYPOGRAPHY / SYSTEMS' },
    { angle: 90, mag: 82, label: 'WEB DEV', sub: 'NEXT.JS / REACT' },
    { angle: 135, mag: 78, label: 'MUSIC PROD', sub: 'MIX / MASTER' },
    { angle: 180, mag: 70, label: 'HARDWARE', sub: 'RIPTIDE MIDI' },
    { angle: 225, mag: 92, label: 'CIVIC OPS', sub: 'PIER AND POINT' },
    { angle: 270, mag: 65, label: 'MUSIC SUPV', sub: 'BERKLEE' },
    { angle: 315, mag: 86, label: 'COASTAL', sub: 'VENTURA NATIVE' },
  ];

  const cx = 200;
  const cy = 200;
  const maxR = 140;

  // helpers
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180; // 0deg = up
  const pointAt = (angle: number, r: number): [number, number] => [cx + r * Math.cos(toRad(angle)), cy + r * Math.sin(toRad(angle))];

  return (
    <section id="wind-rose" ref={ref} data-boot={booted ? 'on' : 'off'} className="section-viewport" style={{ background: C.bg, padding: '12vh 24px 12vh' }}>
      <Reveal>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Eyebrow>POLAR — CAPABILITY ROSE</Eyebrow>
          <Mono style={{ fontSize: 9, color: C.caption, letterSpacing: '0.2em' }}>PG 06 / 07</Mono>
        </div>
        <Hairline />
        <h2 className="section-headline" style={{ color: C.ink, margin: '24px 0 32px 0', maxWidth: '18ch' }}>
          A <em>wind rose</em>. Also an EQ polar plot. Also me.
        </h2>
      </Reveal>

      <div
        className="rose-grid"
        style={{
          border: `1px solid ${C.ink}`,
          background: C.bgElev,
          padding: 24,
          display: 'grid',
          gap: 32,
          alignItems: 'center',
        }}
      >
        <div>
          <svg viewBox="0 0 400 400" style={{ width: '100%', height: 'auto', maxWidth: 400 }}>
            {/* Concentric rings */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <circle
                key={f}
                cx={cx}
                cy={cy}
                r={maxR * f}
                fill="none"
                stroke={C.border}
                strokeWidth="0.5"
                strokeDasharray={f === 1 ? '0' : '2 4'}
              />
            ))}

            {/* Spoke axes */}
            {spokes.map((s) => {
              const [x, y] = pointAt(s.angle, maxR);
              return (
                <line
                  key={s.angle}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke={C.border}
                  strokeWidth="0.5"
                />
              );
            })}

            {/* Filled polygon connecting magnitude points */}
            <polygon
              className="rose-poly"
              data-drawn={booted ? 'true' : 'false'}
              points={spokes.map((s) => pointAt(s.angle, (s.mag / 100) * maxR).join(',')).join(' ')}
              fill={C.accent}
              fillOpacity="0.18"
              stroke={C.accent}
              strokeWidth="1.5"
            />

            {/* Magnitude dots */}
            {spokes.map((s) => {
              const [x, y] = pointAt(s.angle, (s.mag / 100) * maxR);
              return <circle key={s.label} cx={x} cy={y} r="3" fill={C.ink} />;
            })}

            {/* Cardinal labels (N E S W) */}
            {[
              { a: 0, l: 'N' },
              { a: 90, l: 'E' },
              { a: 180, l: 'S' },
              { a: 270, l: 'W' },
            ].map((d) => {
              const [x, y] = pointAt(d.a, maxR + 16);
              return (
                <text
                  key={d.l}
                  x={x}
                  y={y + 3}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="JetBrains Mono"
                  fontWeight="600"
                  fill={C.caption}
                >
                  {d.l}
                </text>
              );
            })}

            {/* Center marker */}
            <circle cx={cx} cy={cy} r="2" fill={C.ink} />

            {/* Skill labels at each spoke */}
            {spokes.map((s) => {
              const [x, y] = pointAt(s.angle, maxR + 38);
              return (
                <g key={`label-${s.label}`}>
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    fontSize="9"
                    fontFamily="JetBrains Mono"
                    fontWeight="600"
                    fill={C.ink}
                    letterSpacing="0.1em"
                  >
                    {s.label}
                  </text>
                  <text
                    x={x}
                    y={y + 11}
                    textAnchor="middle"
                    fontSize="7"
                    fontFamily="JetBrains Mono"
                    fill={C.caption}
                    letterSpacing="0.1em"
                  >
                    {s.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontFamily: "var(--font-libre-caslon), Georgia, serif", fontSize: 22, fontStyle: 'italic', color: C.ink, lineHeight: 1.4, margin: 0 }}>
            “No single peak. The shape itself is the point.”
          </p>
          <p style={{ fontSize: 14, color: C.inkMuted, lineHeight: 1.6, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
            A skill rose is most useful when the perimeter doesn't collapse to
            a single spoke. Watch Duty's reporter corps draws strength from
            exactly this kind of overlap: pilots who can also write, scanner
            listeners who can also map, dispatchers who can also lead.
          </p>
          <div style={{ paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <Mono style={{ fontSize: 9, letterSpacing: '0.2em', color: C.caption }}>
              READING THE PLOT
            </Mono>
            <p style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6, marginTop: 6, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
              The two strongest spokes (AVIATION at N and CIVIC OPS at SW) are
              the foundation. The rest form the support structure: design and
              dev to ship surfaces, audio to train the ear, hardware to keep
              the hands busy.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 7 — PRE-FLIGHT CHECKLIST (the pitch / CTA)
// =============================================================================
function PreFlightChecklist() {
  const { ref, booted } = useScrollBoot<HTMLElement>();
  const [handshaking, setHandshaking] = useState(false);
  const handleClearance = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.href;
    if (handshaking) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setHandshaking(true);
    playHandshake(() => {
      setHandshaking(false);
      window.location.href = href;
    });
  };
  const items = [
    { k: 'COMMERCIAL PILOT CERTIFICATE', v: 'ISSUED — ASEL / IFR', state: true },
    { k: 'AGENCY OPERATIONAL', v: 'OVERLOOK STRATEGY — ACTIVE CLIENTS', state: true },
    { k: 'AUDIO STUDIO OPERATIONAL', v: 'OVERLOOK AUDIO — MIX / MASTER / HW', state: true },
    { k: 'CIVIC NEWS PUBLISHED DAILY', v: 'PIER AND POINT — VENTURA COUNTY', state: true },
    { k: 'BERKLEE COURSEWORK IN PROGRESS', v: 'MUSIC SUPV / SCRIPT ANALYSIS', state: true },
    { k: 'LOCAL TO FIRE COUNTRY', v: 'VENTURA — THOMAS FIRE / MOUNTAIN FIRE', state: true },
    { k: 'CAL FIRE PILOT TRAJECTORY', v: 'FILED — IN CLIMB', state: true },
    { k: 'WATCH DUTY CONTACT INITIATED', v: 'PENDING — REQUEST CLEARANCE', state: false },
  ];

  const allComplete = items.every((i) => i.state);

  return (
    <section id="checklist" ref={ref} data-boot={booted ? 'on' : 'off'} className="section-viewport" style={{ background: C.ink, color: C.bg, padding: '14vh 24px 10vh', position: 'relative' }}>
      {/* Optional noise grain overlay — the brand's texture move on dark heroes */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.04,
          pointerEvents: 'none',
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'120\' height=\'120\' filter=\'url(%23n)\'/></svg>")',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, position: 'relative' }}>
        <Eyebrow tone="inverse">PRE-FLIGHT CHECKLIST — CTA</Eyebrow>
        <Mono style={{ fontSize: 9, color: '#8fc4c1', letterSpacing: '0.2em' }}>
          PG 07 / 07
        </Mono>
      </div>
      <Hairline color={C.bg} opacity={0.4} />
      <h2
        className="section-headline"
        style={{
          color: C.bg,
          margin: '24px 0 32px 0',
          position: 'relative',
        }}
      >
        <em>Holding short.</em> Ready for clearance.
      </h2>

      <div
        style={{
          border: `1px solid ${C.bg}`,
          background: 'transparent',
          position: 'relative',
        }}
      >
        <div
          style={{
            padding: '10px 16px',
            borderBottom: `1px solid ${C.bg}`,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <Mono style={{ fontSize: 10, letterSpacing: '0.25em', color: '#8fc4c1' }}>
            CHECKLIST — N-FINN-1 BEFORE TAKEOFF
          </Mono>
          <Mono style={{ fontSize: 10, letterSpacing: '0.25em', color: '#8fc4c1' }}>
            08 ITEMS
          </Mono>
        </div>

        {items.map((item, i) => (
          <div
            key={item.k}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto auto',
              gap: 16,
              alignItems: 'center',
              padding: '14px 16px',
              borderBottom: `1px solid ${C.bg}`,
              borderBottomColor: 'rgba(251, 250, 247, 0.2)',
            }}
          >
            {/* Checkbox */}
            <div
              style={{
                width: 14,
                height: 14,
                border: `1.5px solid ${C.bg}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: item.state ? '#8fc4c1' : 'transparent',
              }}
            >
              {item.state && (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <polyline
                    points="1,5 4,8 9,2"
                    fill="none"
                    stroke={C.ink}
                    strokeWidth="2"
                  />
                </svg>
              )}
            </div>

            <Mono style={{ fontSize: 12, color: C.bg, letterSpacing: '0.1em', fontWeight: 500 }}>
              {item.k}
            </Mono>

            <Mono style={{ fontSize: 11, color: item.state ? '#8fc4c1' : '#e8d9bf', letterSpacing: '0.1em' }}>
              {item.v}
            </Mono>

            <Mono
              style={{
                fontSize: 10,
                letterSpacing: '0.2em',
                color: item.state ? '#8fc4c1' : C.bg,
                fontWeight: 600,
              }}
            >
              {item.state ? 'CHECK' : 'PENDING'}
            </Mono>
          </div>
        ))}

        <div
          style={{
            padding: '20px 16px',
            background: 'rgba(143, 196, 193, 0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <Mono style={{ fontSize: 10, letterSpacing: '0.25em', color: '#8fc4c1' }}>
              REQUEST FROM N-FINN-1
            </Mono>
            <p style={{ fontFamily: "var(--font-libre-caslon), Georgia, serif", fontSize: 20, color: C.bg, margin: '6px 0 0 0', fontStyle: 'italic' }}>
              "Watch Duty tower, N-FINN-1, ready for clearance."
            </p>
          </div>
          <a
            href="mailto:finn@overlookstrategy.com?subject=Re: N-FINN-1 — request clearance"
            onClick={handleClearance}
            className="cta-handshake"
            data-active={handshaking ? 'true' : 'false'}
            aria-busy={handshaking}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              background: C.bg,
              color: C.ink,
              padding: '14px 28px',
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              border: `2px solid ${C.bg}`,
              transition: 'background 200ms ease-out, color 200ms ease-out',
            }}
          >
            <span>{handshaking ? 'KEYING MIC…' : 'CLEAR FOR APPROACH'}</span>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <line x1="0" y1="7" x2="12" y2="7" stroke={C.ink} strokeWidth="1.5" />
              <polyline points="8,3 12,7 8,11" fill="none" stroke={C.ink} strokeWidth="1.5" />
            </svg>
          </a>
        </div>
      </div>

      {/* Three-way contact rail */}
      <div
        className="contact-rail"
        style={{
          marginTop: 32,
          display: 'grid',
          gap: 16,
          position: 'relative',
        }}
      >
        {[
          { f: '121.500', l: 'EMERGENCY', v: 'finn@overlookstrategy.com' },
          { f: '125.350', l: 'AGENCY', v: 'overlookstrategy.com' },
          { f: '127.250', l: 'CIVIC', v: 'pierandpoint.com' },
        ].map((c) => (
          <div
            key={c.l}
            style={{
              border: `1px solid rgba(251,250,247,0.3)`,
              padding: 16,
            }}
          >
            <Mono style={{ fontSize: 9, letterSpacing: '0.25em', color: '#8fc4c1' }}>
              {c.l}
            </Mono>
            <div style={{ marginTop: 6 }}>
              <Mono style={{ fontSize: 18, color: C.bg, fontWeight: 600 }}>
                {c.f}
              </Mono>
            </div>
            <div style={{ marginTop: 4 }}>
              <Mono style={{ fontSize: 11, color: '#e2e4e1' }}>{c.v}</Mono>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// FOOTER — METAR-style status line
// =============================================================================
function MetarFooter() {
  const { data: metar } = useMetar();
  const rawOb =
    metar?.rawOb ?? 'KOXR ………Z ………… 10SM CLR …/… A…… RMK TUNING';
  return (
    <footer style={{ background: C.ink, color: C.bg, padding: '24px 24px 32px' }}>
      <Hairline color={C.bg} opacity={0.2} />
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Mono style={{ fontSize: 10, letterSpacing: '0.25em', color: '#8fc4c1' }}>
            METAR — KOXR (LIVE)
          </Mono>
          <div style={{ marginTop: 8 }}>
            <Mono style={{ fontSize: 14, color: C.bg, letterSpacing: '0.08em' }}>
              {rawOb}
            </Mono>
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: '#e2e4e1', fontFamily: 'var(--font-inter), system-ui, sans-serif', lineHeight: 1.6, maxWidth: 540 }}>
            Pulled from aviationweather.gov every 5 minutes. The same source a
            pilot files an IFR flight plan against. Remarks: mission ready.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Mono style={{ fontSize: 10, letterSpacing: '0.25em', color: '#8fc4c1' }}>
            DOCUMENT
          </Mono>
          <div style={{ marginTop: 6 }}>
            <Mono style={{ fontSize: 11, color: C.bg, lineHeight: 1.6 }}>
              FBN-26-05 — REV 19 MAY 2026
              <br />
              FILED FROM 34°16′28″N 119°13′44″W
              <br />
              VENTURA COUNTY, CALIFORNIA
              <br />
              <span style={{ color: '#e8d9bf' }}>
                © 2026 FINN BENNETT — OVERLOOK STRATEGY
              </span>
            </Mono>
          </div>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// ROOT
// =============================================================================
export default function App() {
  const phase = useBootSequence();
  return (
    <div
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100vh',
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      <PinnedRail phase={phase} />
      <BriefingStrip phase={phase} />
      <DescentProfile />
      <FrequencyBand />
      <SectionalExcerpt />
      <SignalChain />
      <WindRose />
      <PreFlightChecklist />
      <MetarFooter />
    </div>
  );
}
