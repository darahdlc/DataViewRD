// ============== MODE 3: COMPARE ==============
const Compare = (() => {
  let svg, g, projection, path, mapInited = false;

  function init() {
    if (mapInited) return;
    svg = d3.select('#compare-map');
    const { width, height } = svg.node().getBoundingClientRect();
    projection = d3.geoNaturalEarth1().fitSize([width, height - 10], { type: 'Sphere' });
    path = d3.geoPath(projection);
    g = svg.append('g');

    g.append('g').selectAll('path')
      .data(App.world.features)
      .join('path')
        .attr('class', 'country')
        .attr('d', path)
        .on('mouseover', onHover)
        .on('mousemove', moveTip)
        .on('mouseout',  () => hideTip());

    svg.call(d3.zoom().scaleExtent([1, 6]).on('zoom', (e) => g.attr('transform', e.transform)));

    setupPickers();
    drawLegend();
    mapInited = true;
    refresh(); // colorize + bars + context, now that mapInited === true
  }

  function setupPickers() {
    const a = document.getElementById('year-a');
    const b = document.getElementById('year-b');
    [a, b].forEach(sel => {
      App.data.years.forEach(y => {
        const o = document.createElement('option');
        o.value = y; o.textContent = y;
        sel.appendChild(o);
      });
    });
    a.value = App.yearA;
    b.value = App.yearB;
    a.addEventListener('change', () => { App.yearA = +a.value; refresh(); });
    b.addEventListener('change', () => { App.yearB = +b.value; refresh(); });
  }

  function pctChange(iso) {
    const c = App.data.countries[iso];
    const a = c.data[App.yearA], b = c.data[App.yearB];
    if (!a || !b) return null;
    return safePctChange(b.total, a.total); // accurate, uncapped
  }

  function onHover(ev, feat) {
    const c = getCountryByNum(feat.id);
    if (!c) {
      showTip(`<strong>${feat.properties.name}</strong><br><span style="opacity:.7">No data</span>`, ev);
      return;
    }
    const a = c.data[App.yearA], b = c.data[App.yearB];
    const pc = safePctChange(b.total, a.total); // accurate, uncapped
    showTip(`
      <strong>${c.name}</strong><br>
      <div class="tt-row"><span>${App.yearA}</span><span>${fmtCompact(a.total)}</span></div>
      <div class="tt-row"><span>${App.yearB}</span><span>${fmtCompact(b.total)}</span></div>
      <div class="tt-row" style="margin-top:4px"><span>Change</span><strong style="color:${pc>=0?'#9ae6b4':'#feb2b2'}">${fmtPct(pc)}</strong></div>
    `, ev);
  }

  function colorize() {
    g.selectAll('.country').each(function(feat) {
      const c = getCountryByNum(feat.id);
      const sel = d3.select(this);
      if (!c) { sel.classed('no-data', true).style('fill', '#edf2f7'); return; }
      const pc = pctChange(c.iso);
      if (pc == null || !isFinite(pc)) { sel.classed('no-data', true).style('fill', '#edf2f7'); return; }
      sel.classed('no-data', false).style('fill', compareColor(pc));
    });
  }

  function drawLegend() {
    const legend = d3.select('#compare-legend');
    legend.selectAll('*').remove();
    const W = 220, H = 12;
    const sv = legend.append('svg').attr('width', W + 20).attr('height', H + 18);
    const grad = sv.append('defs').append('linearGradient').attr('id', 'cmp-grad').attr('x1',0).attr('x2',1);
    d3.range(0, 1.001, 0.05).forEach(t => {
      grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', DIV_INTERP(t));
    });
    sv.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#cmp-grad)').attr('stroke', '#cbd5e0');
    sv.append('text').attr('x', 0).attr('y', H+14).attr('font-size', 10).text('≤ −100%');
    sv.append('text').attr('x', W/2).attr('y', H+14).attr('text-anchor', 'middle').attr('font-size', 10).text('0%');
    sv.append('text').attr('x', W).attr('y', H+14).attr('text-anchor', 'end').attr('font-size', 10).text('≥ +100%');
  }

  function drawTopBars() {
    const svgB = d3.select('#compare-bars');
    svgB.selectAll('*').remove();
    const ranked = Object.keys(App.data.countries)
      .map(iso => {
        const c = App.data.countries[iso];
        const a = c.data[App.yearA], b = c.data[App.yearB];
        return {
          iso, name: c.name,
          totalA: a.total, totalB: b.total,
          femA: a.female, femB: b.female,
          maleA: a.male, maleB: b.male,
          pc:  safePctChange(b.total,  a.total),  // accurate, uncapped
          fpc: safePctChange(b.female, a.female), // accurate, uncapped
          mpc: safePctChange(b.male,   a.male),   // accurate, uncapped
        };
      })
      .sort((x, y) => Math.abs(y.pc) - Math.abs(x.pc))
      .slice(0, 10);

    const W = svgB.node().getBoundingClientRect().width;
    const rowH = 28;
    const H = ranked.length * rowH + 30;
    svgB.attr('height', H);

    const m = { t: 16, r: 12, b: 8, l: 110 };
    const innerW = W - m.l - m.r;

    const maxAbs = d3.max(ranked, d => Math.max(Math.abs(d.fpc), Math.abs(d.mpc))) || 1;
    const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, innerW]);

    const g = svgB.append('g').attr('transform', `translate(${m.l},${m.t})`);

    // axis
    g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ranked.length * rowH)
      .attr('stroke', '#a0aec0');

    const ticks = [-maxAbs, -maxAbs/2, 0, maxAbs/2, maxAbs];
    g.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', d => x(d)).attr('y', -4).attr('text-anchor', 'middle')
      .attr('font-size', 9).attr('fill', '#718096')
      .text(d => fmtPct(d));

    const rows = g.selectAll('.row').data(ranked).join('g')
      .attr('transform', (d, i) => `translate(0,${i * rowH})`);

    rows.append('text')
      .attr('x', -8).attr('y', rowH/2 + 3)
      .attr('text-anchor', 'end').attr('font-size', 11).attr('fill', '#2d3748')
      .text(d => d.name);

    // female bar (top half)
    rows.append('rect')
      .attr('x', d => x(Math.min(0, d.fpc))).attr('y', 4)
      .attr('width', d => Math.abs(x(d.fpc) - x(0))).attr('height', 9)
      .attr('fill', '#d53f8c').attr('opacity', 0.85);
    // male bar (bottom half)
    rows.append('rect')
      .attr('x', d => x(Math.min(0, d.mpc))).attr('y', 14)
      .attr('width', d => Math.abs(x(d.mpc) - x(0))).attr('height', 9)
      .attr('fill', '#3182ce').attr('opacity', 0.85);
  }

  function drawContext() {
    const svgC = d3.select('#compare-context');
    svgC.selectAll('*').remove();
    const W = svgC.node().getBoundingClientRect().width;
    const H = 140;
    svgC.attr('height', H);
    const m = { t: 14, r: 14, b: 24, l: 50 };
    const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
    const years = App.data.years;
    const data = years.map(y => ({ year: y, total: App.data.globalTotals[y].total }));
    const x = d3.scaleLinear().domain([1999, 2025]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.total) * 1.1]).range([innerH, 0]);

    const g = svgC.append('g').attr('transform', `translate(${m.l},${m.t})`);

    g.append('rect').attr('x', x(2020)).attr('y', 0)
      .attr('width', x(2022) - x(2020)).attr('height', innerH)
      .attr('fill', '#fed7d7').attr('opacity', 0.45);
    g.append('text').attr('x', x(2021)).attr('y', 12).attr('text-anchor', 'middle')
      .attr('font-size', 10).attr('fill', '#9b2c2c').text('COVID');

    g.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', '#2c5282').attr('stroke-width', 2)
      .attr('d', d3.line().x(d => x(d.year)).y(d => y(d.total)).curve(d3.curveMonotoneX));

    [App.yearA, App.yearB].forEach((yr, i) => {
      const d = data.find(dd => dd.year === yr);
      if (!d) return;
      g.append('circle').attr('cx', x(d.year)).attr('cy', y(d.total))
        .attr('r', 5).attr('fill', i === 0 ? '#ed8936' : '#38a169').attr('stroke', '#fff').attr('stroke-width', 2);
      g.append('text').attr('x', x(d.year)).attr('y', y(d.total) - 8)
        .attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 600)
        .attr('fill', i === 0 ? '#c05621' : '#2f855a').text(d.year);
    });

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(6))
      .selectAll('text').style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => fmtCompact(d)))
      .selectAll('text').style('font-size', '10px');
  }

  function refresh() {
    document.getElementById('compare-hint').textContent =
      `${App.yearB} vs ${App.yearA} · paired bars show female and male separately.`;
    colorize();
    drawTopBars();
    drawContext();
  }

  return { init, refresh };
})();
