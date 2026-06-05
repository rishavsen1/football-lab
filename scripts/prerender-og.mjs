/* Postbuild: write a tiny static HTML page per team at dist/t/<slug>/index.html.
   Social scrapers don't run JS or follow hash routes, so these pages carry the
   per-team OG/Twitter meta tags (pointing at the build-time PNG) and then bounce
   real visitors into the SPA deep link. Run after `vite build`.
   Set SITE_URL (e.g. https://you.github.io) so og:image/url are absolute. */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TEAMS } from "../src/data/wc2026.js";
import { slug } from "./og.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const BASE = process.env.BASE_PATH ?? "/football-lab/";   // must match vite.config base
const SITE = (process.env.SITE_URL || "").replace(/\/$/, ""); // absolute origin for OG (recommended)
const abs = (p) => SITE ? SITE + p : p;
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;" }[c]));

let n = 0;
for (const tm of TEAMS) {
  const s = slug(tm.t);
  const title = `${tm.t} — WC2026 Travel Burden Lab`;
  const desc = `How punishing is ${tm.t}'s 2026 World Cup group-stage draw? Travel, heat, altitude, jet-lag and congestion, scored and audited for fairness.`;
  const img = abs(`${BASE}og/${s}.png`);
  const target = abs(`${BASE}#/wc2026?team=${encodeURIComponent(tm.t)}&open=1`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(target)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="${esc(target)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body>Redirecting to <a href="${esc(target)}">${esc(title)}</a>…</body></html>`;
  mkdirSync(join(DIST, "t", s), { recursive: true });
  writeFileSync(join(DIST, "t", s, "index.html"), html);
  n++;
}
console.log(`prerender-og: wrote ${n} per-team OG pages to dist/t/<slug>/`);
