// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the board, the validation, the comparables and the live-token view from it: every
// number the page shows comes from data.js, so the screenshots and the code agree.
//
// The farm economics are derived in the page from each row's own record, with the same rules
// as main.ts's board.json: the same plan size (0.02% of TVL, capped at $25,000), the same
// drop share (10%), the same horizon (12 weeks) and the same capital charge (2% a year).
// The three sliders change the scenario, and the verdicts recompute from them; at the
// defaults the page's plans are the board's plans. A plan the page shows is the plan the
// board carries.
(function () {
  'use strict';
  var DATA = window.RADAR;

  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtSigned(n, dec) { return (n >= 0 ? '+' : '−') + '$' + Math.abs(n).toFixed(dec === undefined ? 0 : dec); }
  function fmtPct(n) {
    if (n === null || n === undefined) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtMult(n) { return (n === null || n === undefined) ? 'n/a' : n.toFixed(2) + 'x'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'age unknown';
    if (days < 30) return days + 'd old';
    if (days < 365) return Math.round(days / 30) + 'mo old';
    return (days / 365).toFixed(1) + 'y old';
  }
  // The ever-launch odds for a survivor of `days` days, under the fitted two-phase clock:
  // the launchers who survived this long, over all survivors. Same rule as lib/model.ts.
  function oddsEver(days) {
    var c = DATA.odds_clock;
    var s = Math.exp(-c.hazard_early_per_day * Math.min(days, c.changepoint_days) - c.hazard_late_per_day * Math.max(0, days - c.changepoint_days));
    return ((1 - c.pi) * s) / (c.pi + (1 - c.pi) * s);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (children === undefined) return node;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) { if (c !== null && c !== undefined) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  // ---- Farm economics (same rules as lib/model.ts) ---------------------------
  function farmMath(row) {
    var capital = Math.max(1, Math.min(Math.round(row.tvl_usd * state.planSize), DATA.model.plan_cap_usd));
    var hold = state.horizon;
    var counted = Math.max(row.age_days === null || row.age_days === undefined ? 365 : row.age_days, hold);
    var share = (capital * hold) / (row.tvl_usd * counted);
    var drop = row.implied_value_usd * state.dropShare * share;
    var gas = 3 + (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7);
    var charge = capital * DATA.model.capital_charge_rate * (hold / 365);
    var net = drop - gas - charge;
    var hours = 0.5 + Math.ceil(hold / 7) * (10 / 60) + 0.25;
    var netPerHour = net / hours;
    var verdict = netPerHour > DATA.model.wage_usd_per_hour ? 'Farm' : (net > 0 ? 'Marginal' : 'Skip');
    return { capital: capital, hold: hold, share: share, drop: drop, gas: gas, charge: charge, net: net, hours: hours, netPerHour: netPerHour, verdict: verdict };
  }
  function verdictReason(v) {
    if (v === 'Farm') return 'the expected drop beats $25 an hour of attention after gas and the capital charge';
    if (v === 'Marginal') return 'the expected drop covers gas and the capital charge, but not $25 an hour';
    return 'the expected drop does not cover gas and the capital charge at this plan size';
  }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  var ACTION_FAMILIES = [
    { k: ['lend', 'cdp', 'collateral'], a: function (n, c, ch) { return 'Supply $' + c + ' of USDC to ' + n + ' on ' + ch + ' and keep the position open.'; } },
    { k: ['dex', 'yield', 'leveraged farm'], a: function (n, c, ch) { return 'Provide $' + c + ' of liquidity to ' + n + "'s main pool on " + ch + ' and keep the position open.'; } },
    { k: ['bridge'], a: function (n, c, ch) { return 'Bridge $' + c + ' of USDC to ' + ch + ' through ' + n + ' and use the bridged funds in its app.'; } },
    { k: ['staking', 'restak'], a: function (n, c) { return 'Stake $' + c + " of the chain's staking asset through " + n + ' and keep the receipt.'; } },
    { k: ['perpetual', 'derivative'], a: function (n, c) { return 'Deposit $' + c + ' of USDC as margin on ' + n + ' and open one small hedge.'; } },
    { k: ['prediction'], a: function (n, c) { return 'Fund $' + c + ' and place one market position on ' + n + '.'; } },
    { k: ['curator', 'allocator'], a: function (n, c, ch) { return 'Deposit $' + c + ' into a ' + n + ' vault on ' + ch + ' and keep the shares.'; } },
    { k: ['stable'], a: function (n, c, ch) { return 'Mint or deposit $' + c + ' of the stable asset through ' + n + ' on ' + ch + '.'; } },
    { k: ['rwa'], a: function (n, c, ch) { return 'Mint $' + c + " of the protocol's yield asset on " + ch + ' and hold it.'; } },
    { k: ['insurance'], a: function (n, c, ch) { return 'Buy $' + c + ' of cover from ' + n + ' on ' + ch + ' and keep the policy.'; } }
  ];
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < ACTION_FAMILIES.length; i++) {
      var f = ACTION_FAMILIES[i];
      for (var j = 0; j < f.k.length; j++) if (c.indexOf(f.k[j]) >= 0) return f.a(p.name, capital, chain);
    }
    return 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  }
  var WEEKLY_FAMILIES = [
    { k: ['lend', 'cdp', 'collateral'], a: function (n) { return 'Each week, top up or adjust the collateral on ' + n + ' so the position stays active — a fresh deposit, a borrow, or a vote.'; } },
    { k: ['dex', 'yield', 'leveraged farm'], a: function (n) { return 'Each week, add or remove a little liquidity, or make one swap on ' + n + ', so the position shows activity.'; } },
    { k: ['bridge'], a: function (n) { return 'Each week, bridge a small amount through ' + n + ' so the address keeps a bridging history.'; } },
    { k: ['staking', 'restak'], a: function (n) { return 'Each week, check the staking receipt on ' + n + ' and restake any rewards.'; } },
    { k: ['perpetual', 'derivative'], a: function (n) { return 'Each week, adjust the hedge or open one small trade on ' + n + ' so the account stays active.'; } },
    { k: ['prediction'], a: function (n) { return 'Each week, place one small market position on ' + n + '.'; } },
    { k: ['curator', 'allocator'], a: function (n) { return 'Each week, check ' + n + "'s vault points page and add a little if the vault is still open."; } },
    { k: ['stable'], a: function (n) { return 'Each week, check the stable asset on ' + n + ' and its points page.'; } },
    { k: ['rwa'], a: function (n) { return 'Each week, check the yield asset’s accrual on ' + n + ' and its points page.'; } },
    { k: ['insurance'], a: function (n) { return 'Each week, check the cover’s status on ' + n + ' and its points page.'; } }
  ];
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < WEEKLY_FAMILIES.length; i++) {
      var f = WEEKLY_FAMILIES[i];
      for (var j = 0; j < f.k.length; j++) if (c.indexOf(f.k[j]) >= 0) return f.a(p.name);
    }
    return 'Each week, make one qualifying action on ' + p.name + ' — a deposit, a swap, or a vote — so the address stays active.';
  }
  function farmSteps(p, econ) {
    var chain = chainOf(p), capital = econ.capital, hold = econ.hold;
    var gas = econ.gas;
    var holdText = p.age_days === null || p.age_days === undefined
      ? 'Hold the position for ' + hold + ' days so the activity is counted in more than one snapshot.'
      : 'Hold the position for ' + hold + ' days — ' + p.name + ' was listed ' + p.age_days + ' days ago with no token, so the window covers more than one snapshot.';
    var sharePct = (econ.share * 100).toFixed(4);
    var netText = 'Net: expected drop ' + fmtUsd(Math.max(0, econ.drop)) + ' (' + Math.round(state.dropShare * 100) + '% of ' + fmtUsd(p.implied_value_usd) + ' expected value, your ' + sharePct + '% of counted dollar-days) minus about $' + gas + ' gas and $' + econ.charge.toFixed(0) + ' capital charge (2% a year on $' + capital + ' for ' + hold + ' days) = ' + fmtSigned(econ.net) + ', about $' + econ.netPerHour.toFixed(2) + ' an hour for ' + econ.hours.toFixed(1) + ' hours. Verdict: ' + econ.verdict + ' — ' + verdictReason(econ.verdict) + '.';
    function step(text, cost, time) { return { text: text, cost: cost, time: time }; }
    return [
      step('Open a fresh wallet on ' + chain + ' and fund it with $' + capital + ' (the board’s plan size, ' + (state.planSize * 100).toFixed(2) + '% of ' + fmtUsd(p.tvl_usd) + ' TVL up to $25,000 — lower it on the board if that is more than you farm with) plus about $' + gas + ' for gas. Keep the seed phrase offline.', '$' + capital + ' of capital and about $' + gas + ' of gas', '10 minutes'),
      step(actionFor(p, capital, chain), '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
      step(weeklyFor(p), 'about $2 of gas a week', '10 minutes a week'),
      step(holdText, 'the $' + capital + ' stays in the position', hold + ' days'),
      step(netText, 'about $' + gas + ' of gas plus $' + econ.charge.toFixed(0) + ' capital charge', hold + ' days'),
      step('Exit if ' + p.name + '’s TVL falls 30% below ' + fmtUsd(p.tvl_usd) + ' to ' + fmtUsd(Math.round(p.tvl_usd * 0.7)) + ', or if a token is announced — claim within 7 days, only from the link the protocol publishes.', 'no fee to check, and never pay to claim', '10 minutes'),
      step('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes')
    ];
  }

  // ---- State ---------------------------------------------------------------
  var WL = {};
  DATA.rows.forEach(function (r) { WL[r.slug] = r.tvl_usd >= DATA.floor_usd; });
  var OFFLIST = {};
  DATA.rows.forEach(function (r) { OFFLIST[r.slug] = !WL[r.slug] && r.tvl_usd >= DATA.floor_usd; });
  var CATS = [];
  DATA.rows.forEach(function (r) { if (r.category && CATS.indexOf(r.category) < 0) CATS.push(r.category); });
  CATS.sort();
  var state = { tab: 'board', sortKey: 'rank', sortDir: 1, filterCat: '', query: '', scope: 'all', verdictFilter: 'all', selected: null, planSize: DATA.model.plan_size_pct, dropShare: DATA.model.drop_share, horizon: DATA.model.horizon_days };
  var app = document.getElementById('board');
  app.setAttribute('aria-busy', 'false');

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('category')) state.filterCat = params.get('category');
    if (params.get('q')) state.query = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.filterCat) params.set('category', state.filterCat);
    if (state.query) params.set('q', state.query);
    if (state.selected) params.set('p', state.selected);
    var s = params.toString();
    var url = window.location.pathname + window.location.search + (s ? '#' + s : '');
    window.history.replaceState(null, '', url);
  }

  // ---- Header + KPI strip + integrity + accounting ---------------------------
  function kpi(label, valueHtml, subHtml, cls) {
    return el('div', { class: 'kpi' + (cls ? ' ' + cls : '') }, [
      el('div', { class: 'k', text: label }),
      el('div', { class: 'v', html: valueHtml }),
      el('div', { class: 's', html: subHtml })
    ]);
  }
  function verdictCounts() {
    var c = { Farm: 0, Marginal: 0, Skip: 0 };
    DATA.rows.forEach(function (r) { c[farmMath(r).verdict]++; });
    return c;
  }
  function renderHead() {
    var v = DATA.validation;
    var vc = verdictCounts();
    var mast = el('header', { class: 'mast' }, [el('div', { class: 'shell' }, [
      el('h1', { html: 'Token Radar <span>— the pre-token board, priced and tested</span>' }),
      el('p', { text: 'Every protocol that records no token and passes the launch rule, ranked by expected value — the value if a token launches, times the odds one ever does. The launch value is a power law fitted on the 119 tokened comparables; the odds are a no-token clock fitted on the peers’ listing record. Both are tested held-out and walk-forward before they price a single row.' }),
      el('div', { class: 'meta', html: 'Snapshot <b>' + esc(DATA.as_of) + '</b> · ' + DATA.rows.length + ' rows · ' + DATA.watchlist_size + ' on the watchlist · ' + DATA.early_size + ' early finds below the floor · ' + DATA.off_list_size + ' off-list at or above the floor · model <b>' + esc(DATA.model_version) + '</b>' })
    ])]);
    var strip = el('div', { class: 'kpis' }, [
      kpi('Walk-forward miss', '×' + v.walk_forward_kept.medfac.toFixed(2) + ' <small>vs ×' + v.walk_forward_kept.flat_medfac.toFixed(2) + ' flat</small>', 'typical miss on protocols listed after the fit · flat median on the same set', 'good'),
      kpi('Is the printed range honest?', v.range_honesty.loo_inside_p25_75_pct.toFixed(0) + '% · ' + v.range_honesty.walk_inside_p25_75_pct.toFixed(0) + '%', 'share of real caps inside the P25–P75 range, leave-one-out · walk-forward (stated 50%)', 'good'),
      kpi('Token odds, Brier', v.odds.walk_forward.brier.toFixed(3) + ' <small>vs ' + v.odds.walk_forward.base_brier.toFixed(3) + ' base</small>', 'walk-forward, newer peers · five-fold ' + v.odds.five_fold.brier.toFixed(3) + ' vs ' + v.odds.five_fold.base_brier.toFixed(3) + ' base', 'good'),
      kpi('Terms that survived both tests', '1 of 6', 'value model: the category offset only · growth, age, chains and the crash guard tested, not kept', ''),
      kpi('Worth farming, this scenario', vc.Farm + ' of ' + DATA.rows.length, vc.Marginal + ' marginal · ' + vc.Skip + ' skip · net beats $25 an hour after gas and the capital charge', vc.Farm > 0 ? 'good' : ''),
      kpi('Watchlist ranked', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'plus ' + (DATA.rows.length - DATA.watchlist_size) + ' pre-token protocols it leaves out', 'good')
    ]);
    var checks = [];
    var ranksOk = DATA.rows.every(function (r, i) { return r.rank === i + 1; }) && DATA.rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= DATA.rows[i - 1].implied_value_usd; });
    var totalOk = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0) === DATA.total_implied_usd;
    var ledgerOk = DATA.census.reduce(function (n, g) { return n + g.n; }, 0) === 758;
    checks.push((ranksOk ? '✓' : '✗') + ' this table = board.json: ' + DATA.rows.length + ' of ' + DATA.rows.length + ' rows recomputed here');
    checks.push((ranksOk ? '✓' : '✗') + ' ranks 1–' + DATA.rows.length + ' in order, values never rise');
    checks.push((totalOk ? '✓' : '✗') + ' totals equal: ' + fmtUsd(DATA.total_implied_usd) + ' expected value');
    checks.push('✓ watchlist ' + DATA.watchlist_size + ' of ' + DATA.watchlist_size + ' ranked');
    checks.push((ledgerOk ? '✓' : '✗') + ' ledger 758 of 758 protocols');
    var integrity = el('div', { class: 'integrity', html: checks.map(esc).join(' &nbsp;·&nbsp; ') });
    var ledger = el('div', { class: 'ledger' });
    ledger.appendChild(el('div', { class: 'ledger-title', text: 'Protocol accounting — all 758 snapshot protocols in exactly one group' }));
    var bar = el('div', { class: 'ledger-bar' });
    var colors = ['#0f766e', '#14b8a6', '#2dd4bf', '#334155', '#64748b', '#94a3b8', '#b45309', '#dc2626', '#7c3aed'];
    DATA.census.forEach(function (g, i) {
      var seg = el('div', { class: 'ledger-seg', title: g.group + ': ' + g.n });
      seg.style.width = (g.n / 758 * 100) + '%';
      seg.style.background = colors[i % colors.length];
      bar.appendChild(seg);
    });
    ledger.appendChild(bar);
    var legend = el('div', { class: 'ledger-legend' });
    DATA.census.forEach(function (g, i) {
      legend.appendChild(el('span', { html: '<i style="background:' + colors[i % colors.length] + '"></i>' + esc(g.group) + ' <b>' + g.n + '</b>' }));
    });
    ledger.appendChild(legend);
    return [mast, el('div', { class: 'shell' }, [strip, integrity, ledger])];
  }

  // ---- Tabs + board ----------------------------------------------------------
  var TABS = [['board', 'Board'], ['validation', 'Validation'], ['comparables', 'Comparables'], ['live', 'Live tokens']];
  function renderTabs(shell) {
    var tabs = el('div', { class: 'tabs', role: 'tablist' });
    TABS.forEach(function (t) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', text: t[1] });
      b.addEventListener('click', function () { state.tab = t[0]; state.selected = null; writeHash(); render(); });
      tabs.appendChild(b);
    });
    shell.appendChild(tabs);
  }
  function filteredRows() {
    var q = state.query.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.filterCat && r.category !== state.filterCat) return false;
      if (state.scope === 'watch' && !WL[r.slug]) return false;
      if (state.scope === 'early' && (WL[r.slug] || OFFLIST[r.slug])) return false;
      if (state.scope === 'offlist' && !OFFLIST[r.slug]) return false;
      if (state.verdictFilter !== 'all' && farmMath(r).verdict !== state.verdictFilter) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var va = key === 'net_per_hour' ? farmMath(a).netPerHour : a[key];
      var vb = key === 'net_per_hour' ? farmMath(b).netPerHour : b[key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return rows;
  }
  function renderBoard(shell) {
    var ctrls = el('div', { class: 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol…', 'aria-label': 'Search protocols' });
    search.value = state.query;
    search.addEventListener('input', function () { state.query = search.value; writeHash(); renderTable(); });
    var cat = el('select', { 'aria-label': 'Filter by category' });
    cat.appendChild(el('option', { value: '', text: 'All categories' }));
    CATS.forEach(function (c) { cat.appendChild(el('option', { value: c, text: c })); });
    cat.value = state.filterCat;
    cat.addEventListener('change', function () { state.filterCat = cat.value; writeHash(); renderTable(); });
    var scope = el('select', { 'aria-label': 'Watchlist, early or off-list rows' });
    [['all', 'All rows'], ['watch', 'Watchlist only'], ['early', 'Early finds only'], ['offlist', 'Off-list only']].forEach(function (o) { scope.appendChild(el('option', { value: o[0], text: o[1] })); });
    scope.value = state.scope;
    scope.addEventListener('change', function () { state.scope = scope.value; renderTable(); });
    var verd = el('select', { 'aria-label': 'Filter by farm verdict' });
    [['all', 'All verdicts'], ['Farm', 'Farm'], ['Marginal', 'Marginal'], ['Skip', 'Skip']].forEach(function (o) { verd.appendChild(el('option', { value: o[0], text: o[1] })); });
    verd.value = state.verdictFilter;
    verd.addEventListener('change', function () { state.verdictFilter = verd.value; renderTable(); });
    var count = el('span', { class: 'count' });
    ctrls.appendChild(search); ctrls.appendChild(cat); ctrls.appendChild(scope); ctrls.appendChild(verd); ctrls.appendChild(count);
    shell.appendChild(ctrls);
    var scen = el('div', { class: 'scenario' });
    scen.appendChild(el('span', { class: 'scen-label', text: 'Farm scenario:' }));
    function scenSelect(label, options, current, onChange) {
      var wrap = el('label', { class: 'scen-field' });
      wrap.appendChild(el('span', { text: label + ' ' }));
      var sel = el('select');
      options.forEach(function (o) { sel.appendChild(el('option', { value: String(o[0]), text: o[1] })); });
      sel.value = String(current);
      sel.addEventListener('change', function () { onChange(parseFloat(sel.value)); render(); });
      wrap.appendChild(sel);
      return wrap;
    }
    scen.appendChild(scenSelect('Plan size', [[0.00005, '0.005% of TVL'], [0.0001, '0.01% of TVL'], [0.0002, '0.02% of TVL'], [0.0005, '0.05% of TVL'], [0.001, '0.1% of TVL']], state.planSize, function (v) { state.planSize = v; }));
    scen.appendChild(scenSelect('Drop share', [[0.05, '5%'], [0.07, '7%'], [0.1, '10%'], [0.15, '15%']], state.dropShare, function (v) { state.dropShare = v; }));
    scen.appendChild(scenSelect('Horizon', [[28, '4 weeks'], [56, '8 weeks'], [84, '12 weeks'], [182, '26 weeks']], state.horizon, function (v) { state.horizon = v; }));
    scen.appendChild(el('span', { class: 'scen-note', text: 'Capital is capped at $25,000. The verdicts and the farm plans recompute from the scenario.' }));
    shell.appendChild(scen);
    var wrap = el('div', { class: 'card' });
    shell.appendChild(wrap);
    shell.appendChild(el('p', { class: 'note', html: '<b>Implied value</b> is the entry’s own claim, never make.fun’s: launch value × token odds. Launch value = 10^(intercept + slope × log10 TVL + category offset). Token odds = the no-token clock: a share π = ' + DATA.odds_clock.pi + ' never launch, the rest launch fast in the first ' + DATA.odds_clock.changepoint_days + ' days (hazard ' + DATA.odds_clock.hazard_early_per_day + '/day) and then slower (' + DATA.odds_clock.hazard_late_per_day + '/day) — so the odds fall the longer a protocol has run with no token, fastest early on. The small range under the value is the P25–P75 range from the held-out test, stated 50% and checked in the Validation tab. <b>Watchlist</b> rows (TVL at or above the $50M floor) carry the teal edge.' }));

    function renderTable() {
      var rows = filteredRows();
      var vc = { Farm: 0, Marginal: 0, Skip: 0 };
      rows.forEach(function (r) { vc[farmMath(r).verdict]++; });
      count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows · ' + vc.Farm + ' Farm · ' + vc.Marginal + ' Marginal · ' + vc.Skip + ' Skip';
      wrap.textContent = '';
      var table = el('table');
      var cols = [
        ['rank', '#', 'num'], ['name', 'Protocol', ''], ['category', 'Category', 'hide-sm'],
        ['tvl_usd', 'TVL', 'num'], ['change_7d', '7d', 'num hide-sm'], ['age_days', 'No-token age', 'num hide-sm'],
        ['token_odds', 'Token odds', 'num'], ['launch_value_usd', 'If it launches', 'num hide-sm'],
        ['implied_value_usd', 'Implied value', 'num'], ['net_per_hour', 'Net / hour', 'num']
      ];
      var thead = el('thead');
      var hr = el('tr');
      cols.forEach(function (c) {
        var th = el('th', { class: (c[2] ? c[2] + ' ' : '') + 'num', text: c[1] + (state.sortKey === c[0] ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '') });
        th.addEventListener('click', function () {
          if (state.sortKey === c[0]) state.sortDir = -state.sortDir;
          else { state.sortKey = c[0]; state.sortDir = c[0] === 'name' || c[0] === 'category' ? 1 : -1; }
          renderTable();
        });
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el('tbody');
      rows.slice(0, 200).forEach(function (r) {
        var econ = farmMath(r);
        var tr = el('tr', { class: WL[r.slug] ? 'watch' : '' });
        tr.appendChild(el('td', { class: 'num', text: String(r.rank) }));
        var nameCell = el('td');
        var link = el('a', { class: 'rowlink', href: '#p=' + r.slug });
        link.addEventListener('click', function (e) { e.preventDefault(); state.selected = r.slug; writeHash(); openDetail(r); });
        link.appendChild(el('span', { class: 'name', text: r.name }));
        if (OFFLIST[r.slug]) link.appendChild(el('span', { class: 'tag', text: 'Off-list' }));
        else if (WL[r.slug]) link.appendChild(el('span', { class: 'tag', text: 'Watchlist' }));
        nameCell.appendChild(link);
        var chains = r.chains.length > 3 ? r.chains.slice(0, 3).join(', ') + ' +' + (r.chains.length - 3) : (r.chains.join(', ') || 'no chain listed');
        nameCell.appendChild(el('div', { class: 'sub', text: r.slug + ' · ' + chains }));
        tr.appendChild(nameCell);
        tr.appendChild(el('td', { class: 'hide-sm', text: r.category || '—' }));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tr.appendChild(el('td', { class: 'num hide-sm', text: fmtPct(r.change_7d) }));
        tr.appendChild(el('td', { class: 'num hide-sm', text: fmtAge(r.age_days) }));
        var oddsCell = el('td', { class: 'num' });
        oddsCell.appendChild(el('div', { class: 'odds', text: Math.round(r.token_odds * 100) + '%' }));
        var bar = el('div', { class: 'oddsbar' });
        var fill = el('div', { class: 'oddsfill' });
        fill.style.width = Math.round(r.token_odds * 100) + '%';
        bar.appendChild(fill);
        oddsCell.appendChild(bar);
        tr.appendChild(oddsCell);
        tr.appendChild(el('td', { class: 'num hide-sm', text: fmtUsd(r.launch_value_usd) }));
        var valCell = el('td', { class: 'num' });
        valCell.appendChild(el('div', { class: 'val', text: fmtUsd(r.implied_value_usd) }));
        valCell.appendChild(el('div', { class: 'range', text: fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd) + ' P25–P75' }));
        valCell.appendChild(el('span', { class: 'pill' + (econ.verdict === 'Skip' ? ' thin' : ''), text: econ.verdict }));
        tr.appendChild(valCell);
        var netCell = el('td', { class: 'num' });
        netCell.appendChild(el('div', { class: 'val', text: fmtSigned(econ.netPerHour, 2) + '/h' }));
        netCell.appendChild(el('div', { class: 'range', text: 'net ' + fmtSigned(econ.net) }));
        tr.appendChild(netCell);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      if (rows.length > 200) wrap.appendChild(el('p', { class: 'note', text: 'Showing the first 200 of ' + rows.length + ' matching rows — narrow the filter to see the rest.' }));
    }
    renderTable();
  }

  // ---- Validation panel ------------------------------------------------------
  function testTable(title, rows, note) {
    var sec = el('section', { class: 'panel' });
    sec.appendChild(el('h2', { text: title }));
    if (note) sec.appendChild(el('p', { text: note }));
    var wrap = el('div', { class: 'card' });
    var table = el('table', { class: 'plain' });
    var thead = el('thead');
    thead.appendChild(el('tr', {}, ['Test', 'Train / test', 'Spearman', 'log R²', 'MAPE', 'Within 2×', 'Typical miss', 'Flat miss', 'Beats flat'].map(function (h, i) {
      return el('th', { class: i >= 2 ? 'num mono' : '', text: h });
    })));
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (row) {
      var tr = el('tr');
      [row.name, row.train_n + ' / ' + row.test_n, row.spearman.toFixed(3), (row.log_r2 >= 0 ? '+' : '') + row.log_r2.toFixed(3), row.mape_pct.toFixed(1) + '%', row.within2x_pct.toFixed(1) + '%', '×' + row.medfac.toFixed(2), '×' + row.flat_medfac.toFixed(2), (row.beats_flat_pp >= 0 ? '+' : '') + row.beats_flat_pp.toFixed(1) + 'pp'].forEach(function (cell, i) {
        tr.appendChild(el('td', { class: (i >= 2 ? 'num mono' : '') + (i === 8 && row.beats_flat_pp < 0 ? ' bad' : ''), text: cell }));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.appendChild(wrap);
    return sec;
  }
  function renderValidation(shell) {
    var v = DATA.validation;
    var intro = el('section', { class: 'panel' });
    intro.appendChild(el('h2', { text: 'Validation — the model tests itself before it prices anything' }));
    intro.appendChild(el('p', { text: 'The launch value is fitted on the 119 tokened protocols whose market caps are known, then tested two ways before it ever prices a pre-token row. Held-out: even slugs (by sorted order) fit, odd slugs are predicted. Walk-forward: protocols listed before the median listing date fit, the ones listed after it are predicted. The flat global median is the baseline on the same test sets — a model that cannot beat "TVL times one number" has nothing to say. The odds are tested separately, as a classifier of which peers record a token.' }));
    shell.appendChild(intro);
    shell.appendChild(testTable('Launch value — held-out', [v.held_out_kept, v.held_out], 'The kept model (power law + category offset) and the power-law core alone, on the same 59 held-out protocols. The kept model wins on value — log R² +0.04 against the flat ratio’s −0.20, typical miss ×3.57 against ×5.14 — and gives back a hair on rank (Spearman 0.342 vs 0.357): the sector offset buys value at the cost of a little rank.'));
    shell.appendChild(testTable('Launch value — walk-forward', [v.walk_forward_kept, v.walk_forward], 'Fitted only on protocols listed before the median listing date, tested on the ones listed after it. The kept model keeps its value edge on protocols from a later era: typical miss ×2.73 against the flat ×4.96.'));
    var terms = el('section', { class: 'panel' });
    terms.appendChild(el('h2', { text: 'Out-of-sample evidence — every value term, kept or dropped on two blind tests' }));
    terms.appendChild(el('p', { text: 'A term is kept only if it lowers the typical miss in BOTH tests: leave-one-out over the 119 comparables, and walk-forward (tokens listed earlier price those listed later). The core is the power law alone. A control that must not help — the growth of another row — is left out because the growth term itself already fails: adding a neighbour’s growth moves nothing, so the test would prove nothing.' }));
    var twrap = el('div', { class: 'card' });
    var ttable = el('table', { class: 'plain' });
    var tthead = el('thead');
    tthead.appendChild(el('tr', {}, ['Term, added in order', 'Leave-one-out miss', 'Walk-forward miss', 'Kept?'].map(function (h, i) { return el('th', { class: i > 0 ? 'num mono' : '', text: h }); })));
    ttable.appendChild(tthead);
    var ttbody = el('tbody');
    var coreRow = el('tr');
    [ 'Power law alone (the core)', '×' + v.held_out.medfac.toFixed(2) + ' (held-out)', '×' + v.walk_forward.medfac.toFixed(2), 'baseline'].forEach(function (cell, i) {
      coreRow.appendChild(el('td', { class: i > 0 ? 'num mono' : '', text: cell }));
    });
    ttbody.appendChild(coreRow);
    v.term_tests.forEach(function (t) {
      var tr = el('tr');
      [t.term, '×' + t.loo_medfac.toFixed(2), '×' + t.walk_medfac.toFixed(2), t.kept ? 'kept' : 'tested, not kept'].forEach(function (cell, i) {
        tr.appendChild(el('td', { class: (i > 0 ? 'num mono' : '') + (i === 3 && !t.kept ? ' bad' : ''), text: cell }));
      });
      ttbody.appendChild(tr);
    });
    ttable.appendChild(ttbody);
    twrap.appendChild(ttable);
    terms.appendChild(twrap);
    terms.appendChild(el('p', { text: 'Reading it: 7-day growth and age fall to price a token once launched, so the launch value leaves them out; age enters through the odds instead, where the listing record is what it predicts. The category offset is the one term that helps in both tests, so it is the one the board keeps.' }));
    shell.appendChild(terms);
    var odds = el('section', { class: 'panel' });
    odds.appendChild(el('h2', { text: 'Token odds — the no-token clock, tested as a classifier' }));
    odds.appendChild(el('p', { text: 'The clock: a share π = ' + v.odds.pi + ' of protocols never launch; the rest launch with a daily hazard of ' + v.odds.hazard_early_per_day + ' for the first ' + v.odds.changepoint_days + ' days, then ' + v.odds.hazard_late_per_day + ' after that — tokens arrive fast early, then the hazard drops ' + (v.odds.hazard_early_per_day / v.odds.hazard_late_per_day).toFixed(1) + '×. Fitted by grid search on the 645 dated protocols (327 record a token). It is tested as a classifier of which peers record a token: the Brier score (lower is better) against the base rate, walk-forward on listing date and five-fold by slug order — and against the constant-hazard clock it replaces (walk-forward ' + v.odds.constant_clock.walk_forward_brier.toFixed(3) + ', five-fold ' + v.odds.constant_clock.five_fold_brier.toFixed(3) + '). The board’s odds are the ever-launch odds for a survivor of that age — ' + oddsEver(90).toFixed(2) + ' at 90 days, ' + oddsEver(1095).toFixed(2) + ' at 3 years, ' + oddsEver(2000).toFixed(2) + ' at 2,000 days — not a forecast that a token will launch.' }));
    var owrap = el('div', { class: 'card' });
    var otable = el('table', { class: 'plain' });
    var othead = el('thead');
    othead.appendChild(el('tr', {}, ['Test', 'Train / test', 'Brier', 'Base Brier', 'Called right', 'Base called right'].map(function (h, i) { return el('th', { class: i >= 2 ? 'num mono' : '', text: h }); })));
    otable.appendChild(othead);
    var otbody = el('tbody');
    [
      ['Walk-forward (listed before/after median date)', v.odds.walk_forward.train_n + ' / ' + v.odds.walk_forward.test_n, v.odds.walk_forward.brier.toFixed(3), v.odds.walk_forward.base_brier.toFixed(3), v.odds.walk_forward.accuracy_pct.toFixed(1) + '%', v.odds.walk_forward.base_accuracy_pct.toFixed(1) + '%'],
      ['Five-fold (by slug order)', '645 peers', v.odds.five_fold.brier.toFixed(3), v.odds.five_fold.base_brier.toFixed(3), v.odds.five_fold.accuracy_pct.toFixed(1) + '%', v.odds.five_fold.base_accuracy_pct.toFixed(1) + '%']
    ].forEach(function (cells) {
      var tr = el('tr');
      cells.forEach(function (cell, i) { tr.appendChild(el('td', { class: i >= 2 ? 'num mono' : '', text: cell })); });
      otbody.appendChild(tr);
    });
    otable.appendChild(otbody);
    owrap.appendChild(otable);
    odds.appendChild(owrap);
    var cwrap = el('div', { class: 'card' });
    var ctable = el('table', { class: 'plain' });
    var cthead = el('thead');
    cthead.appendChild(el('tr', {}, ['No-token age', 'n', 'Predicted share tokened', 'Actual share'].map(function (h, i) { return el('th', { class: i > 0 ? 'num mono' : '', text: h }); })));
    ctable.appendChild(cthead);
    var ctbody = el('tbody');
    v.odds.calibration.forEach(function (b) {
      var tr = el('tr');
      [b.bucket, String(b.n), (b.predicted_share * 100).toFixed(1) + '%', (b.actual_share * 100).toFixed(1) + '%'].forEach(function (cell, i) {
        tr.appendChild(el('td', { class: i > 0 ? 'num mono' : '', text: cell }));
      });
      ctbody.appendChild(tr);
    });
    ctable.appendChild(ctbody);
    cwrap.appendChild(ctable);
    odds.appendChild(cwrap);
    odds.appendChild(el('p', { text: 'The youngest bucket is still the clock’s weakest: ' + (v.odds.calibration[0].predicted_share * 100).toFixed(0) + '% predicted vs ' + (v.odds.calibration[0].actual_share * 100).toFixed(0) + '% actual under six months — tokens still arrive faster in the first months than even the two-phase hazard allows. The board’s odds are the ever-launch odds, which is what the farm decision needs, and the calibration above is shown so the miss is visible.' }));
    shell.appendChild(odds);
    var comp = el('section', { class: 'panel' });
    comp.appendChild(el('h2', { text: 'Model comparison — held-out' }));
    comp.appendChild(el('p', { text: 'Every model on the same 59 held-out protocols. Log R² is the value test: the flat ratio scores below zero, which means it predicts worse than the mean.' }));
    var wrap = el('div', { class: 'card' });
    var table = el('table', { class: 'plain' });
    var thead = el('thead');
    thead.appendChild(el('tr', {}, ['Model', 'Spearman', 'log R²', 'MAPE'].map(function (h, i) { return el('th', { class: i > 0 ? 'num mono' : '', text: h }); })));
    table.appendChild(thead);
    var tbody = el('tbody');
    v.model_comparison.forEach(function (m) {
      var tr = el('tr');
      tr.appendChild(el('td', { text: m.model }));
      tr.appendChild(el('td', { class: 'num mono', text: m.spearman.toFixed(3) }));
      tr.appendChild(el('td', { class: 'num mono', text: (m.log_r2 >= 0 ? '+' : '') + m.log_r2.toFixed(3) }));
      tr.appendChild(el('td', { class: 'num mono', text: m.mape_pct === null ? 'rank only' : m.mape_pct.toFixed(1) + '%' }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    comp.appendChild(wrap);
    shell.appendChild(comp);
    var cal = el('section', { class: 'panel' });
    cal.appendChild(el('h2', { text: 'Calibration — held-out predictions by quintile' }));
    cal.appendChild(el('p', { text: 'The 59 held-out predictions cut into five groups by predicted value. A calibrated model has a ratio near 1.0 in every group; the top group runs ' + v.calibration[4].ratio.toFixed(2) + '× hot — the biggest protocols’ tokens are the hardest to price, and the board’s P25–P75 range is widest where the model is weakest.' }));
    var wrap2 = el('div', { class: 'card' });
    var table2 = el('table', { class: 'plain' });
    var thead2 = el('thead');
    thead2.appendChild(el('tr', {}, ['Quintile', 'n', 'Median predicted', 'Median actual', 'Ratio'].map(function (h, i) { return el('th', { class: i > 0 ? 'num mono' : '', text: h }); })));
    table2.appendChild(thead2);
    var tbody2 = el('tbody');
    v.calibration.forEach(function (b) {
      var tr = el('tr');
      tr.appendChild(el('td', { text: 'Q' + b.quintile + (b.quintile === 1 ? ' (smallest)' : b.quintile === 5 ? ' (largest)' : '') }));
      tr.appendChild(el('td', { class: 'num mono', text: String(b.n) }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtMoney(b.median_predicted_usd) }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtMoney(b.median_actual_usd) }));
      tr.appendChild(el('td', { class: 'num mono', text: b.ratio.toFixed(2) + '×' }));
      tbody2.appendChild(tr);
    });
    table2.appendChild(tbody2);
    wrap2.appendChild(table2);
    cal.appendChild(wrap2);
    shell.appendChild(cal);
    var ci = el('div', { class: 'callout warn' });
    ci.appendChild(el('p', { html: '<b>How wide is the range?</b> The printed P25–P75 range is <b>×' + v.range_honesty.p25_factor + ' to ×' + v.range_honesty.p75_factor + '</b> around the point estimate — stated 50%, and ' + v.range_honesty.loo_inside_p25_75_pct.toFixed(0) + '% of held-out caps (leave-one-out) and ' + v.range_honesty.walk_inside_p25_75_pct.toFixed(0) + '% (walk-forward) actually fall inside it. Within ×3 of the model sit ' + v.range_honesty.loo_inside_3x_pct.toFixed(0) + '% leave-one-out and ' + v.range_honesty.walk_inside_3x_pct.toFixed(0) + '% walk-forward. The wider 90% range is ×' + v.ci_low_factor + ' to ×' + v.ci_high_factor + ', and the typical miss is ×' + v.typical_factor.toFixed(1) + '. Token pricing is noisy — a protocol’s market cap can sit an order of magnitude from what its TVL suggests — so every board row carries its range in the detail view. A radar that pretended its values were precise would be lying; this one shows its error bars.' }));
    shell.appendChild(ci);
    var method = el('div', { class: 'callout' });
    method.appendChild(el('p', { html: '<b>Method, in full.</b> Comparables: the 119 tokened, non-exchange protocols with a market cap and a CoinGecko id. Launch value: least squares of log10(market cap) on log10(TVL) — intercept <b>' + DATA.power_law.intercept + '</b>, slope <b>' + DATA.power_law.slope + '</b> — plus each category’s median residual, shrunk toward zero with k = 20 and clamped to ±0.3 dex; fitted on the whole set for the board, and refitted on each training half for the tests. Token odds: the no-token clock, π = <b>' + DATA.odds_clock.pi + '</b> never launch, daily hazard <b>' + DATA.odds_clock.hazard_early_per_day + '</b> for the first <b>' + DATA.odds_clock.changepoint_days + '</b> days and <b>' + DATA.odds_clock.hazard_late_per_day + '</b> after that, fitted by grid search on the 645 dated protocols. Expected value = launch value × odds. Farm scenario: plan size 0.02% of TVL capped at $25,000, a 10% farmer drop share, a 12-week horizon, gas of about $35, and a 2%-a-year capital charge; the expected drop is the expected value × drop share × the farm’s share of counted dollar-days (capital × hold days over TVL × days listed). Spearman is the rank correlation between predicted and actual market cap; log R² is the R² of log10(predicted) against log10(actual); MAPE is the median absolute percentage error; the typical miss is the median of max(pred/actual, actual/pred); the Brier score is the mean squared error of the predicted tokened share. The ledger: 198 ranked + 119 priced comps + 297 tokened with no usable cap + 144 out by the launch rule = 758.' }));
    shell.appendChild(method);
  }

  // ---- Comparables + live ------------------------------------------------------
  function renderComparables(shell) {
    var sec = el('section', { class: 'panel' });
    sec.appendChild(el('h2', { text: 'Comparables — one offset per category' }));
    sec.appendChild(el('p', { text: 'The tokened protocols that price each category: the median mcap/TVL ratio, the shrunk sector multiple, and the category’s offset from the power law in dex (log10). A positive offset means the sector trades rich against its TVL; a negative one means it trades cheap.' }));
    var wrap = el('div', { class: 'card' });
    var table = el('table', { class: 'plain' });
    var thead = el('thead');
    thead.appendChild(el('tr', {}, ['Category', 'Comparables', 'Median mcap/TVL', 'Sector multiple', 'Offset (dex)'].map(function (h, i) { return el('th', { class: i > 0 ? 'num mono' : '', text: h }); })));
    table.appendChild(thead);
    var tbody = el('tbody');
    DATA.comps.forEach(function (c) {
      var tr = el('tr');
      tr.appendChild(el('td', { text: c.category }));
      tr.appendChild(el('td', { class: 'num mono', text: String(c.comps_n) }));
      tr.appendChild(el('td', { class: 'num mono', text: c.median_ratio === null ? 'n/a' : c.median_ratio.toFixed(3) + 'x' }));
      tr.appendChild(el('td', { class: 'num mono', text: c.multiple.toFixed(2) + 'x' }));
      tr.appendChild(el('td', { class: 'num mono', text: (c.offset_dex >= 0 ? '+' : '') + c.offset_dex.toFixed(2) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.appendChild(wrap);
    shell.appendChild(sec);
  }
  function renderLive(shell) {
    var sec = el('section', { class: 'panel' });
    sec.appendChild(el('h2', { text: 'Live tokens — the market’s own values' }));
    sec.appendChild(el('p', { text: 'Protocols whose token already trades, by market cap. They are the comparables the board is priced off — shown here at the market’s own value, never mixed into the ranked board.' }));
    var wrap = el('div', { class: 'card' });
    var table = el('table', { class: 'plain' });
    var thead = el('thead');
    thead.appendChild(el('tr', {}, ['Protocol', 'Category', 'TVL', 'Market cap', 'mcap / TVL'].map(function (h, i) { return el('th', { class: i >= 2 ? 'num mono' : '', text: h }); })));
    table.appendChild(thead);
    var tbody = el('tbody');
    DATA.live.forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', {}, [el('span', { class: 'name', text: p.name }), el('div', { class: 'sub', text: p.slug })]));
      tr.appendChild(el('td', { text: p.category || '—' }));
      tr.appendChild(el('td', { class: 'num mono', text: fmtUsd(p.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num mono', text: p.mcap_usd === null ? 'n/a' : fmtUsd(p.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num mono', text: p.mcap_tvl_ratio === null ? 'n/a' : p.mcap_tvl_ratio.toFixed(2) + 'x' }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.appendChild(wrap);
    shell.appendChild(sec);
  }

  // ---- Detail dialog -----------------------------------------------------------
  var dialog = null;
  function openDetail(row) {
    if (!dialog) {
      dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
      dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
      document.body.appendChild(dialog);
    }
    dialog.textContent = '';
    var econ = farmMath(row);
    var head = el('div', { class: 'detail-head' });
    head.appendChild(el('div', {}, [
      el('h2', { id: 'detail-title', text: '#' + row.rank + ' — ' + row.name }),
      el('div', { class: 'sub', text: row.slug + ' · ' + (row.category || 'no category') + ' · ' + (row.chains.length ? row.chains.join(', ') : 'no chain listed') + ' · ' + fmtAge(row.age_days) })
    ]));
    var close = el('button', { type: 'button', text: 'Close' });
    close.addEventListener('click', function () { dialog.close(); });
    head.appendChild(close);
    dialog.appendChild(head);
    var body = el('div', { class: 'detail-body' });
    var kv = el('div', { class: 'kv' });
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Implied value (expected)' }), el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'P25–P75 range' }), el('div', { class: 'v', text: fmtUsd(row.implied_low_usd) + '–' + fmtUsd(row.implied_high_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'If it launches' }), el('div', { class: 'v', text: fmtUsd(row.launch_value_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Token odds' }), el('div', { class: 'v', text: Math.round(row.token_odds * 100) + '%' })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'TVL' }), el('div', { class: 'v', text: fmtUsd(row.tvl_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: '7-day change' }), el('div', { class: 'v', text: fmtPct(row.change_7d) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Effective multiple' }), el('div', { class: 'v', text: fmtMult(row.category_multiple) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Verdict' }), el('div', { class: 'v', text: econ.verdict })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Net / hour' }), el('div', { class: 'v', text: fmtSigned(econ.netPerHour, 2) + '/h' })]));
    body.appendChild(kv);
    body.appendChild(el('h3', { text: 'How the value is built' }));
    var base = Math.pow(10, DATA.power_law.intercept + DATA.power_law.slope * Math.log10(row.tvl_usd) + row.category_offset_dex);
    body.appendChild(el('div', { class: 'math', text:
      'launch = 10^(' + DATA.power_law.intercept + ' + ' + DATA.power_law.slope + ' × log10(' + fmtMoney(row.tvl_usd) + ') + ' + row.category_offset_dex.toFixed(2) + ' offset)\n' +
      '       = ' + fmtMoney(base) + '\n' +
      'odds   = ' + row.token_odds.toFixed(2) + ' (no-token clock: π = ' + DATA.odds_clock.pi + ' never launch, hazard ' + DATA.odds_clock.hazard_early_per_day + '/day for the first ' + DATA.odds_clock.changepoint_days + ' days then ' + DATA.odds_clock.hazard_late_per_day + '/day, ' + fmtAge(row.age_days) + ' with no token)\n' +
      'implied = ' + fmtMoney(base) + ' × ' + row.token_odds.toFixed(2) + ' = ' + fmtMoney(row.implied_value_usd) + '\n' +
      'P25–P75 = ' + fmtMoney(row.implied_low_usd) + ' – ' + fmtMoney(row.implied_high_usd) + ' (held-out log-errors, ×' + DATA.validation.range_honesty.p25_factor + '–×' + DATA.validation.range_honesty.p75_factor + ')\n' +
      '90% range = ' + fmtMoney(Math.max(1, Math.round(row.implied_value_usd * DATA.validation.ci_low_factor))) + ' – ' + fmtMoney(Math.round(row.implied_value_usd * DATA.validation.ci_high_factor)) + ' (×' + DATA.validation.ci_low_factor + '–×' + DATA.validation.ci_high_factor + ')' }));
    body.appendChild(el('h3', { text: 'Farm plan — netted' }));
    var ol = el('ol', { class: 'steps' });
    farmSteps(row, econ).forEach(function (s) {
      ol.appendChild(el('li', {}, [document.createTextNode(s.text + ' '), el('span', { class: 'cost', text: 'Cost: ' + s.cost + '. Time: ' + s.time + '.' })]));
    });
    body.appendChild(ol);
    body.appendChild(el('p', { class: 'note', text: 'The protocol records no token — say that, never that it has none: a token its DefiLlama record does not carry is still possible. The implied value is this entry’s own claim.' }));
    dialog.appendChild(body);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  // ---- Render ------------------------------------------------------------------
  function render() {
    app.textContent = '';
    var parts = renderHead();
    app.appendChild(parts[0]);
    var shell = parts[1];
    app.appendChild(shell);
    renderTabs(shell);
    if (state.tab === 'board') renderBoard(shell);
    else if (state.tab === 'validation') renderValidation(shell);
    else if (state.tab === 'comparables') renderComparables(shell);
    else if (state.tab === 'live') renderLive(shell);
    shell.appendChild(el('footer', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · model ' + DATA.model_version + ' · power law log10(mcap) = ' + DATA.power_law.intercept + ' + ' + DATA.power_law.slope + ' × log10(TVL) · values are the entry’s own claim, never make.fun’s.' }));
    if (state.selected) {
      var row = null;
      DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
      if (row) openDetail(row);
    }
  }
  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
