// The token radar's model, version 3: comps-calibrated valuation with a breadth
// and crash-guard signal.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every other rankable pre-token protocol below the floor: the early rows the radar exists to
// find. A protocol is pre-token when its index entry records no token (no market cap, no
// CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.
//
// Implied value is calibrated on the snapshot's own live-token protocols, the comparables:
//
//   global   = median(mcap_usd / tvl_usd) over every live-token protocol with a market cap
//   cat_med  = median(mcap_usd / tvl_usd) over the live-token protocols in the same category
//   multiple = clamp((n * cat_med + SHRINK_K * global) / (n + SHRINK_K), MULT_MIN, MULT_MAX)
//              (n = 0 in the category: the global median, unshrunk)
//   base       = tvl_usd x multiple
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
// The shrinkage pulls thin categories toward the market-wide median, so one odd comparable
// cannot set a whole sector's multiple, and the clamp keeps every multiple inside the range the
// live market actually shows. No protocol name is ever special-cased: the same function scores
// every row, and the dashboard shows each row's multiple, its comparables and the arithmetic.

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
export const MODEL_VERSION = 'radar-3-breadth';

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
  model: {
    category_multiple: number;
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
  category_multiple: number;
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

/** One category's comparables: how its multiple was set. */
export interface CategoryComp {
  category: string;
  comps_n: number;
  median_ratio: number | null;
  multiple: number;
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

/** Everything the dashboard needs: the board, the live set, the comps and the model it runs. */
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
  comps: CategoryComp[];
  rows: RadarRow[];
  live: LiveRow[];
  comparables: ComparableRow[];
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
function compRatios(snapshot: Snapshot): { all: number[]; byCat: Map<string, number[]> } {
  const all: number[] = [];
  const byCat = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
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

export function computeComps(snapshot: Snapshot, model: ModelConstants = MODEL): CompsTable {
  const { all, byCat } = compRatios(snapshot);
  all.sort((a, b) => a - b);
  const global = medianOf(all) ?? 0.25;
  const by_category = new Map<string, CategoryComp>();
  for (const [cat, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    const med = medianOf(ratios);
    const n = ratios.length;
    by_category.set(cat, { category: cat, comps_n: n, median_ratio: med, multiple: round4(shrunkMultiple(med, n, global, model)) });
  }
  return { global_median: round4(global), by_category };
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
  comps_n: number;
  median: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  crashGuard: number;
  age: number | null;
}

/** The multipliers and the implied value one protocol gets under `model` and `comps`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: CompsTable,
  model: ModelConstants = MODEL,
): ScoredProtocol {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clampedGrowth(protocol, model);
  const growthMult = growthMultiplier(growthPct, model);
  const maturityMult = maturityMultiplier(age, model);
  const breadthMult = breadthMultiplier(protocol, model);
  const guard = crashGuard(protocol, model);
  const { multiple, comps_n, median } = multipleFor(protocol.category, comps, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult * guard));
  return { implied, multiple, comps_n, median, growthPct, growthMult, maturityMult, breadthMult, crashGuard: guard, age };
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

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The watchlist rows: every slug the snapshot still carries, kept by slug. */
function watchlistRows(snapshot: Snapshot, index: Map<string, SnapshotProtocol>): Map<string, SnapshotProtocol> {
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
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
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = computeComps(snapshot, model);
  const chosen = watchlistRows(snapshot, bySlug(snapshot.protocols));
  for (const p of earlyRows(snapshot, chosen)) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, model);
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
    model: {
      category_multiple: s.multiple,
      comps_n: s.comps_n,
      category_median: s.median === null ? null : round4(s.median),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      crash_guard: s.crashGuard,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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
  {
    keywords: ['lend', 'cdp', 'collateral'],
    action: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
  },
  {
    keywords: ['dex', 'yield', 'leveraged farm'],
    action: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
  },
  {
    keywords: ['bridge'],
    action: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
  },
  {
    keywords: ['staking', 'restak'],
    action: (name, capital) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`,
  },
  {
    keywords: ['perpetual', 'derivative'],
    action: (name, capital) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
  },
  {
    keywords: ['prediction'],
    action: (name, capital) => `Fund $${capital} and place one market position on ${name}.`,
  },
  {
    keywords: ['curator', 'allocator'],
    action: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
  },
  {
    keywords: ['stable'],
    action: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
  },
  {
    keywords: ['rwa'],
    action: (name, capital, chain) => `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`,
  },
  {
    keywords: ['insurance'],
    action: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
  },
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
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    step(
      `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      'under $3 of gas for the first transaction',
      '5 minutes',
    ),
    step(action, `$${capital} of capital and about $${gas} of gas`, '15 minutes to set up'),
    step(
      `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      'about $2 of gas a week',
      '10 minutes a week',
    ),
    step(
      `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    step(
      `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      'no fee to check, and never pay to claim',
      '10 minutes',
    ),
    step(
      `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      'nothing but the log',
      '5 minutes',
    ),
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
    category_multiple: row.model.category_multiple,
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
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = computeComps(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const compsList = [...comps.by_category.values()].sort((a, b) => b.comps_n - a.comps_n || (a.category < b.category ? -1 : 1));
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
    global_median_ratio: comps.global_median,
    comps: compsList,
    rows: board.map(radarRow),
    live,
    comparables: comparableRows(snapshot),
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
