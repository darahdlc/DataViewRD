// ============== Shared utilities ==============
const App = {
  data: null,
  world: null,            // topojson features
  numToIso3: {},          // numeric ISO -> "USA"
  currentYear: 2024,
  currentMode: 'explorer',
  selectedCountry: null,
  scaleType: 'log',
  yearA: 2019,
  yearB: 2024,
};

const fmt = d3.format(',.0f');
const fmtPct = d3.format('+.1%');
const fmtPctSimple = d3.format('.1%');

function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return d3.format(',.0f')(n);
}

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

// Data lookup helpers
function getCountryByNum(numStr) {
  const iso = App.numToIso3[String(numStr).padStart(3, '0')];
  if (!iso) return null;
  return { iso, ...App.data.countries[iso] };
}
function valueFor(iso, year) {
  const c = App.data.countries[iso];
  if (!c) return null;
  return c.data[year];
}

// Color scales
const explorerColor = {
  log: null,
  linear: null,
};

function buildExplorerScales() {
  // Domain across all years/countries totals
  let minV = Infinity, maxV = 0;
  Object.values(App.data.countries).forEach(c => {
    Object.values(c.data).forEach(d => {
      if (d.total > 0 && d.total < minV) minV = d.total;
      if (d.total > maxV) maxV = d.total;
    });
  });
  explorerColor.log = d3.scaleSequentialLog(d3.interpolateBlues).domain([Math.max(1, minV*0.8), maxV]);
  explorerColor.linear = d3.scaleSequential(d3.interpolateBlues).domain([0, maxV]);
}

function explorerColorFor(total) {
  if (!total || total <= 0) return '#edf2f7';
  return explorerColor[App.scaleType](total);
}

// Diverging gender scale: rose (female-heavy) -> white -> blue (male-heavy)
function genderColor(femalePct) {
  // femalePct in 0-1; 0.5 is white. Range roughly 0.40 to 0.60 in our data.
  // Map femalePct: >0.5 -> rose, <0.5 -> blue.
  const t = (femalePct - 0.5) / 0.10; // -1..+1 over 0.40..0.60
  const c = d3.interpolateRdBu(0.5 - t*0.5);
  // d3.interpolateRdBu: 0 = red, 1 = blue. Female heavy -> red side.
  return c;
}

// Diverging change scale for compare
function compareColor(pctChange) {
  // pctChange is a fraction; clamp to [-1, +1] for color domain
  const t = Math.max(-1, Math.min(1, pctChange));
  // Want green for positive, red/pink for negative -> use PiYG inverted
  // d3.interpolatePiYG: 0 pink, 1 green. Map: t=-1 -> 0, t=+1 -> 1
  return d3.interpolatePiYG((t + 1) / 2);
}
