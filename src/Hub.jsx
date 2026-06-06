import React from "react";
import { Link } from "react-router-dom";
import { Trophy, ArrowRight, Github } from "lucide-react";
import { TEAMS, BASES, ACTUAL_CITY, TEAM_MATCHES, FIXTURES, MILP_AUDIT } from "./data/wc2026.js";
import { rawMetrics, scaled, composite, DEFAULT_H, DEFAULT_W, LEAD } from "./model/burden.js";

// Headline numbers for the WC2026 card, computed from the model under default
// weights so the landing page stays truthful if the data ever changes.
const hardest = TEAMS.map((tm) => {
  const ms = TEAM_MATCHES[tm.t];
  const raw = rawMetrics(tm, BASES[tm.t], ms.map((i) => ACTUAL_CITY[i]), ms.map((i) => FIXTURES[i][0]), DEFAULT_H, LEAD);
  return { t: tm.t, f: tm.f, cmp: composite(scaled(raw), DEFAULT_W) };
}).sort((a, b) => b.cmp - a.cmp)[0];

// One experiment for now; the array is the seam where future experiments slot in.
const EXPERIMENTS = [
  {
    to: "/wc2026",
    kicker: "FIFA WORLD CUP 26 · 🇺🇸 🇨🇦 🇲🇽",
    title: "Travel Burden Lab",
    blurb: "Who got the brutal draw? Score every team's home → base-camp → venue journey on five fatigue factors, audit whether FIFA's schedule is fair, then let it redraw the map.",
    stats: [
      { k: "Hardest draw", v: `${hardest.f} ${hardest.t}`, s: `burden ${hardest.cmp.toFixed(1)}` },
      { k: "Fairness gap", v: `${MILP_AUDIT.actualGap}`, s: `→ ${MILP_AUDIT.optGap} optimized` },
      { k: "Relocations", v: `${MILP_AUDIT.moved}/72`, s: "for a fairer draw" },
    ],
    live: true,
  },
];

export default function Hub() {
  return (
    <div className="hub">
      <style>{HUB_CSS}</style>
      <header className="hub-hero">
        <div className="hub-glow" />
        <div className="hub-kicker">⚽ DECISION-MAKING ON ALL THINGS FOOTBALL</div>
        <h1 className="hub-title">THE FOOTBALL LAB</h1>
        <p className="hub-sub">
          Interactive experiments that turn football's big questions into tunable,
          shareable data. Start with the 2026 World Cup.
        </p>
      </header>

      <main className="hub-grid">
        {EXPERIMENTS.map((e) => (
          <Link key={e.to} to={e.to} className="xcard">
            <div className="xcard-kicker">{e.kicker}</div>
            <div className="xcard-title">
              {e.title}
              <ArrowRight size={20} className="xcard-arrow" />
            </div>
            <p className="xcard-blurb">{e.blurb}</p>
            <div className="xcard-stats">
              {e.stats.map((s) => (
                <div key={s.k} className="xstat">
                  <div className="xstat-k">{s.k}</div>
                  <div className="xstat-v">{s.v}</div>
                  <div className="xstat-s">{s.s}</div>
                </div>
              ))}
            </div>
            <div className="xcard-cta"><Trophy size={13} /> Open experiment</div>
          </Link>
        ))}
        <div className="xcard xcard-soon">
          <div className="xcard-kicker">COMING SOON</div>
          <div className="xcard-title soon">More experiments</div>
          <p className="xcard-blurb">
            Knockout-stage burden, fixture congestion, and other football fairness
            questions, slotting in here as they ship.
          </p>
        </div>
      </main>

      <footer className="hub-foot">
        <span>A tunable, illustrative model, not calibrated to fatigue data. Method &amp; sources inside.</span>
        <a href="https://github.com/rishavsen1/football-lab" target="_blank" rel="noreferrer">
          <Github size={13} /> source
        </a>
      </footer>
    </div>
  );
}

const HUB_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Hanken+Grotesk:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
.hub{
  --bg:#f7f5ef; --panel:#ffffff; --line:rgba(22,25,28,.11); --ink:#16191c; --ink2:#3b4145; --mut:#7b817d;
  --magenta:#ed1f78; --cyan:#0aa595; --gold:#d98712; --violet:#6a5cf0;
  --disp:'Anton','Arial Narrow',sans-serif; --body:'Hanken Grotesk',system-ui,sans-serif; --mono:'DM Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--bg); color:var(--ink); font-family:var(--body);
  padding:clamp(20px,5vw,64px) clamp(16px,5vw,48px); box-sizing:border-box;
  background-image:radial-gradient(60% 50% at 15% 0%,rgba(237,31,120,.07),transparent 70%),radial-gradient(60% 50% at 90% 10%,rgba(10,165,149,.07),transparent 70%);
}
.hub-hero{position:relative;max-width:1080px;margin:0 auto 40px}
.hub-kicker{font-family:var(--mono);font-size:11px;letter-spacing:.22em;color:var(--cyan);margin-bottom:12px}
.hub-title{font-family:var(--disp);font-size:clamp(44px,9vw,96px);line-height:.9;letter-spacing:.01em;margin:0;color:var(--ink)}
.hub-sub{font-size:clamp(15px,2.2vw,19px);color:var(--ink2);max-width:560px;margin:16px 0 0;line-height:1.5}
.hub-grid{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
.xcard{display:block;text-decoration:none;color:inherit;background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--magenta);
  border-radius:16px;padding:22px 22px 18px;box-shadow:0 1px 2px rgba(22,25,28,.04),0 12px 28px rgba(22,25,28,.06);transition:.18s}
.xcard:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(22,25,28,.06),0 18px 40px rgba(22,25,28,.1)}
.xcard-kicker{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--mut)}
.xcard-title{font-family:var(--disp);font-size:30px;letter-spacing:.01em;margin:7px 0 0;display:flex;align-items:center;justify-content:space-between;gap:8px}
.xcard-arrow{color:var(--magenta);flex:0 0 auto;transition:.18s}
.xcard:hover .xcard-arrow{transform:translateX(4px)}
.xcard-blurb{font-size:14px;color:var(--ink2);line-height:1.5;margin:10px 0 16px}
.xcard-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-top:1px solid var(--line);padding-top:14px}
.xstat-k{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.xstat-v{font-family:var(--disp);font-size:18px;margin:3px 0 1px;line-height:1.1}
.xstat-s{font-family:var(--mono);font-size:9.5px;color:var(--mut)}
.xcard-cta{margin-top:16px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--cyan);display:flex;align-items:center;gap:6px}
.xcard-soon{border-top-color:var(--line);opacity:.7;cursor:default}
.xcard-soon:hover{transform:none;box-shadow:0 1px 2px rgba(22,25,28,.04),0 12px 28px rgba(22,25,28,.06)}
.xcard-title.soon{color:var(--mut)}
.hub-foot{max-width:1080px;margin:36px auto 0;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;
  font-family:var(--mono);font-size:11px;color:var(--mut)}
.hub-foot a{color:var(--ink2);text-decoration:none;display:inline-flex;align-items:center;gap:5px}
.hub-foot a:hover{color:var(--cyan)}
`;
