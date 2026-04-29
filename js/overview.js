// ============== MODE 0: OVERVIEW (showcase) ==============
const Overview = (() => {
  let svg, gRoot, gMap, gArcs, gOrigins, gPulse, drLabel, projection, path;
  let zoomBehavior;
  let inited = false;
  let allTimeTotal = 0;

  const DR_LL = [-70.16, 18.74];

  let ovScale = 'log';

  function init() {
    if (inited) return;
    svg = d3.select('#overview-map');
    const { width, height } = svg.node().getBoundingClientRect();
    projection = d3.geoNaturalEarth1()
      .fitExtent([[20, 60], [width - 20, height - 60]], { type: 'Sphere' });
    path = d3.geoPath(projection);

    gRoot    = svg.append('g').attr('class', 'g-root');
    gMap     = gRoot.append('g').attr('class', 'g-map');
    gArcs    = gRoot.append('g').attr('class', 'g-arcs');
    gOrigins = gRoot.append('g').attr('class', 'g-origins');

    const defs = svg.append('defs');
    const marker = defs.append('marker')
      .attr('id', 'ov-arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 5).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto');
    marker.append('path')
      .attr('d', 'M0,-3L6,0L0,3Z')
      .attr('class', 'arrow-head');

    // Background world — every country gets a path; data-iso lets us color origins later
    gMap.selectAll('path.country-bg')
      .data(App.world.features)
      .join('path')
        .attr('class', 'country-bg')
        .attr('d', path)
        .each(function(feat) {
          const c = getCountryByNum(feat.id);
          const sel = d3.select(this);
          if (c) sel.classed('origin', true).attr('data-iso', c.iso);
          if (feat.id === '214' ||
              feat.properties.name === 'Dominican Rep.' ||
              feat.properties.name === 'Dominican Republic') {
            sel.classed('dr', true);
          }
        })
        .on('mouseover', onCountryHover)
        .on('mousemove', moveTip)
        .on('mouseout',  hideTip);

    // DR pulse rings (inside gRoot so zoom moves them too)
    const dr = projection(DR_LL);
    if (dr) {
      gPulse = gRoot.append('g').attr('class', 'g-pulse')
        .attr('transform', `translate(${dr[0]},${dr[1]})`);
      gPulse.append('circle').attr('class', 'dr-pulse-ring').attr('r', 5);
      gPulse.append('circle').attr('class', 'dr-pulse-ring').attr('r', 5)
        .style('animation-delay', '1s');
      gPulse.append('circle').attr('r', 5).attr('class', 'dr-pulse');
      drLabel = gRoot.append('text').attr('class', 'dr-label')
        .attr('x', dr[0]).attr('y', dr[1] + 24)
        .attr('text-anchor', 'middle')
        .text('Dominican Republic');
    }

    zoomBehavior = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[-50, -50], [width + 50, height + 50]])
      .on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoomBehavior);

    svg.on('wheel', (e) => e.preventDefault(), { passive: false });

    // All-time total — sum globalTotals across every year (incl. ungeo buckets)
    allTimeTotal = Object.values(App.data.globalTotals).reduce((s, t) => s + t.total, 0);

    setupSlider();
    setupPlay();
    setupScaleToggle();
    setupZoomReset();
    drawLegend();

    inited = true;
    refresh();
  }

  function onCountryHover(ev, feat) {
    const c = getCountryByNum(feat.id);
    if (!c) {
      showTip(`<strong>${feat.properties.name}</strong><br><span style="opacity:.7">No data</span>`, ev);
      return;
    }
    const d = c.data[App.currentYear];
    showTip(`
      <strong>${c.name}</strong> — ${App.currentYear}<br>
      <div class="tt-row"><span>Total</span><strong>${fmtCompact(d.total)}</strong></div>
      <div class="tt-row tt-female"><span>Female</span><span>${fmtCompact(d.female)}</span></div>
      <div class="tt-row tt-male"><span>Male</span><span>${fmtCompact(d.male)}</span></div>
    `, ev);
  }

  function setupSlider() {
    const slider = document.getElementById('ov-slider');
    slider.value = App.currentYear;
    document.getElementById('ov-year').textContent = App.currentYear;
    slider.addEventListener('input', e => {
      setYear(+e.target.value); // central sync — updates all sliders + charts
    });
  }

  function setupPlay() {
    const btn = document.getElementById('ov-play');
    btn.addEventListener('click', togglePlay); // shared timer across all tabs
  }

  function setupScaleToggle() {
    document.querySelectorAll('.ov-scale .scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ov-scale .scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ovScale = btn.dataset.ovscale;
        colorCountries();
        drawLegend();
      });
    });
  }

  function drawLegend() {
    const legend = d3.select('#ov-legend');
    if (legend.empty()) return;
    legend.selectAll('*').remove();

    const sc = ovScale === 'log' ? explorerColor.log : explorerColor.linear;
    const [minD, maxD] = sc.domain();

    const W = 200, H = 10;
    const sv = legend.append('svg').attr('width', W + 8).attr('height', H + 28);
    const grad = sv.append('defs').append('linearGradient')
      .attr('id', 'ov-grad').attr('x1', 0).attr('x2', 1);
    d3.range(0, 1.001, 0.05).forEach(t => {
      grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', SEQ_INTERP(t));
    });
    sv.append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', H)
      .attr('fill', 'url(#ov-grad)').attr('stroke', 'rgba(255,255,255,0.35)');

    // Concrete min / mid / max values so the color encoding is unambiguous
    const midD = ovScale === 'log'
      ? Math.sqrt(minD * maxD)              // geometric mean for log
      : (minD + maxD) / 2;                  // arithmetic mean for linear
    sv.append('text').attr('x', 0).attr('y', H + 12)
      .attr('font-size', 10).attr('fill', '#e2e8f0').text(fmtCompact(minD));
    sv.append('text').attr('x', W/2).attr('y', H + 12).attr('text-anchor', 'middle')
      .attr('font-size', 10).attr('fill', '#e2e8f0').text(fmtCompact(midD));
    sv.append('text').attr('x', W).attr('y', H + 12).attr('text-anchor', 'end')
      .attr('font-size', 10).attr('fill', '#e2e8f0').text(fmtCompact(maxD));

    sv.append('text').attr('x', 0).attr('y', H + 26)
      .attr('font-size', 10).attr('fill', '#a0aec0')
      .text(`arrivals per country · ${ovScale === 'log' ? 'log' : 'linear'} scale`);

    // ---- Arc thickness legend ----
    // Three sample widths matching the wScale used to draw the arcs, with labels
    // showing the approximate magnitude each thickness represents this year.
    const yearTotals = Object.values(App.data.countries).map(c => c.data[App.currentYear]?.total || 0);
    const maxV = Math.max(1, d3.max(yearTotals) || 1);
    const sample = [maxV * 0.05, maxV * 0.30, maxV];
    const wScale = d3.scaleSqrt().domain([1, maxV]).range([0.35, 3.2]);

    const tw = 200, th = 38;
    const tv = legend.append('svg').attr('width', tw + 8).attr('height', th)
      .style('display', 'block').style('margin-top', '6px');
    const xStep = tw / sample.length;
    sample.forEach((v, i) => {
      const cx = i * xStep + xStep/2;
      // Sample arc — short curved stroke with thickness from wScale
      tv.append('path')
        .attr('d', `M ${cx-22} 14 Q ${cx} 4, ${cx+22} 14`)
        .attr('fill', 'none')
        .attr('stroke', '#f6ad55')
        .attr('stroke-width', wScale(Math.max(1, v)))
        .attr('opacity', 0.9);
      tv.append('text')
        .attr('x', cx).attr('y', 30)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10).attr('fill', '#e2e8f0')
        .text(fmtCompact(v));
    });
    legend.append('span')
      .style('color', '#a0aec0').style('font-size', '11px')
      .text('arc thickness · arrivals from that origin');
  }

  function setupZoomReset() {
    const btn = document.getElementById('ov-zoom-reset');
    if (!btn) return;
    btn.addEventListener('click', () => {
      svg.transition().duration(450).call(zoomBehavior.transform, d3.zoomIdentity);
    });
  }

  function buildArcPath(origin, dest) {
    const o = projection(origin);
    const d = projection(dest);
    if (!o || !d) return null;
    const mx = (o[0] + d[0]) / 2;
    const my = (o[1] + d[1]) / 2;
    const dx = d[0] - o[0], dy = d[1] - o[1];
    const dist = Math.hypot(dx, dy);
    const bow = Math.min(180, Math.max(40, dist * 0.32));
    let nx = -dy / dist, ny = dx / dist;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const cx = mx + nx * bow;
    const cy = my + ny * bow;
    return { d: `M ${o[0]} ${o[1]} Q ${cx} ${cy} ${d[0]} ${d[1]}`, o, dst: d, c: [cx, cy] };
  }

  // Choropleth coloring on the same Blues scale as the Explorer view, but
  // independent log/linear toggle (ovScale).
  function colorFor(total) {
    if (!total || total <= 0) return '#1a2a3e';
    const sc = ovScale === 'log' ? explorerColor.log : explorerColor.linear;
    return sc(total);
  }
  function colorCountries() {
    if (!gMap) return;
    const year = App.currentYear;
    // Use inline style so it overrides the CSS rule on .country-bg.origin
    gMap.selectAll('path.country-bg').each(function(feat) {
      const c = getCountryByNum(feat.id);
      const sel = d3.select(this);
      if (sel.classed('dr')) return; // keep DR amber via CSS
      if (!c) { sel.style('fill', null); return; } // fall back to CSS dark blue
      const v = c.data[year]?.total || 0;
      sel.style('fill', colorFor(v));
    });
  }

  function refresh() {
    if (!inited) return;
    const year = App.currentYear;

    // All countries with non-zero arrivals this year and a known centroid
    const rows = Object.entries(App.data.countries)
      .map(([iso, c]) => ({
        iso, name: c.name,
        total: c.data[year].total,
        female: c.data[year].female,
        male: c.data[year].male,
        lon: c.lon, lat: c.lat,
      }))
      .filter(r => r.total > 0 && r.lon != null)
      .sort((a, b) => b.total - a.total);

    // Stats — year + all-time
    const yearTotal = App.data.globalTotals[year].total;
    document.getElementById('ov-bignum').textContent  = fmtCompact(yearTotal);
    document.getElementById('ov-alltime').textContent = fmtCompact(allTimeTotal);

    // Color the countries on the blue scale (log/linear)
    colorCountries();

    // Arc width and opacity scales
    const maxV = rows.length ? rows[0].total : 1;
    const wScale       = d3.scaleSqrt().domain([1, maxV]).range([0.35, 3.2]);
    const opacityScale = d3.scaleSqrt().domain([1, maxV]).range([0.30, 0.92]);

    const arcsData = rows.map(r => {
      const arc = buildArcPath([r.lon, r.lat], DR_LL);
      if (!arc) return null;
      return { ...r, ...arc, w: wScale(Math.max(1, r.total)) };
    }).filter(Boolean);

    // Glow underlay
    gArcs.selectAll('path.arc-glow').data(arcsData, d => d.iso).join(
      enter => enter.append('path')
        .attr('class', 'arc-glow')
        .attr('d', d => d.d)
        .attr('stroke-width', d => d.w * 2.5),
      update => update.transition().duration(500)
        .attr('d', d => d.d)
        .attr('stroke-width', d => d.w * 2.5),
      exit => exit.remove()
    );

    // Main arcs
    gArcs.selectAll('path.arc').data(arcsData, d => d.iso).join(
      enter => {
        const sel = enter.append('path')
          .attr('class', 'arc')
          .attr('d', d => d.d)
          .attr('marker-end', 'url(#ov-arrow)')
          .attr('stroke-width', d => d.w)
          .attr('opacity', 0);
        sel.each(function(d) {
          const len = this.getTotalLength();
          d3.select(this)
            .attr('stroke-dasharray', `${len} ${len}`)
            .attr('stroke-dashoffset', len)
            .transition().duration(900).delay(40)
              .attr('opacity', d => opacityScale(Math.max(1, d.total)))
              .attr('stroke-dashoffset', 0);
        });
        return sel;
      },
      update => update.transition().duration(500)
        .attr('d', d => d.d)
        .attr('stroke-width', d => d.w)
        .attr('opacity', d => opacityScale(Math.max(1, d.total))),
      exit => exit.transition().duration(300).attr('opacity', 0).remove()
    );

    // Origin dots + top labels
    const top = arcsData.slice(0, 12);
    const dotR = d3.scaleSqrt().domain([1, maxV]).range([1.8, 5.5]);

    gOrigins.selectAll('circle.origin-dot').data(arcsData, d => d.iso).join(
      enter => enter.append('circle')
        .attr('class', 'origin-dot')
        .attr('cx', d => d.o[0]).attr('cy', d => d.o[1])
        .attr('r', d => dotR(Math.max(1, d.total)))
        .on('mouseover', (ev, d) => {
          showTip(`<strong>${d.name}</strong><br>
            <div class="tt-row"><span>${App.currentYear}</span><strong>${fmtCompact(d.total)}</strong></div>
            <div class="tt-row" style="opacity:.7"><span>share</span><span>${fmtPctSimple(d.total / yearTotal)}</span></div>`, ev);
        })
        .on('mousemove', moveTip)
        .on('mouseout', hideTip),
      update => update.transition().duration(500)
        .attr('cx', d => d.o[0]).attr('cy', d => d.o[1])
        .attr('r', d => dotR(Math.max(1, d.total))),
      exit => exit.remove()
    );

    gOrigins.selectAll('text.origin-label').data(top, d => d.iso).join(
      enter => enter.append('text')
        .attr('class', 'origin-label')
        .attr('x', d => d.o[0])
        .attr('y', d => d.o[1] - 10)
        .attr('text-anchor', 'middle')
        .text(d => d.name),
      update => update.transition().duration(500)
        .attr('x', d => d.o[0])
        .attr('y', d => d.o[1] - 10)
        .text(d => d.name),
      exit => exit.remove()
    );

    gOrigins.selectAll('text.origin-value').data(top, d => d.iso).join(
      enter => enter.append('text')
        .attr('class', 'origin-value')
        .attr('x', d => d.o[0])
        .attr('y', d => d.o[1] + 16)
        .attr('text-anchor', 'middle')
        .text(d => fmtCompact(d.total)),
      update => update.transition().duration(500)
        .attr('x', d => d.o[0])
        .attr('y', d => d.o[1] + 16)
        .text(d => fmtCompact(d.total)),
      exit => exit.remove()
    );

    drawLeaderboard(rows);
  }

  function drawLeaderboard(rows) {
    const board = document.getElementById('ov-board');
    const top = rows.slice(0, 12);
    if (!top.length) { board.innerHTML = ''; return; }
    const max = top[0].total;
    const totalAll = rows.reduce((s, r) => s + r.total, 0);
    board.innerHTML = `<h3>Top origins · ${App.currentYear}</h3>` +
      top.map((r, i) => `
        <div class="lb-row" title="${r.name}: ${r.total.toLocaleString()} (${(r.total/totalAll*100).toFixed(1)}% of mapped)">
          <div class="lb-rank">${i + 1}</div>
          <div class="lb-name">${r.name}</div>
          <div class="lb-val">${fmtCompact(r.total)}</div>
          <div class="lb-bar" style="width:${(r.total / max * 100).toFixed(1)}%"></div>
        </div>`).join('') +
      `<div class="lb-foot">${rows.length} origin countries shown · scroll to zoom</div>`;
  }

  return { init, refresh };
})();
