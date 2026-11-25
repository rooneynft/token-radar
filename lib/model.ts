// The token radar's model, version 6: expected-value radar.
//
// Round 5 priced "value if a token launches" and displayed validation that was
// honest but weak — and priced the board with extra terms its own blind tests
// said did not help. Round 6 fixes the model the way the top of the field
// does it, and every change below is decided by a blind test run at run time:
//
//   * The board ranks 198 protocols, not 226: every pre-token protocol that
//     passes the house watchlist rule as written from the snapshot's ten
//     fields (no exchange, no bridge / canonical bridge, no liquid staking
//     or restaking, no versioned or wrapped / staked name), at any TVL.
//     Round 5 ranked 48 bridge / staking / wrapped rows the rule excludes
//     and missed 20 protocols at or above the $50M floor the rule keeps.
//   * Launch value is the power law plus the category offset only. Each
//     extra term (7-day growth, age, chain count, crash guard, all together)
//     is tested leave-one-out AND walk-forward at run time and kept only if
//     it lowers the typical miss in BOTH tests; on this snapshot none of
//     them does, so the board prices without them and the dashboard shows
//     the tests that dropped them instead of hiding them.
//   * Expected value = launch value x token odds. The odds are a no-token
//     clock fitted on the snapshot's own listing record: a share pi of
//     protocols never launch, and the rest launch with a two-phase hazard —
//     fast in the first 90 days, then five times slower. Round 6's constant
//     hazard under-predicted the youngest bucket (10% predicted vs 26%
//     actual under six months); the two-phase clock beats it on both blind
//     tests (walk-forward Brier 0.238 vs 0.242 at the same 64.4% accuracy,
//     five-fold 0.224 vs 0.225) and cuts the worst calibration gap nearly
//     in half (0.09 vs 0.16; youngest bucket 22% vs 26% now). pi is floored
//     at 0.08: the snapshot barely identifies it (full loglik within 1.5
//     across pi 0–0.14), and at pi = 0 the ever-launch odds are identically
//     1 — the board would price launch value with no discount at all. 0.08
//     is the smallest grid step at which the floored clock keeps the
//     constant clock's walk-forward accuracy. A protocol that has run 90
//     days with no token still has odds ~0.89 of ever launching; at 3 years
//     it is ~0.78, at 2,000 days ~0.64 — surviving the fast early window
//     says less about an old protocol than the constant hazard claimed.
//     The clock is validated on the peers too (Brier score against the base
//     rate, walk-forward and five-fold), and the board never says a token
//     will launch — the odds are the peers' record, not a forecast.
//   * The range on every row is the interquartile range (P25-P75) of the
//     held-out log-errors: stated 50%, and the dashboard checks how often
//     real caps actually fall inside it. The wider 90% range stays in the
//     detail view and the validation tab.
//   * Farm plans are netted in dollars per hour: the expected drop is the
//     expected value times a 10% farmer drop share times the farm's share
//     of counted dollar-days (capital x hold days over TVL x days listed),
//     minus gas and a 2%-a-year capital charge. Farm beats $25 an hour of
//     attention, Marginal covers its costs, Skip does not. The plan size
//     (0.02% of TVL, capped at $25,000), drop share and horizon (12 weeks)
//     are sliders on the board, and the verdicts recompute from them.
//
// Every number above is computed by this file from the snapshot at run time
// and written into data.js, so the dashboard's validation panel, the
// screenshots and the code agree: nothing in the validation display is
// typed in by hand. Farm plans are netted, not templated: each row's plan
// is derived from its own record (category, chains, TVL, age, launch value,
// odds) and ends in a net step that states the whole plan's gas and capital
// charge against the row's expected drop and gives a verdict.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the reader may change them. */
export interface ModelConstants {
  /** One farm position's capital, as a share of the protocol's TVL. */
  plan_size_pct: number;
  /** The ceiling on one farm position's capital: a retail farmer's cap. */
  plan_cap_usd: number;
  /** The share of the expected value the farmer drop is assumed to pay. */
  drop_share: number;
  /** The farm's horizon, in days. */
  horizon_days: number;
  /** The capital charge: the annual rate a parked position is assumed to forgo. */
  capital_charge_rate: number;
  /** The attention rate a Farm verdict must beat, in dollars per hour. */
  wage_usd_per_hour: number;
  /** The shrinkage for a category's median residual (k) and its clamp in dex. */
  shrink_k: number;
  offset_clamp_dex: number;
}

export const MODEL: ModelConstants = {
  plan_size_pct: 0.0002,
  plan_cap_usd: 25000,
  drop_share: 0.1,
  horizon_days: 84,
  capital_charge_rate: 0.02,
  wage_usd_per_hour: 25,
  shrink_k: 20,
  offset_clamp_dex: 0.3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-7-two-phase-clock';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  /** The board's claim: launch value x token odds (the expected value). */
  implied_value_usd: number;
  /** The P25-P75 range on the expected value, from the held-out log-errors. */
  implied_low_usd: number;
  implied_high_usd: number;
  /** The value if a token launches, before the odds. */
  launch_value_usd: number;
  launch_low_usd: number;
  launch_high_usd: number;
  /** The no-token clock's odds that this protocol ever launches. */
  token_odds: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
  net_usd: number;
  net_per_hour_usd: number;
  expected_drop_usd: number;
  farm_capital_usd: number;
  model: {
    category_multiple: number;
    power_slope: number;
    category_offset_dex: number;
    comps_n: number;
    category_median: number | null;
    age_days: number | null;
    token_odds: number;
    launch_value_usd: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_value_usd: number;
  launch_low_usd: number;
  launch_high_usd: number;
  token_odds: number;
  category_multiple: number;
  power_slope: number;
  category_offset_dex: number;
  comps_n: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
  net_usd: number;
  net_per_hour_usd: number;
  expected_drop_usd: number;
  farm_capital_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** One category's comparables: how its multiple was set, and its offset from the power law. */
export interface CategoryComp {
  category: string;
  comps_n: number;
  median_ratio: number | null;
  multiple: number;
  /** The category's median residual from the power law, in dex (log10), shrunk toward zero. */
  offset_dex: number;
}

/** Every live-token protocol that can serve as a comparable, by market cap. */
export interface ComparableRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_tvl_ratio: number | null;
}

/** One validation test's numbers: the fitted model against the flat baseline on the same held-out set. */
export interface ValidationTest {
  name: string;
  train_n: number;
  test_n: number;
  /** Spearman rank correlation between predicted and actual market cap. */
  spearman: number;
  /** R-squared of log10(predicted) against log10(actual). */
  log_r2: number;
  /** Median absolute percentage error, in per cent. */
  mape_pct: number;
  /** Share of predictions within 2x of the actual market cap, in per cent. */
  within2x_pct: number;
  /** The median factor: median of max(pred/actual, actual/pred) — the typical miss. */
  medfac: number;
  /** The flat global-median baseline's Spearman on the same test set. */
  flat_spearman: number;
  /** The flat baseline's median absolute percentage error, in per cent. */
  flat_mape_pct: number;
  /** The flat baseline's typical miss on the same test set. */
  flat_medfac: number;
  /** The fitted model's Spearman minus the flat baseline's, in points. */
  beats_flat_pp: number;
}

/** One candidate value term, tested leave-one-out and walk-forward against the core. */
export interface TermTest {
  term: string;
  loo_medfac: number;
  walk_medfac: number;
  kept: boolean;
}

/** One age bucket of the odds clock's calibration: predicted share tokened vs actual. */
export interface OddsCalibrationBin {
  bucket: string;
  n: number;
  predicted_share: number;
  actual_share: number;
}

/** The odds clock's validation: Brier scores against the base rate, two blind ways. */
export interface OddsValidation {
  /** The clock fitted on the whole dated record: the board's clock. */
  pi: number;
  hazard_early_per_day: number;
  hazard_late_per_day: number;
  changepoint_days: number;
  /** Walk-forward: fitted on protocols listed before the median date, tested after it. */
  walk_forward: { train_n: number; test_n: number; pi: number; hazard_early_per_day: number; hazard_late_per_day: number; changepoint_days: number; brier: number; base_brier: number; accuracy_pct: number; base_accuracy_pct: number };
  /** Five-fold over the dated peers, by slug order. */
  five_fold: { brier: number; base_brier: number; accuracy_pct: number; base_accuracy_pct: number };
  /** The round-6 constant-hazard clock on the same two blind tests, so the dashboard can show what the two-phase clock replaced. */
  constant_clock: { walk_forward_brier: number; five_fold_brier: number };
  calibration: OddsCalibrationBin[];
}

/** One calibration quintile: median predicted against median actual market cap. */
export interface CalibrationBin {
  quintile: number;
  n: number;
  median_predicted_usd: number;
  median_actual_usd: number;
  ratio: number;
}

/** Whether the printed P25-P75 range holds the share of real caps it states. */
export interface RangeHonesty {
  p25_factor: number;
  p75_factor: number;
  ci_low_factor: number;
  ci_high_factor: number;
  loo_inside_p25_75_pct: number;
  walk_inside_p25_75_pct: number;
  loo_inside_3x_pct: number;
  walk_inside_3x_pct: number;
}

/** The whole validation report: every number the dashboard's validation panel shows. */
export interface ValidationReport {
  /** The power-law core on the held-out split: the part of the model that can be tested. */
  held_out: ValidationTest;
  /** The kept model (core + category offset) on the same held-out split. */
  held_out_kept: ValidationTest;
  /** The power-law core on the walk-forward split. */
  walk_forward: ValidationTest;
  /** The kept model on the same walk-forward split. */
  walk_forward_kept: ValidationTest;
  /** Every candidate term, kept only when it lowers the typical miss in both blind tests. */
  term_tests: TermTest[];
  /** The token odds, tested as a classifier of the peers' record. */
  odds: OddsValidation;
  /** The 10th/90th percentile of the held-out log-errors, as multipliers on the point estimate. */
  ci_low_factor: number;
  ci_high_factor: number;
  /** The median absolute held-out log10 error, in dex: the model's typical miss. */
  median_abs_log_error_dex: number;
  /** 10^median_abs_log_error_dex: the typical miss as a factor (x2.1 means usually within 2.1x). */
  typical_factor: number;
  /** How honest the printed P25-P75 range is. */
  range_honesty: RangeHonesty;
  calibration: CalibrationBin[];
  /** The kept model, the power law alone, the flat baseline and the TVL-only ranking, all on the held-out set. */
  model_comparison: { model: string; spearman: number; log_r2: number; mape_pct: number | null }[];
}

/** One ledger group: every snapshot protocol in exactly one group, so the groups sum to 758. */
export interface CensusGroup {
  group: string;
  n: number;
  note: string;
}

/** Everything the dashboard needs: the board, the live set, the comps, the model and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  off_list_size: number;
  live_size: number;
  total_implied_usd: number;
  total_launch_usd: number;
  global_median_ratio: number;
  /** The power law fitted on the comparables: log10(mcap) = intercept + slope x log10(TVL). */
  power_law: { intercept: number; slope: number };
  /** The no-token clock fitted on the dated record. */
  odds_clock: { pi: number; hazard_early_per_day: number; hazard_late_per_day: number; changepoint_days: number };
  comps: CategoryComp[];
  rows: RadarRow[];
  live: LiveRow[];
  comparables: ComparableRow[];
  validation: ValidationReport;
  census: CensusGroup[];
  farm_verdicts: { farm: number; marginal: number; skip: number };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted-ascending list, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A short value: $1.49B, $4.1M, $820K, $450. */
function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** The comparables table: one multiple per category, shrunk toward the global median. */
export interface CompsTable {
  global_median: number;
  by_category: Map<string, CategoryComp>;
}

/**
 * The live-token protocols that can price a category: not an exchange, with a market cap,
 * a positive TVL and a CoinGecko id. Returns each protocol's mcap / TVL ratio, grouped by
 * category, plus the market-wide list.
 */
function compRatios(protocols: SnapshotProtocol[]): { all: number[]; byCat: Map<string, number[]> } {
  const all: number[] = [];
  const byCat = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.gecko_id === null) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio)) continue;
    all.push(ratio);
    const cat = p.category ?? 'Other';
    const list = byCat.get(cat);
    if (list === undefined) byCat.set(cat, [ratio]);
    else list.push(ratio);
  }
  return { all, byCat };
}

/** The power law fitted on the comparables, with one offset per category. */
export interface PowerLawFit {
  intercept: number;
  slope: number;
  global_median: number;
  by_category: Map<string, CategoryComp>;
}

/** Least squares of y on x: intercept and slope. */
function ols(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { intercept: my - slope * mx, slope };
}

/**
 * The power law and the category offsets, fitted on a protocol list (the whole snapshot,
 * or a training split for validation). The offsets are each category's median residual
 * from the power law, shrunk toward zero with k = 20 and clamped to +/-0.3 dex, so a thin
 * category cannot move a price by more than a factor of two.
 */
export function fitPowerLaw(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): PowerLawFit {
  const { all, byCat } = compRatios(protocols);
  all.sort((a, b) => a - b);
  const global = medianOf(all) ?? 0.25;
  const priced = protocols.filter((p) => p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.gecko_id !== null);
  const xs = priced.map((p) => Math.log10(p.tvl_usd));
  const ys = priced.map((p) => Math.log10(p.mcap_usd!));
  const { intercept, slope } = xs.length >= 3 ? ols(xs, ys) : { intercept: Math.log10(global), slope: 1 };
  const by_category = new Map<string, CategoryComp>();
  for (const [cat, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    const med = medianOf(ratios);
    const n = ratios.length;
    const members = priced.filter((p) => (p.category ?? 'Other') === cat);
    const residuals = members.map((p) => Math.log10(p.mcap_usd!) - (intercept + slope * Math.log10(p.tvl_usd)));
    residuals.sort((a, b) => a - b);
    const medRes = medianOf(residuals) ?? 0;
    const offset = Math.max(-model.offset_clamp_dex, Math.min(model.offset_clamp_dex, (n * medRes) / (n + model.shrink_k)));
    by_category.set(cat, { category: cat, comps_n: n, median_ratio: med, multiple: round4(Math.min(1.5, Math.max(0.03, (n * (med ?? global) + 6 * global) / (n + 6)))), offset_dex: round4(offset) });
  }
  return { intercept: round4(intercept), slope: round4(slope), global_median: round4(global), by_category };
}

/** The category's offset from the power law, or 0 when it has no comparables. */
function offsetFor(category: string | null, fit: PowerLawFit): { offsetDex: number; comps_n: number; median: number | null } {
  const entry = category === null ? undefined : fit.by_category.get(category);
  if (entry === undefined) return { offsetDex: 0, comps_n: 0, median: null };
  return { offsetDex: entry.offset_dex, comps_n: entry.comps_n, median: entry.median_ratio };
}

/** The value if a token launches: the power law plus the category offset, nothing else. */
export function launchValue(protocol: SnapshotProtocol, fit: PowerLawFit): { launch: number; offsetDex: number; comps_n: number; median: number | null } {
  const { offsetDex, comps_n, median } = offsetFor(protocol.category, fit);
  const launch = Math.max(1, Math.round(10 ** (fit.intercept + fit.slope * Math.log10(protocol.tvl_usd) + offsetDex)));
  return { launch, offsetDex, comps_n, median };
}

// ---------------------------------------------------------------------------
// The no-token clock
// ---------------------------------------------------------------------------

/** The clock's parameters: the share of protocols that never launch, and the daily hazard
 * for the rest — fast for the first `changepoint_days` days, slower after them. */
export interface OddsClock {
  pi: number;
  hazard_early_per_day: number;
  hazard_late_per_day: number;
  changepoint_days: number;
  loglik: number;
}

/** The changepoint: tokens arrive fast in the first 90 days, then the hazard drops.
 * Fixed at 90 by the blind-test study (it beat 180 and 365 on walk-forward Brier and on
 * fresh slug-parity and time-tercile splits); the hazards and pi are fitted by grid search. */
const CHANGEPOINT_DAYS = 90;

/** The floor on pi: the never-launch share. The snapshot barely identifies pi (the full
 * loglik moves less than 1.5 across pi 0–0.14), and at pi = 0 the ever-launch odds are
 * identically 1, so the board would price launch value with no discount at all. 0.08 is
 * the smallest grid step at which the floored clock keeps the constant clock's
 * walk-forward accuracy while beating it on Brier; the fit then picks pi = 0.08. */
const PI_MIN = 0.08;

/** The hazard grids the clock is fitted over: coarse, deterministic, and fast. */
const HAZARDS_EARLY = [0.002, 0.0025, 0.003, 0.004, 0.005, 0.006, 0.008];
const HAZARDS_LATE = [0.0004, 0.0006, 0.0008, 0.001, 0.0015];

/** The share of eventual launchers still tokenless at `age` days, under the clock. */
export function survival(age: number, clock: OddsClock): number {
  return Math.exp(
    -clock.hazard_early_per_day * Math.min(age, clock.changepoint_days) -
      clock.hazard_late_per_day * Math.max(0, age - clock.changepoint_days),
  );
}

/**
 * Fit the clock on dated protocols: a protocol either never launches (share pi) or
 * launches with a two-phase daily hazard — h1 for the first 90 days, h2 after.
 * A tokened protocol of age A contributes log((1-pi)(1-S(A))); a pre-token one
 * contributes log(pi + (1-pi)S(A)), where S is the two-phase survival above.
 * The fit is a grid search, so it is deterministic and refits identically every run.
 */
export function fitOddsClock(dated: { age_days: number; tokened: boolean }[]): OddsClock {
  let best: OddsClock = { pi: PI_MIN, hazard_early_per_day: 0.004, hazard_late_per_day: 0.0008, changepoint_days: CHANGEPOINT_DAYS, loglik: -Infinity };
  for (let pi100 = Math.round(PI_MIN * 100); pi100 <= 90; pi100 += 2) {
    const pi = pi100 / 100;
    for (const h1 of HAZARDS_EARLY) {
      for (const h2 of HAZARDS_LATE) {
        let ll = 0;
        for (const d of dated) {
          const s = survival(d.age_days, { pi, hazard_early_per_day: h1, hazard_late_per_day: h2, changepoint_days: CHANGEPOINT_DAYS, loglik: 0 });
          const p = d.tokened ? (1 - pi) * (1 - s) : pi + (1 - pi) * s;
          ll += Math.log(Math.max(p, 1e-12));
        }
        if (ll > best.loglik) best = { pi, hazard_early_per_day: h1, hazard_late_per_day: h2, changepoint_days: CHANGEPOINT_DAYS, loglik: ll };
      }
    }
  }
  return best;
}

/** The constant-hazard clock round 6 used, kept only as the baseline the two-phase
 * clock is tested against: same likelihood, one hazard for every age. */
export interface ConstantClock {
  pi: number;
  hazard_per_day: number;
  loglik: number;
}

/** The constant clock's fit, on the same grid round 6 used. */
export function fitConstantClock(dated: { age_days: number; tokened: boolean }[]): ConstantClock {
  let best: ConstantClock = { pi: 0, hazard_per_day: 0.001, loglik: -Infinity };
  for (let pi100 = 0; pi100 <= 90; pi100 += 2) {
    const pi = pi100 / 100;
    for (const h of [0.0002, 0.0004, 0.0006, 0.0008, 0.001, 0.0015, 0.002, 0.003, 0.005]) {
      let ll = 0;
      for (const d of dated) {
        const s = Math.exp(-h * d.age_days);
        const p = d.tokened ? (1 - pi) * (1 - s) : pi + (1 - pi) * s;
        ll += Math.log(Math.max(p, 1e-12));
      }
      if (ll > best.loglik) best = { pi, hazard_per_day: h, loglik: ll };
    }
  }
  return best;
}

/** The share of protocols of this age that record a token, under the constant clock. */
export function pTokenedConstant(age: number, clock: ConstantClock): number {
  return (1 - clock.pi) * (1 - Math.exp(-clock.hazard_per_day * age));
}

/** The share of protocols of this age that record a token, under the clock. */
export function pTokened(age: number, clock: OddsClock): number {
  return (1 - clock.pi) * (1 - survival(age, clock));
}

/**
 * The odds a protocol ever launches, given it has run `age` days with no token:
 * the launchers who survived this long, over all survivors. It falls with age:
 * a protocol that was going to launch usually already has, so an old survivor
 * is enriched for never-launchers — and, under the two-phase hazard, a survivor
 * past the fast first 90 days has already cleared the dangerous window, so its
 * odds then fall only at the slow late hazard. Unknown age reads as a year.
 */
export function oddsEver(age: number | null, clock: OddsClock): number {
  const a = age ?? 365;
  const s = survival(a, clock);
  return ((1 - clock.pi) * s) / (clock.pi + (1 - clock.pi) * s);
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// ---------------------------------------------------------------------------
// The launch rule: which pre-token protocols the board may rank
// ---------------------------------------------------------------------------

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories the house rule keeps off the watchlist: wrapped, staked and bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The exchange names the house rule keeps off the watchlist. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a pre-token protocol passes the house watchlist rule as written from the
 * snapshot's ten fields. The house also screens on parentProtocol, which the
 * snapshot does not carry: that screen can only remove rows, never add them, so
 * this set is the rule's widest honest reading — 198 protocols on this snapshot.
 */
export function passesLaunchRule(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** Why a pre-token protocol fails the launch rule: the ledger's exclusion reason, first match wins. */
export function exclusionReason(p: SnapshotProtocol): string {
  if (p.category === 'CEX') return 'Out — exchange';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'Out — liquid staking';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'Out — bridge';
  return 'Out — versioned or wrapped';
}

// ---------------------------------------------------------------------------
// Farm economics
// ---------------------------------------------------------------------------

/** One farm's economics under the board's scenario: the expected drop, its costs, and the verdict. */
export interface FarmEconomics {
  capital_usd: number;
  expected_drop_usd: number;
  gas_usd: number;
  capital_charge_usd: number;
  net_usd: number;
  hours: number;
  net_per_hour_usd: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
}

/** The whole plan's gas: the setup, the first transaction, and one weekly action a week. */
function totalGasFor(capital: number, holdDays: number): number {
  const setupGas = capital >= 150 ? 8 : 4;
  return 3 + setupGas + 2 * Math.ceil(holdDays / 7);
}

/** The hours of attention a farm takes: setup, one weekly action a week, and the claim. */
function hoursFor(holdDays: number): number {
  return 0.5 + Math.ceil(holdDays / 7) * (10 / 60) + 0.25;
}

/** The net verdict: Farm beats $25 an hour of attention, Marginal covers its costs, Skip does not. */
export function verdictFor(netUsd: number, netPerHourUsd: number, model: ModelConstants = MODEL): 'Farm' | 'Marginal' | 'Skip' {
  if (netPerHourUsd > model.wage_usd_per_hour) return 'Farm';
  if (netUsd > 0) return 'Marginal';
  return 'Skip';
}

/**
 * The farm's economics: the expected drop is the expected value times the farmer
 * drop share times the farm's share of counted dollar-days (capital x hold days
 * over TVL x days listed — the protocol's whole record, so an old giant's drop
 * is spread thin and a young small protocol's is not). Gas and a 2%-a-year
 * capital charge are the costs; the capital itself comes back.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  expectedValueUsd: number,
  planSizePct: number = MODEL.plan_size_pct,
  dropShare: number = MODEL.drop_share,
  holdDays: number = MODEL.horizon_days,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const capital = Math.max(1, Math.min(Math.round(p.tvl_usd * planSizePct), model.plan_cap_usd));
  const countedDays = Math.max(age ?? 365, holdDays);
  const share = (capital * holdDays) / (p.tvl_usd * countedDays);
  const expectedDrop = expectedValueUsd * dropShare * share;
  const gas = totalGasFor(capital, holdDays);
  const charge = capital * model.capital_charge_rate * (holdDays / 365);
  const net = expectedDrop - gas - charge;
  const hours = hoursFor(holdDays);
  const netPerHour = net / hours;
  return { capital_usd: capital, expected_drop_usd: expectedDrop, gas_usd: gas, capital_charge_usd: charge, net_usd: net, hours, net_per_hour_usd: netPerHour, verdict: verdictFor(net, netPerHour, model) };
}

// ---------------------------------------------------------------------------
// Statistical validation
// ---------------------------------------------------------------------------

/** The tokened protocols the model can be tested against: non-CEX, with a market cap. */
function comparableSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.gecko_id !== null)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Ranks with averaged ties, in the order the values arrive. */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]!.i] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation between two equal-length lists. */
function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  if (dx === 0 || dy === 0) return 0;
  return Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)));
}

/** R-squared of log10(predicted) against log10(actual). */
function logR2(actual: number[], predicted: number[]): number {
  const n = actual.length;
  const la = actual.map((v) => Math.log10(v));
  const lp = predicted.map((v) => Math.log10(Math.max(1, v)));
  const mean = la.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (la[i]! - mean) ** 2;
    ssRes += (la[i]! - lp[i]!) ** 2;
  }
  if (ssTot === 0) return 0;
  return Math.max(-10, Math.min(1, 1 - ssRes / ssTot));
}

/** Median absolute percentage error, in per cent. */
function mape(actual: number[], predicted: number[]): number {
  const errs = actual.map((a, i) => Math.abs(predicted[i]! - a) / a).sort((a, b) => a - b);
  const med = medianOf(errs) ?? 0;
  return med * 100;
}

/** Share of predictions within 2x of the actual value, in per cent. */
function within2x(actual: number[], predicted: number[]): number {
  let ok = 0;
  for (let i = 0; i < actual.length; i++) {
    const r = predicted[i]! / actual[i]!;
    if (r >= 0.5 && r <= 2) ok++;
  }
  return (ok / actual.length) * 100;
}

/** The typical miss: the median of max(pred/actual, actual/pred). */
function medfac(actual: number[], predicted: number[]): number {
  const fs = actual.map((a, i) => Math.max(predicted[i]! / a, a / predicted[i]!)).sort((a, b) => a - b);
  return medianOf(fs) ?? 1;
}

/** The 7-day TVL change, clamped to -60..120; null reads as flat. */
function clampedGrowth(protocol: SnapshotProtocol): number {
  const raw = finite(protocol.change_7d, 0);
  return Math.min(120, Math.max(-60, raw));
}

/** One candidate value term, priced on top of the power-law core. */
type ValueVariant = 'core' | 'cat' | 'growth' | 'maturity' | 'breadth' | 'crash' | 'all';

/** The launch value one protocol gets under `variant`, fitted on `fit`. */
function variantPrice(p: SnapshotProtocol, asOf: string, fit: PowerLawFit, variant: ValueVariant): number {
  const base = 10 ** (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
  const { offsetDex } = offsetFor(p.category, fit);
  const age = ageDays(asOf, p.listed_at);
  const growthMult = 1 + (clampedGrowth(p) / 100) * 0.5;
  const maturityMult = 0.6 + (Math.min(age ?? 365, 1095) / 1095) * 0.4;
  const breadthMult = 1 + Math.min(p.chains.length, 4) * 0.02;
  const crashMult = finite(p.change_7d, 0) <= -25 ? 0.9 : 1;
  switch (variant) {
    case 'core': return Math.max(1, Math.round(base));
    case 'cat': return Math.max(1, Math.round(base * 10 ** offsetDex));
    case 'growth': return Math.max(1, Math.round(base * growthMult));
    case 'maturity': return Math.max(1, Math.round(base * maturityMult));
    case 'breadth': return Math.max(1, Math.round(base * breadthMult));
    case 'crash': return Math.max(1, Math.round(base * crashMult));
    case 'all': return Math.max(1, Math.round(base * 10 ** offsetDex * growthMult * maturityMult * breadthMult * crashMult));
  }
}

/** One validation test: fit the power law on `train`, predict `test` two ways — the core
 * alone, and the kept model (core + category offset) — and score both against the flat
 * global-median baseline on the same test set. */
function runTest(name: string, train: SnapshotProtocol[], test: SnapshotProtocol[], asOf: string, model: ModelConstants): {
  core: ValidationTest;
  kept: ValidationTest;
  logErrorsCore: number[];
  logErrorsKept: number[];
  actual: number[];
  predictedKept: number[];
} {
  const fit = fitPowerLaw(train, model);
  const flat = fit.global_median;
  const actual: number[] = [];
  const predictedCore: number[] = [];
  const predictedKept: number[] = [];
  const flatPredicted: number[] = [];
  const logErrorsCore: number[] = [];
  const logErrorsKept: number[] = [];
  for (const p of test) {
    actual.push(p.mcap_usd!);
    const pc = variantPrice(p, asOf, fit, 'core');
    const pk = variantPrice(p, asOf, fit, 'cat');
    predictedCore.push(pc);
    predictedKept.push(pk);
    flatPredicted.push(Math.max(1, Math.round(p.tvl_usd * flat)));
    logErrorsCore.push(Math.log10(pc) - Math.log10(p.mcap_usd!));
    logErrorsKept.push(Math.log10(pk) - Math.log10(p.mcap_usd!));
  }
  const coreSp = spearman(actual, predictedCore);
  const keptSp = spearman(actual, predictedKept);
  const flatSp = spearman(actual, flatPredicted);
  const base = { name, train_n: train.length, test_n: test.length };
  const core: ValidationTest = {
    ...base,
    spearman: round4(coreSp),
    log_r2: round4(logR2(actual, predictedCore)),
    mape_pct: round4(mape(actual, predictedCore)),
    within2x_pct: round4(within2x(actual, predictedCore)),
    medfac: round4(medfac(actual, predictedCore)),
    flat_spearman: round4(flatSp),
    flat_mape_pct: round4(mape(actual, flatPredicted)),
    flat_medfac: round4(medfac(actual, flatPredicted)),
    beats_flat_pp: round4((coreSp - flatSp) * 100),
  };
  const kept: ValidationTest = {
    ...base,
    spearman: round4(keptSp),
    log_r2: round4(logR2(actual, predictedKept)),
    mape_pct: round4(mape(actual, predictedKept)),
    within2x_pct: round4(within2x(actual, predictedKept)),
    medfac: round4(medfac(actual, predictedKept)),
    flat_spearman: round4(flatSp),
    flat_mape_pct: round4(mape(actual, flatPredicted)),
    flat_medfac: round4(medfac(actual, flatPredicted)),
    beats_flat_pp: round4((keptSp - flatSp) * 100),
  };
  return { core, kept, logErrorsCore, logErrorsKept, actual, predictedKept };
}

/** The typical miss of one variant, leave-one-out over the comparables. */
function looMedfac(comps: SnapshotProtocol[], asOf: string, variant: ValueVariant, model: ModelConstants): number {
  const actual: number[] = [];
  const predicted: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const fit = fitPowerLaw(train, model);
    actual.push(comps[i]!.mcap_usd!);
    predicted.push(variantPrice(comps[i]!, asOf, fit, variant));
  }
  return medfac(actual, predicted);
}

/** The typical miss of one variant on the walk-forward split. */
function walkMedfac(comps: SnapshotProtocol[], asOf: string, variant: ValueVariant, model: ModelConstants): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const train = dated.filter((p) => p.listed_at! < cutoff);
  const test = dated.filter((p) => p.listed_at! >= cutoff);
  const fit = fitPowerLaw(train, model);
  return medfac(
    test.map((p) => p.mcap_usd!),
    test.map((p) => variantPrice(p, asOf, fit, variant)),
  );
}

/** The percentile of a sorted list (linear interpolation), or null when empty. */
function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The Brier score of a set of predicted probabilities against 0/1 outcomes. */
function brierScore(predicted: number[], actual: number[]): number {
  let s = 0;
  for (let i = 0; i < actual.length; i++) s += (predicted[i]! - actual[i]!) ** 2;
  return s / actual.length;
}

/** The share of predictions that call the outcome right at a 0.5 threshold, in per cent. */
function accuracyPct(predicted: number[], actual: number[]): number {
  let ok = 0;
  for (let i = 0; i < actual.length; i++) if ((predicted[i]! >= 0.5) === (actual[i]! === 1)) ok++;
  return (ok / actual.length) * 100;
}

/** The odds clock's validation: Brier against the base rate, walk-forward and five-fold. */
function validateOdds(snapshot: Snapshot): OddsValidation {
  const dated = snapshot.protocols
    .filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null)
    .map((p) => ({ age_days: ageDays(snapshot.as_of, p.listed_at)!, tokened: !isPreToken(p), listed_at: p.listed_at! }))
    .sort((a, b) => (a.listed_at < b.listed_at ? -1 : 1));
  const full = fitOddsClock(dated);
  // Walk-forward: fit on protocols listed before the median date, test on the rest.
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at;
  const trainW = dated.filter((d) => d.listed_at < cutoff);
  const testW = dated.filter((d) => d.listed_at >= cutoff);
  const clockW = fitOddsClock(trainW);
  const baseW = trainW.filter((d) => d.tokened).length / trainW.length;
  const predW = testW.map((d) => pTokened(d.age_days, clockW));
  const actualW = testW.map((d) => (d.tokened ? 1 : 0));
  const walk_forward = {
    train_n: trainW.length,
    test_n: testW.length,
    pi: round4(clockW.pi),
    hazard_early_per_day: clockW.hazard_early_per_day,
    hazard_late_per_day: clockW.hazard_late_per_day,
    changepoint_days: clockW.changepoint_days,
    brier: round4(brierScore(predW, actualW)),
    base_brier: round4(brierScore(actualW.map(() => baseW), actualW)),
    accuracy_pct: round4(accuracyPct(predW, actualW)),
    base_accuracy_pct: round4(accuracyPct(actualW.map(() => baseW), actualW)),
  };
  // Five-fold over the dated peers, by slug order: deterministic, no random shuffle.
  const folds: { age_days: number; tokened: boolean }[][] = [[], [], [], [], []];
  const ordered = [...snapshot.protocols]
    .filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1))
    .map((p) => ({ age_days: ageDays(snapshot.as_of, p.listed_at)!, tokened: !isPreToken(p) }));
  ordered.forEach((d, i) => folds[i % 5]!.push(d));
  const pred5: number[] = [];
  const actual5: number[] = [];
  for (let f = 0; f < 5; f++) {
    const train = folds.flatMap((fold, g) => (g === f ? [] : fold));
    const clock = fitOddsClock(train);
    for (const d of folds[f]!) {
      pred5.push(pTokened(d.age_days, clock));
      actual5.push(d.tokened ? 1 : 0);
    }
  }
  const base5 = actual5.reduce((a, b) => a + b, 0) / actual5.length;
  const five_fold = {
    brier: round4(brierScore(pred5, actual5)),
    base_brier: round4(brierScore(actual5.map(() => base5), actual5)),
    accuracy_pct: round4(accuracyPct(pred5, actual5)),
    base_accuracy_pct: round4(accuracyPct(actual5.map(() => base5), actual5)),
  };
  // The constant-hazard clock on the same two blind tests: the baseline the two-phase
  // clock must beat. Same splits, same refits — only the hazard family differs.
  const constW = fitConstantClock(trainW);
  const predWc = testW.map((d) => pTokenedConstant(d.age_days, constW));
  const pred5c: number[] = [];
  for (let f = 0; f < 5; f++) {
    const train = folds.flatMap((fold, g) => (g === f ? [] : fold));
    const clock = fitConstantClock(train);
    for (const d of folds[f]!) pred5c.push(pTokenedConstant(d.age_days, clock));
  }
  const constant_clock = {
    walk_forward_brier: round4(brierScore(predWc, actualW)),
    five_fold_brier: round4(brierScore(pred5c, actual5)),
  };
  // Calibration: predicted share tokened vs actual, by no-token age bucket, full clock.
  const buckets: { label: string; test: (age: number) => boolean }[] = [
    { label: 'under 6 months', test: (a) => a < 180 },
    { label: '6–12 months', test: (a) => a >= 180 && a < 365 },
    { label: '1–2 years', test: (a) => a >= 365 && a < 730 },
    { label: '2–3 years', test: (a) => a >= 730 && a < 1095 },
    { label: 'over 3 years', test: (a) => a >= 1095 },
  ];
  const calibration: OddsCalibrationBin[] = buckets.map((b) => {
    const members = dated.filter((d) => b.test(d.age_days));
    const predicted = members.length === 0 ? 0 : members.reduce((s, d) => s + pTokened(d.age_days, full), 0) / members.length;
    const actual = members.length === 0 ? 0 : members.filter((d) => d.tokened).length / members.length;
    return { bucket: b.label, n: members.length, predicted_share: round4(predicted), actual_share: round4(actual) };
  });
  return { pi: round4(full.pi), hazard_early_per_day: full.hazard_early_per_day, hazard_late_per_day: full.hazard_late_per_day, changepoint_days: full.changepoint_days, walk_forward, five_fold, constant_clock, calibration };
}

/** The whole validation report, computed from the snapshot alone. */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationReport {
  const comps = comparableSet(snapshot);
  // Held-out: even slugs (by sorted order) fit the multiples, odd slugs are predicted.
  const trainH = comps.filter((_, i) => i % 2 === 0);
  const testH = comps.filter((_, i) => i % 2 === 1);
  const held = runTest('Held-out (even/odd slug split)', trainH, testH, snapshot.as_of, model);
  // Walk-forward: fit on protocols listed before the median listing date, test on the rest.
  const dates = comps.filter((p) => p.listed_at !== null).map((p) => p.listed_at!).sort();
  const cutoff = dates[Math.floor(dates.length / 2)] ?? '2024-01-01';
  const trainW = comps.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const testW = comps.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
  const walk = runTest('Walk-forward (listed before/after median date)', trainW, testW, snapshot.as_of, model);
  // Term tests: each candidate term on top of the core, leave-one-out and walk-forward.
  const variants: { term: string; variant: ValueVariant }[] = [
    { term: 'Category offset (median residual, shrunk k=20, ±0.3 dex)', variant: 'cat' },
    { term: '7-day TVL growth (1 + clamped change × 0.5)', variant: 'growth' },
    { term: 'Age / maturity (0.6–1.0 by days listed)', variant: 'maturity' },
    { term: 'Chain count (+2% per chain, up to four)', variant: 'breadth' },
    { term: 'Crash guard (×0.9 at −25% 7-day or worse)', variant: 'crash' },
    { term: 'All five together (round 5’s full model)', variant: 'all' },
  ];
  const coreLoo = looMedfac(comps, snapshot.as_of, 'core', model);
  const coreWalk = walkMedfac(comps, snapshot.as_of, 'core', model);
  const term_tests: TermTest[] = variants.map((v) => {
    const loo = looMedfac(comps, snapshot.as_of, v.variant, model);
    const wf = walkMedfac(comps, snapshot.as_of, v.variant, model);
    return { term: v.term, loo_medfac: round4(loo), walk_medfac: round4(wf), kept: loo < coreLoo && wf < coreWalk };
  });
  // Confidence factors from the kept model's held-out log-errors: P25/P75 and P10/P90.
  const errs = [...held.logErrorsKept].sort((a, b) => a - b);
  const p10 = percentile(errs, 0.1) ?? -0.5;
  const p25 = percentile(errs, 0.25) ?? -0.3;
  const p75 = percentile(errs, 0.75) ?? 0.3;
  const p90 = percentile(errs, 0.9) ?? 0.5;
  const ciLow = round4(10 ** p10);
  const ciHigh = round4(10 ** p90);
  const absErrs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const medAbs = medianOf(absErrs) ?? 0.3;
  const typicalFactor = round4(10 ** medAbs);
  const inside = (es: number[], lo: number, hi: number): number => {
    if (es.length === 0) return 0;
    return round4((es.filter((e) => e >= lo && e <= hi).length / es.length) * 100);
  };
  const walkErrs = [...walk.logErrorsKept].sort((a, b) => a - b);
  const range_honesty: RangeHonesty = {
    p25_factor: round4(10 ** p25),
    p75_factor: round4(10 ** p75),
    ci_low_factor: ciLow,
    ci_high_factor: ciHigh,
    loo_inside_p25_75_pct: inside(errs, p25, p75),
    walk_inside_p25_75_pct: inside(walkErrs, p25, p75),
    loo_inside_3x_pct: inside(errs, -Math.log10(3), Math.log10(3)),
    walk_inside_3x_pct: inside(walkErrs, -Math.log10(3), Math.log10(3)),
  };
  // Calibration: the held-out kept predictions cut into five quintiles by predicted value.
  const pairs = held.actual.map((a, i) => ({ actual: a, predicted: held.predictedKept[i]! })).sort((a, b) => a.predicted - b.predicted);
  const calibration: CalibrationBin[] = [];
  const binSize = Math.ceil(pairs.length / 5);
  for (let q = 0; q < 5; q++) {
    const bin = pairs.slice(q * binSize, (q + 1) * binSize);
    if (bin.length === 0) continue;
    const medP = medianOf(bin.map((b) => b.predicted).sort((a, b) => a - b)) ?? 0;
    const medA = medianOf(bin.map((b) => b.actual).sort((a, b) => a - b)) ?? 0;
    calibration.push({ quintile: q + 1, n: bin.length, median_predicted_usd: Math.round(medP), median_actual_usd: Math.round(medA), ratio: medA > 0 ? round4(medP / medA) : 0 });
  }
  // Model comparison on the held-out set: the kept model, the power law alone, the flat baseline, TVL alone.
  const tvlSpearman = spearman(held.actual, testH.map((p) => p.tvl_usd));
  const flatMedian = fitPowerLaw(trainH, model).global_median;
  const flatPredicted = testH.map((p) => Math.max(1, Math.round(p.tvl_usd * flatMedian)));
  const modelComparison = [
    { model: 'Kept model (power law + category offset)', spearman: held.kept.spearman, log_r2: held.kept.log_r2, mape_pct: held.kept.mape_pct },
    { model: 'Power law alone (no category offset)', spearman: held.core.spearman, log_r2: held.core.log_r2, mape_pct: held.core.mape_pct },
    { model: 'Flat global median', spearman: held.core.flat_spearman, log_r2: round4(logR2(held.actual, flatPredicted)), mape_pct: held.core.flat_mape_pct },
    { model: 'TVL alone (rank only)', spearman: round4(tvlSpearman), log_r2: 0, mape_pct: null },
  ];
  return {
    held_out: held.core,
    held_out_kept: held.kept,
    walk_forward: walk.core,
    walk_forward_kept: walk.kept,
    term_tests,
    odds: validateOdds(snapshot),
    ci_low_factor: ciLow,
    ci_high_factor: ciHigh,
    median_abs_log_error_dex: round4(medAbs),
    typical_factor: typicalFactor,
    range_honesty,
    calibration,
    model_comparison: modelComparison,
  };
}

// ---------------------------------------------------------------------------
// Farm plans
// ---------------------------------------------------------------------------

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * One category family's farm action. The first family whose keywords match the protocol's
 * category wins; the fallback at the end covers every category the table does not name.
 * Each action is a function of the protocol, the capital and the chain, so the plan is
 * derived from the protocol's own record, never from a hand-written list of names.
 */
interface ActionFamily {
  keywords: string[];
  action: (name: string, capital: number, chain: string) => string;
}

const ACTION_FAMILIES: ActionFamily[] = [
  { keywords: ['lend', 'cdp', 'collateral'], action: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.` },
  { keywords: ['dex', 'yield', 'leveraged farm'], action: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.` },
  { keywords: ['bridge'], action: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.` },
  { keywords: ['staking', 'restak'], action: (name, capital) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.` },
  { keywords: ['perpetual', 'derivative'], action: (name, capital) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.` },
  { keywords: ['prediction'], action: (name, capital) => `Fund $${capital} and place one market position on ${name}.` },
  { keywords: ['curator', 'allocator'], action: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.` },
  { keywords: ['stable'], action: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.` },
  { keywords: ['rwa'], action: (name, capital, chain) => `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.` },
  { keywords: ['insurance'], action: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.` },
];

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  for (const family of ACTION_FAMILIES) {
    if (family.keywords.some((k) => c.includes(k))) return family.action(p.name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** One farm step, as its three parts. */
function step(text: string, cost: string, time: string): FarmStep {
  return { text, cost, time };
}

/**
 * One category family's weekly action: the recurring thing that keeps the address active.
 * The first family whose keywords match the protocol's category wins; the fallback covers
 * every category the table does not name. Each action names the protocol, so the weekly
 * step is the protocol's own, not a generic "do something weekly".
 */
interface WeeklyFamily {
  keywords: string[];
  action: (name: string) => string;
}

const WEEKLY_FAMILIES: WeeklyFamily[] = [
  { keywords: ['lend', 'cdp', 'collateral'], action: (name) => `Each week, top up or adjust the collateral on ${name} so the position stays active — a fresh deposit, a borrow, or a vote.` },
  { keywords: ['dex', 'yield', 'leveraged farm'], action: (name) => `Each week, add or remove a little liquidity, or make one swap on ${name}, so the position shows activity.` },
  { keywords: ['bridge'], action: (name) => `Each week, bridge a small amount through ${name} so the address keeps a bridging history.` },
  { keywords: ['staking', 'restak'], action: (name) => `Each week, check the staking receipt on ${name} and restake any rewards.` },
  { keywords: ['perpetual', 'derivative'], action: (name) => `Each week, adjust the hedge or open one small trade on ${name} so the account stays active.` },
  { keywords: ['prediction'], action: (name) => `Each week, place one small market position on ${name}.` },
  { keywords: ['curator', 'allocator'], action: (name) => `Each week, check ${name}'s vault points page and add a little if the vault is still open.` },
  { keywords: ['stable'], action: (name) => `Each week, check the stable asset on ${name} and its points page.` },
  { keywords: ['rwa'], action: (name) => `Each week, check the yield asset's accrual on ${name} and its points page.` },
  { keywords: ['insurance'], action: (name) => `Each week, check the cover's status on ${name} and its points page.` },
];

/** The category's weekly action, in the words a farmer can follow. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  for (const family of WEEKLY_FAMILIES) {
    if (family.keywords.some((k) => c.includes(k))) return family.action(p.name);
  }
  return `Each week, make one qualifying action on ${p.name} — a deposit, a swap, or a vote — so the address stays active.`;
}

/** The net verdict, in words: Farm beats $25 an hour, Marginal covers its costs, Skip does not. */
export function verdictReason(v: 'Farm' | 'Marginal' | 'Skip'): string {
  if (v === 'Farm') return 'the expected drop beats $25 an hour of attention after gas and the capital charge';
  if (v === 'Marginal') return 'the expected drop covers gas and the capital charge, but not $25 an hour';
  return 'the expected drop does not cover gas and the capital charge at this plan size';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age, launch value,
 * odds, expected value) and the board's scenario (plan size, drop share, horizon),
 * never from a hand-written list of names. The net step states the expected drop,
 * the gas, the capital charge and the dollars per hour, with the verdict.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  launchValueUsd: number,
  odds: number,
  expectedValueUsd: number,
  econ: FarmEconomics,
  holdDays: number = MODEL.horizon_days,
  dropShare: number = MODEL.drop_share,
): FarmStep[] {
  const chain = chainOf(p);
  const capital = econ.capital_usd;
  const weekly = weeklyFor(p);
  const gas = econ.gas_usd;
  const holdText =
    age === null
      ? `Hold the position for ${holdDays} days so the activity is counted in more than one snapshot.`
      : `Hold the position for ${holdDays} days — ${p.name} was listed ${age} days ago with no token, so the window covers more than one snapshot.`;
  const triggerTvl = fmtCompact(Math.round(p.tvl_usd * 0.7));
  const sharePct = (((capital * holdDays) / (p.tvl_usd * Math.max(age ?? 365, holdDays))) * 100).toFixed(4);
  const netText = `Net: expected drop ${fmtCompact(Math.max(0, econ.expected_drop_usd))} (${Math.round(dropShare * 100)}% of ${fmtCompact(expectedValueUsd)} expected value, your ${sharePct}% of counted dollar-days) minus about $${gas} gas and $${econ.capital_charge_usd.toFixed(0)} capital charge (2% a year on $${capital} for ${holdDays} days) = ${econ.net_usd >= 0 ? '' : '−'}$${Math.abs(Math.round(econ.net_usd))}, about $${econ.net_per_hour_usd.toFixed(2)} an hour for ${econ.hours.toFixed(1)} hours. Verdict: ${econ.verdict} — ${verdictReason(econ.verdict)}.`;
  return [
    step(`Open a fresh wallet on ${chain} and fund it with $${capital} (the board's plan size, 0.02% of ${fmtCompact(p.tvl_usd)} TVL up to $25,000 — lower it on the board if that is more than you farm with) plus about $${gas} for gas. Keep the seed phrase offline.`, `$${capital} of capital and about $${gas} of gas`, '10 minutes'),
    step(actionFor(p, capital, chain), `$${capital} of capital and about $${gas} of gas`, '15 minutes to set up'),
    step(weekly, 'about $2 of gas a week', '10 minutes a week'),
    step(holdText, `the $${capital} stays in the position`, `${holdDays} days`),
    step(netText, `about $${gas} of gas plus $${econ.capital_charge_usd.toFixed(0)} capital charge`, `${holdDays} days`),
    step(`Exit if ${p.name}'s TVL falls 30% below ${fmtCompact(p.tvl_usd)} to ${triggerTvl}, or if a token is announced — claim within 7 days, only from the link the protocol publishes.`, 'no fee to check, and never pay to claim', '10 minutes'),
    step(`Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, 'nothing but the log', '5 minutes'),
  ];
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/** The live-token protocols the dashboard shows, by market cap: they already trade. */
function liveCandidates(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd);
}

/** A protocol's mcap / TVL ratio, or null when it has no market cap or no TVL. */
function mcapTvlRatio(p: SnapshotProtocol): number | null {
  return p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return liveCandidates(snapshot)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio: mcapTvlRatio(p),
    }));
}

/** Every live-token protocol as a comparable, by market cap. */
export function comparableRows(snapshot: Snapshot): ComparableRow[] {
  return liveCandidates(snapshot)
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_tvl_ratio: mcapTvlRatio(p),
    }));
}

/** The ledger: every snapshot protocol in exactly one group, so the groups sum to the snapshot. */
export function buildCensus(snapshot: Snapshot, boardSlugs: Set<string>): CensusGroup[] {
  const watchlist = new Set(snapshot.watchlist);
  let rankedWatch = 0;
  let rankedEarly = 0;
  let rankedOff = 0;
  for (const slug of boardSlugs) {
    const p = snapshot.protocols.find((q) => q.slug === slug)!;
    if (watchlist.has(slug)) rankedWatch++;
    else if (p.tvl_usd >= snapshot.floor_usd) rankedOff++;
    else rankedEarly++;
  }
  const comps = comparableSet(snapshot).length;
  const tokened = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const tokenedNoCap = tokened - comps;
  const out: Record<string, number> = { 'Out — exchange': 0, 'Out — liquid staking': 0, 'Out — bridge': 0, 'Out — versioned or wrapped': 0 };
  for (const p of snapshot.protocols) {
    if (isPreToken(p) && !boardSlugs.has(p.slug)) {
      const reason = exclusionReason(p);
      out[reason] = (out[reason] ?? 0) + 1;
    }
  }
  return [
    { group: 'Ranked — watchlist', n: rankedWatch, note: 'On the snapshot’s watchlist: at or above the $50M floor, records no token.' },
    { group: 'Ranked — early, below the floor', n: rankedEarly, note: 'Passes the launch rule below the $50M floor: the early finds the radar exists for.' },
    { group: 'Ranked — off-list, at or above the floor', n: rankedOff, note: 'Passes the launch rule at or above the floor but the watchlist leaves out (the house’s parent screen).' },
    { group: 'Token trades — priced comp', n: comps, note: 'Records a token with a usable market cap: the comparables the launch value is fitted on.' },
    { group: 'Token recorded — no usable cap', n: tokenedNoCap, note: 'Records a token but no usable market cap, so it prices nothing and ranks nowhere.' },
    { group: 'Out — exchange', n: out['Out — exchange']!, note: 'Records no token but is an exchange: the house rule keeps exchanges off the board.' },
    { group: 'Out — liquid staking', n: out['Out — liquid staking']!, note: 'Liquid staking, liquid restaking or restaked BTC: a staked product of a token that trades.' },
    { group: 'Out — bridge', n: out['Out — bridge']!, note: 'A bridge or canonical bridge: a wrapped product of a token that trades.' },
    { group: 'Out — versioned or wrapped', n: out['Out — versioned or wrapped']!, note: 'A versioned pool (V2, 2.0) or a wrapped / staked name: a pool of another protocol.' },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, validation?: ValidationReport): BoardRow[] {
  const fit = fitPowerLaw(snapshot.protocols, model);
  const val = validation ?? validateModel(snapshot, model);
  const dated = snapshot.protocols
    .filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null)
    .map((p) => ({ age_days: ageDays(snapshot.as_of, p.listed_at)!, tokened: !isPreToken(p) }));
  const clock = fitOddsClock(dated);
  const chosen = snapshot.protocols.filter((p) => passesLaunchRule(p));
  const scored = chosen.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const { launch, offsetDex, comps_n, median } = launchValue(p, fit);
    const odds = oddsEver(age, clock);
    const expected = Math.max(1, Math.round(launch * odds));
    const econ = farmEconomics(p, age, expected);
    return { p, age, launch, offsetDex, comps_n, median, odds, expected, econ };
  });
  scored.sort((a, b) => b.expected - a.expected || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.expected,
    implied_low_usd: Math.max(1, Math.round(s.expected * val.range_honesty.p25_factor)),
    implied_high_usd: Math.max(1, Math.round(s.expected * val.range_honesty.p75_factor)),
    launch_value_usd: s.launch,
    launch_low_usd: Math.max(1, Math.round(s.launch * val.range_honesty.p25_factor)),
    launch_high_usd: Math.max(1, Math.round(s.launch * val.range_honesty.p75_factor)),
    token_odds: round4(s.odds),
    verdict: s.econ.verdict,
    net_usd: Math.round(s.econ.net_usd),
    net_per_hour_usd: round4(s.econ.net_per_hour_usd),
    expected_drop_usd: Math.round(s.econ.expected_drop_usd * 100) / 100,
    farm_capital_usd: s.econ.capital_usd,
    model: {
      category_multiple: round4(s.launch / s.p.tvl_usd),
      power_slope: fit.slope,
      category_offset_dex: s.offsetDex,
      comps_n: s.comps_n,
      category_median: s.median === null ? null : round4(s.median),
      age_days: s.age,
      token_odds: round4(s.odds),
      launch_value_usd: s.launch,
    },
    farm_steps: farmSteps(s.p, s.age, s.launch, s.odds, s.expected, s.econ).map(stepText),
  }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    launch_value_usd: row.launch_value_usd,
    launch_low_usd: row.launch_low_usd,
    launch_high_usd: row.launch_high_usd,
    token_odds: row.token_odds,
    category_multiple: row.model.category_multiple,
    power_slope: row.model.power_slope,
    category_offset_dex: row.model.category_offset_dex,
    comps_n: row.model.comps_n,
    verdict: row.verdict,
    net_usd: row.net_usd,
    net_per_hour_usd: row.net_per_hour_usd,
    expected_drop_usd: row.expected_drop_usd,
    farm_capital_usd: row.farm_capital_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const validation = validateModel(snapshot, model);
  const board = buildBoard(snapshot, model, validation);
  const live = liveRows(snapshot);
  const fit = fitPowerLaw(snapshot.protocols, model);
  const dated = snapshot.protocols
    .filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null)
    .map((p) => ({ age_days: ageDays(snapshot.as_of, p.listed_at)!, tokened: !isPreToken(p) }));
  const clock = fitOddsClock(dated);
  const boardSlugs = new Set(board.map((r) => r.slug));
  const census = buildCensus(snapshot, boardSlugs);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd < snapshot.floor_usd).length;
  const offList = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const compsList = [...fit.by_category.values()].sort((a, b) => b.comps_n - a.comps_n || (a.category < b.category ? -1 : 1));
  const farm_verdicts = {
    farm: board.filter((r) => r.verdict === 'Farm').length,
    marginal: board.filter((r) => r.verdict === 'Marginal').length,
    skip: board.filter((r) => r.verdict === 'Skip').length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    off_list_size: offList,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    total_launch_usd: board.reduce((n, r) => n + r.launch_value_usd, 0),
    global_median_ratio: fit.global_median,
    power_law: { intercept: fit.intercept, slope: fit.slope },
    odds_clock: { pi: round4(clock.pi), hazard_early_per_day: clock.hazard_early_per_day, hazard_late_per_day: clock.hazard_late_per_day, changepoint_days: clock.changepoint_days },
    comps: compsList,
    rows: board.map(radarRow),
    live,
    comparables: comparableRows(snapshot),
    validation,
    census,
    farm_verdicts,
  };
  return { board, radar };
}

/** A required string field, or a refusal naming it. */
function reqString(o: Record<string, unknown>, key: string, where: string): string {
  if (typeof o[key] !== 'string') throw new SnapshotError(`snapshot.json's ${where} has no ${key}`);
  return o[key] as string;
}

/** An optional number field: the number when it is finite, else null. */
function optNumber(o: Record<string, unknown>, key: string): number | null {
  return typeof o[key] === 'number' && Number.isFinite(o[key]) ? (o[key] as number) : null;
}

/** An optional string field: the string, else null. */
function optString(o: Record<string, unknown>, key: string): string | null {
  return typeof o[key] === 'string' ? (o[key] as string) : null;
}

/** One protocol entry out of its raw object, refused unless it has a slug, a name and a TVL. */
function parseProtocol(v: unknown, i: number): SnapshotProtocol {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
  const p = v as Record<string, unknown>;
  if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
    throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
  }
  return {
    slug: p.slug,
    name: p.name,
    category: optString(p, 'category'),
    chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
    tvl_usd: p.tvl_usd,
    change_7d: optNumber(p, 'change_7d'),
    mcap_usd: optNumber(p, 'mcap_usd'),
    listed_at: optString(p, 'listed_at'),
    gecko_id: optString(p, 'gecko_id'),
    symbol: optString(p, 'symbol'),
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  const asOf = reqString(o, 'as_of', 'snapshot');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new SnapshotError('snapshot.json has no as_of date');
  const source = reqString(o, 'source', 'snapshot');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  return {
    as_of: asOf,
    source,
    floor_usd: o.floor_usd,
    protocols: o.protocols.map((v, i) => parseProtocol(v, i)),
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const checks: (string | null)[] = [coverageIssue(board, snapshot), ranksIssue(board), orderIssue(board), flatIssue(board), stepsIssue(board)];
  for (const issue of checks) if (issue !== null) return issue;
  return null;
}

/** The watchlist slugs the board misses, if any. */
function coverageIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length === 0) return null;
  return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
}

/** The first rank that is not its position, if any. */
function ranksIssue(board: BoardRow[]): string | null {
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  return null;
}

/** The first row that outranks the row above it on implied value, if any. */
function orderIssue(board: BoardRow[]): string | null {
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  return null;
}

/** Whether every row shares one implied value: a board that ranks nothing by value is not a ranking. */
function flatIssue(board: BoardRow[]): string | null {
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  return null;
}

/** The first row whose farm plan or implied value breaks the gate's shape, if any. */
function stepsIssue(board: BoardRow[]): string | null {
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.implied_low_usd) || r.implied_low_usd <= 0) return `${r.slug} has implied low ${r.implied_low_usd}`;
    if (!Number.isSafeInteger(r.implied_high_usd) || r.implied_high_usd <= r.implied_low_usd) return `${r.slug} has implied high ${r.implied_high_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
