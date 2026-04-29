// ============== MODE 0: OVERVIEW (showcase) ==============
const Overview = (() => {
  let svg, gRoot, gMap, gArcs, gOrigins, gPulse, drLabel, projection, path;
  let gLabels;                       // sits OUTSIDE the zoom transform
  let zoomBehavior;
  let inited = false;
  let allTimeTotal = 0;
  let currentTransform = null;       // last d3.zoomTransform from the zoom handler
  let currentLabels = [];            // labels for the active year, kept across zoom events

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
    // Labels live OUTSIDE the zoomed group so text stays a constant pixel
    // size — like Google Maps — while their anchor positions move with zoom.
    gLabels  = svg.append('g').attr('class', 'g-labels');

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
      .on('zoom', (e) => {
        gRoot.attr('transform', e.transform);
        currentTransform = e.transform;
        // Re-resolve label collisions in screen space using the new
        // transform — anchors move apart when zooming in, so labels can
        // settle into freshly-available space.
        layoutLabels(true);
      });
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

    // ===== Block 1 — choropleth color legend =====
    const colorBlock = legend.append('div').attr('class', 'ov-legend-block');
    colorBlock.append('div')
      .attr('class', 'ov-legend-title')
      .text('Arrivals (Density)');

    const sc = ovScale === 'log' ? explorerColor.log : explorerColor.linear;
    const [minD, maxD] = sc.domain();

    const W = 200, H = 10;
    const sv = colorBlock.append('svg').attr('width', W + 8).attr('height', H + 18);
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

    colorBlock.append('div')
      .attr('class', 'ov-legend-caption')
      .text(`arrivals per country · ${ovScale === 'log' ? 'log' : 'linear'} scale`);

    const arcBlock = legend.append('div').attr('class', 'ov-legend-block');
    arcBlock.append('div')
      .attr('class', 'ov-legend-title')
      .text('Arc thickness (Density)');

    const yearTotals = Object.values(App.data.countries).map(c => c.data[App.currentYear]?.total || 0);
    const maxV = Math.max(1, d3.max(yearTotals) || 1);
    const sample = [maxV * 0.05, maxV * 0.30, maxV];
    const wScale = d3.scaleSqrt().domain([1, maxV]).range([0.35, 3.2]);

    const tw = 200, th = 38;
    const tv = arcBlock.append('svg').attr('width', tw + 8).attr('height', th)
      .style('display', 'block');
    const xStep = tw / sample.length;
    sample.forEach((v, i) => {
      const cx = i * xStep + xStep/2;
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
    arcBlock.append('div')
      .attr('class', 'ov-legend-caption')
      .text('arrivals from that origin');
  }


  function resolveLabelCollisions(items, opts = {}) {
    const padX = opts.padX ?? 2;
    const padY = opts.padY ?? 2;
    const iters = opts.iters ?? 140;
    const anchorPull = opts.anchorPull ?? 0.05;
    items.forEach(d => {
      d.w = Math.max(28, d.name.length * 5.6) + padX * 2;
      d.h = 12 + padY * 2;
      if (d.x == null || d.y == null) {
        d.x = d.ax;
        d.y = d.ay - 10;
      }
    });
    const N = items.length;
    for (let it = 0; it < iters; it++) {
      let moved = false;
      for (let i = 0; i < N; i++) {
        const a = items[i];
        a.x += (a.ax - a.x) * anchorPull;
        a.y += ((a.ay - 12) - a.y) * anchorPull;
      }
      for (let i = 0; i < N; i++) {
        const a = items[i];
        for (let j = i + 1; j < N; j++) {
          const b = items[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const ox = (a.w + b.w) / 2 - Math.abs(dx);
          const oy = (a.h + b.h) / 2 - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            moved = true;
            if (ox < oy) {
              const sx = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5);
              a.x -= sx; b.x += sx;
            } else {
              const sy = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5);
              a.y -= sy; b.y += sy;
            }
          }
        }
      }
      if (!moved && it > 8) break;
    }
    return items;
  }

  // Cache previous label positions across refreshes so transitions are smooth
  const _labelPos = new Map();

  function setupZoomReset() {
    const btn = document.getElementById('ov-zoom-reset');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // Clear cached label positions so they re-seed at the unzoomed anchor
      // instead of animating from a wide-zoom layout that no longer fits.
      _labelPos.clear();
      currentLabels.forEach(l => { l.x = null; l.y = null; });
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

    // Origin dots — one per country with data this year
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

    // ----- Label every country from the cleaned DB. Store the unzoomed
    //       projected anchor (ox, oy) on each label; layoutLabels() will
    //       project it through the current zoom transform and resolve
    //       collisions in screen space, so labels separate naturally as
    //       you zoom in (Google Maps style). -----
    currentLabels = arcsData.map(d => {
      const prev = _labelPos.get(d.iso);
      return {
        iso: d.iso,
        name: d.name,
        ox: d.o[0], oy: d.o[1],            // unzoomed anchor (projection space)
        ax: d.o[0], ay: d.o[1],            // screen-space anchor (set in layoutLabels)
        x: prev ? prev.x : d.o[0],
        y: prev ? prev.y : d.o[1] - 10,
      };
    });

    // Run the label layout — it will resolve collisions and bind the labels
    // and connector lines into gLabels (which lives outside the zoom group).
    layoutLabels(false);

    // origin-value text removed — figure already in tooltip + leaderboard,
    // and removing it keeps the map readable when all countries are labeled.
    gOrigins.selectAll('text.origin-value').remove();

    drawLeaderboard(rows);
  }

  // Project each label's unzoomed anchor through the current zoom transform,
  // resolve overlaps in screen space, and update gLabels' DOM. Called from
  // both refresh() (data change) and the zoom handler (view change).
  function layoutLabels(fromZoom) {
    if (!gLabels || !currentLabels.length) return;
    const t = currentTransform || d3.zoomIdentity;

    // Place each label's anchor in current screen coordinates
    currentLabels.forEach(l => {
      l.ax = t.applyX(l.ox);
      l.ay = t.applyY(l.oy);
      // Seed (x,y) at anchor on first sight so resolveLabelCollisions has
      // a sensible starting point near the (now-zoomed) dot.
      if (l.x == null || l.y == null) {
        l.x = l.ax;
        l.y = l.ay - 10;
      }
    });

    // Fewer iterations during interactive zoom so the layout stays snappy;
    // a full pass once the zoom settles via refresh().
    resolveLabelCollisions(currentLabels, fromZoom ? { iters: 50, anchorPull: 0.10 } : {});

    // Persist resolved screen-space positions back as projection-space
    // offsets so the next layout pass can pick up where this one left off.
    _labelPos.clear();
    currentLabels.forEach(l => _labelPos.set(l.iso, { x: l.x, y: l.y }));

    // Zoom events fire fast — skip the transition then so labels track the
    // zoom in real time. Year changes use a soft transition.
    const dur = fromZoom ? 0 : 600;

    // Connector line from each dot to its label
    const linkSel = gLabels.selectAll('line.origin-link')
      .data(currentLabels, d => d.iso);
    linkSel.join(
      enter => enter.append('line')
        .attr('class', 'origin-link')
        .attr('x1', d => d.ax).attr('y1', d => d.ay)
        .attr('x2', d => d.x).attr('y2', d => d.y + 4)
        .attr('opacity', 0.45),
      update => dur
        ? update.transition().duration(dur)
            .attr('x1', d => d.ax).attr('y1', d => d.ay)
            .attr('x2', d => d.x).attr('y2', d => d.y + 4)
        : update
            .attr('x1', d => d.ax).attr('y1', d => d.ay)
            .attr('x2', d => d.x).attr('y2', d => d.y + 4),
      exit => exit.remove()
    );

    const textSel = gLabels.selectAll('text.origin-label')
      .data(currentLabels, d => d.iso);
    textSel.join(
      enter => enter.append('text')
        .attr('class', 'origin-label')
        .attr('x', d => d.x).attr('y', d => d.y)
        .attr('text-anchor', 'middle')
        .attr('opacity', 0)
        .text(d => d.name)
        .call(s => s.transition().duration(500).attr('opacity', 1)),
      update => dur
        ? update.transition().duration(dur)
            .attr('x', d => d.x).attr('y', d => d.y)
            .text(d => d.name)
        : update
            .attr('x', d => d.x).attr('y', d => d.y)
            .text(d => d.name),
      exit => exit.remove()
    );
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
