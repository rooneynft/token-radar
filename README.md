# Token Radar — the pre-token board, priced and tested

A token launch radar: every protocol that records no token and passes the
launch rule, ranked by expected value — the value if a token launches, times
the odds one ever does. Snapshot 2026-11-14, 758 protocols, 40 on the
watchlist, **198 rows ranked** (40 watchlist + 138 early finds below the
$50M floor + 20 off-list at or above the floor).

## The model, in one paragraph

The launch value is a power law fitted on the 119 tokened comparables with a
known market cap: log10(market cap) = **3.3823 + 0.4721 × log10(TVL)**,
plus each category's median residual, shrunk toward zero (k = 20, clamped to
±0.3 dex). Only the category offset survives both blind tests — growth, age,
chain count, the crash guard and all five together were tested and dropped.
The token odds come from a no-token clock fitted on the 645 dated protocols:
a share **π = 0.08 never launches**, the rest launch with a daily hazard of
**0.004 for the first 90 days, then 0.0008** — tokens arrive fast early and
the hazard then drops fivefold, so a survivor's ever-launch odds run 0.89 at
90 days, 0.78 at 3 years, 0.64 at 2,000 days. Round 6's constant hazard
under-predicted the youngest bucket (10% predicted vs 26% actual under six
months); the two-phase clock beats it on both blind tests (walk-forward Brier
0.238 vs 0.242 at the same 64.4% accuracy, five-fold 0.224 vs 0.225) and cuts
the worst calibration gap nearly in half (0.09 vs 0.16). π is floored at 0.08:
the snapshot barely identifies it (full loglik within 1.5 across π 0–0.14),
and at π = 0 the ever-launch odds would be identically 1. Expected value =
launch value × odds. Every
row carries its P25–P75 range (×0.43–×5.11 around the point estimate, stated
50%, verified: 49% of held-out caps leave-one-out and 50% walk-forward fall
inside it).

## How it is tested

Two blind tests before the model prices a single row, on the same sets the
flat global median is tested on:

| Test | Kept model | Flat median |
| --- | --- | --- |
| Held-out (even slugs fit, odd slugs predicted, n=59) | Spearman 0.342, log R² +0.045, MAPE 87.2%, within 2× 32.2%, typical miss ×3.57 | Spearman 0.357, log R² −0.205, MAPE 91.7%, within 2× 27.1%, typical miss ×5.14 |
| Walk-forward (listed before the median date fit, after it predicted, n=59) | Spearman 0.370, log R² +0.051, MAPE 78.3%, within 2× 45.5%, typical miss ×2.73 | Spearman 0.369, log R² −0.182, MAPE 84.1%, within 2× 27.1%, typical miss ×4.96 |

The kept model wins on value in both tests — log R² +0.05 against the flat
ratio's −0.2, typical miss ×2.73 against ×4.96 walk-forward — and gives back
a hair on rank held-out (0.342 vs 0.357): the sector offset buys value at
the cost of a little rank. The odds, tested as a classifier of which peers
record a token: Brier **0.238 vs 0.321 base** walk-forward (64.4% called
right vs 35.6%), 0.224 vs 0.250 five-fold (64.5% vs 50.7%). One honest miss
remains: the clock still under-predicts the youngest bucket (22% predicted vs
26% actual under six months) — tokens still arrive faster in the first months
than even the two-phase hazard allows, though the gap is about a quarter of
what the constant hazard left, and the dashboard shows that calibration table.

Term selection, leave-one-out / walk-forward typical miss — a term is kept
only if it lowers the miss in both:

| Term | LOO | Walk-forward | Kept? |
| --- | --- | --- | --- |
| Power law alone (core) | ×3.36 | ×2.81 | baseline |
| + category offset | ×3.35 | ×2.73 | **kept** |
| + 7-day growth | ×3.46 | ×2.90 | tested, not kept |
| + maturity / age | ×3.35 | ×3.20 | tested, not kept |
| + chain count | ×3.44 | ×2.73 | tested, not kept |
| + crash guard | ×3.36 | ×2.81 | tested, not kept |
| + all five | ×3.56 | ×2.96 | tested, not kept |

Growth and age fall to price a token once launched, so the launch value
leaves them out; age enters through the odds instead, where the listing
record is what it predicts.

## The farm decision

Each row gets a netted farm plan: plan size 0.02% of TVL capped at $25,000,
a 10% farmer drop share, a 12-week horizon, gas of about $35, and a 2%-a-year
capital charge. The expected drop is the expected value × drop share × the
farm's share of counted dollar-days (capital × hold days over TVL × days
listed). Verdict: **Farm** if net/hour beats $25, **Marginal** if net is
positive, else **Skip**. Under the default scenario: **15 Farm, 34 Marginal,
149 Skip** of 198. The top rows by value are Skip at retail size — the
capital charge dominates on giants — while the Farm rows are small young
protocols. The dashboard has sliders (plan size, drop share, horizon) that
recompute every verdict and plan live; `board.json` carries the default
scenario's steps.

## The ledger

All 758 snapshot protocols sit in exactly one group: ranked watchlist 40,
ranked early 138, ranked off-list 20, token trades priced comp 119, token
recorded no usable cap 297, out — exchange 42, out — liquid staking 43,
out — bridge 43, out — versioned or wrapped 16. The dashboard recomputes
the board from `board.json` at render time and checks it: 198 of 198 rows,
ranks 1–198 in order, values never rising, totals equal ($1.79B expected
value), watchlist 40 of 40, ledger 758 of 758.

## Top of the board

1. Sentora Curator — $65.1M expected ($75.6M if it launches, odds 86%), Skip at retail size (net −$138, −$50.14/h)
2. Steakhouse Financial — $64.1M, Skip
3. Gauntlet — $49.2M, Skip
4. Veda — $39.2M, Skip
5. USDD — $35.9M, Skip

## Run it

```
MAKEFUN_OUTPUT_DIR=out node main.ts --input ./snapshot.json
```

Node 22, standard library only, no network. Reads `/input/snapshot.json`
(or the `--input` path), writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory. The program
runs twice and writes identical bytes. Screenshots:
`node scripts/screenshot.mjs` (Playwright + Chromium), then re-run `main.ts`
so `out/` picks them up.

## What this does not claim

Token pricing is noisy — a protocol's market cap can sit an order of
magnitude from what its TVL suggests, and the typical miss is ×3.6
held-out. The board shows its error bars on every row instead of pretending
its values are precise. The implied value is this entry's own claim.
