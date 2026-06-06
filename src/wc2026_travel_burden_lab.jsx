import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plane, Sun, Mountain, Clock, CalendarClock, Trophy, RotateCcw,
  SlidersHorizontal, Map as MapIcon, BarChart3, BookOpen, X, Scale, Zap, Sigma, Link2, Check,
  Search, ChevronDown, ChevronRight, Activity, Download, ShieldCheck, AlertTriangle, FlaskConical
} from "lucide-react";

import {
  C, BASE_CHOICES, BASES, TEAMS, FIFA_RANK, STAGE, FIXTURES, MILP_AUDIT,
  TEAM_MATCHES, ACTUAL_CITY,
} from "./data/wc2026.js";
import {
  DEFAULT_H, DEFAULT_W, LEAD,
  haversine, bearing, rad, rawMetrics, scaled, composite, gini,
  burdensFor, optimizeAssignment,
} from "./model/burden.js";
import { encodeState, decodeState } from "./lib/urlState.js";
import { buildCardSVG, downloadCardPNG } from "./lib/shareCard.js";
import { flipRows } from "./lib/flip.js";
import { CountUp } from "./lib/useCountUp.js";

// factor metadata (icon + color + plain-language tooltip) for bars / radar / legend
const METRICS = [
  {k:"jet",  label:"Jet-lag",    icon:Clock,        col:"var(--magenta)", tip:"Body-clock shift from home to base camp. Eastward travel hurts more; arriving early eases it."},
  {k:"travel",label:"Travel",    icon:Plane,        col:"var(--cyan)",    tip:"Round-trip flight distance from base camp to each venue. Short rest before a match adds a surcharge."},
  {k:"heat", label:"Heat",       icon:Sun,          col:"var(--orange)",  tip:"How far each venue's June heat (a WBGT proxy) sits above a comfortable threshold."},
  {k:"alt",  label:"Altitude",   icon:Mountain,     col:"var(--green)",   tip:"Thin-air exposure at high venues, plus the elevation swing between camp and venue."},
  {k:"cong", label:"Congestion", icon:CalendarClock,col:"var(--violet)",  tip:"Short turnarounds: matchdays closer together than the ideal rest gap."},
];

const CONFEDERATIONS = ["UEFA","CONMEBOL","CONCACAF","CAF","AFC","OFC"];

// plain-language one-line takeaway for a team's row (used in drawer + find-your-team)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function ordHard(rank){
  if(rank===1) return "the hardest";
  if(rank===2) return "2nd-hardest";
  if(rank===3) return "3rd-hardest";
  return `${rank}th-hardest`;
}
function takeawayFor(row, n){
  if(row.cmp < 0.05) return "Barely any travel burden under these settings; one of the lightest draws.";
  const ranked = METRICS.map((m)=>({label:m.label, v:row.parts[m.k]})).sort((a,b)=>b.v-a.v);
  const top = ranked[0];
  const share = Math.round(100*top.v/(row.cmp/100 || 1));
  const third = Math.ceil(n/3);
  const pos = row.rank<=third ? `${ordHard(row.rank)} draw of ${n}`
            : row.rank>n-third ? `one of the lighter draws (#${row.rank} of ${n})`
            : `a middle-of-the-pack draw (#${row.rank} of ${n})`;
  return `${cap(pos)}: ${top.label.toLowerCase()} is the biggest load (${share}% of its burden).`;
}

// one-click tuning presets; hide the raw coefficient sliders behind "Advanced"
const PRESETS = [
  {key:"fifa", label:"FIFA default", mode:"fifa", W:DEFAULT_W, desc:"The real draw, balanced model weights."},
  {key:"fair", label:"Fairness view", mode:"fair", objective:"balanced", W:DEFAULT_W, desc:"Redraw for a fairer schedule (gap + Gini)."},
  {key:"heat", label:"Heat hawk", mode:"fifa", W:{jet:0.15,travel:0.20,heat:0.45,alt:0.10,cong:0.10}, desc:"Weights heat above everything else."},
  {key:"even", label:"All-rounder", mode:"fifa", W:{jet:0.20,travel:0.20,heat:0.20,alt:0.20,cong:0.20}, desc:"Equal weight on all five factors."},
];


// ---- main component ---------------------------------------------------------
export default function WorldCup2026TravelBurdenLab(){
  // ---- URL state: hydrate once from the share link, then keep the URL in sync
  const [searchParams, setSearchParams] = useSearchParams();
  const initRef = useRef(null);
  if (initRef.current === null) initRef.current = decodeState(searchParams);
  const I = initRef.current;

  const [H, setH] = useState(I.H ?? DEFAULT_H);
  const [W, setW] = useState(I.W ?? DEFAULT_W);
  const [lead, setLead] = useState(I.lead ?? LEAD);
  const [mode, setMode] = useState(I.mode ?? "fifa"); // 'fifa' | 'fair'
  const [objective, setObjective] = useState(I.objective ?? "minimax"); // minimax | gap | gini | total
  const [fontTheme, setFontTheme] = useState("editorial"); // editorial | modern | geist
  const [tab, setTab] = useState(I.tab ?? "rank");
  const [sortMode, setSortMode] = useState(I.sortMode ?? "burden"); // burden | group | az | fifa
  const [statMode, setStatMode] = useState("sd"); // sd | var | range
  const [sel, setSel] = useState(I.sel ?? null);
  const [drawerOpen, setDrawerOpen] = useState(I.drawerOpen ?? false);
  const openTeam = (name)=>{ setSel(name); setDrawerOpen(true); };
  // hero chip tap → jump to that factor's plain-language explainer
  const showFactor = (k)=>{ setTab("how"); setTimeout(()=>{ const el=document.getElementById("factor-"+k); if(el) el.scrollIntoView({behavior:"smooth",block:"center"}); },90); };
  const [baseOv, setBaseOv] = useState(I.baseOv ?? {});
  const [leadOv, setLeadOv] = useState(I.leadOv ?? {});
  const [advanced, setAdvanced] = useState(false);   // raw coefficient sliders hidden by default
  const [pickerOpen, setPickerOpen] = useState(false); // "find your team" overlay
  const [conf, setConf] = useState("all");            // confederation filter in rankings
  // console starts collapsed on small screens so mobile users reach the rankings first
  const [consoleOpen, setConsoleOpen] = useState(()=> !(typeof window!=="undefined" && window.matchMedia && window.matchMedia("(max-width:900px)").matches));
  const [expert, setExpert] = useState(I.expert ?? false); // analyst console + Stability/Formulae tabs
  // fan-facing Actual↔Fairer toggle: "Fairer" uses the Balanced objective unless an expert picked another
  const setFairer = (on)=>{ setMode(on?"fair":"fifa"); if(on && !expert) setObjective("balanced"); };

  const applyPreset = (p)=>{ setW(p.W); setH(DEFAULT_H); setMode(p.mode); if(p.objective) setObjective(p.objective); };
  const presetActive = (p)=> mode===p.mode && JSON.stringify(W)===JSON.stringify(p.W)
    && JSON.stringify(H)===JSON.stringify(DEFAULT_H) && (!p.objective || objective===p.objective);

  // mirror current state into the query string (replace, so back-button isn't spammed)
  useEffect(()=>{
    setSearchParams(encodeState({mode,objective,tab,sortMode,lead,H,W,baseOv,leadOv,sel,drawerOpen,expert}), {replace:true});
  },[mode,objective,tab,sortMode,lead,H,W,baseOv,leadOv,sel,drawerOpen,expert,setSearchParams]);

  // leaving Expert while on an expert-only tab → fall back to Rankings
  useEffect(()=>{ if(!expert && (tab==="sens"||tab==="math")) setTab("rank"); },[expert,tab]);

  // copy a deep link to the current view (URL already reflects state via the effect)
  const [copied, setCopied] = useState(false);
  const copyLink = async ()=>{
    try{ await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(()=>setCopied(false),1400); }catch(e){}
  };
  // download the current ranking as CSV or JSON so analysts can re-derive
  const download = (name, text, type)=>{
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  const bufferFor = (name) => (leadOv[name] != null ? leadOv[name] : lead);
  const wN = useMemo(()=>{ const s=(W.jet+W.travel+W.heat+W.alt+W.cong)||1;
    return { jet:W.jet/s, travel:W.travel/s, heat:W.heat/s, alt:W.alt/s, cong:W.cong/s }; },[W]);

  // baseline = real FIFA schedule; fair = constrained minimax reassignment (live)
  const baseOf = (t)=> baseOv[t]||BASES[t];
  const actualBurdens = useMemo(()=>burdensFor(ACTUAL_CITY,H,wN,bufferFor,baseOf),[H,wN,lead,leadOv,baseOv]);
  const optCity = useMemo(()=> mode==="fair" ? optimizeAssignment(H,wN,bufferFor,baseOf,objective) : null, [mode,objective,H,wN,lead,leadOv,baseOv]);

  // per-team computed rows under the active assignment
  const rows = useMemo(()=>{
    const cm = (mode==="fair" && optCity) ? optCity : ACTUAL_CITY;
    const r = TEAMS.map((tm)=>{
      const ms=TEAM_MATCHES[tm.t];
      const base=baseOv[tm.t]||BASES[tm.t];
      const venues=ms.map((i)=>cm[i]), dates=ms.map((i)=>FIXTURES[i][0]);
      const raw=rawMetrics(tm, base, venues, dates, H, bufferFor(tm.t));
      const sc=scaled(raw), cmp=composite(sc,wN);
      const parts={jet:wN.jet*sc.jet,travel:wN.travel*sc.travel,heat:wN.heat*sc.heat,alt:wN.alt*sc.alt,cong:wN.cong*sc.cong};
      return {...tm, base, venues, dates, raw, sc, cmp, parts, fifa:FIFA_RANK[tm.t]||999};
    });
    r.sort((a,b)=>b.cmp-a.cmp); r.forEach((x,i)=>x.rank=i+1);
    return r;
  },[mode,optCity,baseOv,H,wN,lead,leadOv]);

  const cmps = rows.map((x)=>x.cmp);
  const maxC = Math.max(...cmps), minC = Math.min(...cmps);
  const hardest = rows[0], easiest = rows[rows.length-1];
  const gap = maxC - minC, gi = gini(cmps);

  const ab = Object.values(actualBurdens);
  const fifaGap = Math.max(...ab) - Math.min(...ab); // real FIFA baseline gap
  // rank each team under the Actual (FIFA) schedule (1 = hardest)
  const actualRank = useMemo(()=>{
    const m={}; Object.entries(actualBurdens).sort((a,b)=>b[1]-a[1]).forEach(([t],i)=>{m[t]=i+1;});
    return m;
  },[actualBurdens]);
  // baseline (FIFA) vs current values for each selectable objective
  const fifaMax=Math.max(...ab), fifaTot=ab.reduce((s,v)=>s+v,0), fifaGini=gini(ab);
  const curTot=cmps.reduce((s,v)=>s+v,0);
  const mean=curTot/(cmps.length||1);
  const variance=cmps.reduce((s,v)=>s+(v-mean)*(v-mean),0)/(cmps.length||1);
  const sd=Math.sqrt(variance);
  const OBJ_META={
    minimax:{label:"Minimax",    base:fifaMax,  now:maxC, d:1, desc:"Lowers the single hardest draw (the maximum); protects the worst-off team."},
    gap:    {label:"Gap",        base:fifaGap,  now:gap,  d:1, desc:"Shrinks the spread between the hardest and easiest draw (max − min)."},
    gini:   {label:"Gini",       base:fifaGini, now:gi,   d:3, desc:"Reduces relative inequality across all 48 teams (0 = perfectly equal)."},
    balanced:{label:"Balanced",  base:1, now:0.5*(gap/(fifaGap||1)+gi/(fifaGini||1)), d:2, desc:"Does both: shrinks the gap and Gini together (normalised, 1.00 = the actual draw)."},
    total:  {label:"Total",      base:fifaTot,  now:curTot,d:0, desc:"Minimises total burden over every team: efficiency, not fairness."},
  };

  // displayed order for the rankings list
  const displayed = useMemo(()=>{
    if(sortMode==="az")   return [...rows].sort((a,b)=>a.t.localeCompare(b.t));
    if(sortMode==="fifa") return [...rows].sort((a,b)=>a.fifa-b.fifa);
    return rows; // burden (already sorted)
  },[rows,sortMode]);
  const groups = useMemo(()=>"ABCDEFGHIJKL".split("").map((g)=>{
    const gr=rows.filter((r)=>r.g===g).sort((a,b)=>b.cmp-a.cmp);
    const vs=gr.map((r)=>r.cmp);
    return {g, gr, gap:Math.max(...vs)-Math.min(...vs)};
  }),[rows]);
  const barFor = (r) => (
    <button key={r.t} data-flip={r.t} className={"barrow"+(sel===r.t?" selrow":"")} onClick={()=>openTeam(r.t)}
      aria-label={`${r.t}, group ${r.g}, rank ${r.rank} of ${rows.length}, burden ${r.cmp.toFixed(1)}. Open itinerary.`}>
      <span className="rk">{r.rank}</span>
      <span className="fl">{r.f}</span>
      <span className="tn">{r.t}<em>Gr. {r.g} · {r.cf}{sortMode==="fifa"?` · FIFA ≈${r.fifa}`:""}{mode==="fair" && <span className="wasrank" title={`Actual (FIFA) rank ${actualRank[r.t]} → Fair rank ${r.rank}`}> · {actualRank[r.t]>r.rank?`▲${actualRank[r.t]-r.rank}`:actualRank[r.t]<r.rank?`▼${r.rank-actualRank[r.t]}`:"="}</span>}</em></span>
      <span className="track">
        <span className="fill" style={{width:`${(r.cmp/maxC)*100}%`}}>
          {METRICS.map((m)=>{
            const frac = r.parts[m.k]/(r.cmp/100||1);
            return <i key={m.k} className="barseg" style={{width:`${frac*100}%`,background:m.col}}
              title={`${m.label} · ${Math.round(frac*100)}% of burden`}/>;
          })}
        </span>
      </span>
      <span className="sc">{r.cmp.toFixed(1)}</span>
    </button>
  );

  const selRow = sel ? rows.find((r)=>r.t===sel) : null;
  // intuitive "Nx tougher" framing for fans (guard against a near-zero easiest draw)
  // always-defined "Nx tougher" framing; floor the denominator so a near-zero easiest
  // draw (minimax / total push it to ~0) can't blow the ratio up to infinity
  const ratio = easiest ? hardest.cmp/Math.max(easiest.cmp,0.5) : 0;

  // "watch it get fairer": FLIP-animate the ranking rows when their order changes
  const rankwrapRef = useRef(null);
  const flipStore = useRef(new Map());
  useLayoutEffect(()=>{
    if(tab!=="rank"){ flipStore.current.clear(); return; }
    flipRows(rankwrapRef.current, flipStore.current);
  },[mode,sortMode,conf,optCity,rows,tab]);

  const reset = ()=>{ setH(DEFAULT_H); setW(DEFAULT_W); setLead(LEAD); setBaseOv({}); setLeadOv({}); setMode("fifa"); };

  return (
    <div className={"lab"+(fontTheme==="editorial"?"":" font-"+fontTheme)}>
      <style>{CSS}</style>

      {/* ---------------- HERO ---------------- */}
      <header className="hero">
        <div className="hero-glow" />
        <div className="hero-row">
          <div>
            <div className="kicker">TRAVEL BURDEN LAB · WORLD CUP 26 · 🇺🇸 🇨🇦 🇲🇽 · 48 TEAMS</div>
            <h1 className="title">WHO GOT THE BRUTAL DRAW?</h1>
            <p className="sub">
              The first <b>48-team</b> World Cup is spread across three countries and a whole continent.
              Some teams rack up thousands of extra miles (through <b>fierce heat</b>, <b>thin mountain air</b>,
              on <b>short rest</b>) before a ball is kicked. Others barely move. We score every team's trip,
              rank who got the roughest deal, then show the <b>fairer schedule FIFA could have played</b>.
            </p>
            <div className="hero-cta">
              <button className="findbtn" onClick={()=>setPickerOpen(true)}>
                <Search size={15}/> Find your team
              </button>
              <button className="hero-link" onClick={()=>openTeam(hardest.t)}>
                or see the toughest draw <ChevronRight size={14}/>
              </button>
              <button className="hero-link" onClick={()=>openTeam(TEAMS[Math.floor(Math.random()*TEAMS.length)].t)} title="Open a random team">
                🎲 Surprise me
              </button>
            </div>
          </div>
          <div className="hero-badge">
            <Trophy size={15}/> GROUP STAGE · JUN 11–27
          </div>
        </div>

        <div className="burdenstrip">
          <span className="bs-l">A team's <Term def="The total toll of its group-stage trip: five things added into one score. Higher = a tougher, more tiring journey.">“burden”</Term> adds up five things:</span>
          {METRICS.map((m)=>(
            <button key={m.k} className="bs-chip" onClick={()=>showFactor(m.k)} title={`${m.tip} (tap to learn more)`}>
              <m.icon size={13} style={{color:m.col}}/> {m.label}
            </button>
          ))}
          <span className="bs-note">higher = a tougher trip</span>
        </div>
        <div className="prov">
          Groups, nations, base camps & all 72 fixtures <span className="ok">confirmed</span> · model
          weights & coefficients <span className="warn">tunable</span>
          <button className="copylink" onClick={copyLink} title="Copy a link to this exact view">
            {copied ? <><Check size={12}/> copied</> : <><Link2 size={12}/> copy link</>}
          </button>
          <button className={"expertbtn"+(expert?" on":"")} onClick={()=>setExpert((e)=>!e)}
            title="Tune the model yourself: fairness objectives, factor weights, the stability test and the math"
            aria-pressed={expert}>
            <FlaskConical size={13}/>
            {expert ? <>Expert mode <b>on</b></> : <>Expert mode<span className="expertbtn-hint">tune the model →</span></>}
          </button>
          <label className="fontsel">
            <span>Aa</span>
            <select value={fontTheme} onChange={(e)=>setFontTheme(e.target.value)}>
              <option value="editorial">Editorial (Anton)</option>
              <option value="modern">Modern (Space Grotesk)</option>
              <option value="geist">Geist</option>
            </select>
          </label>
        </div>
      </header>

      {/* ---------------- VERDICT BANNER (the hook) ---------------- */}
      <button className="verdict" onClick={()=>openTeam(hardest.t)} title={`Open ${hardest.t}'s journey`}>
        <span className="verdict-tag">THE VERDICT</span>
        <span className="verdict-txt">
          <b>{hardest.f} {hardest.t}</b> got the most punishing trip of all 48 teams
          {ratio ? <>, about <b><CountUp value={ratio} decimals={0} suffix="× the travel grind"/></b> of <b>{easiest.f} {easiest.t}</b>, the comfiest draw</> : null}.
          {mode==="fair"
            ? <> Even on the <b>fairer draw</b>{expert?` (${OBJ_META[objective].label.toLowerCase()})`:""}.</>
            : <> Tap to see their journey, or flip to the <b>Fairer draw</b> below for a fairer World Cup.</>}
        </span>
        <ChevronRight size={18} className="verdict-arrow"/>
      </button>

      {/* ---------------- STAT CARDS ---------------- */}
      <section className="stats">
        <StatCard label="HARDEST DRAW" big={hardest.t} flag={hardest.f}
          sub={`roughest trip · burden ${hardest.cmp.toFixed(1)}`} accent="var(--magenta)" onClick={()=>openTeam(hardest.t)}/>
        <StatCard label="EASIEST DRAW" big={easiest.t} flag={easiest.f}
          sub={`comfiest trip · burden ${easiest.cmp.toFixed(1)}`} accent="var(--green)" onClick={()=>openTeam(easiest.t)}/>
        <StatCard label="HOW LOPSIDED" big={<CountUp value={ratio} decimals={1} suffix="×"/>} sub="hardest vs easiest trip" accent="var(--cyan)"
          tip="How many times tougher the hardest team's trip is than the easiest team's (hardest burden divided by easiest). Higher means a more lopsided, less fair draw."/>
        <StatCard label="INEQUALITY" big={<CountUp value={gi} decimals={2}/>} sub="0 = every team even" accent="var(--gold)"
          tip="The Gini coefficient across all 48 teams: 0 means every team has an identical trip, and higher values mean a more uneven spread. It's a standard way to measure inequality."/>
      </section>

      {/* ---------------- BODY: console + panel ---------------- */}
      <div className={"body"+(expert?"":" solo")}>
        {/* CONSOLE (expert mode only) */}
        {expert && (<aside className={"console"+(consoleOpen?"":" collapsed")}>
          <button className="console-mtoggle" onClick={()=>setConsoleOpen((o)=>!o)} aria-expanded={consoleOpen}>
            <SlidersHorizontal size={14}/> {consoleOpen?"Hide":"Show"} tuning console
          </button>
          <div className="console-head"><SlidersHorizontal size={15}/> TUNING CONSOLE</div>

          <div className="presets">
            <span className="presets-l">Quick presets</span>
            <div className="presets-row">
              {PRESETS.map((p)=>(
                <button key={p.key} className={"presetbtn"+(presetActive(p)?" on":"")} onClick={()=>applyPreset(p)} title={p.desc}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="modebox">
            <div className="modebox-t"><Scale size={13}/> Venue assignment</div>
            <div className="seg">
              <button className={mode==="fifa"?"on":""} onClick={()=>setMode("fifa")}>Actual (FIFA)</button>
              <button className={mode==="fair"?"on":""} onClick={()=>setMode("fair")}>Fairer draw</button>
            </div>
            {mode==="fair" ? (
              <>
                <div className="objgroups">
                  <span className="objrow-l">Objective</span>
                  {[
                    ["Equity", [["minimax","Minimax"],["gap","Gap"],["gini","Gini"]]],
                    ["Both", [["balanced","Balanced"]]],
                    ["Efficiency", [["total","Total"]]],
                  ].map(([cat,items])=>(
                    <div key={cat} className="objgrp">
                      <span className="objgrp-l">{cat}</span>
                      <div className="objbtns">
                        {items.map(([k,l])=>(
                          <button key={k} className={"objbtn"+(objective===k?" on":"")} onClick={()=>setObjective(k)}>{l}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="objdesc">{OBJ_META[objective].desc}</div>
                <div className="objnums">
                  <Zap size={13}/>
                  <b>{OBJ_META[objective].base.toFixed(OBJ_META[objective].d)} → {OBJ_META[objective].now.toFixed(OBJ_META[objective].d)}</b>
                  <em>({(100*(1-OBJ_META[objective].now/(OBJ_META[objective].base||1))).toFixed(0)}% lower)</em>
                </div>
                <div className="objnote">
                  All 72 matches kept on their dates; one match per stadium per day; host nations stay in-country.
                  {objective==="minimax"
                    ? " Matches the exact CBC MILP optimum at default weights (see Formulae)."
                    : " Constrained local search (see Formulae)."}
                </div>
              </>
            ) : (
              <div className="delta muted">The real FIFA schedule. Switch to reassign all 72 matches
                under a chosen objective, subject to the calendar and no-double-booking constraints.</div>
            )}
          </div>

          <Group title="Arrival">
            <Slider label="Arrival lead (days before each team's first match)" v={lead} min={1} max={14} step={1}
              onChange={setLead} tip="Days a team arrives before its first match. More lead time means more chance to shake off jet-lag before kickoff." fmt={(x)=>`${x} d`} hint="default buffer for all teams; override any single team in its detail panel"/>
          </Group>

          <button className="advtoggle" onClick={()=>setAdvanced(!advanced)} aria-expanded={advanced}>
            {advanced ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
            Advanced: factor coefficients
          </button>

          {advanced && (<>
          <Group title="Jet-lag">
            <Slider label="Eastward jet-lag weight" v={H.aE} min={0} max={2} step={0.05} onChange={(x)=>setH({...H,aE:x})} tip="How much eastward time-zone travel hurts. Flying east (losing hours) is harder to recover from than west, so it sits above the westward weight."/>
            <Slider label="Westward jet-lag weight" v={H.aW} min={0} max={2} step={0.05} onChange={(x)=>setH({...H,aW:x})} tip="How much westward time-zone travel hurts. Gaining hours is easier on the body clock than losing them."/>
            <Slider label="Recovery days per time-zone hour" v={H.kappa} min={0.25} max={3} step={0.05} onChange={(x)=>setH({...H,kappa:x})} tip="Days the body needs to adjust per hour of time-zone shift, roughly one day per zone. Arriving early eats into this."/>
          </Group>

          <Group title="Travel">
            <Slider label="Last-minute travel surcharge" v={H.delta} min={0} max={2} step={0.05} onChange={(x)=>setH({...H,delta:x})} tip="Extra penalty for flying to a match on short rest, added on top of the raw distance."/>
            <Slider label="Surcharge decay (days)" v={H.tau} min={0.5} max={6} step={0.1} onChange={(x)=>setH({...H,tau:x})} tip="How quickly that short-rest travel penalty fades as the gap between matches grows."/>
          </Group>

          <Group title="Heat">
            <Slider label="Comfortable heat threshold (°C)" v={H.thetaHeat} min={20} max={34} step={0.5} onChange={(x)=>setH({...H,thetaHeat:x})} tip="Heat only counts above this WBGT temperature. 28°C is where heat-stress risk climbs, the level FIFPRO flags for postponement." fmt={(x)=>`${x}°`}/>
          </Group>

          <Group title="Altitude">
            <Slider label="Altitude threshold (m)" v={H.h0} min={0} max={2500} step={50} onChange={(x)=>setH({...H,h0:x})} tip="Thin-air strain only counts above this elevation. Aerobic performance starts dropping around 1500 m." fmt={(x)=>`${x}m`}/>
            <Slider label="High-altitude exposure weight" v={H.bExp} min={0} max={3} step={0.05} onChange={(x)=>setH({...H,bExp:x})} tip="How much playing at altitude above the threshold matters."/>
            <Slider label="Altitude-change weight" v={H.bTrans} min={0} max={2} step={0.05} onChange={(x)=>setH({...H,bTrans:x})} tip="How much the elevation swing between a team's base camp and each venue matters."/>
          </Group>

          <Group title="Congestion">
            <Slider label="Ideal rest gap (days)" v={H.gMin} min={1} max={7} step={1} onChange={(x)=>setH({...H,gMin:x})} tip="Matches closer together than this many days draw a congestion penalty. About 4 days (96 hours) is the recovery line." fmt={(x)=>`${x} d`}/>
          </Group>
          </>)}

          <Group title="Composite weights">
            {METRICS.map((m)=>(
              <Slider key={m.k} label={m.label} color={m.col} v={W[m.k]} min={0} max={1} step={0.01}
                onChange={(x)=>setW({...W,[m.k]:x})} tip={m.tip} fmt={()=>`${(wN[m.k]*100).toFixed(0)}%`}/>
            ))}
          </Group>

          <button className="reset" onClick={reset}><RotateCcw size={13}/> Reset to defaults</button>
        </aside>)}

        {/* PANEL */}
        <main className="panel">
          {/* always-visible fan control: the real FIFA draw vs a fairer redraw */}
          <div className="fairswitch">
            <Scale size={14}/>
            <span className="fairswitch-l">Schedule</span>
            <div className="seg fairseg">
              <button className={mode==="fifa"?"on":""} onClick={()=>setFairer(false)}>Actual draw</button>
              <button className={mode==="fair"?"on":""} onClick={()=>setFairer(true)}>Fairer draw</button>
            </div>
            <span className="fairswitch-note">
              {mode==="fair"
                ? <>a fairer draw FIFA could've played{expert?` · ${OBJ_META[objective].label.toLowerCase()}`:""}</>
                : <>the real FIFA schedule</>}
            </span>
          </div>
          <nav className="tabs">
            <Tab id="rank" cur={tab} set={setTab} icon={BarChart3}>Rankings</Tab>
            <Tab id="map"  cur={tab} set={setTab} icon={MapIcon}>Journey map</Tab>
            {expert && <Tab id="sens" cur={tab} set={setTab} icon={Activity}>Stability</Tab>}
            <Tab id="how"  cur={tab} set={setTab} icon={BookOpen}>How it works</Tab>
            {expert && <Tab id="math" cur={tab} set={setTab} icon={Sigma}>Formulae</Tab>}
          </nav>

          {tab==="rank" && (
            <div className="rankwrap" ref={rankwrapRef}>
              <div className="legend">
                {METRICS.map((m)=>(
                  <span key={m.k} className="lg"><i style={{background:m.col}}/><Term def={m.tip}>{m.label}</Term></span>
                ))}
                <span className="lg-note">bar length = total <Term def="Composite fatigue score: 100 × the weighted blend of the five factors. Higher = a more punishing draw.">burden</Term> · click a team for its itinerary{mode==="fair"?" · ":""}{mode==="fair" && <b style={{color:"var(--gold)"}}>▲▼ change from actual fixtures</b>}</span>
              </div>
              <div className="sortbar">
                <span className="sortbar-l">Sort</span>
                {[["burden","Burden"],["group","By group"],["az","A–Z"],["fifa","FIFA rank"]].map(([k,l])=>(
                  <button key={k} className={"sortbtn"+(sortMode===k?" on":"")} onClick={()=>setSortMode(k)}>{l}</button>
                ))}
                {sortMode==="fifa" && <span className="sortbar-note">≈ snapshot, Apr 2026 (sub-20 estimated)</span>}
                {sortMode==="group" && <span className="sortbar-note">rank # = overall burden rank · bars share one scale</span>}
              </div>
              <div className="conffilter">
                <span className="sortbar-l">Confed.</span>
                <button className={"confchip"+(conf==="all"?" on":"")} onClick={()=>setConf("all")}>All</button>
                {CONFEDERATIONS.map((c)=>(
                  <button key={c} className={"confchip"+(conf===c?" on":"")} onClick={()=>setConf(conf===c?"all":c)}>{c}</button>
                ))}
              </div>
              {sortMode==="group" ? (
                <div className="bars">
                  {groups.map(({g,gr,gap:gg})=>{
                    const grf = conf==="all" ? gr : gr.filter((r)=>r.cf===conf);
                    if(!grf.length) return null;
                    return (
                    <div key={g} className="grp">
                      <div className="grp-h">
                        <span className="grp-g">Group {g}</span>
                        <span className="grp-gap">intra-group gap {gg.toFixed(1)}</span>
                      </div>
                      {grf.map((r)=>barFor(r))}
                    </div>
                    );
                  })}
                </div>
              ) : (
                (()=>{ const flat = conf==="all" ? displayed : displayed.filter((r)=>r.cf===conf);
                  return flat.length
                    ? <div className="bars">{flat.map((r)=>barFor(r))}</div>
                    : <div className="emptybars">No teams from {conf} in this view.</div>; })()
              )}
              <div className="sumrow">
                {expert ? (<>
                <div className="sum-cell"><span>total</span><b>{curTot.toFixed(1)}</b></div>
                <div className="sum-cell">
                  <span>mean</span><b>{mean.toFixed(1)}</b>
                  {statMode==="range"
                    ? <><span className="pm">range</span><b>{minC.toFixed(1)}–{maxC.toFixed(1)}</b></>
                    : <><span className="pm">±</span><b>{(statMode==="sd"?sd:variance).toFixed(statMode==="sd"?1:2)}</b></>}
                  <select className="statsel" value={statMode} onChange={(e)=>setStatMode(e.target.value)}>
                    <option value="sd">std dev</option>
                    <option value="var">variance</option>
                    <option value="range">min–max</option>
                  </select>
                </div>
                </>) : (
                <div className="sum-readout">
                  {mode==="fair"
                    ? <>This is the <b>fairer draw</b>: the bars even out. Flip to <b>Actual draw</b> to see what FIFA really did.</>
                    : ratio
                      ? <>The hardest trip is <b>{ratio.toFixed(1)}×</b> the easiest. Flip to <b>Fairer draw</b> above to shrink that gap.</>
                      : <>Flip to <b>Fairer draw</b> above to see a more even schedule.</>}
                </div>
                )}
                <div className="sum-export">
                  <button className="expbtn" title="Download this ranking as CSV"
                    onClick={()=>download(`wc2026-burden-${mode}.csv`,
                      "rank,team,group,confederation,burden,jet,travel,heat,alt,cong,fifa_rank\n"+
                      rows.map(r=>[r.rank,`"${r.t}"`,r.g,r.cf,r.cmp.toFixed(2),
                        ...METRICS.map(m=>(r.parts[m.k]*100).toFixed(2)),r.fifa].join(",")).join("\n"),
                      "text/csv")}>
                    <Download size={12}/> CSV
                  </button>
                  <button className="expbtn" title="Download this ranking as JSON"
                    onClick={()=>download(`wc2026-burden-${mode}.json`,
                      JSON.stringify({mode,objective,weights:wN,coefficients:H,arrivalLead:lead,
                        audit:MILP_AUDIT, teams:rows.map(r=>({rank:r.rank,team:r.t,group:r.g,confederation:r.cf,
                          burden:+r.cmp.toFixed(3),factors:Object.fromEntries(METRICS.map(m=>[m.k,+(r.parts[m.k]*100).toFixed(3)])),
                          venues:r.venues,dates:r.dates,fifaRank:r.fifa}))}, null, 2),
                      "application/json")}>
                    <Download size={12}/> JSON
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab==="sens" && <Sensitivity H={H} wN={wN} lead={lead} leadOv={leadOv} baseOv={baseOv} rows={rows}/>}

          {tab==="map" && <JourneyMap row={selRow} onPick={setSel} onDetails={openTeam} rows={rows}/>}

          {tab==="how" && <HowItWorks/>}

          {tab==="math" && <Formulae H={H} wN={wN} lead={lead}/>}
        </main>
      </div>

      {/* ---------------- FIND YOUR TEAM ---------------- */}
      {pickerOpen && <TeamPicker onPick={openTeam} onClose={()=>setPickerOpen(false)}/>}

      {/* ---------------- DETAIL DRAWER ---------------- */}
      {selRow && drawerOpen && <Detail row={selRow} onClose={()=>setDrawerOpen(false)} onShowMap={(name)=>{setSel(name);setTab("map");setDrawerOpen(false);}} baseOv={baseOv} setBaseOv={setBaseOv} leadOv={leadOv} setLeadOv={setLeadOv} lead={lead} rows={rows} copyLink={copyLink} copied={copied} mode={mode} objective={objective} onOpenTeam={openTeam}/>}

      <footer className="foot">
        Built for exploration · five-factor fatigue model over the confirmed WC2026 group draw ·
        all numbers recompute live from the console
      </footer>
    </div>
  );
}

/* ----------------------------- subcomponents ------------------------------- */
function StatCard({label,big,flag,sub,accent,onClick,tip}){
  const inner = (<>
    <div className="stat-l">{label}{tip && <InfoTip text={tip}/>}</div>
    <div className="stat-b" style={{color:accent}}>{flag&&<span style={{marginRight:6}}>{flag}</span>}{big}</div>
    <div className="stat-s">{sub}</div>
  </>);
  return onClick
    ? <button className="stat" onClick={onClick} style={{borderTopColor:accent,cursor:"pointer"}}>{inner}</button>
    : <div className="stat" style={{borderTopColor:accent}}>{inner}</div>;
}
// small "i" info button with a tap/hover tooltip bubble (works on mobile, closes on outside click/Esc)
function InfoTip({text}){
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    if(!open) return;
    const close=()=>setOpen(false);
    window.addEventListener("click",close); window.addEventListener("keydown",close);
    return ()=>{ window.removeEventListener("click",close); window.removeEventListener("keydown",close); };
  },[open]);
  return (
    <span className="infotip">
      <button type="button" className="infotip-btn" aria-label="What does this mean?" title={text}
        onClick={(e)=>{ e.stopPropagation(); e.preventDefault(); setOpen((o)=>!o); }}>i</button>
      {open && <span className="infotip-pop" role="tooltip" onClick={(e)=>e.stopPropagation()}>{text}</span>}
    </span>
  );
}
function Group({title,children}){
  return (<div className="grp"><div className="grp-t">{title}</div>{children}</div>);
}
// inline jargon tooltip (hover / focus): dotted underline, native title for a11y
function Term({children, def}){
  return <abbr className="term" title={def} tabIndex={0}>{children}</abbr>;
}
// "find your team" overlay: searchable flag grid grouped by confederation
function TeamPicker({onPick,onClose}){
  const [q,setQ]=useState("");
  const ql=q.trim().toLowerCase();
  useEffect(()=>{
    const onKey=(e)=>{ if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",onKey); return ()=>window.removeEventListener("keydown",onKey);
  },[onClose]);
  return (
    <div className="picker-wrap" onClick={onClose}>
      <div className="picker" onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Find your team">
        <button className="dclose" onClick={onClose} aria-label="Close"><X size={18}/></button>
        <div className="picker-h"><Search size={16}/> Find your team</div>
        <input className="picker-q" autoFocus placeholder="Search 48 teams…" value={q} onChange={(e)=>setQ(e.target.value)}/>
        <div className="picker-body">
          {CONFEDERATIONS.map((cf)=>{
            const ts=TEAMS.filter((t)=>t.cf===cf && (!ql || t.t.toLowerCase().includes(ql)));
            if(!ts.length) return null;
            return (
              <div key={cf} className="picker-conf">
                <div className="picker-conf-l">{cf}</div>
                <div className="picker-grid">
                  {ts.map((t)=>(
                    <button key={t.t} className="picker-team" onClick={()=>{onPick(t.t);onClose();}}>
                      <span className="picker-flag">{t.f}</span><span className="picker-tn">{t.t}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function Slider({label,v,min,max,step,onChange,fmt,color,hint,tip}){
  const pct = ((v-min)/(max-min))*100;
  return (
    <label className="sl">
      <div className="sl-top">
        <span>{color&&<i className="dot" style={{background:color}}/>}{label}{tip && <InfoTip text={tip}/>}</span>
        <b>{fmt?fmt(v):(+v).toFixed(2)}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e)=>onChange(parseFloat(e.target.value))}
        style={{background:`linear-gradient(90deg,var(--cyan) ${pct}%,rgba(22,25,28,.10) ${pct}%)`}}/>
      {hint&&<div className="sl-hint">{hint}</div>}
    </label>
  );
}
function Tab({id,cur,set,icon:Icon,children}){
  return (
    <button className={"tab"+(cur===id?" on":"")} onClick={()=>set(id)}>
      <Icon size={14}/> {children}
    </button>
  );
}

// ---- plain-language explainer ----
function HowItWorks(){
  return (
    <div className="how">
      <p className="how-lead">
        Each team is reduced to one journey: <b>home origin to a North-American base camp to three
        group venues</b>, with round trips from the camp. Five factors score how punishing that
        journey is. Everything is built from facts (locations, time zones, elevations, match dates)
        plus the settings in the console on the left. The exact equations and symbols live in the
        <b> Formulae</b> tab.
      </p>

      <Factor id="factor-jet" icon={Clock} col="var(--magenta)" name="Jet-lag">
        The time-zone gap between home and the base camp, weighted more heavily for eastward shifts
        than westward ones. Arriving early softens it: more days to adjust before the first match
        means less of a hit.
      </Factor>

      <Factor id="factor-travel" icon={Plane} col="var(--cyan)" name="Travel">
        Total round-trip flying distance from base camp out to each venue. A long trip right before
        kick-off counts for more than the same trip with plenty of rest beforehand.
      </Factor>

      <Factor id="factor-heat" icon={Sun} col="var(--orange)" name="Heat">
        How far each venue's expected June heat sits above a comfort threshold. Houston, Monterrey and
        Miami punish; Vancouver, Seattle and altitude-cooled Mexico City barely register.
      </Factor>

      <Factor id="factor-alt" icon={Mountain} col="var(--green)" name="Altitude">
        Two strains added together: <b>thin air</b> (how far each venue sits above ~1500 m) and the
        <b> swing</b> of every hop between your base camp's elevation and the venue's, so even a sea-level
        match costs if your camp is high. Example: a camp in Guadalajara (1566 m) plus a match up in
        Mexico City (2240 m) and another down at sea level in Miami stacks up exposure <i>and</i> two
        big elevation swings, even though only one venue is genuinely high.
      </Factor>

      <Factor id="factor-cong" icon={CalendarClock} col="var(--violet)" name="Congestion">
        A penalty whenever the rest gap between two consecutive matches falls below the ideal.
      </Factor>

      <div className="how-comp">
        <div className="how-comp-t"><Trophy size={14}/> Putting it together</div>
        <p className="how-foot">
          The five factors are rescaled to a common range and blended using the weights you set,
          giving one burden score per team. The <b>Fairer draw</b> view then asks a harder question:
          keeping every team's base camp and match dates fixed, can the 72 matches be re-slotted across
          the 16 cities so the <i>worst-off</i> team suffers as little as possible? Teams couple because
          no two matches can share a stadium on the same day, so it is a real assignment problem, not
          twelve independent ones. See the <b>Formulae</b> tab for the optimisation.
        </p>
      </div>

      <div className="prov-block">
        <div className="how-comp-t"><ShieldCheck size={14}/> Data provenance</div>
        <div className="prov-rows">
          <div className="prov-r"><span className="pv-badge ok"><ShieldCheck size={11}/> confirmed</span>
            All 72 group-stage fixtures (teams, venue, date), the 12 groups, home nations, announced base camps, and host-city geography (lat/lon, elevation, June UTC offset).</div>
          <div className="prov-r"><span className="pv-badge est"><Search size={11}/> estimated</span>
            FIFA world ranking: top-20 + Canada are published; teams below ~20 are approximate (used only for the FIFA-rank sort, never in the burden score).</div>
          <div className="prov-r"><span className="pv-badge proxy"><AlertTriangle size={11}/> proxy</span>
            Heat is a hand-set seasonal WBGT estimate per city. It ignores kickoff time, humidity, and closed-roof / air-conditioned stadiums. Model coefficients and reference scales are reasoned defaults, not fitted.</div>
        </div>
      </div>

      <div className="caveat-block">
        <div className="how-comp-t"><AlertTriangle size={14}/> What this does <u>not</u> claim</div>
        <ul className="caveat-list">
          <li>It's an <b>illustrative, tunable model</b>, not calibrated against real fatigue or performance data. "FIFA is unfair by X" is relative to <i>this</i> model and your weights.</li>
          <li>The optimizer holds <b>base camps and match dates fixed</b>, so it can only move travel/heat/altitude, never jet-lag or congestion.</li>
          <li>Its constraints are <b>looser than FIFA's real ones</b> (no stadium capacity, broadcast windows, or regional clustering), so the fairness gains are an upper bound, not an operational schedule.</li>
          <li>Only <b>minimax at default weights</b> is certified optimal (matches the exact CBC solver); the other objectives are near-optimal heuristics.</li>
        </ul>
        <p className="caveat-foot">Check the <b>Stability</b> tab to see how much the ranking depends on your weight choices, and export the full data from the Rankings tab to re-derive it yourself.</p>
      </div>
    </div>
  );
}
function Factor({icon:Icon,col,name,children,id}){
  return (
    <div className="eq" id={id} style={{borderLeftColor:col}}>
      <div className="eq-h"><Icon size={15} style={{color:col}}/><b>{name}</b></div>
      <p>{children}</p>
    </div>
  );
}

// ---- formal formulae + symbol glossary ----
function Formulae({H,wN,lead}){
  const n = (x,d=2)=>Number(x).toFixed(d);
  const gloss = [
    ["Δz","Shortest-direction time-zone shift, home to base camp (hours)","per team",false],
    ["B","Acclimatisation buffer = arrival lead, the days before the team's own first match","per team",false],
    ["α_E","Eastward jet-lag weight",n(H.aE),true],
    ["α_W","Westward jet-lag weight",n(H.aW),true],
    ["κ","Recovery days per time-zone hour",n(H.kappa),true],
    ["D(a,b)","Great-circle (haversine) distance between two cities (km)","geometry",false],
    ["restₘ","Rest days before match m","per team",false],
    ["δ","Last-minute travel surcharge",n(H.delta),true],
    ["τ","Surcharge decay constant (days)",n(H.tau,1),true],
    ["WBGTₘ","June heat proxy at venue m (°C)","data",false],
    ["θ","Comfortable heat threshold (°C)",`${n(H.thetaHeat,0)}°`,true],
    ["hₘ, h_camp","Elevation of venue m / base camp (m)","data",false],
    ["h₀","Altitude threshold (m)",`${n(H.h0,0)}m`,true],
    ["β_exp","High-altitude exposure weight",n(H.bExp),true],
    ["β_tr","Altitude-change weight",n(H.bTrans),true],
    ["gapₘ","Days between consecutive matches","per team",false],
    ["g_min","Ideal rest gap (days)",n(H.gMin,0),true],
    ["wᵢ","Composite weight for factor i","see above",false],
    ["refᵢ","Fixed rescale constant per factor","12 / 25 / 12 / 25 / 6",false],
    ["lead","Arrival lead = B: default days before each team's first match",`${n(lead,0)}d default`,true],
  ];
  return (
    <div className="how">
      <p className="how-lead">
        Formal definitions, evaluated for a single team.{" "}
        <span className="warn2">Tunable</span> symbols take their current console values;{" "}
        <span className="ok2">per-team and data</span> symbols come from the fixtures and geography.
      </p>

      <Eq icon={Clock} col="var(--magenta)" name="Arrival jet-lag"
        body="JetLag = J(Δz) · max(0, 1 − B / (κ·|Δz|))"
        sub="with J(Δz) = |Δz| · (α_E if eastward, else α_W). Zero when home and camp share a time zone."/>
      <Eq icon={Plane} col="var(--cyan)" name="Travel"
        body="Travel = Σₘ 2·D(camp, venueₘ) · (1 + δ·e^(−restₘ / τ))"
        sub="Summed over the three group matches as round trips from the base camp."/>
      <Eq icon={Sun} col="var(--orange)" name="Heat"
        body="Heat = Σₘ max(0, WBGTₘ − θ)"/>
      <Eq icon={Mountain} col="var(--green)" name="Altitude"
        body="Alt = Σₘ [ β_exp·max(0, hₘ − h₀) + β_tr·|hₘ − h_camp| ]"/>
      <Eq icon={CalendarClock} col="var(--violet)" name="Congestion"
        body="Cong = Σₘ max(0, g_min − gapₘ)"/>

      <div className="how-comp">
        <div className="how-comp-t"><Trophy size={14}/> Composite burden</div>
        <code>Burden = 100 · Σᵢ wᵢ · (factorᵢ / refᵢ)</code>
        <div className="how-w">
          {METRICS.map((m)=>(
            <span key={m.k}><i style={{background:m.col}}/>{m.label} <b>{(wN[m.k]*100).toFixed(0)}%</b></span>
          ))}
        </div>
        <p className="how-foot">
          Reference scales <b>{`{ jet 12, travel 25, heat 12, alt 25, cong 6 }`}</b> are fixed, not
          data-derived, so the five factors stay comparable across teams as you retune the weights.
        </p>
      </div>

      <div className="how-comp" style={{marginTop:14}}>
        <div className="how-comp-t"><Scale size={14}/> Venue-assignment audit (constrained MILP)</div>
        <p className="how-foot" style={{marginTop:0}}>
          With each team's base camp and match dates fixed, jet-lag and congestion are constant; travel,
          heat and altitude are additively separable over a team's three matches. So the burden is
          <b> linear</b> in the venue assignment, and "make the worst team as light as possible" is an
          exact mixed-integer program:
        </p>
        <code style={{display:"block",whiteSpace:"pre-wrap",lineHeight:1.7}}>
{`min  Z
s.t. Z ≥ κ(t) + Σₘ Σ_c cost(t,m,c)·x[m,c]   ∀ teams t
     Σ_c x[m,c] = 1                          ∀ matches m
     Σ_{m: day(m)=d} x[m,c] ≤ 1              ∀ day d, city c
     x[m,c] ∈ {0,1},  x[m,c]=0 if c ∉ A(m)`}
        </code>
        <p className="how-foot">
          <b>Z</b> is the worst team's burden (epigraph form of the minimax); <b>x[m,c]</b> places match
          m in city c; <b>κ(t)</b> folds in the venue-independent jet-lag + congestion; <b>cost(t,m,c)</b>
          is the weighted travel/heat/altitude term. The third line keeps one match per stadium per day,
          which couples the twelve groups; <b>A(m)</b> keeps each host nation's matches in its own country.
        </p>
        <div className="milp-nums">
          <div><span className="mn-k">worst-team burden</span><span className="mn-v">{MILP_AUDIT.actualMax.toFixed(1)} → {MILP_AUDIT.optMax.toFixed(1)}</span></div>
          <div><span className="mn-k">fairness gap (max−min)</span><span className="mn-v">{MILP_AUDIT.actualGap.toFixed(1)} → {MILP_AUDIT.optGap.toFixed(1)}</span></div>
          <div><span className="mn-k">matches moved (one optimum)</span><span className="mn-v">{MILP_AUDIT.moved} / 72</span></div>
        </div>
        <p className="how-foot">
          Solved exactly with CBC at the default weighting; the worst-team burden and fairness gap above
          are optimal. The optimum is not unique, so the precise set of relocated matches can vary. The
          in-app <b>Fairer draw</b> toggle runs a warm-started local search that attains the same optimum
          and re-solves live as you move the sliders.
        </p>
        <p className="how-foot">
          Note the objective is <b>minimax</b> (worst team) plus total burden, <i>not</i> Gini. Because
          Gini is mean-normalised, it can <i>rise</i> even as the gap shrinks: pulling the worst team down
          lowers both the range and the mean and lets a couple of teams reach near-zero burden, which is
          more unequal in relative terms. Gap and Gini are simply different fairness lenses.
        </p>
      </div>

      <div className="dsec-t" style={{marginTop:20}}>Symbol glossary</div>
      <table className="gloss">
        <thead><tr><th>Symbol</th><th>Meaning</th><th>Value</th></tr></thead>
        <tbody>
          {gloss.map((g,i)=>(
            <tr key={i}>
              <td className="gsym">{g[0]}</td>
              <td>{g[1]}</td>
              <td className={"gval"+(g[3]?" tune":"")}>{g[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Eq({icon:Icon,col,name,body,sub}){
  return (
    <div className="eq" style={{borderLeftColor:col}}>
      <div className="eq-h"><Icon size={15} style={{color:col}}/><b>{name}</b></div>
      <code style={{color:col}}>{body}</code>
      {sub && <p>{sub}</p>}
    </div>
  );
}

// ---- North America basemap (projected to the map's exact coordinates) ----
const USA_PATH="M367.3,60.9 L369.2,66.6 L372.5,68.3 L379.9,69.0 L390.8,70.6 L401.1,73.8 L409.7,72.5 L422.8,75.2 L426.3,75.1 L435.8,72.1 L445.8,75.9 L456.2,79.9 L464.8,83.3 L473.1,86.6 L474.1,89.3 L476.6,90.3 L476.0,91.4 L478.8,91.7 L480.9,90.6 L481.4,93.1 L483.6,94.7 L486.5,94.7 L488.1,95.9 L486.7,97.8 L497.8,102.6 L500.1,112.0 L502.2,121.0 L499.1,127.0 L494.1,132.7 L491.8,136.3 L491.5,137.4 L492.7,138.9 L496.3,140.5 L499.0,140.5 L511.4,135.0 L522.3,133.4 L536.3,128.2 L535.5,124.1 L533.8,122.0 L538.6,120.4 L549.1,120.4 L558.8,120.4 L562.2,116.3 L563.6,115.5 L574.8,108.1 L579.6,106.2 L595.8,106.1 L615.4,106.1 L616.5,103.6 L619.9,103.1 L624.4,101.5 L628.2,96.8 L631.4,88.7 L639.5,81.0 L643.1,83.7 L650.2,81.9 L654.9,84.9 L654.9,99.0 L661.9,104.8 L663.7,108.2 L652.4,113.2 L641.4,116.7 L630.2,119.8 L624.6,125.9 L622.7,128.2 L622.6,133.7 L626.2,139.2 L630.6,139.4 L629.5,135.7 L632.6,138.0 L631.8,140.9 L624.6,142.6 L619.5,142.4 L611.6,144.2 L607.0,144.7 L600.8,145.2 L591.9,148.2 L607.6,146.2 L610.7,148.2 L595.8,151.3 L589.0,151.3 L589.4,150.0 L586.1,152.9 L589.2,153.4 L586.9,160.8 L579.2,168.7 L578.4,166.1 L576.1,165.5 L572.6,163.0 L574.8,168.5 L577.4,170.4 L577.6,174.3 L574.2,178.3 L568.2,186.5 L567.2,186.1 L570.5,179.1 L565.1,175.1 L563.8,166.6 L561.8,171.0 L564.1,177.6 L557.0,175.9 L564.3,179.3 L564.8,189.1 L567.9,189.8 L569.0,193.4 L570.5,203.7 L563.7,211.3 L552.7,214.4 L545.7,220.5 L540.4,221.1 L535.0,224.9 L533.5,228.4 L521.8,235.1 L515.8,240.0 L510.8,246.1 L509.1,253.4 L511.0,260.6 L514.6,269.4 L519.3,276.7 L519.3,281.2 L524.4,293.1 L524.0,300.1 L523.6,304.1 L520.9,310.4 L517.7,311.7 L512.5,310.5 L510.8,305.9 L506.8,303.6 L501.1,294.7 L496.2,286.8 L494.6,282.8 L496.8,275.9 L493.8,270.2 L485.5,261.6 L481.3,260.0 L470.6,264.7 L468.7,264.2 L463.5,259.4 L456.9,256.8 L444.8,258.1 L435.4,257.0 L427.3,257.7 L422.9,259.3 L424.8,262.0 L424.6,266.2 L426.9,268.3 L424.8,269.6 L420.9,268.1 L416.9,270.1 L409.2,269.7 L401.2,264.3 L391.9,265.6 L384.2,263.2 L377.6,263.9 L368.6,266.3 L358.9,274.0 L348.4,278.4 L342.5,283.3 L340.1,288.0 L340.0,295.1 L340.5,300.0 L342.5,303.6 L338.4,303.9 L330.8,301.6 L322.5,298.4 L319.6,293.5 L317.2,286.3 L310.9,280.4 L307.2,274.4 L301.9,267.3 L294.4,263.2 L285.7,263.4 L279.0,271.6 L270.2,268.5 L264.7,265.4 L262.0,259.7 L258.5,254.3 L252.2,249.8 L246.7,246.5 L242.8,242.8 L224.4,242.8 L224.4,247.1 L215.9,247.1 L194.8,247.2 L170.5,239.9 L154.4,234.9 L155.4,232.9 L141.9,234.0 L129.8,234.8 L128.0,229.5 L121.1,223.6 L116.1,222.4 L115.0,219.4 L109.0,218.9 L105.2,216.1 L95.3,215.1 L92.6,213.4 L91.3,207.8 L81.0,197.4 L72.1,183.0 L72.5,180.7 L67.8,177.2 L59.5,168.6 L58.1,160.2 L52.4,154.6 L54.7,146.0 L54.4,137.2 L51.0,129.3 L55.1,119.5 L56.4,110.2 L57.7,100.8 L55.8,87.0 L52.4,78.1 L49.3,73.4 L50.6,71.3 L66.0,74.9 L71.7,84.6 L74.3,81.9 L72.6,73.4 L69.0,64.9 L99.2,64.9 L130.8,64.9 L141.3,64.9 L173.7,64.9 L205.1,64.9 L237.1,64.9 L269.0,64.9 L305.2,64.9 L341.6,64.9 L363.6,64.9 L363.7,61.0 L367.3,60.9ZM-274.0,-163.5 L-266.3,-158.9 L-261.6,-160.9 L-243.6,-160.2 L-244.3,-157.9 L-228.0,-156.1 L-217.1,-157.2 L-194.7,-153.9 L-174.2,-152.9 L-166.0,-151.6 L-151.9,-153.3 L-135.7,-150.2 L-124.2,-148.7 L-124.2,-110.4 L-124.3,-51.7 L-113.8,-51.4 L-103.4,-48.5 L-96.0,-44.0 L-86.5,-37.2 L-76.2,-43.0 L-65.5,-46.3 L-59.9,-41.0 L-52.7,-36.8 L-42.9,-32.1 L-36.3,-24.7 L-25.4,-13.0 L-7.3,-6.4 L-7.0,0.1 L-12.9,5.1 L-18.8,1.2 L-28.2,-2.1 L-31.2,-11.1 L-44.9,-19.4 L-50.6,-29.2 L-60.8,-29.8 L-77.8,-30.1 L-90.2,-33.1 L-112.3,-43.8 L-122.4,-45.7 L-141.1,-49.4 L-155.8,-48.5 L-176.7,-53.3 L-189.4,-57.7 L-201.2,-55.5 L-199.0,-48.3 L-204.9,-47.6 L-217.2,-45.5 L-226.6,-42.0 L-238.4,-39.8 L-239.9,-45.9 L-235.1,-56.0 L-223.8,-59.2 L-226.7,-61.8 L-240.3,-56.0 L-247.5,-49.2 L-262.9,-41.8 L-255.1,-36.8 L-265.2,-29.4 L-276.6,-25.1 L-287.2,-21.9 L-289.9,-17.4 L-306.5,-12.0 L-309.9,-7.2 L-322.3,-2.8 L-329.6,-3.6 L-339.6,-0.7 L-350.4,2.8 L-359.2,6.3 L-377.5,9.2 L-379.1,7.5 L-367.5,2.6 L-357.1,-0.5 L-345.7,-6.2 L-332.5,-7.3 L-327.3,-11.6 L-312.5,-17.8 L-310.2,-19.8 L-302.3,-23.5 L-300.5,-31.3 L-295.1,-37.4 L-307.3,-34.2 L-310.8,-36.0 L-316.5,-32.3 L-323.5,-37.5 L-326.3,-33.8 L-330.3,-38.9 L-341.0,-34.8 L-347.5,-34.8 L-348.4,-41.0 L-346.5,-44.7 L-353.3,-48.4 L-367.2,-46.4 L-376.2,-51.3 L-383.4,-53.8 L-383.5,-59.6 L-391.7,-64.0 L-387.6,-69.9 L-378.9,-75.7 L-375.1,-81.0 L-366.5,-81.7 L-359.2,-80.1 L-350.6,-85.1 L-342.9,-84.2 L-334.8,-87.4 L-336.7,-92.1 L-342.7,-93.9 L-334.8,-97.9 L-341.4,-97.8 L-352.7,-95.6 L-355.9,-93.3 L-364.3,-95.6 L-379.3,-94.4 L-394.9,-96.9 L-399.4,-101.0 L-412.9,-107.0 L-397.9,-111.3 L-374.2,-116.4 L-365.4,-116.4 L-366.9,-111.2 L-344.4,-111.6 L-353.0,-118.0 L-366.1,-121.9 L-373.7,-127.1 L-383.9,-131.5 L-398.5,-134.8 L-392.6,-140.2 L-373.7,-140.5 L-360.3,-145.2 L-357.7,-150.2 L-346.9,-155.1 L-336.5,-156.3 L-316.3,-160.9 L-306.5,-160.2 L-290.1,-165.7 L-274.0,-163.5Z";
const CAN_PATH="M698.9,90.2 L706.6,91.6 L716.4,91.3 L711.2,95.6 L707.3,96.2 L693.8,91.8 L691.1,88.4 L695.1,85.2 L698.9,90.2ZM718.6,63.9 L713.5,64.0 L699.7,60.8 L689.8,55.9 L693.4,55.1 L707.4,57.7 L718.3,62.0 L718.6,63.9ZM61.9,70.0 L56.5,71.4 L39.0,66.8 L35.8,63.1 L26.3,59.5 L24.4,56.5 L13.4,54.7 L9.3,49.1 L10.3,46.7 L21.4,48.9 L28.0,50.5 L38.0,51.6 L41.6,55.1 L46.8,60.0 L57.5,64.3 L61.9,70.0ZM779.0,47.5 L772.0,56.6 L778.9,53.1 L786.1,55.3 L782.3,58.9 L791.8,61.7 L796.7,59.2 L807.3,62.4 L804.0,69.9 L811.5,68.2 L812.8,73.6 L816.1,80.1 L811.6,89.1 L806.8,89.5 L799.8,87.6 L802.1,79.1 L799.2,77.8 L786.8,86.8 L780.5,86.4 L788.0,81.6 L777.8,79.1 L766.3,79.7 L745.7,79.4 L744.0,76.3 L750.7,72.7 L746.0,69.9 L755.0,63.7 L766.0,47.2 L772.6,41.4 L781.8,37.8 L786.8,38.2 L784.7,41.0 L779.0,47.5ZM-36.1,13.0 L-25.8,12.1 L-29.0,23.8 L-19.8,32.1 L-24.0,32.1 L-30.4,27.4 L-34.4,22.7 L-39.7,19.4 L-41.7,14.9 L-41.1,11.6 L-36.1,13.0ZM532.8,-70.8 L528.6,-65.4 L523.9,-66.2 L521.1,-69.3 L525.7,-73.1 L530.1,-72.9 L532.8,-70.8ZM504.8,-76.5 L492.3,-70.8 L484.8,-71.0 L482.5,-73.8 L490.4,-78.6 L505.0,-78.5 L504.8,-76.5ZM412.7,-146.5 L412.7,-136.0 L426.9,-144.0 L439.6,-137.4 L436.5,-129.7 L446.7,-122.8 L457.9,-130.2 L465.6,-139.1 L466.2,-150.5 L481.3,-149.7 L497.1,-148.2 L511.4,-143.0 L512.0,-137.9 L504.1,-132.4 L511.6,-126.9 L510.2,-121.9 L489.4,-114.7 L474.6,-113.1 L463.6,-116.2 L460.4,-111.0 L450.1,-102.3 L447.0,-97.8 L434.7,-90.8 L419.5,-90.1 L411.0,-85.8 L410.3,-79.1 L398.0,-77.8 L384.9,-69.4 L373.4,-57.8 L369.3,-49.7 L368.7,-37.7 L384.3,-36.0 L389.1,-26.3 L394.1,-18.5 L409.0,-20.5 L428.8,-16.0 L439.4,-12.1 L447.0,-7.3 L460.4,-4.4 L471.6,-0.1 L489.2,0.5 L500.8,1.5 L499.1,10.5 L502.4,20.8 L510.1,32.4 L525.9,42.2 L534.1,38.8 L539.9,28.2 L534.3,11.9 L526.8,6.5 L543.8,1.6 L555.9,-5.6 L561.8,-12.8 L560.9,-19.7 L553.7,-28.4 L540.8,-36.2 L553.3,-47.0 L548.7,-56.3 L545.1,-72.5 L552.5,-74.8 L570.8,-72.0 L581.7,-71.0 L590.6,-73.7 L600.5,-70.2 L613.6,-64.3 L616.8,-60.3 L635.8,-59.5 L635.5,-50.8 L639.0,-37.8 L648.7,-36.2 L656.4,-30.1 L671.9,-35.8 L682.0,-47.2 L689.1,-52.0 L697.4,-42.8 L711.2,-29.6 L723.0,-17.2 L718.7,-10.8 L732.9,-4.9 L742.4,0.9 L759.4,3.6 L766.3,6.9 L770.5,15.6 L778.8,17.0 L783.0,20.9 L783.8,32.5 L776.1,36.4 L768.4,40.0 L750.9,43.7 L737.5,52.1 L719.5,53.8 L696.8,51.6 L680.8,51.6 L669.8,52.3 L660.8,59.7 L647.3,64.2 L631.9,77.9 L619.7,87.4 L628.7,85.7 L645.8,72.2 L668.1,63.6 L684.0,62.5 L693.5,67.6 L683.4,74.5 L686.8,85.7 L690.3,93.4 L704.1,98.6 L721.7,97.1 L732.3,85.5 L733.1,93.0 L740.0,96.7 L726.8,103.5 L703.2,109.6 L692.7,113.8 L680.8,121.2 L672.7,120.5 L672.3,111.7 L690.8,103.2 L673.7,103.5 L661.9,104.8 L654.9,99.0 L654.9,84.9 L650.2,81.9 L643.1,83.7 L639.5,81.0 L631.4,88.7 L628.2,96.8 L624.4,101.5 L619.9,103.1 L616.5,103.6 L615.4,106.1 L595.8,106.1 L579.6,106.2 L574.8,108.1 L563.6,115.5 L562.2,116.3 L558.8,120.4 L549.1,120.4 L538.6,120.4 L533.8,122.0 L535.5,124.1 L536.5,127.2 L522.3,133.4 L511.4,135.0 L499.0,140.5 L496.3,140.5 L492.7,138.9 L491.5,137.4 L491.8,136.3 L494.1,132.7 L499.1,127.0 L502.2,121.0 L500.1,112.0 L497.8,102.6 L486.7,97.8 L488.1,95.9 L486.5,94.7 L483.6,94.7 L481.4,93.1 L480.9,90.6 L478.8,91.7 L476.0,91.4 L476.6,90.3 L474.1,89.3 L473.1,86.6 L464.8,83.3 L456.2,79.9 L445.8,75.9 L435.8,72.1 L426.3,75.1 L422.8,75.2 L409.7,72.5 L401.1,73.8 L390.8,70.6 L379.9,69.0 L372.5,68.3 L369.2,66.6 L367.3,60.9 L363.7,61.0 L363.6,64.9 L341.6,64.9 L305.2,64.9 L269.0,64.9 L237.1,64.9 L205.1,64.9 L173.7,64.9 L141.3,64.9 L130.8,64.9 L99.2,64.9 L69.0,64.9 L67.6,64.9 L47.0,54.8 L39.4,50.3 L20.1,46.1 L14.1,36.9 L15.7,30.6 L2.0,26.2 L0.2,17.9 L-12.7,10.4 L-12.9,5.1 L-7.0,0.1 L-7.3,-6.4 L-25.4,-13.0 L-36.3,-24.7 L-42.9,-32.1 L-52.7,-36.8 L-59.9,-41.0 L-65.5,-46.3 L-76.2,-43.0 L-86.5,-37.2 L-96.0,-44.0 L-103.4,-48.5 L-113.8,-51.4 L-124.3,-51.7 L-124.2,-110.4 L-124.2,-148.7 L-104.3,-146.2 L-87.5,-141.3 L-76.4,-140.3 L-67.1,-144.6 L-54.2,-147.8 L-38.4,-146.6 L-22.5,-151.1 L-5.0,-153.7 L2.3,-149.4 L10.2,-151.8 L12.6,-156.7 L20.0,-155.6 L37.9,-146.3 L52.1,-153.3 L53.6,-145.5 L66.6,-147.2 L70.7,-150.2 L83.5,-149.6 L99.8,-145.3 L124.7,-141.5 L139.4,-139.7 L149.8,-140.4 L164.2,-135.2 L149.2,-130.0 L168.4,-127.8 L197.2,-129.1 L206.2,-130.9 L217.6,-124.7 L229.2,-129.9 L218.3,-134.3 L225.2,-137.8 L238.1,-138.3 L246.6,-139.3 L255.2,-136.8 L265.9,-131.2 L277.8,-132.1 L296.6,-127.4 L313.1,-129.0 L328.7,-128.8 L327.4,-135.2 L336.9,-137.0 L353.4,-133.5 L353.3,-123.8 L360.1,-132.0 L368.7,-131.7 L373.5,-142.1 L362.1,-148.4 L349.7,-152.6 L350.5,-164.0 L363.1,-171.5 L377.1,-169.8 L387.9,-165.3 L402.4,-153.7 L392.9,-148.6 L412.7,-146.5ZM455.1,-184.3 L463.5,-177.8 L473.4,-186.1 L500.3,-190.4 L518.6,-179.7 L517.0,-173.0 L538.1,-175.9 L548.1,-180.0 L571.8,-174.8 L586.4,-169.9 L587.8,-165.4 L607.6,-167.7 L618.7,-161.2 L644.3,-157.1 L653.6,-152.9 L663.7,-143.3 L644.1,-138.5 L669.2,-131.7 L686.1,-129.5 L701.4,-120.0 L718.2,-119.3 L714.8,-112.1 L696.2,-100.1 L683.1,-104.5 L666.3,-114.4 L652.6,-113.1 L651.2,-107.2 L662.4,-101.2 L676.9,-96.5 L681.2,-93.7 L688.2,-83.5 L684.5,-76.1 L671.1,-78.9 L644.4,-87.2 L659.4,-78.3 L670.5,-72.0 L672.2,-68.4 L643.4,-72.6 L620.5,-78.6 L607.6,-83.6 L611.3,-86.5 L595.5,-91.8 L580.0,-96.8 L580.1,-93.8 L549.4,-92.2 L540.4,-95.7 L547.4,-103.3 L567.4,-103.5 L589.3,-104.8 L585.7,-108.5 L589.4,-113.6 L603.2,-123.7 L600.3,-128.2 L596.2,-131.8 L579.9,-136.8 L558.3,-140.3 L565.1,-142.9 L553.9,-149.3 L544.5,-149.9 L536.1,-153.4 L530.4,-150.4 L511.1,-149.0 L472.4,-151.3 L449.8,-154.4 L432.6,-155.9 L423.7,-159.5 L434.9,-164.3 L419.7,-164.3 L416.4,-174.7 L424.5,-184.0 L435.5,-188.2 L463.0,-190.9 L455.1,-184.3Z";
const MEX_PATH="M342.5,303.6 L338.4,312.6 L336.6,320.0 L335.8,333.9 L334.7,338.9 L336.6,344.5 L339.9,349.5 L342.0,357.6 L349.1,365.2 L351.6,371.1 L355.7,376.2 L367.0,378.9 L371.4,383.2 L380.8,380.4 L388.9,379.3 L396.9,377.5 L403.6,375.7 L410.3,371.5 L412.9,365.5 L413.7,356.8 L415.6,353.8 L422.8,351.1 L434.0,348.7 L443.5,349.1 L449.9,348.2 L452.5,350.4 L452.1,355.3 L446.4,361.5 L443.9,367.8 L445.8,369.5 L444.2,374.0 L441.6,382.1 L438.9,379.4 L436.6,379.6 L434.6,379.7 L430.8,385.9 L428.9,384.7 L427.6,385.2 L427.7,386.7 L417.8,386.6 L407.9,386.6 L407.9,392.4 L403.1,392.5 L407.0,395.9 L411.0,398.3 L412.1,400.5 L413.9,401.1 L413.6,404.7 L399.9,404.7 L394.8,413.1 L396.3,415.0 L395.1,417.4 L394.8,420.4 L382.8,409.3 L377.3,406.0 L368.6,403.3 L362.7,404.0 L354.1,407.9 L348.7,408.9 L341.2,406.2 L333.3,404.3 L323.3,399.5 L315.3,398.1 L303.3,393.3 L294.4,388.4 L291.7,385.6 L285.7,385.0 L274.8,381.7 L270.4,377.0 L259.0,371.2 L253.6,364.7 L251.1,359.6 L254.6,358.6 L253.6,355.7 L256.0,353.0 L256.1,349.4 L252.5,344.8 L251.5,340.7 L247.9,335.5 L238.6,325.2 L227.8,317.2 L222.7,310.7 L213.5,306.5 L211.6,304.0 L213.2,297.6 L207.8,295.2 L201.5,290.2 L198.8,283.0 L193.1,282.2 L186.9,276.8 L181.9,271.7 L181.5,268.5 L175.8,260.7 L172.0,252.8 L172.1,248.9 L164.4,244.8 L160.9,245.2 L154.8,242.4 L153.1,246.6 L154.9,251.5 L155.9,259.3 L159.6,263.5 L167.5,270.6 L169.2,273.1 L170.8,273.8 L172.2,277.3 L174.1,277.2 L176.3,283.8 L179.5,286.5 L181.8,290.1 L188.5,295.4 L192.0,305.0 L195.1,309.5 L198.1,314.3 L198.7,319.8 L203.8,320.1 L208.1,324.8 L212.0,329.4 L211.7,331.2 L207.2,335.0 L205.3,335.0 L202.5,328.7 L195.6,322.8 L187.9,317.8 L182.4,315.2 L182.8,307.7 L181.2,302.1 L176.1,298.9 L168.8,294.3 L167.4,295.6 L164.7,292.9 L158.1,290.4 L151.9,284.4 L152.6,283.7 L157.0,284.2 L161.0,280.4 L161.4,275.7 L153.2,268.4 L146.9,265.5 L143.0,259.1 L139.0,252.3 L134.1,244.1 L129.8,234.8 L141.9,234.0 L155.4,232.9 L154.4,234.9 L170.5,239.9 L194.8,247.2 L215.9,247.1 L224.4,247.1 L224.4,242.8 L242.8,242.8 L246.7,246.5 L252.2,249.8 L258.5,254.3 L262.0,259.7 L264.7,265.4 L270.2,268.5 L279.0,271.6 L285.7,263.4 L294.4,263.2 L301.9,267.3 L307.2,274.4 L310.9,280.4 L317.2,286.3 L319.6,293.5 L322.5,298.4 L330.8,301.6 L338.4,303.9 L342.5,303.6Z";

// ---- journey map ----
function JourneyMap({row,onPick,onDetails,rows,embedded}){
  const W=720,Hh=460, padX=46, padY=34;
  const LON0=-125,LON1=-66,LAT0=14,LAT1=52;
  const px=(lon)=>padX+((lon-LON0)/(LON1-LON0))*(W-2*padX);
  const py=(lat)=>padY+((LAT1-lat)/(LAT1-LAT0))*(Hh-2*padY);
  const inBounds=(c)=>c.lon>=LON0&&c.lon<=LON1&&c.lat>=LAT0&&c.lat<=LAT1;
  const hosts=["LA","SF","SEA","VAN","DAL","HOU","KC","ATL","MIA","PHI","BOS","NY","TOR","MEX","GDL","MTY"];
  let foot=null, inbound=null, legs=[];
  if(row){
    const baseC=C[row.base], homeC=C[row.o], homeInMap=inBounds(homeC);
    const bx=px(baseC.lon), by=py(baseC.lat);
    foot={};
    const add=(k)=>(foot[k]=foot[k]||{key:k,c:C[k],v:[],base:false,home:false});
    row.venues.forEach((k,i)=>{ add(k).v.push(i+1); });
    add(row.base).base=true;
    const homeShared = row.venues.includes(row.o) || row.o===row.base;
    if(homeInMap) add(row.o).home=true;
    // each match is a ROUND TRIP from the base camp (not venue-to-venue)
    row.venues.forEach((k)=>{ if(k!==row.base) legs.push([{x:bx,y:by},{x:px(C[k].lon),y:py(C[k].lat)}]); });
    // one-time arrival: home country -> base camp
    if(homeInMap){
      if(!homeShared) legs.push([{x:px(homeC.lon),y:py(homeC.lat)},{x:bx,y:by}]);
    } else {
      // place the inbound node on the border in the true great-circle direction from base
      const a=rad(bearing(baseC,homeC));
      const dx=Math.sin(a), dy=-Math.cos(a); // screen vector, north = up
      const m=30; let t=Infinity;
      if(dx>1e-6) t=Math.min(t,(W-m-bx)/dx); else if(dx<-1e-6) t=Math.min(t,(m-bx)/dx);
      if(dy>1e-6) t=Math.min(t,(Hh-m-by)/dy); else if(dy<-1e-6) t=Math.min(t,(m-by)/dy);
      if(!isFinite(t)||t<0) t=70;
      let ix=bx+dx*t, iy=by+dy*t;
      ix=Math.max(42,Math.min(W-42,ix)); iy=Math.max(26,Math.min(Hh-26,iy));
      inbound={x:ix,y:iy,name:homeC.n,deg:Math.atan2(dy,dx)*180/Math.PI};
      legs.push([{x:ix,y:iy},{x:bx,y:by}]);
    }
  }
  return (
    <div className={"map"+(embedded?" embedded":"")}>
      {!embedded && (
      <div className="map-pick">
        <span>Trace a team:</span>
        <select value={row?row.t:""} onChange={(e)=>onPick(e.target.value||null)}>
          <option value="">Select a team…</option>
          {"ABCDEFGHIJKL".split("").map((g)=>(
            <optgroup key={g} label={`Group ${g}`}>
              {rows.filter((r)=>r.g===g).map((r)=>(
                <option key={r.t} value={r.t}>{r.f} {r.t}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {row && <button className="map-clear" onClick={()=>onPick(null)}>clear</button>}
        {row && <button className="map-details" onClick={()=>onDetails(row.t)}>full details →</button>}
      </div>)}
      {!embedded && !row && <div className="map-hint">Choose a team above to draw its <b>home → base camp → group venues</b> route.</div>}
      <svg viewBox={`0 0 ${W} ${Hh}`} className="map-svg" role="img"
        aria-label={row
          ? `Journey map for ${row.t}: home ${C[row.o].n}, base camp ${C[row.base].n}, venues ${row.venues.map((k)=>C[k].n).join(", ")}.`
          : "Map of the 16 World Cup host cities. Select a team to trace its home, base camp and venue route."}>
        <defs>
          <radialGradient id="ocean" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#eef4f3"/><stop offset="100%" stopColor="#e3ece9"/>
          </radialGradient>
          <linearGradient id="leg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--cyan)"/><stop offset="100%" stopColor="var(--magenta)"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={Hh} fill="url(#ocean)"/>
        <g className="land">
          <path d={CAN_PATH}/>
          <path d={USA_PATH}/>
          <path d={MEX_PATH}/>
        </g>
        {[20,30,40,50].map((la)=>(
          <line key={la} x1={padX} x2={W-padX} y1={py(la)} y2={py(la)} stroke="rgba(22,25,28,.07)"/>
        ))}
        <text x={px(-104)} y={py(40)} className="map-co">UNITED STATES</text>
        <text x={px(-110)} y={py(23.5)} className="map-co">MEXICO</text>
        <text x={px(-100)} y={py(50.5)} className="map-co">CANADA</text>

        {/* no selection: overview of all host cities */}
        {!row && hosts.map((k)=>{
          const c=C[k];
          return (<g key={k}>
            <circle cx={px(c.lon)} cy={py(c.lat)} r="3.4" fill="rgba(22,25,28,.34)"/>
            <text x={px(c.lon)+7} y={py(c.lat)+3} className="map-city">{c.n}</text>
          </g>);
        })}

        {/* selected: faint context dots for hosts not in this team's footprint */}
        {row && hosts.filter((k)=>!foot[k]).map((k)=>{
          const c=C[k];
          return <circle key={k} cx={px(c.lon)} cy={py(c.lat)} r="2.4" fill="rgba(22,25,28,.16)"/>;
        })}

        {/* legs, drawn under the markers */}
        {legs.map((lg,i)=>{
          const [a,b]=lg, mx=(a.x+b.x)/2, my=(a.y+b.y)/2-22;
          return <path key={`${row?row.t:"_"}-${i}`} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none"
            stroke="url(#leg)" strokeWidth="2.2" strokeDasharray="6 5" className="legpath"
            style={{animationDelay:`${i*0.18}s`}}/>;
        })}

        {/* inbound arrival marker for an overseas home */}
        {/* off-map home: dashed leg + an arrow pointing out toward the home country */}
        {inbound && (
          <g>
            <g transform={`rotate(${inbound.deg} ${inbound.x} ${inbound.y})`}>
              <path d={`M${inbound.x-5},${inbound.y-6} L${inbound.x+9},${inbound.y} L${inbound.x-5},${inbound.y+6} Z`}
                fill="var(--magenta)" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/>
            </g>
            <text x={inbound.x} y={inbound.y-14} className="map-origin" textAnchor="middle">✈ {inbound.name}</text>
            <text x={inbound.x} y={inbound.y+19} className="map-sub" textAnchor="middle">home · {Math.round(Math.abs(row.raw.dz))}h shift</text>
          </g>
        )}

        {/* footprint markers: venue (cyan) / base (gold) / home (magenta); rings = shared roles */}
        {row && Object.values(foot).map((r0)=>{
          const x=px(r0.c.lon), y=py(r0.c.lat);
          const isV=r0.v.length>0, isB=r0.base, isH=r0.home, stacked=isH&&(isV||isB);
          const fill=isV?"var(--cyan)":isB?"var(--gold)":"var(--magenta)";
          const matchStr=r0.v.slice().sort((a,b)=>a-b).map((n)=>`${STAGE}${n}`).join(", ");
          const cityLabel=matchStr?`${r0.c.n} (${matchStr})`:r0.c.n;
          const roleTags=[isB?"camp":null, isH?"home":null].filter(Boolean);
          const lx=x+(stacked?15:9);
          return (
            <g key={r0.key}>
              {stacked && <circle cx={x} cy={y} r={isB&&isV?12:9} fill="none" stroke="var(--magenta)" strokeWidth="2"/>}
              {isB && isV && <circle cx={x} cy={y} r="9" fill="none" stroke="var(--gold)" strokeWidth="2"/>}
              <circle cx={x} cy={y} r="5.6" fill={fill} stroke="#fff" strokeWidth="1.4" style={{cursor:"help"}}>
                <title>{`${r0.c.n}${roleTags.length?` · ${roleTags.join(", ")}`:""}${isV?` · matches ${matchStr}`:""}${r0.c.wb!=null?` · ~${r0.c.wb}°C WBGT`:""}${r0.c.el!=null?`${r0.c.wb!=null?",":" ·"} ${r0.c.el} m`:""}`}</title>
              </circle>
              <text x={lx} y={y+3} className="map-city strong">{cityLabel}</text>
              {roleTags.length>0 && <text x={lx} y={y+13.5} className="map-tags">{roleTags.join(" · ")}</text>}
            </g>
          );
        })}
      </svg>
      {row && (
        <div className="map-foot">
          <span><i className="d" style={{background:"var(--cyan)"}}/>match venue (G1–G3)</span>
          <span><i className="d" style={{background:"var(--gold)"}}/>base camp</span>
          <span><i className="d" style={{background:"var(--magenta)"}}/>home / arrival (↗ arrow if off-map)</span>
          <span className="map-foot-note">each match is a round trip from the base camp · a ringed city fills more than one role</span>
        </div>
      )}
    </div>
  );
}

// ---- detail drawer ----
// deterministic PRNG so the Monte-Carlo stability run is stable across renders
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
// Stability tab: re-rank under many perturbed weightings; show each team's rank range
function Sensitivity({H, wN, lead, leadOv, baseOv, rows}){
  const M=240;
  const data = useMemo(()=>{
    const rng=mulberry32(0x9e3779b9);
    const leadOf=(t)=>leadOv[t]!=null?leadOv[t]:lead;
    const baseOf=(t)=>baseOv[t]||BASES[t];
    const acc={}; TEAMS.forEach((t)=>{acc[t.t]={ranks:[],top5:0};});
    for(let s=0;s<M;s++){
      const jw={}; let sum=0;
      for(const m of METRICS){ const j=wN[m.k]*(1+(rng()-0.5)); jw[m.k]=Math.max(0,j); sum+=jw[m.k]; }
      sum=sum||1; for(const k in jw) jw[k]/=sum;
      const b=burdensFor(ACTUAL_CITY,H,jw,leadOf,baseOf);
      Object.entries(b).sort((a,c)=>c[1]-a[1]).forEach(([nm],i)=>{ acc[nm].ranks.push(i+1); if(i<5) acc[nm].top5++; });
    }
    const out={};
    for(const nm in acc){ const rs=acc[nm].ranks.sort((a,c)=>a-c);
      out[nm]={min:rs[0],max:rs[rs.length-1],med:rs[Math.floor(rs.length/2)],top5:acc[nm].top5/M,range:rs[rs.length-1]-rs[0]}; }
    return out;
  },[H,wN,lead,leadOv,baseOv]);

  const n=rows.length, hardest=rows[0];
  const pct=(r)=>((r-1)/(n-1))*100;
  const tag=(range)=> range<=4?{t:"rock-solid",c:"var(--green)"} : range<=10?{t:"steady",c:"var(--cyan)"} : range<=20?{t:"shifts",c:"var(--gold)"} : {t:"swingy",c:"var(--magenta)"};
  return (
    <div className="sens">
      <div className="sens-intro">
        <b>How stable is this ranking?</b> We re-ran the model <b>{M}×</b>, each time randomly nudging every weight by up to ±50% and renormalising. Each bar is the range of finishing positions a team landed in. A short bar means the verdict barely depends on your weight choices.
      </div>
      <div className="sens-call">
        {hardest.f} <b>{hardest.t}</b> sits among the 5 hardest draws in <b>{Math.round((data[hardest.t]?.top5||0)*100)}%</b> of reweightings.
      </div>
      <div className="sens-list">
        {rows.map((r)=>{ const d=data[r.t]; if(!d) return null; const tg=tag(d.range);
          return (
            <div key={r.t} className="sens-row">
              <span className="sens-rk">{r.rank}</span>
              <span className="sens-fl">{r.f}</span>
              <span className="sens-tn">{r.t}</span>
              <span className="sens-track" title={`ranks #${d.min}–#${d.max} across ${M} reweightings (median #${d.med})`}>
                <i className="sens-range" style={{left:`${pct(d.min)}%`,width:`${Math.max(0,pct(d.max)-pct(d.min))}%`}}/>
                <i className="sens-med" style={{left:`${pct(d.med)}%`}}/>
              </span>
              <span className="sens-tag" style={{color:tg.c}}>{tg.t}<em>#{d.min}–{d.max}</em></span>
            </div>
          );
        })}
      </div>
      <div className="sens-foot">Lower rank # = harder draw. The dot is the median finishing position across the {M} runs. Weights are perturbed; coefficients and arrival lead stay at the current console values.</div>
    </div>
  );
}
function Detail({row,onClose,onShowMap,baseOv,setBaseOv,leadOv,setLeadOv,lead,rows,copyLink,copied,mode,objective,onOpenTeam}){
  const rivals = rows.filter((r)=>r.g===row.g && r.t!==row.t);
  const downloadCard = ()=>{
    const svg = buildCardSVG({ team:row.t, flag:row.f, rank:row.rank, n:rows.length, burden:row.cmp,
      mode, objective, parts:row.parts, takeaway:takeawayFor(row, rows.length), url:window.location.href });
    downloadCardPNG(svg, `wc2026-${row.t.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}-burden.png`, 2);
  };
  // a11y: focus the close button on open, close on Escape
  const closeRef = useRef(null);
  useEffect(()=>{
    closeRef.current?.focus();
    const onKey=(e)=>{ if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",onKey); return ()=>window.removeEventListener("keydown",onKey);
  },[onClose]);
  const effLead = leadOv[row.t] != null ? leadOv[row.t] : lead;
  // radar geometry
  const cx=96,cy=92,Rr=70;
  const axes=METRICS.map((m,i)=>{
    const ang=(-90+i*72)*Math.PI/180;
    const val=Math.min(1.15,row.sc[m.k]);
    return {m,ang,x:cx+Math.cos(ang)*Rr*val,y:cy+Math.sin(ang)*Rr*val,
      ax:cx+Math.cos(ang)*Rr,ay:cy+Math.sin(ang)*Rr};
  });
  const poly=axes.map((a)=>`${a.x},${a.y}`).join(" ");
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <div className="drawer" onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${row.t} travel burden detail`}>
        <button ref={closeRef} className="dclose" onClick={onClose} aria-label="Close detail"><X size={18}/></button>
        <div className="dhead">
          <span className="dflag">{row.f}</span>
          <div>
            <h2>{row.t}</h2>
            <div className="dmeta">Group {row.g} · {row.cf} · home {C[row.o].n}</div>
            <div className="dshare">
              {copyLink && <button className="copylink" onClick={copyLink} title="Copy a link to this team's view">
                {copied ? <><Check size={12}/> link copied</> : <><Link2 size={12}/> copy link</>}
              </button>}
              <button className="copylink dcard" onClick={downloadCard} title="Download a shareable burden card (PNG)">
                <Download size={12}/> share card
              </button>
            </div>
          </div>
          <div className="dscore">
            <span>#{row.rank}</span><b><CountUp value={row.cmp} decimals={1}/></b><em>burden</em>
          </div>
        </div>

        <div className="dtakeaway">{takeawayFor(row, rows.length)}</div>

        <div className="dsec-t">Journey map</div>
        <JourneyMap row={row} embedded rows={rows} onPick={()=>{}} onDetails={()=>{}}/>

        {/* itinerary timeline */}
        <div className="dsec-t">Itinerary</div>
        <div className="timeline">
          <Node label="HOME" sub={C[row.o].n} tag={`${Math.round(Math.abs(row.raw.dz))}h ${row.raw.dz>0?"east":"west"}`} col="var(--magenta)"/>
          <Edge sub={`buffer ${row.raw.B}d`}/>
          <Node label="CAMP" sub={C[row.base].n} tag={`${C[row.base].el}m`} col="var(--gold)"/>
          {row.venues.map((k,i)=>{
            const dEl=C[k].el-C[row.base].el;
            return (
            <React.Fragment key={i}>
              <Edge sub={`${Math.round(haversine(C[row.base],C[k]))} km`}
                sub2={dEl===0?"level":(dEl>0?"↑":"↓")+Math.abs(dEl)+"m"}/>
              <Node label={`${STAGE}${i+1} · Jun ${row.dates[i]}`} sub={C[k].n}
                tag={`${C[k].wb}° · ${C[k].el}m`} col="var(--cyan)"/>
            </React.Fragment>);
          })}
        </div>

        {/* what-if overrides */}
        <div className="dsec-t" style={{marginTop:16}}>What-if</div>
        <div className="ovrow">
          <span>Base camp</span>
          <select value={baseOv[row.t]||row.base} onChange={(e)=>setBaseOv({...baseOv,[row.t]:e.target.value})}>
            {BASE_CHOICES.map((k)=><option key={k} value={k}>{C[k].n}</option>)}
          </select>
          {baseOv[row.t] && <button className="ovreset" onClick={()=>{const n={...baseOv};delete n[row.t];setBaseOv(n);}}>reset</button>}
        </div>
        <div className="ovrow">
          <span>Arrival lead</span>
          <input className="ovrange" type="range" min={1} max={14} step={1} value={effLead}
            onChange={(e)=>setLeadOv({...leadOv,[row.t]:parseInt(e.target.value)})}/>
          <b className="ovval">{effLead}d {leadOv[row.t]!=null?"":"(default)"}</b>
          {leadOv[row.t]!=null && <button className="ovreset" onClick={()=>{const n={...leadOv};delete n[row.t];setLeadOv(n);}}>reset</button>}
        </div>

        <div className="dgrid">
          {/* radar */}
          <div className="radarbox">
            <div className="dsec-t">Burden profile</div>
            <svg viewBox="-24 0 240 184" className="radar">
              {[0.25,0.5,0.75,1].map((f)=>(
                <polygon key={f} points={METRICS.map((m,i)=>{
                  const a=(-90+i*72)*Math.PI/180;
                  return `${cx+Math.cos(a)*Rr*f},${cy+Math.sin(a)*Rr*f}`;}).join(" ")}
                  fill="none" stroke="rgba(22,25,28,.12)"/>
              ))}
              {axes.map((a,i)=>(<line key={i} x1={cx} y1={cy} x2={a.ax} y2={a.ay} stroke="rgba(22,25,28,.12)"/>))}
              <polygon points={poly} fill="rgba(10,165,149,.16)" stroke="var(--cyan)" strokeWidth="2"/>
              {axes.map((a,i)=>(<circle key={i} cx={a.x} cy={a.y} r="3" fill={a.m.col}/>))}
              {axes.map((a,i)=>(
                <text key={i} x={cx+Math.cos(a.ang)*(Rr+15)} y={cy+Math.sin(a.ang)*(Rr+15)+3}
                  className="radar-lab" textAnchor="middle">{a.m.label}</text>
              ))}
            </svg>
            <div className="metriclist">
              {METRICS.map((m)=>(
                <div key={m.k} className="ml"><i style={{background:m.col}}/>{m.label}
                  <b>{(row.sc[m.k]*100).toFixed(0)}</b></div>
              ))}
            </div>
          </div>

          {/* rivals */}
          <div className="rivalbox">
            <div className="dsec-t">Group {row.g} rivals: burden edge</div>
            <div className="rivals">
              {rivals.sort((a,b)=>b.cmp-a.cmp).map((rv)=>{
                const edge=rv.cmp-row.cmp; const fav=edge>0;
                return (
                  <button key={rv.t} className="rival" onClick={()=>onOpenTeam&&onOpenTeam(rv.t)} title={`Open ${rv.t}'s journey`}>
                    <span className="rf">{rv.f}</span>
                    <span className="rn">{rv.t}</span>
                    <span className="redge" style={{color:fav?"var(--green)":"var(--magenta)"}}>
                      {fav?"+":""}{edge.toFixed(1)}
                    </span>
                    <span className="rtag">{fav?"they're wearier":"you're wearier"}</span>
                  </button>
                );
              })}
            </div>
            <p className="rivalnote">
              Positive = the rival arrives more fatigued than you (your edge). Negative = you're the
              tired side. A "fair" group keeps these near zero.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
function Node({label,sub,tag,col}){
  return (
    <div className="tlnode">
      <div className="tldot" style={{background:col,boxShadow:`0 0 0 4px ${col}22`}}/>
      <div className="tllab" style={{color:col}}>{label}</div>
      <div className="tlsub">{sub}</div>
      <div className="tltag">{tag}</div>
    </div>
  );
}
function Edge({sub,sub2}){ return <div className="tledge"><span/><em>{sub}</em>{sub2&&<em className="e2">{sub2}</em>}</div>; }

/* --------------------------------- styles ---------------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Hanken+Grotesk:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Geist:wght@400;500;600;700;800;900&family=Geist+Mono:wght@400;500&display=swap');
:root{
  --bg:#f7f5ef; --bg2:#efece3; --panel:#ffffff; --card:#ffffff; --card2:#faf8f2;
  --line:rgba(22,25,28,.11); --line2:rgba(22,25,28,.06); --ink:#16191c; --ink2:#3b4145; --mut:#7b817d;
  --magenta:#ed1f78; --cyan:#0aa595; --gold:#d98712; --green:#19a957;
  --orange:#e95c2c; --violet:#6a5cf0;
  --shadow:0 1px 2px rgba(22,25,28,.04),0 10px 26px rgba(22,25,28,.07);
  --disp:'Anton','Arial Narrow',sans-serif;
  --body:'Hanken Grotesk',system-ui,sans-serif;
  --mono:'DM Mono',ui-monospace,monospace;
  --disp-w:400;
}
/* typeface themes (swap the three families + the display weight) */
.lab.font-modern{ --disp:'Space Grotesk','Arial Narrow',sans-serif; --body:'Figtree',system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace; --disp-w:700; }
.lab.font-geist{ --disp:'Geist','Hanken Grotesk',sans-serif; --body:'Geist',system-ui,sans-serif; --mono:'Geist Mono','DM Mono',ui-monospace,monospace; --disp-w:800; }
.title,.stat-b,.grp-g,.map-co,.how-comp-t,.dhead h2,.dscore b{font-weight:var(--disp-w)}
*{box-sizing:border-box}
.lab{font-family:var(--body);color:var(--ink);
  background:
    radial-gradient(820px 460px at 8% -10%, rgba(237,31,120,.06), transparent 62%),
    radial-gradient(760px 460px at 96% -6%, rgba(10,165,149,.06), transparent 62%),
    radial-gradient(880px 560px at 50% 120%, rgba(217,135,18,.045), transparent 60%),
    linear-gradient(180deg,var(--bg),var(--bg2));
  min-height:100%;padding:22px;max-width:1280px;margin:0 auto;}
.lab input[type=range]{-webkit-appearance:none;appearance:none;height:5px;border-radius:5px;width:100%;outline:none;cursor:pointer;background:rgba(22,25,28,.11)}
.lab input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#fff;border:3px solid var(--cyan);cursor:pointer;box-shadow:0 1px 4px rgba(22,25,28,.22)}
.lab input[type=range]::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#fff;border:3px solid var(--cyan)}

/* hero */
.hero{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:20px;
  padding:26px 28px;background:linear-gradient(120deg,rgba(237,31,120,.06),rgba(10,165,149,.05) 58%,#fff);box-shadow:var(--shadow)}
.hero-glow{position:absolute;inset:0;background:repeating-linear-gradient(115deg,transparent,transparent 40px,rgba(22,25,28,.02) 40px,rgba(22,25,28,.02) 80px);pointer-events:none}
.hero-row{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;position:relative}
.kicker{font-family:var(--mono);font-size:11px;letter-spacing:.22em;color:var(--cyan);margin-bottom:8px}
.title{font-family:var(--disp);font-size:clamp(38px,6vw,66px);line-height:.92;letter-spacing:.01em;margin:0;
  background:linear-gradient(95deg,var(--magenta) 8%,var(--violet) 52%,var(--cyan) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{max-width:640px;margin:12px 0 0;color:var(--ink2);font-size:14.5px;line-height:1.5}
.sub b{color:var(--ink)}
.hero-badge{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--gold);
  border:1px solid rgba(217,135,18,.45);background:rgba(217,135,18,.07);border-radius:999px;padding:8px 12px;display:flex;gap:7px;align-items:center;white-space:nowrap}
.prov{position:relative;margin-top:16px;font-family:var(--mono);font-size:11px;color:var(--mut);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.prov .ok{color:var(--green);border:1px solid rgba(25,169,87,.4);background:rgba(25,169,87,.07);padding:2px 7px;border-radius:6px}
.prov .warn{color:var(--gold);border:1px solid rgba(217,135,18,.4);background:rgba(217,135,18,.07);padding:2px 7px;border-radius:6px}
.copylink{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10.5px;color:var(--cyan);background:none;border:1px solid var(--line);border-radius:999px;padding:3px 10px;cursor:pointer;transition:.12s}
.copylink:hover{border-color:var(--cyan);background:rgba(10,165,149,.07)}
/* Expert-mode toggle: a prominent, inviting pill (stands apart from the utility links) */
.expertbtn{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;letter-spacing:.03em;
  color:#fff;background:linear-gradient(96deg,var(--violet),#8b5cf6);border:none;border-radius:999px;padding:6px 14px;cursor:pointer;
  box-shadow:0 3px 12px rgba(106,92,240,.34);transition:.16s;position:relative}
.expertbtn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(106,92,240,.5)}
.expertbtn b{font-weight:700}
.expertbtn-hint{margin-left:5px;padding-left:7px;border-left:1px solid rgba(255,255,255,.4);opacity:.92;font-size:10px}
/* gentle attention pulse while off (disabled under prefers-reduced-motion via the global guard) */
.expertbtn:not(.on){animation:expertpulse 2.6s ease-in-out infinite}
@keyframes expertpulse{
  0%,100%{box-shadow:0 3px 12px rgba(106,92,240,.34)}
  50%{box-shadow:0 4px 20px rgba(106,92,240,.62),0 0 0 4px rgba(106,92,240,.12)}
}
.expertbtn.on{background:var(--ink);box-shadow:none}
.expertbtn.on:hover{box-shadow:0 3px 10px rgba(22,25,28,.25)}
/* fan-mode single-column body (console hidden) */
.body.solo{grid-template-columns:1fr}
/* always-visible Actual↔Fairer schedule switch (panel header) */
.fairswitch{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 8px 4px}
.fairswitch-l{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.fairseg{flex:0 0 auto;display:inline-flex;background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:3px}
.fairseg button{font-family:var(--mono);font-size:12px;letter-spacing:.02em;color:var(--mut);background:none;border:none;padding:7px 16px;border-radius:999px;cursor:pointer;transition:.15s}
.fairseg button:hover{color:var(--ink2)}
.fairseg button.on{background:linear-gradient(96deg,var(--cyan),var(--green));color:#fff;box-shadow:0 2px 8px rgba(10,165,149,.3)}
.fairswitch-note{font-family:var(--mono);font-size:11px;color:var(--mut)}
.dshare{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
.dcard{color:var(--gold)!important;border-color:rgba(217,135,18,.4)!important}
.dcard:hover{border-color:var(--gold)!important;background:rgba(217,135,18,.08)!important}
.fontsel{margin-left:auto;display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--mut)}
.fontsel>span{font-family:var(--disp);font-weight:var(--disp-w);font-size:15px;color:var(--ink2);line-height:1}
.fontsel select{font-family:var(--mono);font-size:11px;color:var(--ink2);background:#fff;border:1px solid var(--line);border-radius:7px;padding:3px 6px;cursor:pointer}

/* stats */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}
.stat{text-align:left;border:1px solid var(--line);border-top:3px solid;border-radius:14px;background:var(--card);box-shadow:var(--shadow);padding:13px 15px;transition:.15s;font-family:inherit}
.stat:hover{transform:translateY(-2px);box-shadow:0 2px 5px rgba(22,25,28,.06),0 14px 30px rgba(22,25,28,.11)}
.stat-l{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:var(--mut)}
.stat-b{font-family:var(--disp);font-size:27px;margin:5px 0 1px;letter-spacing:.01em}
.stat-s{font-size:11.5px;color:var(--mut)}

/* body */
.body{display:grid;grid-template-columns:316px 1fr;gap:14px;align-items:start}
@media(max-width:900px){
  .body{grid-template-columns:1fr}
  .stats{grid-template-columns:repeat(2,1fr)}
  .console .console-mtoggle{display:flex;width:100%;align-items:center;justify-content:center;gap:8px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;
    color:var(--ink2);background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:12px;cursor:pointer}
  .console.collapsed{padding:0;border:none;background:none;box-shadow:none}
  .console.collapsed > :not(.console-mtoggle){display:none}
}

/* console */
.console{border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow);padding:14px;position:sticky;top:14px;max-height:calc(100vh - 28px);overflow:auto}
.console-head{font-family:var(--mono);font-size:12px;letter-spacing:.14em;color:var(--ink);display:flex;gap:8px;align-items:center;margin-bottom:12px}
.modebox{border:1px solid var(--line);border-radius:12px;padding:11px;margin-bottom:14px;background:rgba(10,165,149,.05)}
.modebox-t{font-size:12px;display:flex;gap:6px;align-items:center;color:var(--ink2);margin-bottom:8px;font-weight:700}
.seg{display:flex;background:var(--card2);border:1px solid var(--line);border-radius:9px;padding:3px;gap:3px}
.seg button{flex:1;font-family:var(--mono);font-size:11px;letter-spacing:.05em;color:var(--mut);background:none;border:none;padding:7px;border-radius:7px;cursor:pointer;transition:.15s}
.seg button.on{background:linear-gradient(92deg,var(--cyan),var(--green));color:#fff;font-weight:700;box-shadow:0 2px 8px rgba(10,165,149,.25)}
.delta{font-size:11.5px;color:var(--ink2);margin-top:9px;line-height:1.45;display:flex;gap:6px;align-items:flex-start}
.objrow{display:flex;align-items:center;gap:5px;margin-top:8px;flex-wrap:wrap}
.objgroups{margin-top:8px}
.objgrp{display:flex;align-items:center;gap:8px;margin-top:6px}
.objgrp-l{flex:0 0 64px;font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);text-align:right}
.objbtns{display:flex;gap:5px;flex-wrap:wrap}
.objrow-l{font-family:var(--mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);margin-right:1px}
.objbtn{font-family:var(--mono);font-size:10.5px;padding:4px 9px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink2);cursor:pointer;transition:.12s}
.objbtn:hover{background:var(--card2)}
.objbtn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.objdesc{font-size:11px;color:var(--mut);line-height:1.4;margin-top:7px;font-style:italic}
.objnums{display:flex;align-items:center;gap:8px;margin-top:8px;color:var(--ink)}
.objnums b{font-family:var(--mono);font-size:17px;letter-spacing:.01em}
.objnums em{font-style:normal;font-size:12px;color:var(--cyan2,#0a7d70);font-family:var(--mono)}
.objnote{font-size:11px;color:var(--mut);line-height:1.45;margin-top:6px}
.objnote b{color:var(--ink2)}
.delta svg{flex:none;margin-top:2px;color:var(--gold)}
.delta b{color:var(--gold)} .delta.muted{color:var(--mut)}
.grp{border-top:1px solid var(--line);padding:12px 0 4px}
.grp-t{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:var(--ink2);margin-bottom:10px;opacity:.78;text-transform:uppercase}
.sl{display:block;margin-bottom:13px}
.sl-top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;color:var(--ink2);gap:8px}
.sl-top b{font-family:var(--mono);color:var(--ink)}
.sl-top .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.sl-hint{font-size:10.5px;color:var(--mut);margin-top:5px;line-height:1.35}
.reset{width:100%;margin-top:14px;border:1px solid var(--line);background:var(--card2);color:var(--mut);
  font-family:var(--mono);font-size:11px;letter-spacing:.08em;padding:10px;border-radius:10px;cursor:pointer;display:flex;gap:7px;align-items:center;justify-content:center;transition:.15s}
.reset:hover{color:var(--magenta);border-color:rgba(237,31,120,.4)}

/* verdict banner ("which team got screwed") */
.verdict{width:100%;text-align:left;display:flex;align-items:center;gap:14px;margin-bottom:14px;cursor:pointer;
  background:linear-gradient(96deg,rgba(237,31,120,.07),rgba(106,92,240,.05));border:1px solid var(--line);border-left:4px solid var(--magenta);
  border-radius:13px;padding:13px 16px;transition:.15s}
.verdict:hover{border-left-color:var(--violet);box-shadow:var(--shadow)}
.verdict{animation:reveal .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes reveal{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.verdict-tag{flex:0 0 auto;font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--magenta);align-self:flex-start;margin-top:2px}
.verdict-txt{font-size:14px;line-height:1.5;color:var(--ink2)}
.verdict-txt b{color:var(--ink)}
.verdict-arrow{flex:0 0 auto;color:var(--mut);margin-left:auto;transition:.15s}
.verdict:hover .verdict-arrow{color:var(--magenta);transform:translateX(3px)}

/* find-your-team CTA (hero) */
.hero-cta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:16px}
.findbtn{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12px;letter-spacing:.04em;
  color:#fff;background:linear-gradient(96deg,var(--magenta),var(--violet));border:none;border-radius:999px;padding:10px 18px;cursor:pointer;
  box-shadow:0 4px 14px rgba(237,31,120,.28);transition:.15s}
.findbtn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(237,31,120,.36)}
.hero-link{display:inline-flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;
  font-family:var(--mono);font-size:12px;color:var(--ink2);padding:4px 0;transition:.12s}
.hero-link:hover{color:var(--magenta)}

/* "what is burden" explainer strip (hero) */
.burdenstrip{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:18px;padding-top:15px;border-top:1px solid var(--line2)}
.bs-l{font-size:13px;color:var(--ink2);margin-right:2px}
.bs-chip{cursor:pointer;transition:.12s;display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;color:var(--ink2);
  background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:4px 11px}
.bs-chip svg{flex:0 0 auto}
.bs-chip:hover{border-color:var(--ink2);color:var(--ink);transform:translateY(-1px)}
.bs-note{font-family:var(--mono);font-size:11px;color:var(--mut)}

/* presets + advanced disclosure (console) */
.presets{margin-bottom:12px}
.presets-l{font-family:var(--mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
.presets-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.presetbtn{font-family:var(--mono);font-size:10.5px;padding:5px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink2);cursor:pointer;transition:.12s}
.presetbtn:hover{border-color:var(--violet);color:var(--violet)}
.presetbtn.on{background:var(--violet);border-color:var(--violet);color:#fff}
.advtoggle{width:100%;margin:4px 0 2px;display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;letter-spacing:.05em;
  color:var(--mut);background:none;border:none;border-top:1px dashed var(--line);padding:11px 2px 4px;cursor:pointer;transition:.12s}
.advtoggle:hover{color:var(--ink2)}
.advtoggle[aria-expanded="true"]{color:var(--ink2)}
.console-mtoggle{display:none}

/* confederation filter + empty state (rankings) */
.conffilter{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 2px 10px}
.confchip{font-family:var(--mono);font-size:10px;letter-spacing:.04em;padding:4px 9px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--mut);cursor:pointer;transition:.12s}
.confchip:hover{border-color:var(--cyan);color:var(--cyan)}
.confchip.on{background:var(--cyan);border-color:var(--cyan);color:#fff}
.emptybars{padding:34px 12px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--mut)}

/* jargon tooltip + drawer takeaway */
.term{text-decoration:underline dotted;text-underline-offset:2px;cursor:help;color:inherit}
.term:focus{outline:2px solid var(--cyan);outline-offset:1px;border-radius:2px}
/* "i" info button + tooltip bubble */
.infotip{position:relative;display:inline-flex;vertical-align:middle;margin-left:5px}
.infotip-btn{width:14px;height:14px;flex:0 0 auto;border-radius:50%;border:1px solid var(--line);background:var(--card2);color:var(--mut);
  font-family:Georgia,serif;font-style:italic;font-weight:700;font-size:10px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:.12s}
.infotip-btn:hover{border-color:var(--cyan);color:var(--cyan)}
.infotip-pop{position:absolute;z-index:50;top:150%;left:50%;transform:translateX(-50%);width:max-content;max-width:230px;
  background:var(--ink);color:#fff;font-family:var(--body);font-weight:400;font-size:11.5px;line-height:1.45;letter-spacing:normal;text-transform:none;text-align:left;
  padding:8px 11px;border-radius:9px;box-shadow:0 8px 24px rgba(22,25,28,.28)}
.infotip-pop::before{content:"";position:absolute;bottom:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-bottom-color:var(--ink)}
.dtakeaway{margin:2px 0 14px;font-size:13.5px;line-height:1.45;color:var(--ink2);border-left:3px solid var(--cyan);padding:7px 0 7px 11px;background:rgba(10,165,149,.05);border-radius:0 8px 8px 0}

/* find-your-team picker overlay */
.picker-wrap{position:fixed;inset:0;z-index:60;background:rgba(22,25,28,.42);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:7vh 16px 16px;animation:fade .2s ease}
.picker{position:relative;width:min(680px,96vw);max-height:84vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:22px}
.picker-h{font-family:var(--disp);font-size:24px;display:flex;align-items:center;gap:9px;margin:0 0 4px}
.picker-q{width:100%;box-sizing:border-box;font-family:var(--body);font-size:14px;padding:10px 13px;border:1px solid var(--line);border-radius:11px;margin:10px 0 16px;outline:none}
.picker-q:focus{border-color:var(--cyan)}
.picker-conf{margin-bottom:14px}
.picker-conf-l{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--mut);margin-bottom:7px}
.picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px}
.picker-team{display:flex;align-items:center;gap:8px;font-family:var(--body);font-size:13px;color:var(--ink);text-align:left;
  background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:8px 11px;cursor:pointer;transition:.12s}
.picker-team:hover{border-color:var(--magenta);background:#fff;transform:translateY(-1px)}
.picker-flag{font-size:18px;line-height:1}
.picker-tn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* data export buttons (rankings summary) */
.sum-readout{font-size:13px;color:var(--ink2);line-height:1.45;max-width:60ch}
.sum-readout b{color:var(--ink)}
.sum-export{margin-left:auto;display:flex;gap:6px;align-items:center}
.expbtn{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:var(--ink2);
  background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px 9px;cursor:pointer;transition:.12s}
.expbtn:hover{border-color:var(--cyan);color:var(--cyan)}

/* Stability (sensitivity) tab */
.sens{padding:16px 16px 8px}
.sens-intro{font-size:13.5px;line-height:1.55;color:var(--ink2);max-width:680px}
.sens-call{margin:14px 0 16px;font-family:var(--mono);font-size:13px;color:var(--ink);background:var(--card2);border:1px solid var(--line);border-left:3px solid var(--magenta);border-radius:0 9px 9px 0;padding:10px 13px}
.sens-list{display:flex;flex-direction:column;gap:3px}
.sens-row{display:grid;grid-template-columns:24px 22px minmax(80px,150px) 1fr 96px;align-items:center;gap:9px;padding:3px 0}
.sens-rk{font-family:var(--mono);font-size:11px;color:var(--mut);text-align:right}
.sens-fl{font-size:15px}
.sens-tn{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sens-track{position:relative;height:9px;background:rgba(22,25,28,.06);border-radius:999px}
.sens-range{position:absolute;top:0;height:9px;min-width:4px;background:linear-gradient(90deg,var(--magenta),var(--cyan));border-radius:999px;opacity:.55}
.sens-med{position:absolute;top:-2px;width:3px;height:13px;background:var(--ink);border-radius:2px;transform:translateX(-1px)}
.sens-tag{font-family:var(--mono);font-size:10px;display:flex;flex-direction:column;line-height:1.25;text-align:right}
.sens-tag em{font-style:normal;color:var(--mut);font-size:9.5px}
.sens-foot{margin-top:14px;font-family:var(--mono);font-size:10.5px;color:var(--mut);line-height:1.5}

/* provenance + caveat blocks (how-it-works) */
.prov-block,.caveat-block{margin-top:16px;border:1px solid var(--line);border-radius:13px;background:var(--card2);padding:15px 17px}
.prov-rows{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.prov-r{font-size:13px;line-height:1.5;color:var(--ink2)}
.pv-badge{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;
  padding:2px 7px;border-radius:999px;margin-right:7px;vertical-align:middle;white-space:nowrap}
.pv-badge.ok{color:var(--green);background:rgba(25,169,87,.1)}
.pv-badge.est{color:var(--cyan);background:rgba(10,165,149,.1)}
.pv-badge.proxy{color:var(--gold);background:rgba(217,135,18,.12)}
.caveat-list{margin:10px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:8px}
.caveat-list li{font-size:13px;line-height:1.5;color:var(--ink2)}
.caveat-foot{margin:12px 0 0;font-size:12.5px;color:var(--mut)}

/* panel + tabs */
.panel{border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow);padding:6px;min-height:520px}
.tabs{display:flex;gap:4px;padding:6px;border-bottom:1px solid var(--line)}
.tab{font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:var(--mut);background:none;border:none;padding:9px 13px;border-radius:9px;cursor:pointer;display:flex;gap:7px;align-items:center;transition:.15s}
.tab:hover{color:var(--ink)}
.tab.on{background:linear-gradient(92deg,rgba(237,31,120,.12),rgba(10,165,149,.10));color:var(--ink)}

/* rankings */
.rankwrap{padding:12px 14px}
.legend{display:flex;flex-wrap:wrap;gap:13px;align-items:center;margin-bottom:12px;font-size:11.5px;color:var(--mut)}
.lg{display:flex;gap:6px;align-items:center}
.lg i{width:11px;height:11px;border-radius:3px;display:inline-block}
.lg-note{margin-left:auto;font-family:var(--mono);font-size:10.5px;opacity:.85}
.sortbar{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.sortbar-l{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin-right:2px}
.sortbtn{font-family:var(--mono);font-size:11.5px;padding:4px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink2);cursor:pointer;transition:.12s}
.sortbtn:hover{background:var(--card2)}
.sortbtn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.sortbar-note{font-family:var(--mono);font-size:10px;color:var(--mut);margin-left:auto}
.grp{display:flex;flex-direction:column;gap:3px;margin-bottom:9px}
.grp-h{display:flex;align-items:baseline;gap:10px;padding:7px 8px 4px;border-bottom:1px solid var(--line);margin-bottom:3px}
.grp-g{font-family:var(--disp);font-size:15px;letter-spacing:.02em;color:var(--ink)}
.grp-gap{font-family:var(--mono);font-size:10.5px;color:var(--mut);margin-left:auto}
.bars{display:flex;flex-direction:column;gap:3px}
.barrow{display:grid;grid-template-columns:24px 26px 168px 1fr 46px;align-items:center;gap:9px;width:100%;
  background:none;border:1px solid transparent;border-radius:9px;padding:5px 8px;cursor:pointer;text-align:left;font-family:inherit;transition:.12s}
.barrow:hover{background:var(--card2);border-color:var(--line)}
.barrow.selrow{background:rgba(10,165,149,.09);border-color:var(--cyan)}
.rk{font-family:var(--mono);font-size:11px;color:var(--mut);text-align:right}
.fl{font-size:18px}
.tn{font-size:13px;font-weight:700;color:var(--ink);line-height:1.15;display:flex;flex-direction:column}
.tn em{font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;color:var(--mut);font-weight:400;margin-top:1px}
.wasrank{color:var(--gold);font-weight:700}
.track{height:16px;background:rgba(22,25,28,.07);border-radius:6px;overflow:hidden}
.fill{height:100%;display:flex;border-radius:6px;overflow:hidden;min-width:2px;transition:width .25s}
.fill i{height:100%;display:block;transition:filter .12s}
.barrow:hover .barseg:hover{filter:brightness(1.18)}
.sc{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--ink);text-align:right}
.sumrow{display:flex;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:11px;border-top:1.5px solid var(--line)}
.sum-cell{flex:1 1 150px;display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--card2)}
.sum-cell>span{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.sum-cell>b{font-family:var(--mono);font-size:17px;color:var(--ink)}
.sum-cell .pm{font-size:13px;color:var(--mut);text-transform:none;letter-spacing:0;margin-left:2px}
.statsel{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--ink2);background:#fff;border:1px solid var(--line);border-radius:7px;padding:3px 6px;cursor:pointer}

/* map */
.map{padding:14px}
.map.embedded{padding:0;margin-bottom:18px}
.map.embedded .map-svg{border-radius:11px;box-shadow:none}
.map.embedded .map-foot{gap:8px 14px;margin-top:9px;font-size:10.5px}
.map-pick{display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:12px;color:var(--mut);flex-wrap:wrap}
.map-pick select{background:#fff;border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:7px 10px;font-family:var(--body);font-size:12.5px;font-weight:600;cursor:pointer;min-width:180px;box-shadow:var(--shadow)}
.map-clear{background:none;border:none;color:var(--magenta);font-family:var(--mono);font-size:11px;cursor:pointer;text-decoration:underline}
.map-details{margin-left:auto;background:var(--ink);color:#fff;border:none;border-radius:8px;padding:7px 11px;font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;cursor:pointer;transition:.15s}
.map-details:hover{background:var(--magenta)}
.land path{fill:#f6efe2;stroke:rgba(22,25,28,.22);stroke-width:1;stroke-linejoin:round;stroke-linecap:round}
.map-hint{font-size:12.5px;color:var(--mut);margin-bottom:10px;text-align:center}
.map-svg{width:100%;height:auto;border:1px solid var(--line);border-radius:14px;display:block;box-shadow:var(--shadow)}
.map-co{font-family:var(--disp);font-size:13px;fill:rgba(22,25,28,.12);letter-spacing:.18em}
.map-city{font-family:var(--mono);font-size:9px;fill:var(--ink2)}
.map-origin{font-family:var(--mono);font-size:10px;fill:var(--magenta);font-weight:500}
.map-city.strong{fill:var(--ink);font-weight:600;font-size:9.5px}
.map-tags{font-family:var(--mono);font-size:7.5px;fill:var(--mut);letter-spacing:.02em}
.map-sub{font-family:var(--mono);font-size:8px;fill:var(--mut)}
.legpath{stroke-dashoffset:200;animation:dash 1.1s ease forwards}
@keyframes dash{to{stroke-dashoffset:0}}
.map-foot{display:flex;flex-wrap:wrap;gap:14px 18px;justify-content:center;margin-top:11px;font-size:11.5px;color:var(--mut)}
.map-foot-note{flex-basis:100%;text-align:center;font-family:var(--mono);font-size:10px;color:var(--mut);opacity:.85;margin-top:1px}
.map-foot .d{width:11px;height:11px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle}

/* how */
.how{padding:16px 18px;max-width:840px}
.how-lead{font-size:14px;line-height:1.6;color:var(--ink2);margin:2px 0 16px}
.how-lead b{color:var(--ink)}
.ok2{color:var(--green);font-weight:600} .warn2{color:var(--gold);font-weight:600}
.eq{border-left:3px solid;background:var(--card2);border:1px solid var(--line);border-left-width:3px;border-radius:0 11px 11px 0;padding:11px 14px;margin-bottom:10px}
.eq-h{display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:6px}
.eq code{font-family:var(--mono);font-size:12.5px;display:block;margin-bottom:6px}
.eq p{margin:0;font-size:12.5px;color:var(--mut);line-height:1.5}
.how-comp{margin-top:16px;border:1px solid var(--line);border-radius:13px;padding:15px;background:linear-gradient(120deg,rgba(217,135,18,.07),#fff)}
.how-comp-t{font-family:var(--disp);font-size:17px;letter-spacing:.02em;display:flex;gap:8px;align-items:center;color:var(--ink);margin-bottom:8px}
.how-comp code{font-family:var(--mono);font-size:13px;color:var(--ink);display:block}
.how-w{display:flex;flex-wrap:wrap;gap:14px;margin:11px 0}
.how-w span{font-size:12px;color:var(--ink2);display:flex;gap:6px;align-items:center}
.how-w i{width:11px;height:11px;border-radius:3px}
.how-w b{font-family:var(--mono)}
.how-foot{font-size:12px;color:var(--mut);line-height:1.55;margin:6px 0 0}
.how-foot b{color:var(--ink2)}
.milp-nums{display:flex;flex-wrap:wrap;gap:8px;margin:11px 0 2px}
.milp-nums>div{flex:1 1 150px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#fff;display:flex;flex-direction:column;gap:3px}
.mn-k{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
.mn-v{font-family:var(--mono);font-size:15px;color:var(--ink);font-weight:600}
.gloss{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
.gloss th{text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--mut);border-bottom:1px solid var(--line);padding:7px 9px}
.gloss th:last-child{text-align:right}
.gloss td{padding:7px 9px;border-bottom:1px solid var(--line2);color:var(--ink2);vertical-align:top;line-height:1.4}
.gloss .gsym{font-family:var(--mono);color:var(--ink);white-space:nowrap}
.gloss .gval{font-family:var(--mono);color:var(--mut);text-align:right;white-space:nowrap}
.gloss .gval.tune{color:var(--gold)}

/* drawer */
.drawer-wrap{position:fixed;inset:0;background:rgba(22,25,28,.34);backdrop-filter:blur(3px);z-index:40;display:flex;justify-content:flex-end;animation:fade .2s ease}
@keyframes fade{from{opacity:0}to{opacity:1}}
.drawer{width:min(560px,96vw);height:100%;overflow:auto;background:#fff;border-left:1px solid var(--line);box-shadow:-14px 0 44px rgba(22,25,28,.16);padding:22px;animation:slide .25s cubic-bezier(.2,.8,.2,1)}
@keyframes slide{from{transform:translateX(30px);opacity:.4}to{transform:none;opacity:1}}
.dclose{position:absolute;top:16px;right:16px;background:var(--card2);border:1px solid var(--line);color:var(--mut);border-radius:9px;padding:6px;cursor:pointer}
.dclose:hover{color:var(--ink)}
.dhead{display:flex;gap:13px;align-items:center;margin-bottom:18px;padding-right:36px}
.dflag{font-size:38px}
.dhead h2{font-family:var(--disp);font-size:30px;margin:0;letter-spacing:.01em}
.dmeta{font-family:var(--mono);font-size:11px;color:var(--mut);margin-top:2px}
.dscore{margin-left:auto;text-align:right;line-height:1}
.dscore span{font-family:var(--mono);font-size:11px;color:var(--mut)}
.dscore b{font-family:var(--disp);font-size:34px;color:var(--cyan);display:block;margin:2px 0}
.dscore em{font-style:normal;font-size:10px;color:var(--mut);letter-spacing:.1em}
.dmapbtn{display:flex;align-items:center;gap:7px;width:100%;justify-content:center;margin:-6px 0 18px;padding:9px;border:1px solid var(--cyan);border-radius:10px;background:rgba(10,165,149,.07);color:var(--cyan2,#0a7d70);font-family:var(--mono);font-size:12px;cursor:pointer;transition:background .15s}
.dmapbtn:hover{background:rgba(10,165,149,.14)}
.dsec-t{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--ink2);opacity:.78;margin:6px 0 12px;text-transform:uppercase}

/* timeline */
.timeline{display:flex;align-items:flex-start;overflow-x:auto;padding-bottom:8px;gap:0}
.tlnode{min-width:78px;text-align:center;flex:none}
.tldot{width:13px;height:13px;border-radius:50%;margin:0 auto 8px}
.tllab{font-family:var(--mono);font-size:10px;letter-spacing:.06em;font-weight:500}
.tlsub{font-size:12px;font-weight:700;color:var(--ink);margin-top:3px;line-height:1.2}
.tltag{font-family:var(--mono);font-size:9.5px;color:var(--mut);margin-top:3px}
.tledge{flex:1;min-width:52px;display:flex;flex-direction:column;align-items:center;padding:5px 6px 0}
.tledge span{height:2px;width:100%;background:linear-gradient(90deg,var(--cyan),var(--magenta));border-radius:2px;opacity:.55}
.tledge em{font-style:normal;font-family:var(--mono);font-size:9.5px;color:var(--mut);margin-top:6px;white-space:nowrap;line-height:1.3}
.tledge em.e2{margin-top:1px;color:var(--ink2)}

/* override */
.ovrow{display:flex;align-items:center;gap:9px;margin:14px 0 4px;font-size:12px;color:var(--mut);flex-wrap:wrap}
.ovrow select{background:#fff;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:6px 9px;font-family:var(--mono);font-size:11.5px;cursor:pointer}
.ovrow .ovrange{flex:1;min-width:120px;max-width:200px}
.ovrow .ovval{font-family:var(--mono);font-size:11.5px;color:var(--gold);white-space:nowrap}
.ovreset{background:none;border:none;color:var(--magenta);font-family:var(--mono);font-size:11px;cursor:pointer;text-decoration:underline}

/* detail grid */
.dgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
@media(max-width:560px){.dgrid{grid-template-columns:1fr}}
.radar{width:100%;height:auto}
.radar-lab{font-family:var(--mono);font-size:8.5px;fill:var(--mut)}
.metriclist{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.ml{font-size:11.5px;color:var(--ink2);display:flex;align-items:center;gap:7px}
.ml i{width:9px;height:9px;border-radius:2px}
.ml b{margin-left:auto;font-family:var(--mono);color:var(--ink)}
.rivals{display:flex;flex-direction:column;gap:7px}
.rival{display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;transition:.12s}
.rival:hover{border-color:var(--cyan);background:#fff;transform:translateX(2px)}
.rf{font-size:17px}.rn{font-size:12.5px;font-weight:700}
.redge{font-family:var(--mono);font-size:14px;font-weight:500;text-align:right}
.rtag{grid-column:2/4;font-family:var(--mono);font-size:9.5px;color:var(--mut);margin-top:-3px}
.rivalnote{font-size:11px;color:var(--mut);line-height:1.5;margin-top:10px}

.foot{text-align:center;font-family:var(--mono);font-size:10.5px;color:var(--mut);margin-top:18px;opacity:.8;line-height:1.6}

/* ---- mobile / responsive ---- */
@media(max-width:720px){
  .lab{padding:12px}
  .hero{padding:18px 16px;border-radius:16px}
  .hero-row{flex-wrap:wrap}
  .title{font-size:clamp(28px,8.5vw,46px)}
  .sub{font-size:13.5px}
  .hero-badge{font-size:10px;padding:6px 10px}
  .prov{font-size:10px}
  .body{gap:12px}
  .console{position:static;top:auto;max-height:none}
  .tabs{flex-wrap:wrap}
  .tab{padding:8px 10px;font-size:11px}
  .rankwrap{padding:10px 10px}
  .legend{gap:9px;font-size:10.5px}
  .lg-note{display:none}
  .barrow{grid-template-columns:18px 20px minmax(70px,92px) 1fr 32px;gap:6px;padding:5px 6px}
  .tn{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px}
  .tn em{display:none}
  .rk{font-size:10px}.fl{font-size:15px}.sc{font-size:11.5px}
  .stat{padding:11px 12px}
  .stat-b{font-size:21px}
  .map{padding:8px}
  .how{padding:14px 14px}
  .eq code,.how-comp code{font-size:11.5px;line-height:1.5}
  .gloss td,.gloss th{padding:6px 6px}
  .gloss .gval{white-space:normal}
  .drawer{padding:16px}
  .dhead{gap:10px}
  .dflag{font-size:30px}
  .dhead h2{font-size:23px}
  .dscore b{font-size:25px}
  .map-foot{flex-wrap:wrap;gap:12px}
  /* detail drawer becomes a bottom sheet */
  .drawer-wrap{justify-content:center;align-items:flex-end}
  .drawer{width:100%;height:auto;max-height:90vh;border-left:none;border-top:1px solid var(--line);
    border-radius:18px 18px 0 0;box-shadow:0 -14px 44px rgba(22,25,28,.18);animation:slideup .26s cubic-bezier(.2,.8,.2,1)}
  .verdict{flex-wrap:wrap;gap:8px}
  .verdict-arrow{display:none}
  .sens{padding:12px 8px}
  .sens-row{grid-template-columns:20px 18px minmax(64px,1fr) 1.4fr 72px;gap:6px}
  .sens-tn{font-size:11.5px}
  .sum-export{width:100%;margin-left:0;justify-content:flex-end}
}
@keyframes slideup{from{transform:translateY(40px);opacity:.5}to{transform:none;opacity:1}}
@media(max-width:360px){
  .stats{gap:8px}
  .barrow{grid-template-columns:16px 18px 1fr 1.3fr 30px;gap:5px}
}
@media(prefers-reduced-motion:reduce){
  .lab *,.hub *,.picker,.drawer{animation:none!important;transition:none!important}
  .leg{stroke-dashoffset:0!important}
}
`;
