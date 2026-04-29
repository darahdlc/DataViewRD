// ============== Shared utilities ==============
const App = {
  data: null,
  world: null,            // topojson features
  numToIso3: {},          // numeric ISO -> "USA"
  currentYear: 2024,
  currentMode: 'overview',
  selectedCountry: null,
  scaleType: 'log',
  yearA: 2019,
  yearB: 2024,
};

const fmt = d3.format(',.0f');
const fmtPct = d3.format('+.1%');
const fmtPctSimple = d3.format('.1%');

// Safe percent change: never divides by 0 and never returns Infinity.
// - prev > 0   -> (curr - prev) / prev   (accurate, can exceed +/-100%)
// - prev == 0, curr  > 0 -> +1           (treated as +100% growth from nothing)
// - prev == 0, curr  < 0 -> -1           (defensive; arrivals are non-negative)
// - prev == 0, curr == 0 -> 0
// `clamp` (default false) hard-limits the result to [-1, +1] for visualization domains.
function safePctChange(curr, prev, clamp = false) {
  if (curr == null || prev == null || isNaN(curr) || isNaN(prev)) return null;
  let v;
  if (prev === 0) {
    v = curr === 0 ? 0 : (curr > 0 ? 1 : -1);
  } else {
    v = (curr - prev) / prev;
  }
  if (clamp) v = Math.max(-1, Math.min(1, v));
  return v;
}

function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return d3.format(',.0f')(n);
}

// ============ Centralized year + play sync ============
// Every slider / play button updates state through here so all charts stay in sync.
function setYear(y) {
  if (App.data && App.data.years) {
    const yMin = App.data.years[0];
    const yMax = App.data.years[App.data.years.length - 1];
    if (y < yMin) y = yMin;
    if (y > yMax) y = yMax;
  }
  App.currentYear = y;

  // Sync every slider DOM element
  ['year-slider', 'year-slider-2', 'ov-slider'].forEach(id => {
    const el = document.getElementById(id);
    if (el && +el.value !== y) el.value = y;
  });
  // Sync every year display
  ['year-display', 'year-display-2', 'ov-year'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = y;
  });

  // Refresh modules that have been initialized
  if (typeof Overview !== 'undefined' && Overview.refresh) Overview.refresh();
  if (typeof Explorer !== 'undefined' && Explorer.refresh) Explorer.refresh();
  if (typeof Gender   !== 'undefined' && Gender.refresh)   Gender.refresh();
}

// Single shared play timer so play buttons in any tab toggle the same animation,
// and every year is visited (1999..2025) regardless of selected-country data.
let _playTimer = null;
function isPlaying() { return _playTimer !== null; }
function syncPlayButtons() {
  const sym = isPlaying() ? '⏸' : '▶';
  ['play-btn', 'play-btn-2', 'ov-play'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
}
function startPlay() {
  if (_playTimer) return;
  const yMin = App.data.years[0];
  const yMax = App.data.years[App.data.years.length - 1];
  _playTimer = setInterval(() => {
    let y = App.currentYear + 1;
    if (y > yMax) y = yMin;
    setYear(y); // visits every year unconditionally — no country-specific skipping
  }, 700);
  syncPlayButtons();
}
function stopPlay() {
  if (!_playTimer) return;
  clearInterval(_playTimer);
  _playTimer = null;
  syncPlayButtons();
}
function togglePlay() { isPlaying() ? stopPlay() : startPlay(); }

// Tooltip helpers
const tipEl = () => document.getElementById('tooltip');
function showTip(html, ev) {
  const el = tipEl();
  el.innerHTML = html;
  el.style.display = 'block';
  moveTip(ev);
}
function moveTip(ev) {
  const el = tipEl();
  const x = ev.clientX + 14;
  const y = ev.clientY + 14;
  el.style.left = Math.min(x, window.innerWidth - 260) + 'px';
  el.style.top  = Math.min(y, window.innerHeight - 100) + 'px';
}
function hideTip() { tipEl().style.display = 'none'; }

// Data lookup helpers — accept numeric ISO either zero-padded ("032") or not ("32")
function getCountryByNum(numStr) {
  if (numStr == null) return null;
  const padded = String(numStr).padStart(3, '0');
  const unpadded = String(numStr).replace(/^0+/, '') || '0';
  const iso = App.numToIso3[padded] || App.numToIso3[unpadded];
  if (!iso) return null;
  return { iso, ...App.data.countries[iso] };
}
function valueFor(iso, year) {
  const c = App.data.countries[iso];
  if (!c) return null;
  return c.data[year];
}

// ============ Color scales (colorblind-safe / daltonic friendly) ============
// Sequential scale: Viridis — perceptually uniform, safe for all common color
// vision deficiencies (deuteranopia/protanopia/tritanopia).
const SEQ_INTERP = d3.interpolateViridis;
// Diverging scale: Purple-Orange — the standard recommendation for diverging
// data when red-green deficiency is a concern.
const DIV_INTERP = d3.interpolatePuOr;

const explorerColor = {
  log: null,
  linear: null,
};

function buildExplorerScales() {
  let minV = Infinity, maxV = 0;
  Object.values(App.data.countries).forEach(c => {
    Object.values(c.data).forEach(d => {
      if (d.total > 0 && d.total < minV) minV = d.total;
      if (d.total > maxV) maxV = d.total;
    });
  });
  explorerColor.log    = d3.scaleSequentialLog(SEQ_INTERP).domain([Math.max(1, minV*0.8), maxV]);
  explorerColor.linear = d3.scaleSequential(SEQ_INTERP).domain([0, maxV]);
}

function explorerColorFor(total) {
  if (!total || total <= 0) return '#edf2f7';
  return explorerColor[App.scaleType](total);
}

// Diverging gender scale: female-heavy -> purple, 50/50 -> neutral, male-heavy -> orange
function genderColor(femalePct) {
  const t = (femalePct - 0.5) / 0.10; // -1..+1 over 0.40..0.60
  // d3.interpolatePuOr: 0 = orange (deficit of female), 1 = purple (excess of female)
  return DIV_INTERP(0.5 + t * 0.5);
}

// Diverging change scale for compare. Color domain pinned to [-100%, +100%]
// (so very large changes saturate to the extreme color), but the *displayed*
// percentage value is always the true accurate number.
function compareColor(pctChange) {
  const t = Math.max(-1, Math.min(1, pctChange));
  // 0 -> orange (decline), 0.5 -> neutral, 1 -> purple (growth)
  return DIV_INTERP((t + 1) / 2);
}
