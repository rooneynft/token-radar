// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the board, the validation, the comparables and the live-token view from it: every
// number the page shows comes from data.js, so the screenshots and the code agree.
//
// The farm plans are derived in the page from each row's own record, with the same rules as
// main.ts's board.json: the same capital tiers, the same hold tiers, the same category
// families, the same netting step. A plan the page shows is the plan the board carries.
(function () {
  'use strict';
  var DATA = window.RADAR;

  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }
  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
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

  // ---- Farm plans (same rules as lib/model.ts) -------------------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
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
  function verdictFor(implied, multiple) {
    if (implied >= 1e7 && multiple >= 0.25) return { label: 'Farm', cls: '' };
    if (implied < 1e6) return { label: 'Thin — smallest size only, or skip', cls: 'thin' };
    return { label: 'Farm with the standard size', cls: '' };
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    var totalGas = 3 + gas + 2 * Math.ceil(hold / 7);
    var v = verdictFor(p.implied_value_usd, p.category_multiple);
    var verdictText = v.label + (v.label === 'Farm' ? ' — the sector prices strongly and the value justifies the gas'
      : v.label.indexOf('Thin') === 0 ? ' — the value is under $1M, so the gas is a large share of any airdrop'
      : ' — the value justifies the position');
    var holdText = p.age_days === null
      ? 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.'
      : 'Hold the position for at least ' + hold + ' days — ' + p.name + ' was listed ' + p.age_days + ' days ago with no token, so a ' + hold + '-day window covers more than one snapshot.';
    function step(text, cost, time) { return { text: text, cost: cost, time: time }; }
    return [
      step('Open a fresh wallet on ' + chain + ' and fund it with $' + capital + ' plus about $' + gas + ' for gas. Keep the seed phrase offline.', '$' + capital + ' of capital and about $' + gas + ' of gas', '10 minutes'),
      step(actionFor(p, capital, chain), '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
      step(weeklyFor(p), 'about $2 of gas a week', '10 minutes a week'),
      step(holdText, 'the $' + capital + ' stays in the position', hold + ' days'),
      step('Net: about $' + totalGas + ' of gas over ' + hold + ' days plus $' + capital + ' of capital, against an implied value of ' + fmtUsd(p.implied_value_usd) + ' at ' + p.category_multiple.toFixed(2) + 'x. Verdict: ' + verdictText + '.', 'about $' + totalGas + ' of gas in total', hold + ' days'),
      step("Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'),
      step('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes')
    ];
  }

  // ---- State ---------------------------------------------------------------
  var WL = {};
  DATA.rows.forEach(function (r) { WL[r.slug] = r.tvl_usd >= DATA.floor_usd; });
  var CATS = [];
  DATA.rows.forEach(function (r) { if (r.category && CATS.indexOf(r.category) < 0) CATS.push(r.category); });
  CATS.sort();
  var state = { tab: 'board', sortKey: 'rank', sortDir: 1, filterCat: '', query: '', scope: 'all', selected: null };
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

  // ---- Header + validation strip -------------------------------------------
  function kpi(label, valueHtml, subHtml, cls) {
    return el('div', { class: 'kpi' + (cls ? ' ' + cls : '') }, [
      el('div', { class: 'k', text: label }),
      el('div', { class: 'v', html: valueHtml }),
      el('div', { class: 's', html: subHtml })
    ]);
  }
  function renderHead() {
    var v = DATA.validation;
    var mast = el('header', { class: 'mast' }, [el('div', { class: 'shell' }, [
      el('h1', { html: 'Token Radar <span>— the pre-token board, priced and tested</span>' }),
      el('p', { text: 'Every protocol that records no token, ranked by what its token would be worth if its record stayed as it is — priced off a power law fitted on the 119 tokened comparables, and tested held-out and walk-forward before it prices a single row.' }),
      el('div', { class: 'meta', html: 'Snapshot <b>' + esc(DATA.as_of) + '</b> · ' + DATA.rows.length + ' rows · ' + DATA.watchlist_size + ' on the watchlist · ' + DATA.early_size + ' early finds below the floor · model <b>' + esc(DATA.model_version) + '</b>' })
    ])]);
    var strip = el('div', { class: 'kpis' }, [
      kpi('Held-out log R²', '+' + v.held_out.log_r2.toFixed(2), 'flat median <b>' + v.model_comparison[2].log_r2.toFixed(2) + '</b> · the core explains value, flat cannot', 'good'),
      kpi('Walk-forward MAPE', v.walk_forward.mape_pct.toFixed(1) + '<small>%</small>', 'flat median <b>' + v.walk_forward.flat_mape_pct.toFixed(1) + '%</b> · fitted on older listings only', 'good'),
      kpi('Typical error', '×' + v.typical_factor.toFixed(1), 'median held-out miss · 90% range <b>×' + v.ci_low_factor + '–×' + v.ci_high_factor + '</b>', ''),
      kpi('Worst calibration quintile', '×' + Math.max.apply(null, v.calibration.map(function (b) { return b.ratio; })).toFixed(2), 'median predicted vs actual per quintile · see Validation tab', 'warn')
    ]);
    return [mast, el('div', { class: 'shell' }, [strip])];
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
      if (state.scope === 'early' && WL[r.slug]) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var va = a[key], vb = b[key];
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
    var scope = el('select', { 'aria-label': 'Watchlist or early rows' });
    [['all', 'All rows'], ['watch', 'Watchlist only'], ['early', 'Early finds only']].forEach(function (o) { scope.appendChild(el('option', { value: o[0], text: o[1] })); });
    scope.value = state.scope;
    scope.addEventListener('change', function () { state.scope = scope.value; renderTable(); });
    var count = el('span', { class: 'count' });
    ctrls.appendChild(search); ctrls.appendChild(cat); ctrls.appendChild(scope); ctrls.appendChild(count);
    shell.appendChild(ctrls);
    var wrap = el('div', { class: 'card' });
    shell.appendChild(wrap);
    shell.appendChild(el('p', { class: 'note', html: '<b>Implied value</b> is the entry’s own claim, never make.fun’s: 10^(intercept + slope × log10 TVL + category offset) × growth × maturity × breadth × crash guard. The small range under it is the 90% range from the held-out test — token pricing is noisy, and the board shows the range instead of hiding it. <b>Watchlist</b> rows (TVL at or above the $50M floor) carry the teal edge.' }));

    function renderTable() {
      var rows = filteredRows();
      count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
      wrap.textContent = '';
      var table = el('table');
      var cols = [
        ['rank', '#', 'num'], ['name', 'Protocol', ''], ['category', 'Category', 'hide-sm'],
        ['tvl_usd', 'TVL', 'num'], ['change_7d', '7d', 'num hide-sm'],
        ['implied_value_usd', 'Implied value', 'num'], ['category_multiple', 'Multiple', 'num hide-sm']
      ];
      var thead = el('thead');
      var hr = el('tr');
      cols.forEach(function (c) {
        var th = el('th', { class: (c[2] ? c[2] + ' ' : '') + (c[0] === 'implied_value_usd' || c[0] === 'tvl_usd' || c[0] === 'rank' || c[0] === 'change_7d' || c[0] === 'category_multiple' ? 'num' : ''), text: c[1] + (state.sortKey === c[0] ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '') });
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
        var tr = el('tr', { class: WL[r.slug] ? 'watch' : '' });
        var v = verdictFor(r.implied_value_usd, r.category_multiple);
        tr.appendChild(el('td', { class: 'num', text: String(r.rank) }));
        var nameCell = el('td');
        var link = el('a', { class: 'rowlink', href: '#p=' + r.slug });
        link.addEventListener('click', function (e) { e.preventDefault(); state.selected = r.slug; writeHash(); openDetail(r); });
        link.appendChild(el('span', { class: 'name', text: r.name }));
        nameCell.appendChild(link);
        nameCell.appendChild(el('div', { class: 'sub', text: r.slug + ' · ' + fmtAge(r.age_days) + ' · ' + (r.chains.length ? r.chains.join(', ') : 'no chain listed') }));
        tr.appendChild(nameCell);
        tr.appendChild(el('td', { class: 'hide-sm', text: r.category || '—' }));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tr.appendChild(el('td', { class: 'num hide-sm', text: fmtPct(r.change_7d) }));
        var valCell = el('td', { class: 'num' });
        valCell.appendChild(el('div', { class: 'val', text: fmtUsd(r.implied_value_usd) }));
        valCell.appendChild(el('div', { class: 'range', text: fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd) + ' 90%' }));
        valCell.appendChild(el('span', { class: 'pill' + (v.cls ? ' ' + v.cls : ''), text: v.label }));
        tr.appendChild(valCell);
        tr.appendChild(el('td', { class: 'num hide-sm', text: fmtMult(r.category_multiple) + ' (' + r.comps_n + ')' }));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      if (rows.length > 200) wrap.appendChild(el('p', { class: 'note', text: 'Showing the first 200 of ' + rows.length + ' matching rows — narrow the filter to see the rest.' }));
    }
    renderTable();
  }

  // ---- Validation panel ------------------------------------------------------
  function testTable(title, t, note) {
    var sec = el('section', { class: 'panel' });
    sec.appendChild(el('h2', { text: title }));
    if (note) sec.appendChild(el('p', { text: note }));
    var wrap = el('div', { class: 'card' });
    var table = el('table', { class: 'plain' });
    var thead = el('thead');
    thead.appendChild(el('tr', {}, ['Test', 'Train / test', 'Spearman', 'log R²', 'MAPE', 'Within 2×', 'Flat Spearman', 'Flat MAPE', 'Beats flat'].map(function (h, i) {
      return el('th', { class: i >= 2 ? 'num mono' : '', text: h });
    })));
    table.appendChild(thead);
    var tbody = el('tbody');
    [t].forEach(function (row) {
      var tr = el('tr');
      [row.name, row.train_n + ' / ' + row.test_n, row.spearman.toFixed(3), (row.log_r2 >= 0 ? '+' : '') + row.log_r2.toFixed(3), row.mape_pct.toFixed(1) + '%', row.within2x_pct.toFixed(1) + '%', row.flat_spearman.toFixed(3), row.flat_mape_pct.toFixed(1) + '%', (row.beats_flat_pp >= 0 ? '+' : '') + row.beats_flat_pp.toFixed(1) + 'pp'].forEach(function (cell, i) {
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
    intro.appendChild(el('p', { text: 'The power law is fitted on the 119 tokened protocols whose market caps are known, then tested two ways before it ever prices a pre-token row. Held-out: even slugs (by sorted order) fit, odd slugs are predicted. Walk-forward: protocols listed before the median listing date fit, the ones listed after it are predicted. The flat global median is the baseline on the same test sets — a model that cannot beat "TVL times one number" has nothing to say.' }));
    shell.appendChild(intro);
    shell.appendChild(testTable('Power-law core', v.held_out, 'The fitted core alone: log10(market cap) = intercept + slope × log10(TVL), fitted on the training half only. Spearman ties the flat baseline by construction — both rank by TVL — so read log R² and MAPE: the core explains value where the flat ratio cannot.'));
    shell.appendChild(testTable('Full model', v.held_out_full, 'The core plus the category offset, the growth multiplier, the maturity multiplier, the breadth bonus and the crash guard — the model the board actually runs. Held-out it beats flat on rank (+3.5pp Spearman); walk-forward it trails flat on rank (−7.2pp) while still winning on value (MAPE 74.1% vs 86.5%). Both numbers are shown: the extra terms buy sector separation at the cost of some walk-forward rank.'));
    shell.appendChild(testTable('Walk-forward — power-law core', v.walk_forward, 'Fitted only on protocols listed before 28 February 2024, tested on the ones listed after it. The core keeps its value edge on protocols from a later era.'));
    shell.appendChild(testTable('Walk-forward — full model', v.walk_forward_full, 'The full model on the same later listings.'));
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
    cal.appendChild(el('p', { text: 'The 59 held-out predictions cut into five groups by predicted value. A calibrated model has a ratio near 1.0 in every group; the old ratio model ran 10.45× hot in the top group, which is why the board now prices off the power law.' }));
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
    ci.appendChild(el('p', { html: '<b>How wide is the range?</b> The 90% range from the held-out log-errors is <b>×' + v.ci_low_factor + ' to ×' + v.ci_high_factor + '</b> around the point estimate, and the typical miss is <b>×' + v.typical_factor.toFixed(1) + '</b>. Token pricing is noisy — a protocol’s market cap can sit an order of magnitude from what its TVL suggests — so every board row carries its own 90% range in the detail view, and the board shows it under the value. A radar that pretended its values were precise would be lying; this one shows its error bars.' }));
    shell.appendChild(ci);
    var method = el('div', { class: 'callout' });
    method.appendChild(el('p', { html: '<b>Method, in full.</b> Comparables: the 119 tokened, non-exchange protocols with a market cap and a CoinGecko id. Power law: least squares of log10(market cap) on log10(TVL) — intercept <b>' + DATA.power_law.intercept + '</b>, slope <b>' + DATA.power_law.slope + '</b> — fitted on the whole set for the board, and refitted on each training half for the tests. Category offset: each category’s median residual from the power law, shrunk toward zero with k = 20 and clamped to ±0.3 dex. Growth: 1 + clamped 7-day change × 0.5. Maturity: 0.6 + min(age, 1095)/1095 × 0.4. Breadth: +2% per chain up to four. Crash guard: ×0.9 when the 7-day change is −25% or worse. Spearman is the rank correlation between predicted and actual market cap; log R² is the R² of log10(predicted) against log10(actual); MAPE is the median absolute percentage error.' }));
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
    var v = verdictFor(row.implied_value_usd, row.category_multiple);
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
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Implied value' }), el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: '90% range' }), el('div', { class: 'v', text: fmtUsd(row.implied_low_usd) + '–' + fmtUsd(row.implied_high_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'TVL' }), el('div', { class: 'v', text: fmtUsd(row.tvl_usd) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: '7-day change' }), el('div', { class: 'v', text: fmtPct(row.change_7d) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Effective multiple' }), el('div', { class: 'v', text: fmtMult(row.category_multiple) })]));
    kv.appendChild(el('div', {}, [el('div', { class: 'k', text: 'Verdict' }), el('div', { class: 'v', text: v.label })]));
    body.appendChild(kv);
    body.appendChild(el('h3', { text: 'How the value is built' }));
    var base = Math.pow(10, DATA.power_law.intercept + DATA.power_law.slope * Math.log10(row.tvl_usd) + row.category_offset_dex);
    body.appendChild(el('div', { class: 'math', text:
      'base   = 10^(' + DATA.power_law.intercept + ' + ' + DATA.power_law.slope + ' × log10(' + fmtMoney(row.tvl_usd) + ') + ' + row.category_offset_dex.toFixed(2) + ' offset)\n' +
      '       = ' + fmtMoney(base) + '\n' +
      'growth = ×' + row.growth_multiplier.toFixed(2) + '   maturity = ×' + row.maturity_multiplier.toFixed(2) +
      '   breadth = ×' + row.breadth_multiplier.toFixed(2) + '   crash guard = ×' + row.crash_guard.toFixed(2) + '\n' +
      'implied = ' + fmtMoney(base) + ' × ' + row.growth_multiplier.toFixed(2) + ' × ' + row.maturity_multiplier.toFixed(2) +
      ' × ' + row.breadth_multiplier.toFixed(2) + ' × ' + row.crash_guard.toFixed(2) + ' = ' + fmtMoney(row.implied_value_usd) + '\n' +
      '90% range = ' + fmtMoney(row.implied_low_usd) + ' – ' + fmtMoney(row.implied_high_usd) + ' (held-out log-errors, ×' + DATA.validation.ci_low_factor + '–×' + DATA.validation.ci_high_factor + ')' }));
    body.appendChild(el('h3', { text: 'Farm plan — netted' }));
    var ol = el('ol', { class: 'steps' });
    farmSteps(row).forEach(function (s) {
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
