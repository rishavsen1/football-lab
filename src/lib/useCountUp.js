/* Animate a number from its previous value to the new one (easeOutCubic).
   Honors prefers-reduced-motion (snaps instantly). Used for the big burden
   scores, the "N×" ratio, and the stat-card numbers. */
import React, { useEffect, useRef, useState } from "react";

export function useCountUp(value, duration = 650) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current, to = value;
    if (reduce || from === to) { setDisplay(to); fromRef.current = to; return; }
    let raf, start = null;
    const step = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

// Drop-in animated number: <CountUp value={27.6} decimals={1} suffix="×" />
export function CountUp({ value, decimals = 0, prefix = "", suffix = "" }) {
  const d = useCountUp(value);
  return React.createElement(React.Fragment, null, `${prefix}${Number(d).toFixed(decimals)}${suffix}`);
}
