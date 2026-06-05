# World Cup 2026 — Travel Burden Lab · v1.0 review & handoff

Single-file React artifact (`wc2026_travel_burden_lab.jsx`, ~1.56k lines, deps: `react` + `lucide-react`). Companion validator: `milp.py` (PuLP/CBC). This doc is the end-to-end spec, code map, feature list, loophole audit, and roadmap for continuing in Claude Code.

---

## 1. The idea

Score how physically punishing each of the 48 teams' **group-stage** draw is, audit whether the real FIFA schedule is fair, and compute a constrained counterfactual that reassigns match venues to optimise a chosen fairness/efficiency objective.

- Unit of analysis: a team's journey `home -> base camp -> 3 group venues` (round trips from camp).
- Output 1: a per-team **composite burden** score (0..~100-ish) from five fatigue factors, fully tunable.
- Output 2: a fairness **audit** of the real draw (gap, Gini, worst case) plus a constrained **optimizer** ("Optimized" toggle) that re-slots the 72 matches across the 16 cities.
- Scope: group stage only (knockouts deferred). Everything is computed live; nothing is precomputed except a baked CBC reference solution.

---

## 2. Data & provenance

Confirmed / real (verified via web sources, Jun 2026):

- 48 teams, 12 groups A-L; playoff slots resolved (Czechia, Bosnia & Herz., Türkiye, Sweden, DR Congo, Iraq).
- All **72 group-stage fixtures** (teams, venue city, date) from the official schedule -> `const FIXTURES`.
- Base camps per team (`const BASES`), incl. Iran moved Tucson -> Tijuana.
- 16 host-city geos: lat/lon/June-UTC/elevation (`const C`).

Estimated / proxy (NOT data-derived — flagged in-app):

- `wb` (WBGT heat proxy) per city: hand-set seasonal estimates.
- `FIFA_RANK`: Apr-2026 snapshot; top-20 + Canada are published, the rest are approximate (labelled "≈", used only for the sort).
- Model coefficients and reference scales (see §3): reasoned defaults, not fitted.

---

## 3. The burden model

Per team, five raw factors (all `max(0, .)`), rescaled by fixed reference constants, then weight-blended:

- **Jet-lag** `J(Δz)·max(0, 1 − B/(κ|Δz|))`, `Δz` = shortest-direction tz shift home->camp, `J` = `|Δz|·(αE if east else αW)`, `B` = arrival-lead days. Defaults αE 1.0, αW 0.6, κ 1.0.
- **Travel** `Σ 2·dist(camp,venue)·(1+δ·e^(−rest/τ))/1000` (haversine, round trip per match, recency-weighted). δ 0.5, τ 2.0.
- **Heat** `Σ max(0, WBGT_city − θ)`, θ 28.
- **Altitude** `Σ [β_exp·max(0,(h−h0)/100) + β_tr·|h − h_camp|/100]`, h0 1500, β_exp 1.0, β_tr 0.5. (exposure + camp↔venue swing.)
- **Congestion** `Σ max(0, g_min − gap)`, g_min 4.

Composite `= 100·Σ wᵢ·(factorᵢ/refᵢ)`, weights default `{jet .30, travel .30, heat .15, alt .15, cong .10}` (auto-normalised), refs `{jet 12, travel 25, heat 12, alt 25, cong 6}` (fixed, so factors stay comparable). Arrival lead default 7 days; global + per-team override.

---

## 4. The optimization layer ("Optimized" toggle)

Key structural fact that makes it tractable: with base camp and match dates **fixed**, jet-lag and congestion are **constant** w.r.t. venue choice, and travel/heat/altitude are **additively separable per match**. So burden is **linear in the assignment** and minimax is an exact MILP.

- Decision: `x[m,c] ∈ {0,1}` (match m in city c). Constraints: one city per match; **≤1 match per stadium per day** (couples the 12 groups); host nations stay in-country (`A(m)`).
- Exact reference (container `milp.py`, PuLP/CBC): minimax solved exactly. Worst-team 27.61 -> 20.70, gap 26.31 -> 20.70, 49/72 matches relocated. Baked as `MILP_OPT` / `MILP_AUDIT` for reference.
- In-app: a **constrained local search** (single-move + same-day swap, warm-started from the real schedule, ≤40 passes). Verified to reach the **exact CBC optimum** for minimax at default weights (0.00% gap).
- **Selectable objectives**, grouped in the UI:
  - Equity: **Minimax** (lower the max), **Gap** (max−min), **Gini** (relative inequality).
  - Both: **Balanced** (normalised blend of Gap + Gini; 1.00 = actual draw).
  - Efficiency: **Total** (sum of burden; not fairness).
- Verified per-objective behaviour (default weights): minimax max 20.7; gap 10.9; gini 0.046; balanced gap 9.1 & gini 0.041 (dominates both); total 380.
- Note: only minimax is certified optimal (matches CBC); the others are near-optimal heuristics (the Gap objective carries a small Gini smoother to escape flat plateaus). Hence the toggle is named "Optimized", not "Optimal".

---

## 5. Code map

Module-level (top -> bottom):

- Data: `C` (cities), `BASES`, `TEAMS`, `FIFA_RANK`, `STAGE`, `FIXTURES`, `MILP_OPT`, `MILP_AUDIT`; derived `US/MX/CA_CITIES`, `ALL_HOSTS`, `allowedCities`, `TEAM_MATCHES`, `ACTUAL_CITY`, `MATCH_DAYS`, `REF`, `METRICS`.
- Geometry/model: `haversine`, `bearing`, `effShift`, `DEFAULT_H/W`, `rawMetrics`, `scaled`, `composite`, `gini`.
- Optimizer: `burdensFor`, `costTable` (per-team·slot·city cost + venue-independent constant), `objScore`, `optimizeAssignment` (the local search).
- Component `WorldCup2026TravelBurdenLab`: state (H, W, lead, mode, objective, fontTheme, tab, sortMode, statMode, sel, drawerOpen, baseOv, leadOv); memos `actualBurdens`, `optCity` (fair only), `rows`, `actualRank`, `displayed`, `groups`; derived gap/Gini/mean/var/sd; `OBJ_META`; renderer `barFor`.
- Sub-components: `StatCard`, `Group`, `Slider`, `Tab`, `HowItWorks`, `Factor`, `Formulae`, `Eq`, `JourneyMap` (with `embedded` mode), `Detail` (drawer, embeds JourneyMap), `Node`, `Edge`. Styles: one `CSS` template string.

Data flow: `FIXTURES` -> `ACTUAL_CITY`/`TEAM_MATCHES` -> (mode=fair? `optimizeAssignment` : actual) -> per-team venues/dates -> `rawMetrics` -> `composite` -> sorted `rows` -> bars/map/drawer. Dates are fixed across modes; only cities change.

---

## 6. Features shipped (v1)

- Five-factor tunable model; live weights + 10 coefficient sliders; per-team base-camp and arrival-lead overrides.
- Real 72-fixture schedule; real groups, nations, camps, geos.
- Rankings: stacked-segment burden bars; sorts **Burden / By group / A-Z / FIFA rank**; group view with intra-group gap; summary row (total + selectable mean ± SD/variance/range).
- "Optimized" mode: constrained reassignment with selectable objective (Minimax/Gap/Gini/Balanced/Total), grouped + described; live readout (metric before -> after, % lower); per-team Actual->Optimized rank-change badge (▲/▼) in flat and group views.
- Journey map: real basemap, footprint markers with role rings, venue match labels `City (G1, G2)`, off-map origin shown as an outward arrow on a dashed leg, leg-draw animation replays on team change.
- Detail drawer: itinerary timeline with camp↔venue distance + elevation swing, hand-drawn radar, what-if base/lead controls, group-rival edges, **embedded journey map**.
- How-it-works (plain language) and Formulae tab (equations, symbol glossary, full MILP formulation + audit numbers + the Gini-vs-minimax note).
- Typeface switcher (Editorial / Modern / Geist) via CSS-variable theming.
- Companion `milp.py`: fixture integrity checks, exact CBC minimax, greedy-vs-MILP validation, JS data emit.

---

## 7. Loopholes & limitations

### 7a. Modeling / problem (logical)

- Illustrative, not validated against real fatigue/performance data; coefficients are reasoned, not fitted. Reference scales set implicit factor importance and are arbitrary; changing them reorders teams.
- Travel assumes a round trip camp->venue->camp for every match; real teams sometimes stay near a venue or shift camp. Overstates travel for clustered venues.
- Heat is a static per-city proxy: ignores match date, **kickoff time**, humidity, and **closed-roof/AC stadiums** (several hosts). (Item 3.)
- Jet-lag captures only the one-time home->camp shift; intra-US time-zone changes to venues are ignored (base fixed). Linear acclimation, no per-day dynamics.
- Altitude treats each camp↔venue hop as instantaneous exposure + a round-trip swing; no acclimatisation time course.
- The optimizer holds **dates and camps fixed** -> it can only move travel/heat/altitude, never jet-lag or congestion. A fuller fairness redesign would also re-time matchdays and relocate camps.
- "FIFA is unfair by X" is **model-relative** (baseline gap/Gini use this model).
- Constraint set is looser than FIFA's real one (no stadium capacity, turf, broadcast windows, regional clustering, opening-ceremony pins). So the optimizer's gains are an **upper bound** on achievable fairness, not an operational schedule.
- Competitive fairness (opponent strength / strength-of-schedule) is out of scope; physical burden only.
- Group stage only; FIFA-rank sort is approximate below the top 20.

### 7b. Code / engineering

- **Heuristic optimizer**: only minimax is certified optimal (= CBC) and only at default weights; Gap/Gini/Balanced/Total are local optima and can vary with neighborhood/seed. No global guarantee.
- **Performance**: the optimizer runs in a `useMemo` while in Optimized mode; Gini/Gap/Balanced sort all 48 burdens per candidate move (~10^6 ops/run). `wN` is now memoized (v1 fix) so it only re-runs on real input changes, but a heavy objective + fast slider dragging can still drop frames. Next: debounce / `useDeferredValue` / run on pointer-up / Web Worker; incremental max·min·Gini instead of full rescans.
- `rawMetrics` **hardcodes exactly 3 matches** (`dates[1]`, `dates[2]`, `m<3`). Any non-3-match team (knockouts, byes) breaks silently. Generalise before adding stages.
- Hand-entered data (`C`, `BASES`, `wb`, `FIFA_RANK`) has no runtime schema validation in the app (only `milp.py` validates fixtures). Add a dev assert pass.
- Edge: all weights = 0 -> all burdens 0 -> readout "% lower" can show 100% (cosmetic only).
- Dead code to delete: `MILP_OPT` (baked CBC solution, currently unused by the UI — keep as a reference or remove), the unused `onShowMap` prop on `Detail`, the unused `.dmapbtn` CSS rule.
- Fonts Geist/Geist Mono load from Google Fonts with graceful fallback; nothing bundled offline.
- Single ~1.56k-line file; CSS is one string. Fine as an artifact, not for a growing codebase.
- No automated tests in the app; `milp.py` is the only validation harness. No a11y audit (SVG-only map, color-coded factors, keyboard focus).
- State is not persisted (artifact restriction).

---

## 8. Roadmap (parked + next)

- **Item 3** — real WBGT per venue/date at local kickoff (NOAA/ERA5), with roof/AC adjustment.
- **Item 4** — per-matchday opponent edge: cumulative burden-to-date before each actual opponent (pairings already in `FIXTURES`).
- **Item 5** — knockout extension: expected burden over the bracket weighted by advancement probability; post-group base relocation. (Requires removing the 3-match assumption.)
- Calibrate coefficients to sports-science literature; sensitivity / rank-stability analysis (weight perturbation, Monte Carlo on coefficient priors).
- Exact solver for all objectives (server-side, or GLPK/HiGHS via WASM) instead of the heuristic.
- Richer constraints (stadium capacity, turf, broadcast windows) to tighten the counterfactual toward an operational schedule.
- Also optimise over base camps and/or matchday dates (larger MILP) for a full fairness redesign.
- Pareto front across objectives (show the equity-efficiency tradeoff curve) instead of one Balanced blend.
- Programmatic data pipeline (fixtures, geos, WBGT, rankings) with schema validation; CI on `milp.py`.

---

## 9. Claude Code handoff

Suggested structure:

- `src/data/` — cities, camps, teams, fixtures, rankings (typed; generated/validated, not hand-typed).
- `src/model/` — `rawMetrics`, `composite`, `gini` (single typed source shared by app + a TS port of `milp.py`).
- `src/optimize/` — `costTable`, objectives, local search; plus a solver adapter (WASM HiGHS) for exact runs.
- `src/ui/` — components split out; move the CSS string to CSS modules / Tailwind.
- `tools/milp.py` — keep as source-of-truth validator; wire into CI to assert the heuristic stays within tolerance of the exact optimum.
- Tests: port the `milp.py` checks (fixture integrity, exact minimax, greedy-vs-MILP gap) to unit tests; add property tests (all factors ≥ 0, weights normalise, burden monotone in coefficients).

First things to do in Claude Code: (1) generalise `rawMetrics` off the 3-match assumption, (2) move the optimizer to a Web Worker + debounce, (3) add the data-validation pass, (4) delete the dead code listed in §7b.
