"use client";

import { useEffect, useState } from "react";

/**
 * Returns a [0..1] progress value reflecting how far through `el` the viewport has scrolled.
 * 0 = top of element has just entered viewport bottom
 * 1 = bottom of element has just exited viewport top
 * Updates on scroll/resize via rAF batching.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!el || typeof window === "undefined") return;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = r.height + vh;
      const traveled = vh - r.top;
      const p = Math.min(1, Math.max(0, traveled / total));
      setProgress(p);
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [el]);

  return { ref: setEl, progress };
}

/**
 * Tracks which section index is currently "active" (the one whose top
 * is nearest viewport top). Returns the active id or null.
 */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const compute = () => {
      let best: { id: string; dist: number } | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        const dist = Math.abs(top - 80); // bias toward "near top of viewport"
        if (best === null || dist < best.dist) best = { id, dist };
      }
      setActive(best ? best.id : null);
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    compute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [ids]);

  return active;
}
