"use client";

import { useEffect, useState } from "react";

export type Metar = {
  rawOb: string | null;
  reportTime: string | null;
  tempC: number | null;
  dewC: number | null;
  windDir: number | string | null;
  windKt: number | null;
  visSm: number | string | null;
  altimHg: number | null;
  clouds: Array<{ cover?: string; base?: number }>;
};

export function useMetar() {
  const [data, setData] = useState<Metar | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/metar", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as Metar;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    const i = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, []);

  return { data, error };
}

export function formatWind(dir: number | string | null, kt: number | null) {
  if (dir == null || kt == null) return null;
  const d = typeof dir === "string" ? dir : String(dir).padStart(3, "0");
  return `${d}@${kt}`;
}

export function formatConditions(m: Metar | null): string {
  if (!m) return "— — —";
  const cover = m.clouds?.[0]?.cover ?? "CLR";
  const temp = m.tempC != null ? `${Math.round(m.tempC)}°C` : "—";
  const wind = formatWind(m.windDir, m.windKt) ?? "—";
  return `${cover} / ${temp} / WIND ${wind}`;
}
