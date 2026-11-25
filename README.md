# Token Radar — round 4

A pre-token radar: protocols that record no token, ranked by what their token would
be worth if their record stayed as it is — priced off a power law fitted on the
tokened comparables, and tested held-out and walk-forward before it prices a
single row.

## What changed since round 3

Round 3 priced protocols with a ratio model: the category median mcap/TVL, shrunk
toward the global median. Tested on the snapshot's tokened protocols, that model
did not beat a flat global median at all — and it ran 10.45× hot in the top
calibration quintile. This round replaces the ratio with a fitted power law and
shows the validation that proves it, in the dashboard itself:

- **Power law.** log10(market cap) = 3.3823 + 0.4721 × log10(TVL), fitted by least
  squares on the 119 tokened comparables. Market cap scales sublinearly with TVL:
  a protocol ten times bigger in TVL is worth about three times more, not ten.
- **Category offsets.** Each category's median residual from the power law, shrunk
  toward zero (k = 20) and clamped to ±0.3 dex — the sector's judgement, kept in
  proportion.
- **The old terms stay.** Growth (1 + clamped 7-day change × 0.5), maturity
  (0.6–1.0 by age), breadth (+2% per chain, up to four) and the crash guard (×0.9
  at −25% 7-day or worse) are still there, on top of the power-law base.
- **A 90% range on every row.** The held-out log-errors give a ×0.14–×23.0 range
  and a typical miss of ×3.7. Token pricing is noisy; the board shows the range
  under every value instead of hiding it.

## Validation (held-out: even slugs fit, odd slugs predicted; walk-forward: listed
before the median listing date fit, after it predicted)

| Test | Spearman | log R² | MAPE | Within 2× | Flat MAPE |
| --- | --- | --- | --- | --- | --- |
| Held-out, power-law core | 0.357 | +0.044 | 86.5% | 32.2% | 88.0% |
| Held-out, full model | 0.392 | +0.056 | 90.6% | 25.4% | 88.0% |
| Walk-forward, power-law core | 0.375 | +0.054 | 79.3% | 45.5% | 86.5% |
| Walk-forward, full model | 0.303 | −0.028 | 74.1% | 29.5% | 86.5% |

The flat global median is the baseline on the same test sets: its log R² is
−0.20 held-out and −0.25 walk-forward — it predicts worse than the mean, and the
power law beats it on value in every test. The full model wins on held-out rank
(+3.5pp Spearman vs flat) and on walk-forward value (MAPE 74.1% vs 86.5%), while
it trails flat on walk-forward rank (−7.2pp) — both numbers are shown in the
dashboard, not just the flattering one. The dashboard's Validation tab carries
all four test tables, the model comparison, the calibration quintiles and the
method in full.

## The board

226 rows: every pre-token protocol with a listed date and at least $50M of TVL,
plus 46 early finds below the floor (under $50M). Steakhouse Financial leads at
$64.4M implied, followed by Gauntlet ($51.5M) and Veda ($40.2M). Total implied
value across the board: $1.60B — down from $5.46B in round 3, because the power
law stops crediting giants with ten times the value for ten times the TVL.

Every row carries a netted 7-step farm plan: the capital tier ($50–$250 by TVL),
the hold tier (30–60 days by age), a weekly action that keeps the address active,
and the gas total netted against the implied value, with the verdict. The board
page re-derives each plan from the row's own record with the same rules as the
board file, so the page and the board never disagree.

## How to run

```sh
# main.ts writes out/board.json, out/data.js, out/dashboard/ and out/dossier.json
# (place the competition's snapshot.json at the repo root; the kit's input/snapshot.json)
cp token-radar-01-kit/input/snapshot.json snapshot.json
node main.ts token-radar-01-kit/input/snapshot.json
# The three screenshots: board, a protocol detail, the Lending filter
NODE_PATH=shots/node_modules node scripts/screenshot.mjs
node main.ts token-radar-01-kit/input/snapshot.json
```

Requires Node.js 22.18+ and a Chromium for the screenshots (Playwright-managed,
or `CHROME_PATH`). The dashboard is a static page: it reads `data.js`, renders
locally, and makes no network requests. The kit check is:

```sh
node token-radar-01-kit/cli/makefun.mjs check --repo . --system-prompt ../SYSTEM_PROMPT.md
```

## Reproducibility

The snapshot is the competition's `input/snapshot.json` (as of 2026-11-14, 758
protocols). Nothing in the model is tuned to a single protocol: the power law,
the category offsets and the validation are all computed from the snapshot at
run time, and the numbers above are what that run produces. Rerun `main.ts` and
you get the same board.
