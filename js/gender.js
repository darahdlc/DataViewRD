// ============== MODE 2: GENDER RATIO ==============
const Gender = (() => {
  let svg, g, projection, path, mapInited = false;

  function init() {
    if (mapInited) return;
    svg = d3.select('#gender-map');
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
        .on('mouseout',  () => hideTip())
        .on('click',     onClick);

    svg.call(d3.zoom().scaleExtent([1, 6]).on('zoom', (e) => g.attr('transform', e.transform)));

    drawSlider();
    drawLegend();
    drawStack();
    setupPlay();
    mapInited = true;
    colorize(); // paint the choropleth as soon as the paths are mounted
    if (App.selectedCountry && App.data.countries[App.selectedCountry]) {
      renderCountryPanel({ iso: App.selectedCountry, ...App.data.countries[App.selectedCountry] });
    }
  }

  function onClick(ev, feat) {
    const c = getCountryByNum(feat.id);
    if (!c) return;
    App.selectedCountry = c.iso;
    g.selectAll('.country').classed('selected', d => d.id === feat.id);
    renderCountryPanel(c);
  }

  function onHover(ev, feat) {
    const c = getCountryByNum(feat.id);
    if (!c) {
      showTip(`<strong>${feat.properties.name}</strong><br><span style="opacity:.7">No data</span>`, ev);
      return;
    }
    const d = c.data[App.currentYear];
    const fp = d.female / d.total;
    showTip(`
      <strong>${c.name}</strong> — ${App.currentYear}<br>
      <div class="tt-row tt-female"><span>Female</span><span>${fmtPctSimple(fp)} · ${fmtCompact(d.female)}</span></div>
      <div class="tt-row tt-male"><span>Male</span><span>${fmtPctSimple(1-fp)} · ${fmtCompact(d.male)}</span></div>
      <div class="tt-row" style="margin-top:4px;opacity:.7"><span>Skew</span><span>${(fp-0.5>=0?'+':'')}${((fp-0.5)*100).toFixed(1)} pp F</span></div>
    `, ev);
  }

  function colorize() {
    if (!mapInited) return;
    g.selectAll('.country').each(function(feat) {
      const c = getCountryByNum(feat.id);
      const sel = d3.select(this);
      if (!c) { sel.classed('no-data', true).style('fill', '#edf2f7'); return; }
      const d = c.data[App.currentYear];
      if (!d.total) { sel.classed('no-data', true).style('fill', '#edf2f7'); return; }
      const fp = d.female / d.total;
      sel.classed('no-data', false).style('fill', genderColor(fp));
    });
  }

  function drawLegend() {
    const legend = d3.select('#gender-legend');
    legend.selectAll('*').remove();
    const W = 220, H = 12;
    const sv = legend.append('svg').attr('width', W + 50).attr('height', H + 18);
    const grad = sv.append('defs').append('linearGradient').attr('id', 'gender-grad').attr('x1',0).attr('x2',1);
    d3.range(0, 1.001, 0.05).forEach(t => {
      // 0 = orange (more male), 1 = purple (more female) — see genderColor()
      grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', DIV_INTERP(t));
    });
    sv.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#gender-grad)').attr('stroke', '#cbd5e0');
    sv.append('text').attr('x', 0).attr('y', H+14).attr('font-size', 10).text('More male');
    sv.append('text').attr('x', W/2).attr('y', H+14).attr('text-anchor', 'middle').attr('font-size', 10).text('50/50');
    sv.append('text').attr('x', W).attr('y', H+14).attr('text-anchor', 'end').attr('font-size', 10).text('More female');
  }

  function drawSlider() {
    const slider = document.getElementById('year-slider-2');
    const display = document.getElementById('year-display-2');
    slider.value = App.currentYear;
    display.textContent = App.currentYear;
    slider.addEventListener('input', e => {
      setYear(+e.target.value); // central sync — updates all sliders + charts
    });
    const markers = document.getElementById('slider-markers-2');
    markers.innerHTML = '';
    [[2020, 'COVID']].forEach(([y, label]) => {
      const pct = (y - 1999) / (2025 - 1999) * 100;
      const m = document.createElement('div');
      m.className = 'slider-marker';
      m.style.left = `calc(${pct}% - 1px)`;
      m.dataset.label = label;
      markers.appendChild(m);
    });
  }

  function setupPlay() {
    const btn = document.getElementById('play-btn-2');
    btn.addEventListener('click', togglePlay); // shared timer across all tabs
  }

  function drawStack() {
    const svg = d3.select('#gender-stack');
    svg.selectAll('*').remove();
    svg.attr('height', 180);
    const W = svg.node().getBoundingClientRect().width;
    const H = 180;
    const m = { t: 14, r: 12, b: 28, l: 40 };
    const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
    const years = App.data.years;
    const data = years.map(y => {
      const t = App.data.globalTotals[y];
      return { year: y, female: t.female / t.total, male: t.male / t.total };
    });
    const x = d3.scaleLinear().domain([1999, 2025]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);

    const stack = d3.stack().keys(['female', 'male'])(data);
    const area = d3.area()
      .x(d => x(d.data.year))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX);

    const colors = { female: FEMALE_COLOR, male: MALE_COLOR };
    g.selectAll('path').data(stack).join('path')
      .attr('fill', d => colors[d.key])
      .attr('opacity', 0.85)
      .attr('d', area);

    // 50% line
    g.append('line').attr('x1', 0).attr('x2', innerW)
      .attr('y1', y(0.5)).attr('y2', y(0.5))
      .attr('stroke', '#fff').attr('stroke-width', 1).attr('stroke-dasharray', '3,3');

    // year marker
    g.append('line').attr('x1', x(App.currentYear)).attr('x2', x(App.currentYear))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#1a202c').attr('stroke-width', 1).attr('opacity', .5);

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(6))
      .selectAll('text').style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(d3.format('.0%')).ticks(4))
      .selectAll('text').style('font-size', '10px');

    // labels
    const lastF = data[data.length-1].female;
    g.append('text').attr('x', innerW - 4).attr('y', y(lastF/2))
      .attr('text-anchor', 'end').attr('fill', '#fff').attr('font-size', 11).attr('font-weight', 600)
      .text(`F ${fmtPctSimple(lastF)}`);
    g.append('text').attr('x', innerW - 4).attr('y', y(lastF + (1-lastF)/2))
      .attr('text-anchor', 'end').attr('fill', '#fff').attr('font-size', 11).attr('font-weight', 600)
      .text(`M ${fmtPctSimple(1-lastF)}`);
  }

  function refresh() {
    colorize();
    drawStack();
    if (App.selectedCountry && App.data.countries[App.selectedCountry] && mapInited) {
      const c = { iso: App.selectedCountry, ...App.data.countries[App.selectedCountry] };
      renderCountryPanel(c);
    }
  }

  function renderCountryPanel(c) {
    const panel = document.getElementById('gender-country-panel');
    if (!panel) return;
    const d = c.data[App.currentYear];
    const fp = d.total ? d.female / d.total : 0;
    panel.innerHTML = `
      <h2>${c.name}</h2>
      <p class="hint">${c.continent} · ${App.currentYear}</p>
      <div class="stats-box">
        <div class="stat"><div class="stat-label">Female %</div><div class="stat-value female">${fmtPctSimple(fp)}</div></div>
        <div class="stat"><div class="stat-label">Male %</div><div class="stat-value male">${fmtPctSimple(1 - fp)}</div></div>
      </div>
      <h3>Female arrivals</h3>
      <svg id="gender-line-female" width="100%" height="120"></svg>
      <h3>Male arrivals</h3>
      <svg id="gender-line-male" width="100%" height="120"></svg>
    `;
    drawLine('#gender-line-female', c, 'female', FEMALE_COLOR);
    drawLine('#gender-line-male',   c, 'male',   MALE_COLOR);
  }

  function drawLine(sel, c, key, color) {
    const svg = d3.select(sel);
    svg.selectAll('*').remove();
    const node = svg.node();
    const W = node.getBoundingClientRect().width;
    const H = +svg.attr('height') || 120;
    const m = { t: 8, r: 8, b: 22, l: 44 };
    const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
    const years = App.data.years;
    const data = years.map(y => ({ year: y, value: c.data[y][key] }));
    const x = d3.scaleLinear().domain([1999, 2025]).range([0, innerW]);
    const yMax = Math.max(1, d3.max(data, d => d.value) || 0);
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([innerH, 0]);

    const g2 = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);

    g2.append('rect')
      .attr('x', x(2020) - 4).attr('y', 0)
      .attr('width', x(2022) - x(2020) + 8).attr('height', innerH)
      .attr('fill', '#fed7d7').attr('opacity', 0.4);

    g2.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(6).tickSizeOuter(0))
      .selectAll('text').style('font-size', '10px');
    g2.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => fmtCompact(d)).tickSizeOuter(0))
      .selectAll('text').style('font-size', '10px');

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    g2.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
      .attr('d', line);

    g2.append('line')
      .attr('x1', x(App.currentYear)).attr('x2', x(App.currentYear))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#1a202c').attr('stroke-dasharray', '2,2').attr('opacity', .5);

    const cur = data.find(d => d.year === App.currentYear);
    if (cur) {
      g2.append('circle').attr('cx', x(cur.year)).attr('cy', y(cur.value))
        .attr('r', 4).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2);
    }
  }

  return { init, refresh, colorize, drawStack };
})();
