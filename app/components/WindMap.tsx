"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { REGION } from "@/app/data/region";
import type { FieldMode, Station, WindPayload } from "@/app/lib/types";
import {
  correctedSampler,
  differenceSampler,
  estimateMaxSpeed,
  idwSampler,
  makeProjector,
  modelSampler,
  stationVec,
} from "@/app/lib/interpolate";
import { angleDiff, cToF, compass, kmhToMph, toSpeedDir } from "@/app/lib/wind";
import { rgbCss, speedColor } from "@/app/lib/colormap";
import { ParticleField } from "@/app/components/particles";
import { Panel, type StationCompare } from "@/app/components/Panel";
import { Legend } from "@/app/components/Legend";

// Esri World Imagery — keyless satellite tiles, matching Watch Duty's basemap.
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    "esri-labels": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: "imagery", type: "raster", source: "esri-imagery" },
    { id: "labels", type: "raster", source: "esri-labels", paint: { "raster-opacity": 0.85 } },
  ],
};

export default function WindMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vanesRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fieldRef = useRef<ParticleField | null>(null);

  const [ready, setReady] = useState(false);
  const [payload, setPayload] = useState<WindPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshKey, setRefreshKey] = useState(0);

  const [mode, setMode] = useState<FieldMode>("corrected");
  const [radiusKm, setRadiusKm] = useState(REGION.defaultRadiusKm);
  const [showFlow, setShowFlow] = useState(true);
  const [showVanes, setShowVanes] = useState(true);

  // ---- Initialize the map once ------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | undefined;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: REGION.center,
        zoom: REGION.zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.fitBounds(
        [
          [REGION.bbox.west, REGION.bbox.south],
          [REGION.bbox.east, REGION.bbox.north],
        ],
        { padding: 36, duration: 0 },
      );
      map.on("load", () => {
        if (cancelled) return;
        map!.resize(); // container may have sized after style init
        mapRef.current = map!;
        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      if (fieldRef.current) {
        fieldRef.current.destroy();
        fieldRef.current = null;
      }
      if (map) map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // ---- Fetch live wind data ---------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch("/api/wind")
      .then((r) => r.json())
      .then((d: WindPayload) => {
        if (cancelled) return;
        setPayload(d);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // ---- Build samplers + station comparison from the data ----------------
  const data = useMemo(() => {
    if (!payload) return null;
    const { stations, model, bbox, center } = payload;
    const proj = makeProjector(center[0], center[1]);
    const background = model ? modelSampler(model) : idwSampler(stations, proj);
    const corrected = correctedSampler(background, stations, proj, radiusKm);
    const difference = differenceSampler(background, corrected);

    const sharedMax = Math.max(
      estimateMaxSpeed(background, bbox),
      estimateMaxSpeed(corrected, bbox),
      1,
    );
    const maxDiff = Math.max(estimateMaxSpeed(difference, bbox), 0.5);

    let comparisons: StationCompare[] = [];
    if (model) {
      const ms = modelSampler(model);
      comparisons = stations
        .map((s): StationCompare => {
          const m = ms(s.lon, s.lat);
          const md = toSpeedDir(m.u, m.v);
          const o = stationVec(s);
          return {
            station: s,
            obsMph: kmhToMph(s.speedKmh),
            obsDir: s.dirDeg,
            modelMph: kmhToMph(md.speed),
            modelDir: md.dir,
            dSpeedMph: kmhToMph(Math.abs(s.speedKmh - md.speed)),
            // A calm vane has no direction; report the speed gap only.
            dDir: s.dirDeg == null ? null : angleDiff(s.dirDeg, md.dir),
            dVecMph: kmhToMph(Math.hypot(o.u - m.u, o.v - m.v)),
          };
        })
        .sort((a, b) => b.dVecMph - a.dVecMph);
    }

    return { background, corrected, difference, sharedMax, maxDiff, comparisons };
  }, [payload, radiusKm]);

  // With no model background, "Disagreement" (corrected − model) is ~0 everywhere
  // and meaningless — fall back to the corrected field for display.
  const modelAvailable = !!(payload && payload.model);
  const effectiveMode: FieldMode = mode === "difference" && !modelAvailable ? "corrected" : mode;

  const field = useMemo(() => {
    if (!data) return null;
    if (effectiveMode === "model") return { sampler: data.background, scaleKmh: data.sharedMax };
    if (effectiveMode === "corrected") return { sampler: data.corrected, scaleKmh: data.sharedMax };
    // Disagreement: advect through the real (vane-corrected) wind so the flow
    // direction is meaningful, and colour by how far that wind departs from the
    // model. Previously we advected through the residual vector itself, whose
    // direction is essentially noise when model and vanes roughly agree — that's
    // why the flow looked like it ran "the wrong way" for no reason.
    return {
      sampler: data.corrected,
      scaleKmh: data.sharedMax,
      // The advection vec is already the corrected wind here, so reuse it: the
      // gap is corrected − model, no need to re-evaluate the 60-station field.
      colorScalar: (lon: number, lat: number, vec: { u: number; v: number }) => {
        const b = data.background(lon, lat);
        return Math.hypot(vec.u - b.u, vec.v - b.v);
      },
      colorScale: data.maxDiff,
    };
  }, [data, effectiveMode]);

  // Legend reflects the colour scale: disagreement magnitude in difference mode,
  // wind speed otherwise.
  const scaleMph = field ? kmhToMph(field.colorScale ?? field.scaleKmh) : 0;

  // ---- Drive the particle overlay ---------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!ready || !map || !canvas || !payload || !field) return;
    if (!fieldRef.current) {
      fieldRef.current = new ParticleField(canvas, map, payload.bbox, field);
    } else {
      fieldRef.current.setField(field);
    }
    if (showFlow) fieldRef.current.start();
    else fieldRef.current.stop(true);
  }, [ready, payload, field, showFlow]);

  // ---- Render station vanes as a tracked DOM overlay --------------------
  useEffect(() => {
    const map = mapRef.current;
    const overlay = vanesRef.current;
    if (!ready || !map || !overlay) return;
    overlay.replaceChildren();
    if (!payload || !showVanes) return;

    const items = payload.stations.map((s) => {
      const el = makeVaneEl(s);
      overlay.appendChild(el);
      return { el, s };
    });
    const update = () => {
      for (const { el, s } of items) {
        const pt = map.project([s.lon, s.lat]);
        el.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }
    };
    update();
    map.on("render", update);
    return () => {
      map.off("render", update);
      overlay.replaceChildren();
    };
  }, [ready, payload, showVanes]);

  const captionByMode: Record<FieldMode, string> = {
    model: "model wind speed",
    corrected: "vane-corrected wind speed",
    difference: "model ↔ vane gap (flow = real wind)",
  };

  return (
    <div className="app">
      <div ref={containerRef} className="map-root" />
      <canvas ref={canvasRef} className="flow-canvas" />
      <div ref={vanesRef} className="vanes-overlay" />

      <header className="hud hud-tl">
        <div className="title">
          Wind, corrected to the vanes
        </div>
        <div className="subtitle">{REGION.name} · {REGION.subtitle}</div>
        <p className="thesis">
          Watch Duty animates a smooth global model. Its own weather vanes — the
          Synoptic RAWS &amp; mesonet stations on these ridges — often tell a different
          story. This pins the field to those vanes and shows the gap.
        </p>
      </header>

      {payload && data && (
        <Panel
          payload={payload}
          mode={mode}
          setMode={setMode}
          radiusKm={radiusKm}
          setRadiusKm={setRadiusKm}
          showFlow={showFlow}
          setShowFlow={setShowFlow}
          showVanes={showVanes}
          setShowVanes={setShowVanes}
          comparisons={data.comparisons}
          modelAvailable={modelAvailable}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {field && <Legend scaleMph={scaleMph} caption={captionByMode[effectiveMode]} />}

      {status === "loading" && <div className="overlay-msg mono">reading the vanes…</div>}
      {status === "error" && (
        <div className="overlay-msg mono">
          could not reach the wind service — check the network policy
        </div>
      )}
    </div>
  );
}

function makeVaneEl(s: Station): HTMLDivElement {
  const mph = kmhToMph(s.speedKmh);
  // Calm / variable: speed below ~1 mph, or no resolvable direction. Watch Duty
  // still shows these vanes (often the largest gap with a windy model), so we
  // draw a hollow dot with no arrow instead of dropping the station.
  const calm = s.dirDeg == null || mph < 1;
  const stale = s.ageMin > 75;
  const el = document.createElement("div");
  el.className = `vane${stale ? " is-stale" : ""}`;
  const dirText = calm ? "calm" : `${mph.toFixed(1)} mph from ${Math.round(s.dirDeg as number)}° (${compass(s.dirDeg as number)})`;
  el.title = `${s.id} · ${s.name}${s.network ? ` (${s.network})` : ""} — ${dirText}${
    s.tempC != null ? `, ${cToF(s.tempC).toFixed(0)}°F` : ""
  }, ${s.ageMin} min ago${stale ? " (stale)" : ""}`;
  const tempLabel = s.tempC != null ? ` · ${cToF(s.tempC).toFixed(0)}°F` : "";
  const color = rgbCss(speedColor(mph));
  // A bold arrow that radiates OUT from the station dot, so the wind direction is
  // unmistakable — like the vanes on Watch Duty. The shaft's tail sits at the dot
  // (the station) and the head juts out ~22px the way the wind blows (downwind =
  // direction-from + 180°), matching the animated flow. Calm vanes get a hollow
  // dot and no arrow.
  const arrow = calm
    ? ""
    : `<svg class="vane-pointer" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"
            style="transform: translate(-50%, -50%) rotate(${(s.dirDeg as number) + 180}deg)">
        <line x1="24" y1="24" x2="24" y2="15" stroke="${color}" stroke-width="3.5" stroke-linecap="round" />
        <path d="M24 3 L33.5 20 L24 15.5 L14.5 20 Z" fill="${color}"
              stroke="rgba(0,0,0,0.7)" stroke-width="1.5" stroke-linejoin="round" />
      </svg>`;
  el.innerHTML = `
    ${arrow}
    <span class="vane-dot${calm ? " is-calm" : ""}" style="background:${color}"></span>
    <span class="vane-label">${calm ? "calm" : `${mph.toFixed(1)} mph`}${tempLabel}</span>
  `;
  return el;
}
