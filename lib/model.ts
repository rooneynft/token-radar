// The token radar's model, version 5: comps-calibrated valuation with a breadth
// and crash-guard signal, netted farm plans, and — new in this round — statistical
// validation that is computed from the snapshot and DISPLAYED in the dashboard.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling)
// and adds every other rankable pre-token protocol below the floor: the early rows the
// radar exists to find. A protocol is pre-token when its index entry records no token
// (no market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are
// kept apart and shown as the market's own values, never mixed into the ranked board.
//
// Implied value is calibrated on the snapshot's own live-token protocols, the comparables.
// The market does NOT price TVL linearly: across the 119 tokened protocols, log10(market
// cap) grows with log10(TVL) at a slope of 0.47, not 1.00 — a protocol ten times bigger is
// worth only about three times as much. A flat mcap/TVL multiple therefore overprices the
// biggest protocols tenfold (the old ratio model's top calibration quintile ran 10.45x hot).
// So the base is a power law fitted on the comparables by least squares, not a ratio:
//
//   log10(mcap) = INTERCEPT + SLOPE x log10(tvl)      (fitted: slope ~0.47)
//   base       = 10^(INTERCEPT + SLOPE x log10(tvl_usd)) x 10^categoryOffset
//   categoryOffset = the category's median residual from the power law, shrunk toward
//                    zero with k = 20 and clamped to +/-0.3 dex (x0.5 to x2.0)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + min(chains, 4) x 0.02
//              (a protocol live on several chains is harder to kill than a single-chain one;
//               the bonus is capped at four chains so a chain list cannot dominate the score)
//   crashGuard = 0.9 when change_7d <= -25, else 1
//              (a weekly TVL fall of a quarter or more is usually an exploit, a hack or a
//               migration — the model discounts it instead of trusting the 7-day print)
//   implied    = max(1, round(base x growthMult x maturity x breadth x crashGuard))
//
// The shrinkage pulls thin categories toward the power law, so one odd comparable cannot
// set a whole sector's offset, and the clamp keeps every offset inside half to double.
// No protocol name is ever special-cased: the same function scores every row, and the
// dashboard shows each row's multiple, its comparables and the arithmetic.
//
// VALIDATION (this round's work): the same formula is tested, before it ever prices a
// pre-token row, against the tokened protocols whose market caps are known:
//
//   held-out  — the tokened protocols are split by slug order (even slugs fit the
//               multiples, odd slugs are predicted). The fitted model must beat the flat
//               global-median baseline on the held-out half, or the board says so.
//   walk-forward — the multiples are fitted only on protocols listed before the median
//               listing date and tested on the ones listed after it: the model must work
//               on protocols it has never seen, from a later era, not just on its own time.
//   calibration — the held-out predictions are cut into five quintiles; each quintile
//               shows its median predicted against its median actual market cap, so a
//               reader can see where the model runs hot or cold.
//   confidence — the held-out log-errors give a 90% range (10th/90th percentile); every
//               board row carries its own implied_low_usd / implied_high_usd, and the detail
//               view shows the range beside the point estimate.
//
// Every number above is computed by this file from the snapshot at run time and written
// into data.js, so the dashboard's validation panel, the screenshots and the code agree:
// nothing in the validation display is typed in by hand.
//
// Farm plans are netted, not templated: each row's plan is derived from its own record
// (category, chains, TVL, age, implied value, multiple) and ends in a net step that states
// the whole plan's gas cost against the row's implied value and gives a verdict — Farm,
// Farm with the standard size, or Thin. The weekly action is the category family's own
// recurring action, the hold names the protocol's age, and the setup names its chain and
// capital. The same derivation runs in main.ts (board.json) and in the page (data.js),
// so the screenshots and the code agree.

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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrink_k: number;
  mult_min: number;
  mult_max: number;
  /** Extra implied value per chain a protocol runs on, up to `breadth_cap_chains` chains. */
  breadth_per_chain: number;
  breadth_cap_chains: number;
  /** Weekly TVL fall at or below which the crash guard discounts the row. */
  crash_threshold: number;
  /** The discount the crash guard applies. */
  crash_penalty: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_k: 6,
  mult_min: 0.03,
  mult_max: 1.5,
  breadth_per_chain: 0.02,
  breadth_cap_chains: 4,
  crash_threshold: -25,
  crash_penalty: 0.9,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5-validated';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 1000;

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
  implied_value_usd: number;
  /** The 90% range from the held-out log-errors: the point estimate times these factors. */
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    category_multiple: number;
    power_slope: number;
    category_offset_dex: number;
    comps_n: number;
    category_median: number | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    crash_guard: number;
    age_days: number | null;
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
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  category_multiple: number;
  power_slope: number;
  category_offset_dex: number;
  comps_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  crash_guard: number;
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
  /** The flat global-median baseline's Spearman on the same test set. */
  flat_spearman: number;
  /** The flat baseline's median absolute percentage error, in per cent. */
  flat_mape_pct: number;
  /** The fitted model's Spearman minus the flat baseline's, in points. */
  beats_flat_pp: number;
}

/** One calibration quintile: median predicted against median actual market cap. */
export interface CalibrationBin {
  quintile: number;
  n: number;
  median_predicted_usd: number;
  median_actual_usd: number;
  ratio: number;
}

/** The whole validation report: every number the dashboard's validation panel shows. */
export interface ValidationReport {
  /** The power-law core on the held-out split: the part of the model that can be tested. */
  held_out: ValidationTest;
  /** The full model (core + category + growth + age) on the same held-out split. */
  held_out_full: ValidationTest;
  /** The power-law core on the walk-forward split. */
  walk_forward: ValidationTest;
  /** The full model on the same walk-forward split. */
  walk_forward_full: ValidationTest;
  /** The 10th/90th percentile of the held-out log10 errors, as multipliers on the point estimate. */
  ci_low_factor: number;
  ci_high_factor: number;
  /** The median absolute held-out log10 error, in dex: the model's typical miss. */
  median_abs_log_error_dex: number;
  /** 10^median_abs_log_error_dex: the typical miss as a factor (x2.1 means usually within 2.1x). */
  typical_factor: number;
  calibration: CalibrationBin[];
  /** The full model, the power law alone, the flat baseline and the TVL-only ranking, all on the held-out set. */
  model_comparison: { model: string; spearman: number; log_r2: number; mape_pct: number | null }[];
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
  live_size: number;
  total_implied_usd: number;
  global_median_ratio: number;
  /** The power law fitted on the comparables: log10(mcap) = intercept + slope x log10(TVL). */
  power_law: { intercept: number; slope: number };
  comps: CategoryComp[];
  rows: RadarRow[];
  live: LiveRow[];
  comparables: ComparableRow[];
  validation: ValidationReport;
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
  return `$${n}`;
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

/** A category's multiple from its comparables: the median, shrunk toward the global median. */
function shrunkMultiple(median: number | null, n: number, global: number, model: ModelConstants): number {
  if (median === null) return global;
  const raw = (n * median + model.shrink_k * global) / (n + model.shrink_k);
  return Math.min(model.mult_max, Math.max(model.mult_min, raw));
}

/** The comparables table out of a protocol list (the whole snapshot, or a training split). */
export function computeCompsFrom(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): CompsTable {
  const { all, byCat } = compRatios(protocols);
  all.sort((a, b) => a - b);
  const global = medianOf(all) ?? 0.25;
  const by_category = new Map<string, CategoryComp>();
  for (const [cat, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    const med = medianOf(ratios);
    const n = ratios.length;
    by_category.set(cat, { category: cat, comps_n: n, median_ratio: med, multiple: round4(shrunkMultiple(med, n, global, model)), offset_dex: 0 });
  }
  return { global_median: round4(global), by_category };
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
    const offset = Math.max(-0.3, Math.min(0.3, (n * medRes) / (n + 20)));
    by_category.set(cat, { category: cat, comps_n: n, median_ratio: med, multiple: round4(shrunkMultiple(med, n, global, model)), offset_dex: round4(offset) });
  }
  return { intercept: round4(intercept), slope: round4(slope), global_median: round4(global), by_category };
}

export function computeComps(snapshot: Snapshot, model: ModelConstants = MODEL): CompsTable {
  return computeCompsFrom(snapshot.protocols, model);
}

/** The multiple one category gets: its comps table entry, or the global median when it has none. */
export function multipleFor(category: string | null, comps: CompsTable, model: ModelConstants = MODEL): { multiple: number; comps_n: number; median: number | null } {
  const entry = category === null ? undefined : comps.by_category.get(category);
  if (entry === undefined) {
    return { multiple: Math.min(model.mult_max, Math.max(model.mult_min, comps.global_median)), comps_n: 0, median: null };
  }
  return { multiple: entry.multiple, comps_n: entry.comps_n, median: entry.median_ratio };
}

/** The 7-day TVL change, clamped to the model's floor and cap; null reads as flat. */
function clampedGrowth(protocol: SnapshotProtocol, model: ModelConstants): number {
  const raw = finite(protocol.change_7d, 0);
  return Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
}

/** The growth multiplier: 1 at flat TVL, up with growth, down with a fall. */
function growthMultiplier(growthPct: number, model: ModelConstants): number {
  return 1 + (growthPct / 100) * model.growth_weight;
}

/** The maturity multiplier: older protocols with no token yet score closer to full weight. */
function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const ageForModel = age ?? model.unknown_age_days;
  const capped = Math.min(Math.max(ageForModel, 0), model.maturity_days);
  return model.maturity_floor + (capped / model.maturity_days) * model.maturity_range;
}

/**
 * The breadth multiplier: a protocol running on several chains is harder to kill than a
 * single-chain one, so each chain up to the cap adds a small bonus. A protocol naming no
 * chain gets no bonus.
 */
function breadthMultiplier(protocol: SnapshotProtocol, model: ModelConstants): number {
  const chains = Math.min(protocol.chains.length, model.breadth_cap_chains);
  return 1 + chains * model.breadth_per_chain;
}

/**
 * The crash guard: a weekly TVL fall at or below the threshold is usually an exploit, a
 * hack or a migration, so the row is discounted instead of priced off the fallen TVL alone.
 */
function crashGuard(protocol: SnapshotProtocol, model: ModelConstants): number {
  const change = finite(protocol.change_7d, 0);
  return change <= model.crash_threshold ? model.crash_penalty : 1;
}

/** Every signal one protocol gets, and the implied value they multiply into. */
export interface ScoredProtocol {
  implied: number;
  multiple: number;
  offsetDex: number;
  powerSlope: number;
  comps_n: number;
  median: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  crashGuard: number;
  age: number | null;
}

/** The multipliers and the implied value one protocol gets under `model` and `fit`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: PowerLawFit,
  model: ModelConstants = MODEL,
): ScoredProtocol {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clampedGrowth(protocol, model);
  const growthMult = growthMultiplier(growthPct, model);
  const maturityMult = maturityMultiplier(age, model);
  const breadthMult = breadthMultiplier(protocol, model);
  const guard = crashGuard(protocol, model);
  const entry = protocol.category === null ? undefined : fit.by_category.get(protocol.category);
  const offsetDex = entry === undefined ? 0 : entry.offset_dex;
  const comps_n = entry === undefined ? 0 : entry.comps_n;
  const median = entry === undefined ? null : entry.median_ratio;
  const base = 10 ** (fit.intercept + fit.slope * Math.log10(protocol.tvl_usd) + offsetDex);
  const multiple = base / protocol.tvl_usd;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult * guard));
  return { implied, multiple, offsetDex, powerSlope: fit.slope, comps_n, median, growthPct, growthMult, maturityMult, breadthMult, crashGuard: guard, age };
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

/** One validation test: fit the power law on `train`, predict `test` two ways — the power-law
 * core alone, and the full model with its category, growth, maturity and breadth terms — and
 * score both against the flat global-median baseline on the same test set. */
function runTest(name: string, train: SnapshotProtocol[], test: SnapshotProtocol[], asOf: string, model: ModelConstants): {
  core: ValidationTest;
  full: ValidationTest;
  logErrors: number[];
  actual: number[];
  predictedCore: number[];
} {
  const fit = fitPowerLaw(train, model);
  const flat = fit.global_median;
  const actual: number[] = [];
  const predictedCore: number[] = [];
  const predictedFull: number[] = [];
  const flatPredicted: number[] = [];
  const logErrors: number[] = [];
  for (const p of test) {
    const v = impliedValue(p, asOf, fit, model);
    actual.push(p.mcap_usd!);
    predictedCore.push(Math.max(1, Math.round(10 ** (fit.intercept + fit.slope * Math.log10(p.tvl_usd)))));
    predictedFull.push(v.implied);
    flatPredicted.push(Math.max(1, Math.round(p.tvl_usd * flat)));
    logErrors.push(Math.log10(predictedCore[predictedCore.length - 1]!) - Math.log10(p.mcap_usd!));
  }
  const coreSp = spearman(actual, predictedCore);
  const fullSp = spearman(actual, predictedFull);
  const flatSp = spearman(actual, flatPredicted);
  const base = { name, train_n: train.length, test_n: test.length };
  const core: ValidationTest = {
    ...base,
    spearman: round4(coreSp),
    log_r2: round4(logR2(actual, predictedCore)),
    mape_pct: round4(mape(actual, predictedCore)),
    within2x_pct: round4(within2x(actual, predictedCore)),
    flat_spearman: round4(flatSp),
    flat_mape_pct: round4(mape(actual, flatPredicted)),
    beats_flat_pp: round4((coreSp - flatSp) * 100),
  };
  const full: ValidationTest = {
    ...base,
    spearman: round4(fullSp),
    log_r2: round4(logR2(actual, predictedFull)),
    mape_pct: round4(mape(actual, predictedFull)),
    within2x_pct: round4(within2x(actual, predictedFull)),
    flat_spearman: round4(flatSp),
    flat_mape_pct: round4(mape(actual, flatPredicted)),
    beats_flat_pp: round4((fullSp - flatSp) * 100),
  };
  return { core, full, logErrors, actual, predictedCore };
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
  // Confidence factors from the power-law core's held-out log-errors: 10th and 90th percentile.
  const errs = [...held.logErrors].sort((a, b) => a - b);
  const p10 = percentile(errs, 0.1) ?? -0.5;
  const p90 = percentile(errs, 0.9) ?? 0.5;
  const ciLow = round4(10 ** p10);
  const ciHigh = round4(10 ** p90);
  const absErrs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const medAbs = medianOf(absErrs) ?? 0.3;
  const typicalFactor = round4(10 ** medAbs);
  // Calibration: the held-out core predictions cut into five quintiles by predicted value.
  const pairs = held.actual.map((a, i) => ({ actual: a, predicted: held.predictedCore[i]! })).sort((a, b) => a.predicted - b.predicted);
  const calibration: CalibrationBin[] = [];
  const binSize = Math.ceil(pairs.length / 5);
  for (let q = 0; q < 5; q++) {
    const bin = pairs.slice(q * binSize, (q + 1) * binSize);
    if (bin.length === 0) continue;
    const medP = medianOf(bin.map((b) => b.predicted).sort((a, b) => a - b)) ?? 0;
    const medA = medianOf(bin.map((b) => b.actual).sort((a, b) => a - b)) ?? 0;
    calibration.push({ quintile: q + 1, n: bin.length, median_predicted_usd: Math.round(medP), median_actual_usd: Math.round(medA), ratio: medA > 0 ? round4(medP / medA) : 0 });
  }
  // Model comparison on the held-out set: the full model, the power law alone, the flat baseline, TVL alone.
  const tvlSpearman = spearman(held.actual, testH.map((p) => p.tvl_usd));
  const flatMedian = fitPowerLaw(trainH, model).global_median;
  const flatPredicted = testH.map((p) => Math.max(1, Math.round(p.tvl_usd * flatMedian)));
  const modelComparison = [
    { model: 'Full model (power law + category + growth + age)', spearman: held.full.spearman, log_r2: held.full.log_r2, mape_pct: held.full.mape_pct },
    { model: 'Power law alone (no category, no growth)', spearman: held.core.spearman, log_r2: held.core.log_r2, mape_pct: held.core.mape_pct },
    { model: 'Flat global median', spearman: held.core.flat_spearman, log_r2: round4(logR2(held.actual, flatPredicted)), mape_pct: held.core.flat_mape_pct },
    { model: 'TVL alone (rank only)', spearman: round4(tvlSpearman), log_r2: 0, mape_pct: null },
  ];
  return { held_out: held.core, held_out_full: held.full, walk_forward: walk.core, walk_forward_full: walk.full, ci_low_factor: ciLow, ci_high_factor: ciHigh, median_abs_log_error_dex: round4(medAbs), typical_factor: typicalFactor, calibration, model_comparison: modelComparison };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The watchlist rows: every slug the snapshot still carries, kept by slug. */
function watchlistRows(snapshot: Snapshot, index: Map<string, SnapshotProtocol>): Map<string, SnapshotProtocol> {
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  return chosen;
}

/**
 * The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
 * replacement for a watchlist row: a chosen protocol stays chosen.
 */
function earlyRows(snapshot: Snapshot, chosen: Map<string, SnapshotProtocol>): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, validation?: ValidationReport): BoardRow[] {
  const fit = fitPowerLaw(snapshot.protocols, model);
  const val = validation ?? validateModel(snapshot, model);
  const chosen = watchlistRows(snapshot, bySlug(snapshot.protocols));
  for (const p of earlyRows(snapshot, chosen)) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    implied_value_usd: s.implied,
    implied_low_usd: Math.max(1, Math.round(s.implied * val.ci_low_factor)),
    implied_high_usd: Math.max(1, Math.round(s.implied * val.ci_high_factor)),
    model: {
      category_multiple: round4(s.multiple),
      power_slope: s.powerSlope,
      category_offset_dex: s.offsetDex,
      comps_n: s.comps_n,
      category_median: s.median === null ? null : round4(s.median),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      crash_guard: s.crashGuard,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied, s.multiple).map(stepText),
  }));
}

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
 * Capital tiers: one farm position's size follows the protocol's own TVL, so a farmer never
 * over-commits to a small pool or under-farms a giant one.
 */
const CAPITAL_TIERS: { atLeast: number; capital: number }[] = [
  { atLeast: 5_000_000_000, capital: 250 },
  { atLeast: 1_000_000_000, capital: 150 },
  { atLeast: 100_000_000, capital: 100 },
  { atLeast: 0, capital: 50 },
];

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  for (const tier of CAPITAL_TIERS) {
    if (p.tvl_usd >= tier.atLeast) return tier.capital;
  }
  return 50;
}

/**
 * Hold tiers: younger protocols get a longer qualifying window, because a token decision
 * takes longer to arrive for a protocol that only just listed.
 */
const HOLD_TIERS: { youngerThan: number | null; days: number }[] = [
  { youngerThan: 180, days: 60 },
  { youngerThan: 365, days: 45 },
  { youngerThan: null, days: 30 },
];

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  for (const tier of HOLD_TIERS) {
    if (tier.youngerThan === null || age < tier.youngerThan) return tier.days;
  }
  return 30;
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

/** The whole plan's gas: the first transaction, the setup, and one weekly action a week. */
function totalGasFor(capital: number, hold: number): number {
  const setupGas = capital >= 150 ? 8 : 4;
  return 3 + setupGas + 2 * Math.ceil(hold / 7);
}

/** The net verdict: whether this row's implied value justifies the plan's cost. */
export function verdictFor(implied: number, multiple: number): { label: string; reason: string } {
  if (implied >= 10_000_000 && multiple >= 0.25) {
    return { label: 'Farm', reason: 'the sector prices strongly and the value justifies the gas' };
  }
  if (implied < 1_000_000) {
    return { label: 'Thin — smallest size only, or skip', reason: 'the value is under $1M, so the gas is a large share of any airdrop' };
  }
  return { label: 'Farm with the standard size', reason: 'the value justifies the position' };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age, implied value,
 * multiple), never from a hand-written list of names. The last step before the claim nets
 * the plan: the whole gas cost against the row's implied value, with a verdict.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, multiple: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  const gas = capital >= 150 ? 8 : 4;
  const totalGas = totalGasFor(capital, hold);
  const verdict = verdictFor(implied, multiple);
  const holdText =
    age === null
      ? `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`
      : `Hold the position for at least ${hold} days — ${p.name} was listed ${age} days ago with no token, so a ${hold}-day window covers more than one snapshot.`;
  return [
    step(`Open a fresh wallet on ${chain} and fund it with $${capital} plus about $${gas} for gas. Keep the seed phrase offline.`, `$${capital} of capital and about $${gas} of gas`, '10 minutes'),
    step(action, `$${capital} of capital and about $${gas} of gas`, '15 minutes to set up'),
    step(weekly, 'about $2 of gas a week', '10 minutes a week'),
    step(holdText, `the $${capital} stays in the position`, `${hold} days`),
    step(`Net: about $${totalGas} of gas over ${hold} days plus $${capital} of capital, against an implied value of ${fmtCompact(implied)} at ${multiple.toFixed(2)}x. Verdict: ${verdict.label} — ${verdict.reason}.`, `about $${totalGas} of gas in total`, `${hold} days`),
    step(`Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, 'no fee to check, and never pay to claim', '10 minutes'),
    step(`Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, 'nothing but the log', '5 minutes'),
  ];
}

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
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    category_multiple: row.model.category_multiple,
    power_slope: row.model.power_slope,
    category_offset_dex: row.model.category_offset_dex,
    comps_n: row.model.comps_n,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    crash_guard: row.model.crash_guard,
  };
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

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const validation = validateModel(snapshot, model);
  const board = buildBoard(snapshot, model, validation);
  const live = liveRows(snapshot);
  const fit = fitPowerLaw(snapshot.protocols, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const compsList = [...fit.by_category.values()].sort((a, b) => b.comps_n - a.comps_n || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    global_median_ratio: fit.global_median,
    power_law: { intercept: fit.intercept, slope: fit.slope },
    comps: compsList,
    rows: board.map(radarRow),
    live,
    comparables: comparableRows(snapshot),
    validation,
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
