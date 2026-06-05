# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A growing **set of interactive experiments around football (soccer)**. Experiment #1 — and currently the only one — is **Fair Fixtures: the WC2026 Travel Burden Lab**, a React app that scores how physically punishing each of the 48 teams' 2026 World Cup group-stage draw is, audits whether the real FIFA schedule is fair, and computes a constrained MILP counterfactual that re-slots the 72 matches across the 16 host cities. Expect future experiments to be added alongside it; keep new work modular rather than entangling it with the WC2026 lab.

## Commands

```bash
npm install                 # install JS deps (react, lucide-react, vite)
npm run dev                 # Vite dev server (the lab)
npm run build               # production build to dist/
npm run preview             # serve the built bundle

# Python validator / reference solver (needs the .venv)
.venv/bin/python tools/milp.py     # fixture integrity checks + exact CBC minimax + greedy-vs-MILP gap
```

There is **no test runner and no linter configured**. `tools/milp.py` is the only validation harness — treat it as the source-of-truth check on the data and the optimizer. If you touch the model, fixtures, or optimizer, run it and confirm the printed numbers still match the README's headline result (worst team 27.6 → 20.7, gap 26.3 → 20.7, 49/72 relocated).

## Architecture

**Everything in the lab lives in one ~1.5k-line file: `src/wc2026_travel_burden_lab.jsx`.** It is self-contained — module-level data constants, the model math, the optimizer, the React component tree, and a single `CSS` template string. `src/main.jsx` and `index.html` are just the Vite mount. This single-file shape is inherited from the app's origin as a Claude artifact; the documented intent (see "Roadmap / handoff" below) is to split it into `src/data/`, `src/model/`, `src/optimize/`, `src/ui/`.

The pieces, top to bottom in the file:

- **Data constants** — `C` (16 host-city geos: lat/lon/UTC/elevation/WBGT proxy), `BASES`, `TEAMS`, `FIFA_RANK`, `FIXTURES` (the 72 real group-stage matches as `[day, group, home, away, cityKey]`), and baked reference solutions `MILP_OPT` / `MILP_AUDIT`. Derived: `ACTUAL_CITY`, `TEAM_MATCHES`, `MATCH_DAYS`, `allowedCities`, `REF`, `METRICS`.
- **Model** — `haversine`, `effShift`, `rawMetrics` (the five fatigue factors: jet-lag, travel, heat, altitude, congestion), `scaled`, `composite`, `gini`. Coefficients live in `DEFAULT_H`; weights in `DEFAULT_W`; reference scales in `REF`. All are live-tunable in the UI.
- **Optimizer** — `costTable`, `objScore`, `optimizeAssignment`. A constrained local search (single-move + same-day swap, warm-started from the real draw). The key structural fact: with base camps and match dates **fixed**, burden is linear in the venue assignment, so minimax is an exact MILP. The in-app heuristic reaches the exact CBC optimum **for minimax at default weights only**; Gap/Gini/Balanced/Total are near-optimal heuristics (hence the toggle is "Optimized", not "Optimal").
- **Component `WorldCup2026TravelBurdenLab`** (default export) and its sub-components (`StatCard`, `Group`, `JourneyMap`, `Detail` drawer, `Formulae`, etc.).

**Data flow:** `FIXTURES` → `ACTUAL_CITY`/`TEAM_MATCHES` → (Optimized mode? `optimizeAssignment` : actual cities) → per-team venues/dates → `rawMetrics` → `composite` → sorted rows → bars/map/drawer. Dates never change across modes; only city assignments do.

### `tools/milp.py` ↔ the app

`milp.py` **reads `src/wc2026_travel_burden_lab.jsx` directly with regex** to extract `C`, `BASES`, `TEAMS`, and `FIXTURES`, then mirrors the model defaults (`H`, `W`, `REF`, `LEAD`) as Python literals. **These defaults are duplicated, not shared** — if you change a coefficient, weight, reference scale, or the fixture/city data in the `.jsx`, you must mirror it in `milp.py` or the validator will silently check a different model. The script also emits `tools/fixtures.js` (a generated, gitignored extract of `FIXTURES` + the CBC solution) — do not hand-edit that file.

## Gotchas

- **`rawMetrics` hardcodes exactly 3 matches per team** (`dates[1]`, `dates[2]`, `m<3`). Any non-3-match team (knockouts, byes) breaks silently. Generalise this before extending past the group stage.
- **Hand-entered data has no runtime validation in the app** — only `milp.py` checks fixture integrity. Don't trust edits to `C`/`BASES`/`FIFA_RANK`/`wb` until milp.py passes.
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