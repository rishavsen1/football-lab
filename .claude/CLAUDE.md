# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A growing **set of interactive experiments around football (soccer)**. Experiment #1 — and currently the only one — is **Fair Fixtures: the WC2026 Travel Burden Lab**, a React app that scores how physically punishing each of the 48 teams' 2026 World Cup group-stage draw is, audits whether the real FIFA schedule is fair, and computes a constrained MILP counterfactual that re-slots the 72 matches across the 16 host cities. Expect future experiments to be added alongside it; keep new work modular rather than entangling it with the WC2026 lab.

## Commands

```bash
npm install                 # install JS deps (react, react-dom, react-router-dom, lucide-react, vite)
npm run dev                 # Vite dev server (BASE_PATH=/ to serve at root locally)
npm run build               # production build to dist/ (base path /football-lab/ for GitHub Pages)
npm run preview             # serve the built bundle
npm run gen:data            # emit tools/wc2026.data.json from src/data + src/model (run after data/model edits)
npm run og                  # generate per-team social-preview PNGs to public/og/ (needs @resvg/resvg-js)
npm run build:site          # full public build: og PNGs -> vite build -> per-team OG html in dist/t/ (set SITE_URL for absolute OG urls)

# Python validator / reference solver (needs the .venv)
.venv/bin/python tools/milp.py     # fixture integrity checks + exact CBC minimax + greedy-vs-MILP gap
```

There is **no JS test runner and no linter configured** (yet). `tools/milp.py` is the validation harness — treat it as the source-of-truth check on the data and the optimizer. If you touch the model, fixtures, or optimizer, run **`npm run gen:data && .venv/bin/python tools/milp.py`** and confirm the printed numbers still match the README's headline result (worst team 27.6 → 20.7, gap 26.3 → 20.7, 49/72 relocated).

## Architecture

**The app is a HashRouter SPA** mounted by `src/main.jsx` → `src/App.jsx`: route `/` = the multi-experiment hub (`src/Hub.jsx`), route `/wc2026` = the lab (`src/wc2026_travel_burden_lab.jsx`). HashRouter is deliberate — it makes client deep-links resolve on GitHub Pages with no server rewrites.

Data and model have been **extracted out of the lab into shared, pure-JS modules** (no React/icon deps) so the browser app, the Node scripts, and the Python validator all consume one source of truth:

- **`src/data/wc2026.js`** — `C` (16 host-city geos + home origins + base camps), `BASES`, `TEAMS`, `FIFA_RANK`, `FIXTURES` (`[day, group, home, away, cityKey]`), baked `MILP_OPT`/`MILP_AUDIT`, host-city lists, `allowedCities`, and derived `TEAM_MATCHES`/`ACTUAL_CITY`/`MATCH_DAYS`.
- **`src/model/burden.js`** — geometry (`haversine`, `bearing`, `effShift`), the five-factor model (`rawMetrics`/`scaled`/`composite`/`gini`), and the optimizer (`costTable`/`objScore`/`optimizeAssignment`). Coefficient defaults `DEFAULT_H`, weights `DEFAULT_W`, reference scales `REF`, default arrival-lead `LEAD` all live here.

The **lab `.jsx`** still holds the React component tree, the `METRICS` icon/color table (depends on lucide), and the single `CSS` template string. It imports everything else from the two modules. Lab state (mode, objective, weights `W`, coefficients `H`, lead, per-team `baseOv`/`leadOv`, selected team, tab, sort) is serialized to the URL query string via `src/lib/urlState.js` + `useSearchParams` — only non-defaults are written, and a cold load hydrates from the link. `copyLink` (hero + drawer) copies the current deep link.

Public-launch surface (milestone 1): tabs are Rankings / Journey map / **Stability** (`Sensitivity` Monte-Carlo rank-range panel) / How it works / Formulae. Friendliness: hero "Find your team" picker (`TeamPicker`), one-line `takeawayFor` takeaways, console quick-`PRESETS` + an "Advanced" disclosure hiding the 10 coefficient sliders, confederation filter chips, jargon `Term` tooltips. Shareability: a "verdict" banner, client-side PNG share card + build-time per-team OG cards (both via `src/lib/shareCard.js` `buildCardSVG`; `scripts/og.mjs` rasterizes with resvg, `scripts/prerender-og.mjs` writes `dist/t/<slug>/` OG pages). Credibility: provenance badges + caveats (How-it-works), CSV/JSON export (Rankings). Mobile/a11y: console collapses on small screens, drawer becomes a bottom sheet, `role="dialog"`/Esc/focus on the drawer, aria-labels on bars + map, `prefers-reduced-motion`. Deferred to later phases: Web Worker for the optimizer, generalising the 3-match assumption (knockouts), real WBGT, tests/CI, experiment #2.

- **Optimizer** — constrained local search (single-move + same-day swap, warm-started from the real draw). Key structural fact: with base camps and match dates **fixed**, burden is linear in the venue assignment, so minimax is an exact MILP. The in-app heuristic reaches the exact CBC optimum **for minimax at default weights only**; Gap/Gini/Balanced/Total are near-optimal heuristics (hence the toggle is "Optimized", not "Optimal").

**Data flow:** `FIXTURES` → `ACTUAL_CITY`/`TEAM_MATCHES` → (Optimized mode? `optimizeAssignment` : actual cities) → per-team venues/dates → `rawMetrics` → `composite` → sorted rows → bars/map/drawer. Dates never change across modes; only city assignments do.

### `tools/milp.py` ↔ the app — now a single source of truth

`scripts/gen-data.mjs` (run via `npm run gen:data`) imports `src/data/wc2026.js` + `src/model/burden.js` and writes **`tools/wc2026.data.json`** (data + model defaults). `milp.py` loads that JSON — it no longer regex-scrapes the JSX or hardcodes `H`/`W`/`REF`/`LEAD`/fixtures. So **changing a coefficient/weight/fixture in the JS modules and re-running `gen:data` automatically flows to the validator** (the old duplicated-defaults drift is gone). `milp.py` still re-implements the math independently in Python (that's the cross-check) and still emits `tools/fixtures.js` (gitignored) to regenerate the baked `MILP_OPT`/`MILP_AUDIT`.

## Gotchas

- **`rawMetrics` (in `src/model/burden.js`) hardcodes exactly 3 matches per team** (`dates[1]`, `dates[2]`, `m<3`). Any non-3-match team (knockouts, byes) breaks silently. Generalise this before extending past the group stage.
- **Hand-entered data has no runtime validation in the app** — only `milp.py` checks fixture integrity. Don't trust edits to `C`/`BASES`/`FIFA_RANK`/`wb` until `npm run gen:data && python tools/milp.py` passes.
- After editing `src/data/wc2026.js` or `src/model/burden.js`, **run `npm run gen:data`** or the validator keeps checking the previous JSON snapshot.
- The optimizer runs inside a `useMemo` in Optimized mode and rescans all 48 burdens per candidate move. Heavy objectives + fast slider dragging can drop frames; debounce/Web-Worker is on the roadmap.
- The model is an **illustrative, tunable heuristic** — coefficients are reasoned, not fitted to fatigue data. "FIFA is unfair by X" is model-relative. Keep this framing in any user-facing copy.

## Reference docs

- `README.md` — model formulae, MILP formulation, headline results, data provenance, limitations.
- `.claude/v1_review.md` (and `docs/REVIEW_v1.md`) — the full v1 spec, code map, loophole audit, and roadmap. Read this before any substantial change to the lab. The roadmap's first priorities: generalise `rawMetrics` off the 3-match assumption, move the optimizer to a Web Worker + debounce, add a data-validation pass, and delete the dead code it lists (`MILP_OPT`, the unused `onShowMap` prop, the `.dmapbtn` CSS rule).


## vexp - Context-Aware AI Coding <!-- vexp v2.0.25 -->

### MANDATORY: use vexp pipeline - do NOT grep or glob the codebase
For every task - bug fixes, features, refactors, debugging:
**call `run_pipeline` FIRST**. It executes context search + impact analysis +
memory recall in a single call, returning compressed results.

Do NOT use grep, glob, Bash, or cat to search/explore the codebase.
vexp returns pre-indexed, graph-ranked context that is more relevant and
uses fewer tokens than manual searching. Prefer `get_skeleton` over Read to
inspect files (detail: minimal/standard/detailed, 70-90% token savings).
Only use Read when you need exact raw content to edit a specific line.

### Primary Tool
- `run_pipeline` - **USE THIS FOR EVERYTHING**. Single call that runs
  capsule + impact + memory server-side. Returns compressed results.
  Auto-detects intent (debug/modify/refactor/explore) from your task.
  Includes full file content for pivots.
  Examples:
  - `run_pipeline({ "task": "fix JWT validation bug" })` - auto-detect
  - `run_pipeline({ "task": "refactor db layer", "preset": "refactor" })` - explicit
  - `run_pipeline({ "task": "add auth", "observation": "using JWT" })` - save insight in same call

### Other MCP tools (use only when run_pipeline is insufficient)
- `get_skeleton` - **preferred over Read** for inspecting files (minimal/standard/detailed detail levels, 70-90% token savings)
- `index_status` - indexing status and health check
- `expand_vexp_ref` - expand V-REF hash placeholders in v2 compact output

### Workflow
1. `run_pipeline("your task")` - ALWAYS FIRST. Returns pivots + impact + memories in 1 call
2. Need more detail on a file? Use `get_skeleton({ files: [...], detail: "detailed" })` - avoid Read unless editing
3. Make targeted changes based on the context returned
4. `run_pipeline` again ONLY if you need more context during implementation
5. Do NOT chain multiple vexp calls - one `run_pipeline` replaces capsule + impact + memory + observation

### Subagent / Explore / Plan mode
- Subagents CAN and MUST call `run_pipeline` - always include the task description
- The PreToolUse hook blocks Grep/Glob when vexp daemon is running
- Do NOT spawn Agent(Explore) to freely search - call `run_pipeline` first,
  then pass the returned context into the agent prompt if needed
- Always: `run_pipeline` -> get context -> spawn agent with context

### Smart Features (automatic - no action needed)
- **Intent Detection**: auto-detects from your task keywords. "fix bug" -> Debug, "refactor" -> blast-radius, "add" -> Modify
- **Hybrid Search**: keyword + semantic + graph centrality ranking
- **Session Memory**: auto-captures observations; memories auto-surfaced in results
- **LSP Bridge**: VS Code captures type-resolved call edges
- **Change Coupling**: co-changed files included as related context

### Advanced Parameters
- `preset: "debug"` - forces debug mode (capsule+tests+impact+memory)
- `preset: "refactor"` - deep impact analysis (depth 5)
- `max_tokens: 12000` - increase total budget for complex tasks
- `include_tests: true` - include test files in results
- `include_file_content: false` - omit full file content (lighter response)

### Multi-Repo Workspaces
`run_pipeline` auto-queries all indexed repos. Use `repos: ["alias"]` to scope.
Use `index_status` to discover available repo aliases.
<!-- /vexp -->