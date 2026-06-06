/* URL <-> lab-state serialization. Only non-default values are written, so a
   pristine lab keeps a clean URL and any share link round-trips exactly.
   Used with react-router's useSearchParams under the HashRouter (params live in
   the part after '?' inside the '#/wc2026?...' hash). */
import { DEFAULT_H, DEFAULT_W, LEAD } from "../model/burden.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

// pack the subset of obj that differs from defs into "k1:v1,k2:v2" (numeric values)
function packDiff(obj, defs) {
  const parts = [];
  for (const k in defs) if (obj && obj[k] != null && obj[k] !== defs[k]) parts.push(`${k}:${obj[k]}`);
  return parts.join(",");
}
function unpackDiff(str, defs) {
  const out = {};
  if (!str) return out;
  for (const seg of str.split(",")) {
    const [k, v] = seg.split(":");
    if (k in defs) { const n = num(v); if (n != null) out[k] = n; }
  }
  return out;
}
// pack a {team: value} override map into "team~value,team~value"
function packMap(map) {
  return Object.entries(map || {}).map(([k, v]) => `${k}~${v}`).join(",");
}
function unpackMap(str, numeric) {
  const out = {};
  if (!str) return out;
  for (const seg of str.split(",")) {
    const i = seg.lastIndexOf("~"); if (i < 0) continue;
    const k = seg.slice(0, i), v = seg.slice(i + 1);
    if (numeric) { const n = num(v); if (n != null) out[k] = n; } else out[k] = v;
  }
  return out;
}

// state -> plain {param: string} object (only non-defaults)
export function encodeState(s) {
  const p = {};
  if (s.mode && s.mode !== "fifa") p.m = s.mode;
  if (s.objective && s.objective !== "minimax") p.o = s.objective;
  if (s.tab && s.tab !== "rank") p.tab = s.tab;
  if (s.sortMode && s.sortMode !== "burden") p.sort = s.sortMode;
  if (s.lead != null && s.lead !== LEAD) p.lead = String(s.lead);
  const h = packDiff(s.H, DEFAULT_H); if (h) p.h = h;
  const w = packDiff(s.W, DEFAULT_W); if (w) p.w = w;
  const bo = packMap(s.baseOv); if (bo) p.base = bo;
  const lo = packMap(s.leadOv); if (lo) p.leado = lo;
  if (s.sel) p.team = s.sel;
  if (s.drawerOpen && s.sel) p.open = "1";
  if (s.expert) p.x = "1";
  return p;
}

// URLSearchParams -> partial lab-state object (omitted keys keep their defaults)
export function decodeState(sp) {
  const g = (k) => sp.get(k);
  const st = {};
  if (g("m")) st.mode = g("m");
  if (g("o")) st.objective = g("o");
  if (g("tab")) st.tab = g("tab");
  if (g("sort")) st.sortMode = g("sort");
  if (g("lead") != null) { const n = num(g("lead")); if (n != null) st.lead = n; }
  const H = unpackDiff(g("h"), DEFAULT_H); if (Object.keys(H).length) st.H = { ...DEFAULT_H, ...H };
  const W = unpackDiff(g("w"), DEFAULT_W); if (Object.keys(W).length) st.W = { ...DEFAULT_W, ...W };
  const bo = unpackMap(g("base"), false); if (Object.keys(bo).length) st.baseOv = bo;
  const lo = unpackMap(g("leado"), true); if (Object.keys(lo).length) st.leadOv = lo;
  if (g("team")) st.sel = g("team");
  if (g("open") === "1") st.drawerOpen = true;
  if (g("x") === "1") st.expert = true;
  return st;
}
