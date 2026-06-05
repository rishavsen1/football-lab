/* ============================================================================
   WC2026 Travel Burden Lab — MODEL
   Geometry, the five-factor burden model, and the constrained venue optimizer.
   Pure JS (no React) so it is shared by the app, the Node scripts, and — via the
   reference numbers in tools/wc2026.data.json — cross-checked by tools/milp.py.

   Composite burden = 100 · Σ wᵢ · (factorᵢ / refᵢ).
   With base camps and match dates fixed, jet-lag and congestion are constant
   w.r.t. venue choice and travel/heat/altitude are additively separable per
   match, so burden is linear in the assignment and minimax is an exact MILP;
   optimizeAssignment is the in-app constrained local search.
============================================================================ */

import {
  C, TEAMS, TEAM_MATCHES, FIXTURES, ACTUAL_CITY, MATCH_DAYS, allowedCities,
} from "../data/wc2026.js";

// ---- reference scales (raw -> ~[0,1]) so metrics are comparable & decoupled --
export const REF = { jet:12, travel:25, heat:12, alt:25, cong:6 };

// model coefficient + weight defaults; LEAD = default arrival-lead buffer (days)
export const DEFAULT_H = {
  aE:1.0, aW:0.6, kappa:1.0, delta:0.5, tau:2.0,
  thetaHeat:28, h0:1500, bExp:1.0, bTrans:0.5, gMin:4,
};
export const DEFAULT_W = { jet:0.30, travel:0.30, heat:0.15, alt:0.15, cong:0.10 };
export const LEAD = 7;

// ---- math -------------------------------------------------------------------
export const R = 6371;
export const rad = (d) => (d * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s)); // km
}
// great-circle initial bearing from a -> b, degrees 0=N 90=E (date-line safe)
export function bearing(a, b) {
  const f1 = rad(a.lat), f2 = rad(b.lat);
  let dl = rad(b.lon - a.lon);
  dl = ((dl + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
  const y = Math.sin(dl)*Math.cos(f2);
  const x = Math.cos(f1)*Math.sin(f2) - Math.sin(f1)*Math.cos(f2)*Math.cos(dl);
  return (Math.atan2(y, x)*180/Math.PI + 360) % 360;
}
// shortest-direction circadian shift in (-12,12]; +ve = eastward (phase advance)
export function effShift(fromUtc, toUtc) {
  const raw = toUtc - fromUtc;
  return (((raw + 12) % 24) + 24) % 24 - 12;
}

// raw metrics for one team given its assignment (base, venues, dates)
export function rawMetrics(team, base, venues, dates, H, buffer) {
  const o = C[team.o], bC = C[base], vC = venues.map((k)=>C[k]);
  const B = Math.max(0, buffer);
  const dz = effShift(o.utc, bC.utc), adz = Math.abs(dz);
  const dirW = dz > 0 ? H.aE : H.aW;
  const jet = adz === 0 ? 0 : adz * dirW * Math.max(0, 1 - B / (H.kappa * adz));
  const rest = [B, dates[1]-dates[0], dates[2]-dates[1]];
  let travel = 0;
  for (let m=0;m<3;m++) travel += 2*haversine(bC,vC[m])*(1 + H.delta*Math.exp(-rest[m]/H.tau));
  travel /= 1000; // -> thousand-km units
  let heat = 0; for (let m=0;m<3;m++) heat += Math.max(0, vC[m].wb - H.thetaHeat);
  let alt = 0;
  for (let m=0;m<3;m++)
    alt += H.bExp*Math.max(0,(vC[m].el-H.h0)/100) + H.bTrans*Math.abs(vC[m].el-bC.el)/100;
  const cong = Math.max(0,H.gMin-(dates[1]-dates[0])) + Math.max(0,H.gMin-(dates[2]-dates[1]));
  return { jet, travel, heat, alt, cong, B, rest, dz };
}
export const scaled = (raw) => ({
  jet:raw.jet/REF.jet, travel:raw.travel/REF.travel, heat:raw.heat/REF.heat,
  alt:raw.alt/REF.alt, cong:raw.cong/REF.cong,
});
export const composite = (sc, w) =>
  100*(w.jet*sc.jet + w.travel*sc.travel + w.heat*sc.heat + w.alt*sc.alt + w.cong*sc.cong);

// gini over non-negative array
export function gini(xs){
  const a=[...xs].sort((p,q)=>p-q), n=a.length, s=a.reduce((u,v)=>u+v,0);
  if(s===0) return 0;
  let cum=0; for(let i=0;i<n;i++) cum+=(i+1)*a[i];
  return (2*cum)/(n*s) - (n+1)/n;
}

// ---- venue-assignment optimizer (constrained minimax) -----------------------
// composite burden per team for a full city-by-match assignment (via rawMetrics)
export function burdensFor(cityByMatch, H, wN, leadOf, baseOf){
  const out={};
  for(const tm of TEAMS){
    const ms=TEAM_MATCHES[tm.t];
    out[tm.t]=composite(scaled(rawMetrics(tm, baseOf(tm.t),
      ms.map((i)=>cityByMatch[i]), ms.map((i)=>FIXTURES[i][0]), H, leadOf(tm.t))), wN);
  }
  return out;
}
// fast per-(team,slot,city) cost table + venue-independent constant (jet+congestion)
export function costTable(H,wN,leadOf,baseOf){
  const tab={}, konst={};
  for(const tm of TEAMS){
    const t=tm.t, ms=TEAM_MATCHES[t], base=C[baseOf(t)];
    const dates=ms.map((i)=>FIXTURES[i][0]);
    const B=Math.max(0,leadOf(t)), rest=[B, dates[1]-dates[0], dates[2]-dates[1]];
    const o=C[tm.o], dz=effShift(o.utc,base.utc), adz=Math.abs(dz);
    const jet=adz===0?0:adz*(dz>0?H.aE:H.aW)*Math.max(0,1-B/(H.kappa*adz));
    const cong=Math.max(0,H.gMin-rest[1])+Math.max(0,H.gMin-rest[2]);
    konst[t]=100*(wN.jet/REF.jet*jet + wN.cong/REF.cong*cong);
    tab[t]=ms.map((mi,s)=>{
      const row={};
      for(const ck of allowedCities(FIXTURES[mi][2],FIXTURES[mi][3])){
        const c=C[ck];
        const travel=2*haversine(base,c)*(1+H.delta*Math.exp(-rest[s]/H.tau))/1000;
        const heat=Math.max(0,c.wb-H.thetaHeat);
        const alt=H.bExp*Math.max(0,(c.el-H.h0)/100)+H.bTrans*Math.abs(c.el-base.el)/100;
        row[ck]=100*(wN.travel/REF.travel*travel + wN.heat/REF.heat*heat + wN.alt/REF.alt*alt);
      }
      return row;
    });
  }
  return {tab,konst};
}
// combine a primary fairness objective with a small total-burden tie-break
export function objScore(mx,mn,sm,arr,objective){
  if(objective==="total") return sm;
  if(objective==="gap")   return 1e6*(mx-mn)+1e3*gini(arr)+sm; // gini term smooths the range landscape
  if(objective==="gini")  return 1e6*gini(arr)+sm;
  return 1000*mx+sm; // minimax (worst case)
}
// constrained local search over venue assignment, warm-started from the real schedule.
// constraints: one match per stadium per day; host nations stay in-country.
// objective is selectable; at the default weighting the minimax run reaches the exact CBC optimum.
export function optimizeAssignment(H,wN,leadOf,baseOf,objective){
  const obj=objective||"minimax";
  const {tab,konst}=costTable(H,wN,leadOf,baseOf);
  const slotOf={};
  for(const t in TEAM_MATCHES) TEAM_MATCHES[t].forEach((mi,s)=>{ (slotOf[mi]=slotOf[mi]||{})[t]=s; });
  const teamOf=(mi)=>[FIXTURES[mi][2],FIXTURES[mi][3]];
  const assign=[...ACTUAL_CITY];
  const occ=new Map();
  assign.forEach((c,mi)=>occ.set(MATCH_DAYS[mi]+"|"+c, mi));
  const burd=(t,ov)=>konst[t]+TEAM_MATCHES[t].reduce((s,mi)=>s+tab[t][slotOf[mi][t]][(ov&&mi in ov)?ov[mi]:assign[mi]],0);
  const tb={}; for(const t in tab) tb[t]=burd(t,null);
  // baseline (actual-schedule) gap & gini under current weights, for the Balanced blend
  let b0mx=-Infinity,b0mn=Infinity; const b0arr=[];
  for(const t in tb){ const v=tb[t]; if(v>b0mx)b0mx=v; if(v<b0mn)b0mn=v; b0arr.push(v); }
  const gap0=Math.max(1e-9,b0mx-b0mn), gini0=Math.max(1e-9,gini(b0arr));
  const needArr = obj==="gini"||obj==="balanced"||obj==="gap";
  const score=(ov,aff)=>{
    let mx=-Infinity,mn=Infinity,sm=0; const arr=needArr?[]:null;
    for(const t in tb){ const v=(aff&&aff.indexOf(t)>=0)?burd(t,ov):tb[t];
      if(v>mx)mx=v; if(v<mn)mn=v; sm+=v; if(arr)arr.push(v); }
    if(obj==="balanced") return 0.5*((mx-mn)/gap0 + gini(arr)/gini0)*1e6 + sm; // equity blend + tie-break
    return objScore(mx,mn,sm,arr,obj);
  };
  let cur=score(null,null);
  for(let pass=0;pass<40;pass++){
    let best=null, bestD=-1e-9;
    for(let mi=0;mi<FIXTURES.length;mi++){
      const d=MATCH_DAYS[mi], c0=assign[mi];
      for(const c1 of allowedCities(FIXTURES[mi][2],FIXTURES[mi][3])){
        if(c1===c0) continue;
        const occu=occ.get(d+"|"+c1), ov={[mi]:c1}; let aff=teamOf(mi);
        if(occu!=null){
          if(allowedCities(FIXTURES[occu][2],FIXTURES[occu][3]).indexOf(c0)<0) continue;
          ov[occu]=c0; aff=aff.concat(teamOf(occu));
        }
        const dlt=score(ov,aff)-cur;
        if(dlt<bestD){ bestD=dlt; best={mi,c1,occu}; }
      }
    }
    if(!best) break;
    const {mi,c1,occu}=best, d=MATCH_DAYS[mi], c0=assign[mi];
    occ.delete(d+"|"+c0);
    if(occu!=null){ assign[occu]=c0; occ.set(d+"|"+c0,occu); }
    assign[mi]=c1; occ.set(d+"|"+c1,mi);
    teamOf(mi).concat(occu!=null?teamOf(occu):[]).forEach((t)=>{ tb[t]=burd(t,null); });
    cur=score(null,null);
  }
  return assign;
}
