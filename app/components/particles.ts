// Animated wind-flow overlay: thousands of particles advected through the
// interpolated velocity field and drawn as fading trails on a 2-D canvas that
// sits above a MapLibre map. Particles live in geographic coordinates and are
// re-projected to the screen each frame, so they stay locked to the map.

import type { Map as MlMap } from "maplibre-gl";
import type { Sampler } from "@/app/lib/interpolate";
import type { Bbox, Vec } from "@/app/lib/types";
import { rampColor, rgbCss } from "@/app/lib/colormap";

type Particle = { lon: number; lat: number; age: number; life: number };

/** The field to advect through, plus the speed (km/h) that maps to the top colour. */
export type FieldSpec = {
  /** Velocity field the particles are advected through (sets motion direction/speed). */
  sampler: Sampler;
  /** Speed (km/h) mapping to the top colour, when `colorScalar` is absent. */
  scaleKmh: number;
  /**
   * Optional scalar field used to COLOUR particles instead of their advection
   * speed — e.g. the model↔vane disagreement magnitude. Lets the flow keep a
   * meaningful direction (the real wind) while the glow encodes the gap.
   */
  colorScalar?: (lon: number, lat: number, vec: Vec) => number;
  /** Value (same units as colorScalar) mapping to the top colour. */
  colorScale?: number;
};

export type ParticleOptions = {
  count: number;
  speedScale: number; // geographic step per second per (km/h)
  fade: number; // alpha removed from trails each frame (higher = shorter trails)
  lineWidth: number;
};

const DEFAULTS: ParticleOptions = {
  count: 2800,
  speedScale: 0.12,
  fade: 0.07,
  lineWidth: 1.3,
};

export class ParticleField {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: MlMap;
  private bbox: Bbox;
  private spec: FieldSpec;
  private opts: ParticleOptions;
  private particles: Particle[] = [];
  private raf = 0;
  private last = 0;
  private running = false;
  private moving = false;
  private clearPending = true;
  private readonly onResize = () => this.resize();
  private readonly onMoveStart = () => { this.moving = true; };
  private readonly onMoveEnd = () => { this.moving = false; this.clearPending = true; };

  constructor(
    canvas: HTMLCanvasElement,
    map: MlMap,
    bbox: Bbox,
    spec: FieldSpec,
    opts?: Partial<ParticleOptions>,
  ) {
    this.canvas = canvas;
    this.map = map;
    this.bbox = bbox;
    this.spec = spec;
    this.opts = { ...DEFAULTS, ...opts };
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    this.seed();
    map.on("resize", this.onResize);
    map.on("movestart", this.onMoveStart);
    map.on("moveend", this.onMoveEnd);
  }

  setField(spec: FieldSpec) {
    this.spec = spec;
    this.clearPending = true;
  }

  setOptions(opts: Partial<ParticleOptions>) {
    const prevCount = this.opts.count;
    this.opts = { ...this.opts, ...opts };
    if (opts.count != null && opts.count !== prevCount) this.seed();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const el = this.map.getContainer();
    this.canvas.width = Math.round(el.clientWidth * dpr);
    this.canvas.height = Math.round(el.clientHeight * dpr);
    this.canvas.style.width = `${el.clientWidth}px`;
    this.canvas.style.height = `${el.clientHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clearPending = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(clear = false) {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (clear) this.clearAll();
  }

  destroy() {
    this.stop();
    this.map.off("resize", this.onResize);
    this.map.off("movestart", this.onMoveStart);
    this.map.off("moveend", this.onMoveEnd);
  }

  private rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  private spawn(p: Particle) {
    p.lon = this.rand(this.bbox.west, this.bbox.east);
    p.lat = this.rand(this.bbox.south, this.bbox.north);
    p.age = 0;
    p.life = this.rand(1.4, 4.2);
  }

  private seed() {
    this.particles = [];
    for (let i = 0; i < this.opts.count; i++) {
      const p: Particle = { lon: 0, lat: 0, age: 0, life: 0 };
      this.spawn(p);
      p.age = Math.random() * p.life; // desynchronize lifetimes
      this.particles.push(p);
    }
  }

  private clearAll() {
    const { width, height } = this.canvas;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.restore();
  }

  private tick = (ts: number) => {
    if (!this.running) return;
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);

    const ctx = this.ctx;
    const el = this.map.getContainer();
    const w = el.clientWidth;
    const h = el.clientHeight;

    // While interacting, clear fully each frame so trails don't smear; otherwise
    // erase a little alpha for the fading-trail look.
    if (this.clearPending || this.moving) {
      this.clearAll();
      this.clearPending = false;
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${this.opts.fade})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = this.opts.lineWidth;
    ctx.lineCap = "round";

    const { sampler, scaleKmh, colorScalar, colorScale } = this.spec;
    const colorDenom = (colorScalar ? (colorScale ?? scaleKmh) : scaleKmh) || 1;
    const map = this.map;
    const { west, east, south, north } = this.bbox;

    for (const p of this.particles) {
      const lon0 = p.lon;
      const lat0 = p.lat;
      const a = map.project([lon0, lat0]);
      const vec = sampler(lon0, lat0);
      const sp = Math.hypot(vec.u, vec.v);
      // Colour by the scalar field if given (e.g. disagreement), else by speed.
      // Sampled at the pre-move position so colour and motion stay consistent.
      const colorVal = colorScalar ? colorScalar(lon0, lat0, vec) : sp;

      const dLat = 1 / 110.57;
      const dLon = 1 / (111.32 * Math.cos((lat0 * Math.PI) / 180));
      const step = dt * this.opts.speedScale;
      p.lon += vec.u * step * dLon;
      p.lat += vec.v * step * dLat;
      p.age += dt;

      const b = map.project([p.lon, p.lat]);
      const t = Math.min(colorVal / colorDenom, 1);
      ctx.strokeStyle = rgbCss(rampColor(t), 0.55 + 0.45 * t);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      if (
        p.age > p.life ||
        p.lon < west || p.lon > east || p.lat < south || p.lat > north
      ) {
        this.spawn(p);
      }
    }

    this.raf = requestAnimationFrame(this.tick);
  };
}
