"use client";

import { useEffect, useState } from "react";

/**
 * Boot phase counter. Each new phase reveals the next slice of the page.
 *  0  = blank (pre-mount safety)
 *  1  = top ribbon online
 *  2  = hero headline + KOXR identifier card
 *  3  = briefing cells (4-up)
 *  4  = MSA mins strip
 *  5  = page online — below-fold sections become eligible for scroll-triggered boot
 */
export function useBootSequence() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setPhase(5);
      return;
    }

    const stages: Array<[number, number]> = [
      [80, 1],
      [380, 2],
      [780, 3],
      [1180, 4],
      [1500, 5],
    ];
    const timers = stages.map(([ms, p]) =>
      window.setTimeout(() => setPhase(p), ms)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return phase;
}

/**
 * Boot a section once it scrolls into view. Returns a ref to attach + a boolean.
 */
export function useScrollBoot<T extends HTMLElement>() {
  const [booted, setBooted] = useState(false);
  const [el, setEl] = useState<T | null>(null);

  useEffect(() => {
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setBooted(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setBooted(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);

  return { ref: setEl, booted };
}
