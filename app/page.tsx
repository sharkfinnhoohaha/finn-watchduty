'use client';

import { useEffect, useRef, useState } from 'react';

type PulseKind = 'ambient' | 'radial' | 'sweep' | 'beat' | 'grid';

interface Ember {
  x: number;
  y: number;
  size: number;
  phase: number;
  freq: number;
  brightness: number;
}

interface Pulse {
  kind: PulseKind;
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  decay: number;
  strength: number;
  angle?: number;
  arc?: number;
  vAngle?: number;
}

function halton(i: number, b: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Ember[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, in: false, lastEmit: 0 });
  const wordRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [now, setNow] = useState<string>('');
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const z = (n: number) => String(n).padStart(2, '0');
      setNow(`${z(d.getUTCHours())}${z(d.getUTCMinutes())}Z`);
    };
    tick();
    const i = setInterval(tick, 20000);
    const b = setTimeout(() => setBooted(true), 60);
    return () => { clearInterval(i); clearTimeout(b); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const place = (w: number, h: number) => {
      const count = Math.min(360, Math.max(140, Math.floor((w * h) / 5200)));
      const embers: Ember[] = [];
      for (let i = 0; i < count; i++) {
        embers.push({
          x: halton(i + 1, 2) * w,
          y: halton(i + 1, 3) * h,
          size: 0.7 + halton(i + 1, 5) * 1.3,
          phase: halton(i + 1, 7) * Math.PI * 2,
          freq: 0.3 + halton(i + 1, 11) * 0.7,
          brightness: 0,
        });
      }
      embersRef.current = embers;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      place(rect.width, rect.height);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();

    const draw = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (!reduced && mouseRef.current.in && t - mouseRef.current.lastEmit > 320) {
        pulsesRef.current.push({
          kind: 'ambient',
          x: mouseRef.current.x,
          y: mouseRef.current.y,
          r: 0,
          vr: 200,
          life: 1,
          decay: 0.55,
          strength: 0.55,
        });
        mouseRef.current.lastEmit = t;
      }

      pulsesRef.current = pulsesRef.current.filter((p) => p.life > 0.01);
      for (const p of pulsesRef.current) {
        p.r += p.vr * dt;
        p.life -= dt * p.decay;
        if (p.vAngle !== undefined && p.angle !== undefined) {
          p.angle += p.vAngle * dt;
        }
      }

      const embers = embersRef.current;
      for (const e of embers) {
        let boost = 0;
        for (const p of pulsesRef.current) {
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          const sigma = p.kind === 'beat' ? 22 : 38;
          const band = Math.exp(-((d - p.r) ** 2) / (2 * sigma * sigma));
          let mask = 1;
          if (p.kind === 'sweep' && p.angle !== undefined && p.arc !== undefined) {
            const a = Math.atan2(dy, dx);
            let diff = a - p.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const half = p.arc / 2;
            mask = diff > -half && diff < half
              ? Math.cos((diff / half) * (Math.PI / 2))
              : 0;
          } else if (p.kind === 'grid') {
            const ang = Math.atan2(dy, dx);
            const ax = Math.abs(Math.cos(ang));
            const ay = Math.abs(Math.sin(ang));
            mask = Math.max(ax, ay) ** 6;
          }
          boost += band * mask * p.life * p.strength;
        }
        const target = Math.min(1.1, boost);
        e.brightness += (target - e.brightness) * Math.min(1, dt * 5.5);
      }

      const tt = t / 1000;
      for (const e of embers) {
        const flicker = 0.35 + 0.18 * Math.sin(tt * e.freq + e.phase);
        const baseAlpha = 0.14 * flicker;
        ctx.fillStyle = `rgba(14,36,57,${baseAlpha})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
        const lit = e.brightness;
        if (lit > 0.03) {
          const rad = e.size + 9 * lit;
          const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rad);
          grad.addColorStop(0, `rgba(232,93,26,${Math.min(0.8, 0.75 * lit)})`);
          grad.addColorStop(1, 'rgba(232,93,26,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(e.x, e.y, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(232,93,26,${Math.min(1, lit * 1.1)})`;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size * 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const p of pulsesRef.current) {
        if (p.kind === 'ambient' || p.kind === 'radial') {
          ctx.strokeStyle = `rgba(232,93,26,${0.14 * p.life})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.in = true;
    };
    const onLeave = () => {
      mouseRef.current.in = false;
    };
    const onClick = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pulsesRef.current.push({
        kind: 'radial',
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        r: 0,
        vr: 360,
        life: 1.3,
        decay: 0.45,
        strength: 1.2,
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onClick);
    };
  }, []);

  const emitFromWord = (key: string, kind: PulseKind) => {
    const el = wordRefs.current[key];
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const wr = el.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const x = wr.left + wr.width / 2 - cr.left;
    const y = wr.top + wr.height / 2 - cr.top;

    if (kind === 'grid') {
      pulsesRef.current.push({
        kind: 'grid',
        x, y, r: 0, vr: 520, life: 1.4, decay: 0.5, strength: 1.3,
      });
    } else if (kind === 'sweep') {
      pulsesRef.current.push({
        kind: 'sweep',
        x, y, r: Math.max(cr.width, cr.height) * 0.6,
        vr: 0,
        life: 1.8, decay: 0.32, strength: 1.5,
        angle: -Math.PI / 2,
        vAngle: Math.PI * 1.4,
        arc: Math.PI / 4,
      });
      pulsesRef.current.push({
        kind: 'radial',
        x, y, r: 0, vr: 280, life: 1, decay: 0.6, strength: 0.7,
      });
    } else if (kind === 'beat') {
      const spawn = (delay: number, str: number) =>
        setTimeout(() => {
          pulsesRef.current.push({
            kind: 'beat',
            x, y, r: 0, vr: 460, life: 0.9, decay: 0.85, strength: str,
          });
        }, delay);
      spawn(0, 1.4);
      spawn(180, 1.2);
      spawn(360, 1.0);
    }
  };

  const signals = [
    {
      key: 'web',
      kind: 'grid' as const,
      headline: 'I build the web.',
      aside:
        'Next.js · React · TypeScript. Hand-written canvas, motion, design systems. Every dot and pulse on this page is mine.',
    },
    {
      key: 'flight',
      kind: 'sweep' as const,
      headline: 'I fly commercially.',
      aside:
        'Commercial / IFR, ASEL. I read sectionals and talk to towers. I understand the airspace you alert beneath.',
    },
    {
      key: 'news',
      kind: 'beat' as const,
      headline: 'I run a daily public-info desk.',
      aside:
        'A hyperlocal civic news operation for the same Ventura County polygon Watch Duty already watches. Vetted, fast, calm.',
    },
  ];

  return (
    <main className="root" data-booted={booted ? 'on' : 'off'}>
      <canvas ref={canvasRef} className="field" aria-hidden="true" />

      <header className="top">
        <div className="row">
          <span className="name">Finn Bennett</span>
          <span className="sep">·</span>
          <span className="muted">Ventura County, CA</span>
        </div>
        <div className="row">
          <span className="muted">KOXR 34.27°N · 119.23°W</span>
          <span className="sep">·</span>
          <span className="muted mono clock">{now || '— — — —'}</span>
        </div>
      </header>

      <section className="middle" aria-label="Three signals">
        <p className="lede">
          Three signals from one operator. <em>Hover each.</em>
        </p>
        <ul className="signals">
          {signals.map((s) => (
            <li key={s.key}>
              <span
                ref={(el) => { wordRefs.current[s.key] = el; }}
                className="word"
                role="button"
                tabIndex={0}
                onMouseEnter={() => emitFromWord(s.key, s.kind)}
                onFocus={() => emitFromWord(s.key, s.kind)}
                onClick={() => emitFromWord(s.key, s.kind)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    emitFromWord(s.key, s.kind);
                  }
                }}
              >
                {s.headline}
              </span>
              <span className="aside">{s.aside}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="bot">
        <span className="muted">For Watch Duty —</span>
        <a className="mail" href="mailto:finn@overlookstrategy.com">
          finn@overlookstrategy.com
        </a>
      </footer>
    </main>
  );
}
