/* FLIP animation: smoothly move keyed rows to their new positions after a
   re-order (e.g. Actual→Fairer re-ranks the teams, or the sort changes).
   Measures each [data-flip] row's offset relative to the container (scroll-safe),
   then inverts + transitions it from its old spot to its new one.
   Honors prefers-reduced-motion (no-op). */
export function flipRows(container, store, duration = 440) {
  if (!container) return;
  const reduce = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cTop = container.getBoundingClientRect().top;
  const rows = container.querySelectorAll("[data-flip]");
  rows.forEach((el) => {
    const key = el.getAttribute("data-flip");
    const relTop = el.getBoundingClientRect().top - cTop;
    const prev = store.get(key);
    store.set(key, relTop);
    if (prev == null || reduce) return;
    const dy = prev - relTop;
    if (Math.abs(dy) < 1) return;
    el.style.transition = "none";
    el.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
      el.style.transform = "";
    });
  });
}
