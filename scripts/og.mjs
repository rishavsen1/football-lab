/* Build-time social-preview (OG) images: the static-hosting solution for rich
   link previews. For each team, compute its burden under default weights + the
   actual FIFA schedule, render the SAME share card used in-app (src/lib/shareCard
   .js), and rasterize to public/og/<slug>.png so `vite build` copies them to dist.
   Pair with scripts/prerender-og.mjs (per-team HTML with OG meta).
   Run: `npm run og`. */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { TEAMS, BASES, ACTUAL_CITY, TEAM_MATCHES, FIXTURES } from "../src/data/wc2026.js";
import { rawMetrics, scaled, composite, DEFAULT_H, DEFAULT_W, LEAD } from "../src/model/burden.js";
import { buildCardSVG } from "../src/lib/shareCard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "og");
mkdirSync(OUT, { recursive: true });

export const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const FACTORS = [["jet","Jet-lag"],["travel","Travel"],["heat","Heat"],["alt","Altitude"],["cong","Congestion"]];
function takeaway(row, n){
  if(row.cmp < 0.05) return "Barely any travel burden, one of the lightest draws.";
  const top = FACTORS.map(([k,l])=>({l,v:row.parts[k]})).sort((a,b)=>b.v-a.v)[0];
  const share = Math.round(100*top.v/(row.cmp/100 || 1));
  const third = Math.ceil(n/3);
  const ord = row.rank===1?"The hardest":row.rank===2?"2nd-hardest":row.rank===3?"3rd-hardest":`${row.rank}th-hardest`;
  const pos = row.rank<=third ? `${ord} draw of ${n}` : row.rank>n-third ? `One of the lighter draws (#${row.rank})` : `A mid-pack draw (#${row.rank} of ${n})`;
  return `${pos}: ${top.l.toLowerCase()} is the biggest load (${share}%).`;
}

// compute burdens under default weights + the actual schedule, then rank
const wN = DEFAULT_W; // already sums to 1
const rows = TEAMS.map((tm) => {
  const ms = TEAM_MATCHES[tm.t];
  const raw = rawMetrics(tm, BASES[tm.t], ms.map((i)=>ACTUAL_CITY[i]), ms.map((i)=>FIXTURES[i][0]), DEFAULT_H, LEAD);
  const sc = scaled(raw), cmp = composite(sc, wN);
  const parts = { jet:wN.jet*sc.jet, travel:wN.travel*sc.travel, heat:wN.heat*sc.heat, alt:wN.alt*sc.alt, cong:wN.cong*sc.cong };
  return { t: tm.t, cmp, parts };
}).sort((a,b)=>b.cmp-a.cmp).map((r,i)=>({ ...r, rank:i+1 }));

const SITE = process.env.SITE_URL || "the-football-lab";
function renderPNG(svg) {
  return new Resvg(svg, { fitTo:{ mode:"width", value:1200 }, font:{ loadSystemFonts:true } }).render().asPng();
}

let n = 0;
for (const r of rows) {
  const svg = buildCardSVG({ team:r.t, flag:"", rank:r.rank, n:rows.length, burden:r.cmp,
    mode:"fifa", objective:"minimax", parts:r.parts, takeaway:takeaway(r, rows.length), url:SITE });
  writeFileSync(join(OUT, `${slug(r.t)}.png`), renderPNG(svg));
  n++;
}
// default card = the hardest draw (used when no specific team is shared)
const top = rows[0];
writeFileSync(join(OUT, "default.png"), renderPNG(buildCardSVG({
  team:top.t, flag:"", rank:1, n:rows.length, burden:top.cmp, mode:"fifa", objective:"minimax",
  parts:top.parts, takeaway:takeaway(top, rows.length), url:SITE })));

console.log(`og: wrote ${n} team cards + default.png to public/og/`);
