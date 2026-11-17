// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a movers strip, a per-protocol detail drawer
// with the model's own inputs, its comparables and the protocol's farm plan. No network: every
// byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WL = {};
  // Watchlist membership: a row is on the watchlist when its TVL is at or above the floor.
  DATA.rows.forEach(function (r) { WL[r.slug] = r.tvl_usd >= DATA.floor_usd; });
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x'; }
  function fmtChains(p) { return p.chains && p.chains.length ? p.chains.length + (p.chains.length === 1 ? ' chain' : ' chains') : 'no chain listed'; }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // Same signals as lib/model.ts: growth, maturity, chain breadth and the crash guard.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(row.chains ? row.chains.length : 0, model.breadth_cap_chains) * model.breadth_per_chain;
    var guard = growth <= model.crash_threshold ? model.crash_penalty : 1;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth * guard));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  // Capital follows the protocol's TVL in tiers; the hold follows its age in tiers.
  var CAPITAL_TIERS = [
    { atLeast: 5e9, capital: 250 },
    { atLeast: 1e9, capital: 150 },
    { atLeast: 1e8, capital: 100 },
    { atLeast: 0, capital: 50 }
  ];
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    for (var i = 0; i < CAPITAL_TIERS.length; i++) {
      if (p.tvl_usd >= CAPITAL_TIERS[i].atLeast) return CAPITAL_TIERS[i].capital;
    }
    return 50;
  }
  var HOLD_TIERS = [
    { youngerThan: 180, days: 60 },
    { youngerThan: 365, days: 45 },
    { youngerThan: null, days: 30 }
  ];
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    for (var i = 0; i < HOLD_TIERS.length; i++) {
      var t = HOLD_TIERS[i];
      if (t.youngerThan === null || age < t.youngerThan) return t.days;
    }
    return 30;
  }
  // One category family's farm action: the first family whose keywords match wins.
  var ACTION_FAMILIES = [
    { keywords: ['lend', 'cdp', 'collateral'], action: function (name, capital, chain) { return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.'; } },
    { keywords: ['dex', 'yield', 'leveraged farm'], action: function (name, capital, chain) { return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.'; } },
    { keywords: ['bridge'], action: function (name, capital, chain) { return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.'; } },
    { keywords: ['staking', 'restak'], action: function (name, capital) { return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.'; } },
    { keywords: ['perpetual', 'derivative'], action: function (name, capital) { return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.'; } },
    { keywords: ['prediction'], action: function (name, capital) { return 'Fund $' + capital + ' and place one market position on ' + name + '.'; } },
    { keywords: ['curator', 'allocator'], action: function (name, capital, chain) { return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.'; } },
    { keywords: ['stable'], action: function (name, capital, chain) { return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.'; } },
    { keywords: ['rwa'], action: function (name, capital, chain) { return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.'; } },
    { keywords: ['insurance'], action: function (name, capital, chain) { return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.'; } }
  ];
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < ACTION_FAMILIES.length; i++) {
      var fam = ACTION_FAMILIES[i];
      for (var j = 0; j < fam.keywords.length; j++) {
        if (c.indexOf(fam.keywords[j]) >= 0) return fam.action(p.name, capital, chain);
      }
    }
    return 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function riskNotes(row) {
    var notes = [];
    if (row.age_days === null) notes.push('Age unknown: no listing date in the snapshot, so maturity uses 365 days.');
    else if (row.age_days < 180) notes.push('Young protocol: listed under 6 months ago, so a token is less proven — hold the position longer.');
    if (row.change_7d !== null && row.change_7d <= -25) notes.push('TVL fell ' + Math.abs(row.change_7d).toFixed(1) + '% in the last week: the crash guard discounts this row by 10% — find out why before farming.');
    else if (row.change_7d !== null && row.change_7d <= -10) notes.push('TVL fell ' + Math.abs(row.change_7d).toFixed(1) + '% in the last week: find out why before farming.');
    if (row.change_7d !== null && row.change_7d >= 30) notes.push('TVL is surging +' + row.change_7d.toFixed(1) + '% in a week: the growth may be a spike, not a trend.');
    if (row.tvl_usd < DATA.floor_usd) notes.push('Below the $' + Math.round(DATA.floor_usd / 1e6) + 'M watchlist floor: an early-radar row, smaller and less proven than the watchlist.');
    if (row.comps_n === 0) notes.push('No live-token comparable in this category: the market-wide median sets its multiple.');
    if (row.chains && row.chains.length > 5) notes.push('Multi-chain (' + row.chains.length + ' chains): farm on the chain with the deepest pool.');
    else if (row.chains && row.chains.length <= 1) notes.push('Single-chain: the whole position depends on one chain staying healthy.');
    if (notes.length === 0) notes.push('No red flag in the snapshot: steady TVL, listed long enough, priced off live comparables.');
    return notes;
  }

  // Deep-link state: every key the hash carries, in one table, so read and write cannot drift apart.
  var HASH_PARAMS = [
    { key: 'q', state: 'q', write: function () { return state.q; } },
    { key: 'p', state: 'selected', write: function () { return state.selected; } },
    { key: 'category', state: 'category', write: function () { return state.category !== 'all' ? state.category : ''; } },
    { key: 'chain', state: 'chain', write: function () { return state.chain !== 'all' ? state.chain : ''; } },
    { key: 'tab', state: 'tab', write: function () { return state.tab !== 'pre-token' ? state.tab : ''; } },
    { key: 'wl', state: 'wl', write: function () { return state.wl ? '1' : ''; } }
  ];
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    HASH_PARAMS.forEach(function (entry) {
      var v = params.get(entry.key);
      if (v === null || v === '') return;
      state[entry.state] = entry.key === 'wl' ? v === '1' : v;
    });
  }
  function writeHash() {
    var params = new URLSearchParams();
    HASH_PARAMS.forEach(function (entry) {
      var v = entry.write();
      if (v) params.set(entry.key, v);
    });
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.wl && !WL[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  // One comparator per sort key: the value a row sorts on, with nulls pushed to the end
  // whichever way the sort runs. Ties always break on slug, so the order is stable.
  var SORT_KEYS = {
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
    multiple: function (r) { return r.category_multiple; },
    breadth: function (r) { return r.chains ? r.chains.length : 0; },
    implied: function (r) { return r.implied_value_usd; }
  };
  function sortedRows(list) {
    var keyFn = SORT_KEYS[state.sort] || SORT_KEYS.implied;
    return list.slice().sort(function (a, b) {
      var av = keyFn(a);
      var bv = keyFn(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Each implied value is priced off live-token comparables in the same category — not a flat multiple. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market-wide median mcap / TVL' }), el('b', { text: DATA.global_median_ratio.toFixed(2) + 'x' }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    return el('section', { class: 'spot', 'aria-label': 'Top 5 by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: '#' + r.rank }),
          el('b', { text: r.name }),
          el('span', { class: 'imp', text: fmtUsd(r.implied_value_usd) + ' implied' }),
          el('span', { class: 'meta', text: (r.category || 'Other') + ' · TVL ' + fmtUsd(r.tvl_usd) })
        );
      })
    );
  }

  // The week's fastest movers: the five pre-token rows with the largest 7-day TVL gain.
  // A mover is momentum, not value — the rank and the implied value sit next to the gain
  // so a spike is never mistaken for a strong row.
  function movers() {
    var top = DATA.rows.filter(function (r) { return r.change_7d !== null; })
      .sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    if (top.length === 0) return null;
    return el('section', { class: 'movers', 'aria-label': 'Top 5 movers by 7-day TVL change' },
      el('h2', { text: 'Moving fastest this week' }),
      top.map(function (r) {
        return el('button', { type: 'button', class: 'mover', onclick: function () { openDetail(r.slug); } },
          el('b', { text: r.name }),
          el('span', { class: 'gain pos', text: fmtPct(r.change_7d) + ' in 7d' }),
          el('span', { class: 'meta', text: 'rank #' + r.rank + ' · ' + fmtUsd(r.implied_value_usd) + ' implied' })
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.wl ? 'checked' : null }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var count = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.comps.length + ' categories priced';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('comps', 'Comps'))),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', { class: 'num', text: fmtChains(r) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'tag' + (WL[r.slug] ? ' watch' : ''), text: WL[r.slug] ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('breadth', 'Chains'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'List' })
          )),
          tbody
        )
      )
    );
  }

  function categoryBars() {
    var totals = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      totals[c] = (totals[c] || 0) + r.implied_value_usd;
    });
    var top = Object.keys(totals).map(function (c) { return { c: c, v: totals[c] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    var max = top.length ? top[0].v : 1;
    return el('section', { class: 'panel bars' },
      el('h2', { text: 'Where the implied value sits' }),
      el('p', { class: 'sub', text: 'Total implied value by category, across all ' + DATA.board_size + ' pre-token rows. Risk curators and capital allocators hold the most — the largest pre-token protocols live there.' }),
      top.map(function (t) {
        return el('div', { class: 'bar-row' },
          el('span', { class: 'lbl', text: t.c }),
          el('div', { class: 'track', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((t.v / max) * 100)) + '%' })),
          el('span', { class: 'val', text: fmtUsd(t.v) })
        );
      })
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mcap_tvl_ratio) }),
        el('td', null, el('span', { class: 'tag live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their mcap / TVL ratios are the comparables that price the board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function compsView() {
    var m = DATA.model;
    var tbody = el('tbody');
    DATA.comps.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.comps_n) }),
        el('td', { class: 'num', text: c.median_ratio === null ? 'n/a' : c.median_ratio.toFixed(2) + 'x' }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    return el('div', null,
      el('section', { class: 'panel model' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
        el('div', { class: 'formula' },
          'multiple = clamp((n x median(mcap/TVL in category) + ' + m.shrink_k + ' x ' + DATA.global_median_ratio.toFixed(2) + ') / (n + ' + m.shrink_k + '), ' + m.mult_min + ', ' + m.mult_max + ')\n' +
          'breadth = 1 + min(chains, ' + m.breadth_cap_chains + ') x ' + m.breadth_per_chain + '\n' +
          'crash guard = ' + m.crash_penalty + ' when change_7d <= ' + m.crash_threshold + '%, else 1\n' +
          'implied = round( tvl_usd x multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x breadth x crash guard )'
        ),
        el('p', { class: 'sub', text: 'The comparables are the snapshot\u2019s own live-token protocols: for each category, the median of market cap over TVL. Thin categories are shrunk toward the market-wide median of ' + DATA.global_median_ratio.toFixed(2) + 'x (weight ' + m.shrink_k + '), and every multiple is clamped to ' + m.mult_min + '–' + m.mult_max + 'x, inside the range the live market shows. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain breadth adds ' + m.breadth_per_chain + ' per chain up to ' + m.breadth_cap_chains + ' chains, and a weekly TVL fall of ' + Math.abs(m.crash_threshold) + '% or more is discounted by the crash guard (' + m.crash_penalty + 'x). The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
      ),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Comparables by category' }),
        el('p', { class: 'sub', text: 'Each multiple comes from the live-token protocols that already trade in that category. Categories with no live comparable use the market-wide median.' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'comps-table' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
            tbody
          )
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var comp = DATA.comps.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    var sameCat = DATA.comparables.filter(function (c) { return c.category === row.category; }).slice(0, 5);
    var base = Math.round(row.tvl_usd * row.category_multiple);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WL[row.slug] ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'x ' + (row.category || 'Other') + ' multiple (' + row.comps_n + ' comps)' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: '= base value' }), el('b', { class: 'num', text: fmtUsd(base) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'x growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'x maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains (' + fmtChains(row) + ')' }), el('b', { class: 'num', text: 'x ' + String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'x crash guard' }), el('b', { class: 'num', text: String(row.crash_guard) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    var compBody = el('tbody');
    if (sameCat.length === 0) {
      compBody.appendChild(el('tr', null, el('td', { colspan: '3', class: 'sub', text: 'No live-token comparable in this category: the market-wide median of ' + DATA.global_median_ratio.toFixed(2) + 'x sets the multiple.' })));
    } else {
      sameCat.forEach(function (c) {
        compBody.appendChild(el('tr', null,
          el('td', null, el('b', { text: c.name })),
          el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
          el('td', { class: 'num', text: fmtMult(c.mcap_tvl_ratio) })
        ));
      });
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Comparables: live-token ' + (row.category || 'Other') + ' protocols' }),
      el('p', { class: 'sub', text: comp ? 'Median mcap / TVL across ' + comp.comps_n + ' live comparables is ' + (comp.median_ratio === null ? 'n/a' : comp.median_ratio.toFixed(2) + 'x') + '; shrunk toward the market median, the multiple used is ' + fmtMult(row.category_multiple) + '.' : 'No live comparables in this category.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mini' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'mcap / TVL' }))),
          compBody
        )
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'What to watch' }),
      el('ul', { class: 'notes' }, riskNotes(row).map(function (n) { return el('li', { text: n }); }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source + '. Snapshot date ' + DATA.as_of + '; the snapshot is frozen, so the board does not move.' }),
      el('span', { text: 'Method: comps-calibrated implied value (model ' + DATA.model_version + '). An implied value is what a token would be worth if the protocol launched one at the multiple its live-token peers trade at — not a price, not a promise, and not financial advice.' }),
      el('span', { text: 'Wrapped, staked and bridged products of protocols that already trade are left out: they are not protocols still waiting on a launch of their own.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    if (state.tab === 'pre-token') shell.appendChild(movers());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(categoryBars());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(compsView());
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
