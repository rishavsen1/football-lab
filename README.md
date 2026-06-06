# Decision making on all things football (soccer)

# 1. Fair Fixtures — WC2026 Travel Burden Lab

Travel-fatigue burden model and constrained MILP venue-reassignment fairness audit for the 2026 FIFA World Cup group stage.

An interactive lab that scores how physically punishing each of the 48 teams' group-stage draw is, audits whether the real FIFA schedule is fair, and computes a constrained counterfactual that re-slots the 72 matches across the 16 host cities to optimise a chosen fairness or efficiency objective.

> Status: v1.0. Group stage only (knockouts on the roadmap). The burden model is illustrative and tunable, not calibrated to performance data; see Limitations.

---

## What it does

- **Burden model.** Scores every team on five fatigue factors (jet-lag, travel, heat, altitude, congestion), each rescaled and weight-blended into one composite score. Weights and all coefficients are live-tunable; base camp and arrival lead are overridable per team.
- **Fairness audit.** Shows the real-draw gap, Gini, and worst case, and ranks teams by burden (sortable by burden, group, A-Z, or FIFA rank).
- **Constrained optimizer ("Optimized" toggle).** Reassigns match venues subject to real constraints (one match per stadium per day; host nations stay in-country) under a selectable objective. Reports the improvement and each team's rank change vs the actual draw.
- **Journey map + drawer.** Per-team route (home -> base camp -> venues) on a real basemap, with an embedded map and full itinerary breakdown in the detail drawer.

---

## The model

Composite `= 100 · Σ wᵢ · (factorᵢ / refᵢ)`, default weights `{jet .30, travel .30, heat .15, alt .15, cong .10}`, fixed reference scales `{jet 12, travel 25, heat 12, alt 25, cong 6}`.

- **Jet-lag** `J(Δz)·max(0, 1 − B/(κ|Δz|))` — shortest-direction tz shift home->camp, eastward penalised more, discounted by arrival-lead days `B`.
- **Travel** `Σ 2·dist(camp,venue)·(1 + δ·e^(−rest/τ)) / 1000` — round trips from camp, recency-weighted (short rest hurts).
- **Heat** `Σ max(0, WBGT_city − θ)`.
- **Altitude** `Σ [β_exp·max(0,(h−h0)/100) + β_tr·|h − h_camp|/100]` — thin air plus the swing of each camp↔venue hop.
- **Congestion** `Σ max(0, g_min − gap)` — short turnarounds between matchdays.

## Model defaults — choices & reasoning

The coefficients are **reasoned defaults anchored to sports-science thresholds, not fitted to fatigue data** — every value is live-tunable in the console, and this section explains why each default sits where it does. (You can verify the threshold anchors against the sources at the end.)

### Threshold & shape coefficients (`H`)

| Symbol | Default | What it controls | Why this value |
|---|---|---|---|
| `θ` (heat threshold) | **28 °C WBGT** | heat counts only above this | FIFPRO's threshold to consider **postponing** a match and to run cooling breaks is **WBGT 28 °C**; FIFA mandates cooling breaks at **32 °C**. 28 °C is the onset of meaningful heat stress, so burden accrues above it. |
| `h₀` (altitude threshold) | **1500 m** | thin-air exposure counts above this | Measurable aerobic decline (**~5–10 % at 1500 m**, with VO₂max falling ~7–8 % per 1000 m above it) begins here; FIFA once banned internationals **>2500 m**. |
| `g_min` (ideal rest gap) | **4 days (96 h)** | congestion penalty below this | The fixture-congestion literature defines congestion as **<96 h between matches**; 72–96 h preserves performance but not injury-rate. 96 h = 4 days is the recovery line. |
| `αE / αW` (east/west jet-lag) | **1.0 / 0.6** | eastward penalised more | Eastward (phase-advance) jet-lag takes **~50–100 % longer** to clear than westward; the 1.67× ratio reflects that asymmetry. |
| `κ` (recovery rate) | **1.0 day / tz-hour** | how fast the body clock resets | Matches the athlete rule of thumb of **~1 day per time zone** for eastward adjustment. |
| `δ / τ` (travel recency) | **0.5 / 2.0** | surcharge for travelling on short rest | A reasoned heuristic: a leg flown with no rest costs up to **+50 %**, decaying with an ~2-day time constant (so ~2 days' rest removes most of it). Not literature-anchored — a tunable shape. |
| `β_exp / β_tr` (altitude) | **1.0 / 0.5** | thin-air exposure vs camp↔venue swing | Sustained exposure is weighted twice the transient hop; both reasoned, not fitted. |
| `LEAD` (arrival lead) | **7 days** | buffer before a team's first match | A typical pre-tournament base-camp arrival window; long enough to blunt most jet-lag for the ≤9 h shifts seen here. Per-team overridable. |

### Composite weights (`W`) and reference scales (`REF`)

Default weights `{jet .30, travel .30, heat .15, alt .15, cong .10}` are **importance priors** — travel and jet-lag lead because a continent-spanning, 48-team draw is fundamentally a *travel* problem; heat and altitude are secondary physiological loads; congestion is last because the group calendar is uniform. Reference scales `{jet 12, travel 25, heat 12, alt 25, cong 6}` rescale each raw factor by its **worst plausible single-team case** (e.g. `jet 12` = a full 12 h time-zone flip with no buffer) so every factor maps onto a comparable 0–1-ish band before weighting.

**Important nuance — nominal weight ≠ realized influence.** Because `REF` is set to each factor's *worst-case headroom* rather than its *realized spread under the actual 2026 draw*, the weights behave as ceilings, not shares. Measured across all 48 teams under the real schedule and default buffer, the **effective** contribution to the composite is:

| factor | nominal weight | effective share | why it differs |
|---|---|---|---|
| travel | 30 % | **~52 %** | the real draw's biggest source of variation (camps 1–10k km from venues) |
| altitude | 15 % | **~24 %** | Mexico City / Guadalajara / Bogotá-bound trips push this near its ceiling |
| heat | 15 % | **~15 %** | on target |
| jet-lag | 30 % | **~9 %** | the 7-day arrival buffer cancels most jet-lag for the ≤9 h shifts in this draw |
| congestion | 10 % | **~0 %** | **dormant**: every group-stage gap is 4–7 days (≥96 h), so no team is congested |

This is a deliberate, defensible design — the factors are "armed" to punish a genuinely bad schedule, and the low jet-lag/congestion shares correctly reflect that **FIFA's group-stage calendar is humane** (long buffers, ≥96 h spacing). The congestion term is retained for the planned knockout extension, where short turnarounds appear. If you'd rather the weights equal realized influence under *this* draw, recalibrate `REF` to the empirical maxima (jet ≈ 3, travel ≈ 11, heat ≈ 8, alt ≈ 28, cong ≈ 0) — see Limitations, as this reorders teams and shifts the headline numbers.

### Sources

- FIFA / FIFPRO heat policy & WBGT thresholds — [Kestrel: FIFA hydration-break rule](https://kestrelinstruments.com/blog/fifas-hydration-break-rule-explained-what-it-means-for-the-2026-world-cup), [FIFPRO: Extreme weather in football](https://fifpro.org/en/supporting-players/health-and-performance/extreme-weather-and-climate-change/extreme-weather-in-football)
- Jet-lag east/west asymmetry & recovery rate — [Jet Lag in Athletes (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3435929/), [Eastward jet lag & NBA performance (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9245584/)
- Altitude & football performance — [The Science of Sport: altitude](https://sportsscientists.com/2010/06/football-2010-impact-of-altitude/), [ISSPF: altitude on soccer performance](https://www.isspf.com/articles/the-impact-of-altitude-on-soccer-performance/)
- Fixture congestion & the 96 h line — [Fixture congestion & injury: systematic review (Sports Medicine)](https://link.springer.com/article/10.1007/s40279-022-01799-5), [Hamstrings: are 72 h enough? (J Sports Sci)](https://www.tandfonline.com/doi/abs/10.1080/02640414.2024.2386209)

## The optimizer

With base camp and dates fixed, jet-lag and congestion are constant w.r.t. venue choice and travel/heat/altitude are additively separable per match, so burden is **linear in the assignment** and minimax is an exact MILP:

```
min  Z
s.t. Z ≥ κ(t) + Σₘ Σ_c cost(t,m,c)·x[m,c]   ∀ teams t
     Σ_c x[m,c] = 1                          ∀ matches m
     Σ_{m: day(m)=d} x[m,c] ≤ 1              ∀ day d, city c
     x[m,c] ∈ {0,1},  x[m,c] = 0 if c ∉ A(m)
```

- Exact solve in `milp.py` (PuLP/CBC); the in-app constrained local search reaches the **exact CBC optimum** for minimax at default weights.
- Objectives: **Minimax**, **Gap**, **Gini** (equity); **Balanced** (Gap+Gini, normalised); **Total** (efficiency). Only minimax is certified optimal; the rest are near-optimal heuristics.

## Headline result (default weights)

- Hardest real draw: South Africa (27.6). Real-draw fairness gap 26.3, Gini 0.323.
- Minimax optimum: worst team 27.6 -> 20.7, gap 26.3 -> 20.7, 49 of 72 matches relocated.
- Balanced objective drives gap to 9.1 and Gini to 0.041 at once.

---

## Repo contents

- `wc2026_travel_burden_lab.jsx` — the app. Single-file React component, deps `react` + `lucide-react`, self-contained CSS. Default export `WorldCup2026TravelBurdenLab`.
- `milp.py` — validator/reference solver. Parses the data from the `.jsx`, checks fixture integrity (72 matches, 12 groups × 6, every team plays 3), solves the exact minimax MILP, and confirms the greedy reaches it.
- `wc2026_travel_burden_lab_v1_review.md` — full v1 review: end-to-end spec, code map, feature list, loophole audit, and roadmap.

---

## Run it

The app renders as-is in a Claude artifact. To run standalone (Vite):

```bash
npm create vite@latest fair-fixtures -- --template react
cd fair-fixtures && npm install && npm install lucide-react
# drop wc2026_travel_burden_lab.jsx into src/, then in src/App.jsx:
#   import Lab from "./wc2026_travel_burden_lab.jsx";
#   export default function App(){ return <Lab/>; }
npm run dev
```

It injects its own CSS and loads fonts from Google Fonts. No build config or Tailwind needed.

Validate the data and optimum:

```bash
pip install pulp
python milp.py   # prints fixture checks, actual vs MILP-optimal, and the greedy-vs-CBC gap
```

---

## Data & provenance

- Confirmed: 48 teams, 12 groups, all 72 fixtures (teams/venue/date), base camps, host-city geos (lat/lon/elevation/timezone).
- Estimated (flagged in-app): WBGT heat proxy per city; FIFA world ranking (top-20 published, rest approximate, used only for sorting); model coefficients and reference scales.

## Limitations

The model is a tunable heuristic, not validated against fatigue/performance data. Heat ignores kickoff time and roofs; the optimizer holds dates and camps fixed (so it cannot fix jet-lag or congestion); its constraint set is looser than FIFA's real one, so the fairness gains are an upper bound, not an operational schedule. "FIFA is unfair by X" is model-relative. **Reference scales set implicit factor importance**: they normalise to each factor's worst-case headroom, so the nominal composite weights act as ceilings rather than realised shares (see *Model defaults*). Recalibrating `REF` to the realised spread of this draw would make weights equal realised influence but reorders teams and shifts the headline numbers — a deliberate choice left to the user. Full audit and engineering caveats are in the review doc.

## Roadmap

- Real WBGT per venue/date at local kickoff (NOAA/ERA5), roof/AC adjustment.
- Per-matchday opponent edge (cumulative burden before each actual opponent).
- Knockout extension (expected burden over the bracket, post-group base relocation).
- Coefficient calibration, sensitivity/stability analysis, exact solver for all objectives, richer constraints, base/date optimization, and a Pareto front across objectives.

## License

MIT (add a `LICENSE` file).
