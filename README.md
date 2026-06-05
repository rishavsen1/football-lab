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

The model is a tunable heuristic, not validated against fatigue/performance data. Heat ignores kickoff time and roofs; the optimizer holds dates and camps fixed (so it cannot fix jet-lag or congestion); its constraint set is looser than FIFA's real one, so the fairness gains are an upper bound, not an operational schedule. "FIFA is unfair by X" is model-relative. Full audit and engineering caveats are in the review doc.

## Roadmap

- Real WBGT per venue/date at local kickoff (NOAA/ERA5), roof/AC adjustment.
- Per-matchday opponent edge (cumulative burden before each actual opponent).
- Knockout extension (expected burden over the bracket, post-group base relocation).
- Coefficient calibration, sensitivity/stability analysis, exact solver for all objectives, richer constraints, base/date optimization, and a Pareto front across objectives.

## License

MIT (add a `LICENSE` file).
