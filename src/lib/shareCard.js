/* Build a shareable burden card as a self-contained SVG string and rasterize it
   to PNG entirely client-side (no backend, no external assets). Uses system font
   stacks so the SVG->canvas rasterization is consistent without embedding fonts.
   Decoupled from the model: callers pass a plain opts object. */

const COL = { jet:"#ed1f78", travel:"#0aa595", heat:"#e95c2c", alt:"#19a957", cong:"#6a5cf0" };
const FACTORS = [
  ["jet","Jet-lag"],["travel","Travel"],["heat","Heat"],["alt","Altitude"],["cong","Congestion"],
];
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));

// opts: { team, flag, rank, n, burden, mode, objective, parts:{k:weightedContribution}, takeaway, url }
export function buildCardSVG(o) {
  const W = 1200, H = 630;
  const sum = FACTORS.reduce((s, [k]) => s + (o.parts[k] || 0), 0) || 1;
  const barX = 70, barW = 1060, barY = 398, barH = 44;
  let x = barX;
  const segs = FACTORS.map(([k, label]) => {
    const w = (o.parts[k] / sum) * barW;
    const seg = `<rect x="${x.toFixed(1)}" y="${barY}" width="${Math.max(0, w).toFixed(1)}" height="${barH}" fill="${COL[k]}"/>`;
    x += w;
    return seg;
  }).join("");
  const legend = FACTORS.map(([k, label], i) => {
    const lx = barX + i * 215;
    const pctv = Math.round(100 * (o.parts[k] || 0) / sum);
    return `<g transform="translate(${lx},${barY + barH + 36})">
      <rect x="0" y="-11" width="13" height="13" rx="3" fill="${COL[k]}"/>
      <text x="20" y="0" font-family="ui-monospace,Menlo,monospace" font-size="17" fill="#3b4145">${esc(label)} ${pctv}%</text></g>`;
  }).join("");
  const tag = o.mode === "fair" ? `OPTIMIZED · ${esc(String(o.objective || "").toUpperCase())}` : "ACTUAL FIFA DRAW";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f5ef"/><stop offset="1" stop-color="#efece3"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="10" fill="#ed1f78"/>
  <circle cx="1080" cy="120" r="200" fill="#0aa595" opacity="0.06"/>
  <text x="70" y="92" font-family="ui-monospace,Menlo,monospace" font-size="20" letter-spacing="4" fill="#0aa595">FIFA WORLD CUP 26 · TRAVEL BURDEN LAB</text>
  <text x="70" y="196" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="84" fill="#16191c">${esc(o.flag || "")} ${esc(o.team)}</text>
  <text x="70" y="250" font-family="ui-monospace,Menlo,monospace" font-size="24" fill="#7b817d">${tag}</text>
  <text x="1130" y="210" text-anchor="end" font-family="Georgia,serif" font-weight="700" font-size="150" fill="#0aa595">${o.burden.toFixed(1)}</text>
  <text x="1130" y="250" text-anchor="end" font-family="ui-monospace,Menlo,monospace" font-size="24" fill="#7b817d">burden · #${o.rank} of ${o.n}</text>
  <text x="70" y="340" font-family="Helvetica,Arial,sans-serif" font-size="30" fill="#3b4145">${esc(o.takeaway)}</text>
  ${segs}
  ${legend}
  <text x="70" y="600" font-family="ui-monospace,Menlo,monospace" font-size="19" fill="#7b817d">${esc(o.url || "")}</text>
</svg>`;
}

// rasterize an SVG string to a PNG Blob via an offscreen canvas, then trigger download
export function downloadCardPNG(svg, filename, scale = 1) {
  const W = 1200, H = 630;
  const img = new Image();
  const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.src = svg64;
}
