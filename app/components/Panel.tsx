"use client";

import type { FieldMode, Station, WindPayload } from "@/app/lib/types";
import { compass } from "@/app/lib/wind";

export type StationCompare = {
  station: Station;
  obsMph: number;
  obsDir: number | null;
  modelMph: number;
  modelDir: number;
  dSpeedMph: number;
  dDir: number | null;
  dVecMph: number;
};

/** Compass label for a possibly-calm (null-direction) observation. */
function dirLabel(d: number | null): string {
  return d == null ? "calm" : compass(d);
}

const MODES: { id: FieldMode; label: string; sub: string }[] = [
  { id: "model", label: "Model", sub: "Windy-style" },
  { id: "corrected", label: "Vane-corrected", sub: "model + vanes" },
  { id: "difference", label: "Disagreement", sub: "corrected − model" },
];

type Props = {
  payload: WindPayload;
  mode: FieldMode;
  setMode: (m: FieldMode) => void;
  radiusKm: number;
  setRadiusKm: (n: number) => void;
  showFlow: boolean;
  setShowFlow: (b: boolean) => void;
  showVanes: boolean;
  setShowVanes: (b: boolean) => void;
  comparisons: StationCompare[];
  modelAvailable: boolean;
  onRefresh: () => void;
};

export function Panel({
  payload,
  mode,
  setMode,
  radiusKm,
  setRadiusKm,
  showFlow,
  setShowFlow,
  showVanes,
  setShowVanes,
  comparisons,
  modelAvailable,
  onRefresh,
}: Props) {
  const worst = comparisons[0];
  const generated = new Date(payload.generatedAt);

  return (
    <div className="panel">
      <div className="panel-modes" role="group" aria-label="Field mode">
        {MODES.map((m) => {
          // Disagreement is only meaningful when there is a model to disagree with.
          const disabled = m.id === "difference" && !modelAvailable;
          return (
            <button
              key={m.id}
              className={`mode ${mode === m.id ? "is-active" : ""}`}
              onClick={() => setMode(m.id)}
              type="button"
              disabled={disabled}
              title={disabled ? "Needs the model field (currently unavailable)" : undefined}
            >
              <span className="mode-label">{m.label}</span>
              <span className="mode-sub mono">{m.sub}</span>
            </button>
          );
        })}
      </div>

      <label className="control">
        <span className="control-row">
          <span>Vane influence radius</span>
          <span className="mono">{radiusKm} km</span>
        </span>
        <input
          type="range"
          min={5}
          max={40}
          step={1}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
        />
        <span className="control-hint">
          How far each vane&apos;s correction spreads before relaxing to the model.
        </span>
      </label>

      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={showFlow} onChange={(e) => setShowFlow(e.target.checked)} />
          Wind flow
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showVanes} onChange={(e) => setShowVanes(e.target.checked)} />
          Vanes
        </label>
      </div>

      {worst ? (
        <div className="headline">
          <div className="headline-kicker mono">BIGGEST MODEL ↔ VANE GAP</div>
          <div className="headline-name">{stationShort(worst.station)}</div>
          <div className="headline-rows mono">
            <span>
              Model <b>{worst.modelMph.toFixed(1)}</b> mph {compass(worst.modelDir)}
            </span>
            <span>
              Vane <b>{worst.obsMph.toFixed(1)}</b> mph {dirLabel(worst.obsDir)}
            </span>
            <span className="headline-delta">
              off by {worst.dVecMph.toFixed(1)} mph{worst.dDir != null ? ` · ${worst.dDir.toFixed(0)}°` : ""}
            </span>
          </div>
        </div>
      ) : (
        <div className="headline headline-empty mono">
          Model field unavailable — corrected = observations only.
        </div>
      )}

      {comparisons.length > 0 && (
        <div className="compare">
          <div className="compare-head mono">
            <span>STATION</span>
            <span>MODEL</span>
            <span>VANE</span>
            <span>Δ</span>
          </div>
          {comparisons.map((c) => (
            <div className="compare-row mono" key={c.station.id}>
              <span className="compare-id" title={`${c.station.name}${c.station.network ? ` · ${c.station.network}` : ""}`}>{c.station.id}</span>
              <span>{c.modelMph.toFixed(0)} {compass(c.modelDir)}</span>
              <span>{c.obsMph.toFixed(0)} {dirLabel(c.obsDir)}</span>
              <span className={c.dVecMph >= 8 ? "hot" : ""}>{c.dVecMph.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel-foot mono">
        <div className="foot-line">
          {payload.fallback ? (
            <span className="badge-warn">SNAPSHOT</span>
          ) : (
            <span className="badge-live">LIVE</span>
          )}
          <span className="badge-src" title={payload.sources.observations}>
            {payload.sources.obsKind === "synoptic" ? "SYNOPTIC" : "NWS"}
          </span>
          <span>{payload.stations.length} vanes</span>
          <span>·</span>
          <span>{timeAgo(generated)}</span>
          <button type="button" className="refresh" onClick={onRefresh}>
            ↻
          </button>
        </div>
        <div className="foot-src">obs: {payload.sources.observations}</div>
        <div className="foot-src">model: {payload.sources.model}</div>
        {payload.warnings.length > 0 && (
          <div className="foot-warn">{payload.warnings.length} warning(s): {payload.warnings[0]}</div>
        )}
      </div>
    </div>
  );
}

function stationShort(s: Station): string {
  // "Santa Monica, Santa Monica Municipal Airport" → "Santa Monica"
  return `${s.id} · ${s.name.split(",")[0]}`;
}

function timeAgo(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}
