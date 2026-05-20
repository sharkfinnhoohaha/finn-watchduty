"use client";

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function envelope(
  gain: GainNode,
  start: number,
  duration: number,
  peak = 0.18,
  attack = 0.005,
  release = 0.015
) {
  const a = getCtx()!;
  gain.gain.cancelScheduledValues(start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, start + Math.max(attack, duration - release));
  gain.gain.linearRampToValueAtTime(0, start + duration);
  void a;
}

function tone(start: number, duration: number, freq = 600, peak = 0.18) {
  const a = getCtx();
  if (!a || muted) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(g).connect(a.destination);
  envelope(g, start, duration, peak);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

// KOXR's Morse ident is "OXR" — O=---, X=-..-, R=.-.
const MORSE: Record<string, string> = {
  O: "---",
  X: "-..-",
  R: ".-.",
};

let morsePlaying = false;
export function playKoxrIdent() {
  const a = getCtx();
  if (!a || muted || morsePlaying) return;
  morsePlaying = true;
  const dit = 0.07;
  const dah = dit * 3;
  const symbolGap = dit;
  const letterGap = dit * 3;
  let t = a.currentTime + 0.02;
  const ident = "OXR";
  for (let li = 0; li < ident.length; li++) {
    const code = MORSE[ident[li]];
    for (let si = 0; si < code.length; si++) {
      const dur = code[si] === "-" ? dah : dit;
      tone(t, dur, 620, 0.16);
      t += dur + symbolGap;
    }
    t += letterGap - symbolGap;
  }
  const totalMs = (t - a.currentTime) * 1000;
  setTimeout(() => {
    morsePlaying = false;
  }, totalMs + 50);
}

// Brief noise burst — squelch open
function noiseBurst(start: number, duration: number, peak = 0.08) {
  const a = getCtx();
  if (!a || muted) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;
  const g = a.createGain();
  src.connect(filter).connect(g).connect(a.destination);
  envelope(g, start, duration, peak, 0.002, 0.04);
  src.start(start);
  src.stop(start + duration + 0.05);
}

let handshakePlaying = false;
export function playHandshake(onDone?: () => void) {
  const a = getCtx();
  if (!a || muted) {
    onDone?.();
    return;
  }
  if (handshakePlaying) return;
  handshakePlaying = true;
  const t0 = a.currentTime + 0.02;
  // Squelch open
  noiseBurst(t0, 0.12, 0.06);
  // Short ack beep
  tone(t0 + 0.18, 0.22, 880, 0.14);
  // Brief mic key click + small noise tail
  noiseBurst(t0 + 0.5, 0.08, 0.04);
  // Confirm tone (lower)
  tone(t0 + 0.7, 0.18, 520, 0.12);
  const totalMs = 1100;
  setTimeout(() => {
    handshakePlaying = false;
    onDone?.();
  }, totalMs);
}

// Soft single click — used for boot tick / hover ack if needed
export function clickTick() {
  const a = getCtx();
  if (!a || muted) return;
  noiseBurst(a.currentTime + 0.005, 0.025, 0.05);
}
