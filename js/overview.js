// ============== MODE 0: OVERVIEW (showcase) ==============
// World map with curved arrows from each origin to the Dominican Republic.
// Countries are colored on a sequential blue choropleth scale (log or linear),
// the same scale used in the Explorer view.
const Overview = (() => {
  let svg, gRoot, gMap, gArcs, gOrigins, gPulse, drLabel, projection, path;
  let zoomBehavior;
  let inited = false;
  let allTimeTotal = 0;

  // Dominican Republic centroid (lon, lat) — Santo Domingo
  const DR_LL = [-70.16, 18.74];

  // Independent scale state for the Overview tab so toggling here
  // doesn't disturb the Explorer view.
  let ovScale = 'log';

  function init() {
    if (inited) return;
    svg = d3.select('#overview-map');
    const { width, height } = svg.node().getBoundingClientRect();
    projection = d3.geoNaturalEarth1()
      .fitExtent([[20, 60], [width - 20, height - 60]], { type: 'Sphere' });
    path = d3.geoPath(projection);

    // Single root group so a single zoom transform moves the whole scene
    gRoot    = svg.append('g').attr('class', 'g-root');
    gMap     = gRoot.append('g').attr('class', 'g-map');
    gArcs    = gRoot.append('g').attr('class', 'g-arcs');
    gOrigins = gRoot.append('g').attr('class', 'g-origins');

    // Defs: arrow marker
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

    // Zoom & pan
    zoomBehavior = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[-50, -50], [width + 50, height + 50]])
      .on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoomBehavior);

    // Wheel-zoom should not also scroll the page
    svg.on('wheel', (e) => e.preventDefault(), { passive: false });

    // All-time total — sum globalTotals across every year (incl. ungeo buckets)
    allTimeTotal = Object.values(App.data.globalTotals).reduce((s, t) => s + t.total, 0);

    setupSlider();
    setupPlay();
    setupScaleToggle();
    setupZoomReset();

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
      App.currentYear = +e.target.value;
      document.getElementById('ov-year').textContent = App.currentYear;
      const s1 = document.getElementById('year-slider');
      const s2 = document.getElementById('year-slider-2');
      if (s1) { s1.value = App.currentYear; document.getElementById('year-display').textContent = App.currentYear; }
      if (s2) { s2.value = App.currentYear; document.getElementById('year-display-2').textContent = App.currentYear; }
      refresh();
    });
  }

  let playTimer = null;
  function setupPlay() {
    const btn = document.getElementById('ov-play');
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
          document.getElementById('ov-slider').value = y;
          document.getElementById('ov-year').textContent = y;
          refresh();
        }, 800);
      }
    });
  }

  function setupScaleToggle() {
    document.querySelectorAll('.ov-scale .scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ov-scale .scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ovScale = btn.dataset.ovscale;
        colorCountries();
      });
    });
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
