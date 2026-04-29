// ============== MODE 1: EXPLORER ==============
const Explorer = (() => {
  let svg, g, projection, path, mapInited = false;

  function init() {
    if (mapInited) return;
    svg = d3.select('#explorer-map');
    const { width, height } = svg.node().getBoundingClientRect();
    projection = d3.geoNaturalEarth1().fitSize([width, height - 10], { type: 'Sphere' });
    path = d3.geoPath(projection);

    g = svg.append('g').attr('class', 'world-g');

    // sphere fill (oceans already styled by CSS gradient on bg)
    g.append('path')
      .datum({ type: 'Sphere' })
      .attr('class', 'sphere')
      .attr('d', path)
      .attr('fill', 'none');

    g.append('g').attr('class', 'countries')
      .selectAll('path')
      .data(App.world.features)
      .join('path')
        .attr('class', 'country')
        .attr('d', path)
        .on('mouseover', onHover)
        .on('mousemove', moveTip)
        .on('mouseout',  () => hideTip())
        .on('click',     onClick);

    // zoom
    svg.call(d3.zoom().scaleExtent([1, 6]).on('zoom', (e) => {
      g.attr('transform', e.transform);
    }));

    drawSlider();
    drawLegend();
    setupScaleToggle();
    setupPlay();
    mapInited = true;
    colorize(); // paint the choropleth right away
  }

  function onHover(ev, feat) {
    const c = getCountryByNum(feat.id);
    if (!c) {
      showTip(`<strong>${feat.properties.name}</strong><br><span style="opacity:.7">No data</span>`, ev);
      return;
    }
    const d = c.data[App.currentYear];
    showTip(`
      <strong>${c.name}</strong> — ${App.currentYear}<br>
      <div class="tt-row"><span>Total</span><strong>${fmtCompact(d.total)}</strong></div>
      <div class="tt-row tt-female"><span>Female</span><span>${fmtCompact(d.female)} (${fmtPctSimple(d.female/d.total)})</span></div>
      <div class="tt-row tt-male"><span>Male</span><span>${fmtCompact(d.male)} (${fmtPctSimple(d.male/d.total)})</span></div>
    `, ev);
  }

  function onClick(ev, feat) {
    const c = getCountryByNum(feat.id);
    if (!c) return;
    App.selectedCountry = c.iso;
    g.selectAll('.country').classed('selected', d => d.id === feat.id);
    renderPanel(c);
  }

  function colorize() {
    if (!mapInited) return;
    g.selectAll('.country').each(function(feat) {
      const c = getCountryByNum(feat.id);
      const sel = d3.select(this);
      if (!c) { sel.classed('no-data', true).style('fill', '#edf2f7'); return; }
      const v = c.data[App.currentYear];
      sel.classed('no-data', false).style('fill', explorerColorFor(v.total));
    });
  }

  function drawLegend() {
    const legend = d3.select('#explorer-legend');
    legend.selectAll('*').remove();
    const W = 180, H = 12;
    const sv = legend.append('svg').attr('width', W + 50).attr('height', H + 18);

    const grad = sv.append('defs').append('linearGradient')
      .attr('id', 'exp-grad').attr('x1', 0).attr('x2', 1);
    d3.range(0, 1.001, 0.1).forEach(t => {
      grad.append('stop').attr('offset', `${t*100}%`)
        .attr('stop-color', d3.interpolateBlues(t));
    });
    sv.append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', H)
      .attr('fill', 'url(#exp-grad)').attr('stroke', '#cbd5e0');
    sv.append('text').attr('x', 0).attr('y', H + 14).attr('font-size', 10).text('Few');
    sv.append('text').attr('x', W).attr('y', H + 14).attr('text-anchor', 'end').attr('font-size', 10).text('Many');
    legend.append('span').text('arrivals · ' + (App.scaleType === 'log' ? 'log' : 'linear') + ' scale');
  }

  function drawSlider() {
    const slider = document.getElementById('year-slider');
    const display = document.getElementById('year-display');
    slider.value = App.currentYear;
    display.textContent = App.currentYear;
    slider.addEventListener('input', (e) => {
      App.currentYear = +e.target.value;
      display.textContent = App.currentYear;
      colorize();
      if (App.selectedCountry) {
        const c = { iso: App.selectedCountry, ...App.data.countries[App.selectedCountry] };
        renderPanel(c);
      }
    });
    // Markers
    const markers = document.getElementById('slider-markers');
    markers.innerHTML = '';
    [[2008, '2008 crisis'], [2020, 'COVID']].forEach(([y, label]) => {
      const pct = (y - 1999) / (2025 - 1999) * 100;
      const m = document.createElement('div');
      m.className = 'slider-marker';
      m.style.left = `calc(${pct}% - 1px)`;
      m.dataset.label = label;
      m.title = label;
      markers.appendChild(m);
    });
  }

  function setupScaleToggle() {
    document.querySelectorAll('.scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        App.scaleType = btn.dataset.scale;
        colorize();
        drawLegend();
      });
    });
  }

  let playTimer = null;
  function setupPlay() {
    const btn = document.getElementById('play-btn');
    btn.addEventListener('click', () => {
      if (playTimer) {
        clearInterval(playTimer); playTimer = null;
        btn.textContent = '▶';
      } else {
        btn.textContent = '⏸';
        playTimer = setInterval(() => {
          let y = App.currentYear + 1;
          if (y > 2025) y = 1999;
          App.currentYear = y;
          document.getElementById('year-slider').value = y;
          document.getElementById('year-display').textContent = y;
          colorize();
          if (App.selectedCountry) {
            const c = { iso: App.selectedCountry, ...App.data.countries[App.selectedCountry] };
            renderPanel(c);
          }
        }, 700);
      }
    });
  }

  function renderPanel(c) {
    const panel = document.getElementById('country-panel');
    const d = c.data[App.currentYear];
    const prev = c.data[App.currentYear - 1];
    const change = prev ? safePctChange(d.total, prev.total, true) : null;
    const femalePct = d.total ? d.female / d.total : 0;

    panel.innerHTML = `
      <h2>${c.name}</h2>
      <p class="hint">${c.continent} · ${App.currentYear}</p>
      <div class="stats-box">
        <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${fmtCompact(d.total)}</div></div>
        <div class="stat"><div class="stat-label">Female %</div><div class="stat-value female">${fmtPctSimple(femalePct)}</div></div>
        <div class="stat"><div class="stat-label">vs prev. year</div>
          <div class="stat-value ${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change == null ? '—' : fmtPct(change)}</div></div>
        <div class="stat"><div class="stat-label">Male %</div><div class="stat-value male">${fmtPctSimple(1 - femalePct)}</div></div>
      </div>
      <h3>Female arrivals</h3>
      <svg id="line-female" width="100%" height="120"></svg>
      <h3>Male arrivals</h3>
      <svg id="line-male" width="100%" height="120"></svg>
    `;
    drawLine('#line-female', c, 'female', '#d53f8c');
    drawLine('#line-male', c, 'male', '#3182ce');
  }

  function drawLine(sel, c, key, color) {
    const svg = d3.select(sel);
    svg.selectAll('*').remove();
    const W = svg.node().getBoundingClientRect().width;
    const H = 120;
    const m = { t: 8, r: 8, b: 22, l: 44 };
    const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
    const years = App.data.years;
    const data = years.map(y => ({ year: y, value: c.data[y][key] }));
    const x = d3.scaleLinear().domain([1999, 2025]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) * 1.1]).range([innerH, 0]);

    const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);

    // covid band
    g.append('rect')
      .attr('x', x(2020) - 4).attr('y', 0)
      .attr('width', x(2022) - x(2020) + 8).attr('height', innerH)
      .attr('fill', '#fed7d7').attr('opacity', 0.4);

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(6).tickSizeOuter(0))
      .selectAll('text').style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => fmtCompact(d)).tickSizeOuter(0))
      .selectAll('text').style('font-size', '10px');

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
      .attr('d', line);

    // year marker
    g.append('line')
      .attr('x1', x(App.currentYear)).attr('x2', x(App.currentYear))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#1a202c').attr('stroke-dasharray', '2,2').attr('opacity', .5);

    // dot for current year
    const cur = data.find(d => d.year === App.currentYear);
    if (cur) {
      g.append('circle').attr('cx', x(cur.year)).attr('cy', y(cur.value))
        .attr('r', 4).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2);
    }
  }

  function refresh() { colorize(); }

  return { init, refresh, colorize };
})();
