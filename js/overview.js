// ============== MODE 0: OVERVIEW (showcase) ==============
// Curved arrows from every origin country to the Dominican Republic,
// thickness scaled by total arrivals for the selected year.
const Overview = (() => {
  let svg, gMap, gArcs, gOrigins, projection, path;
  let inited = false;

  // Dominican Republic centroid (lon, lat) — Santo Domingo
  const DR_LL = [-70.16, 18.74];

  // origin lon/lat now comes from the data file itself (c.lon, c.lat for each country).

  function init() {
    if (inited) return;
    svg = d3.select('#overview-map');
    const { width, height } = svg.node().getBoundingClientRect();
    projection = d3.geoNaturalEarth1()
      .fitExtent([[20, 60], [width - 20, height - 60]], { type: 'Sphere' });
    path = d3.geoPath(projection);

    gMap     = svg.append('g').attr('class', 'g-map');
    gArcs    = svg.append('g').attr('class', 'g-arcs');
    gOrigins = svg.append('g').attr('class', 'g-origins');

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

    // Background world
    gMap.selectAll('path.country-bg')
      .data(App.world.features)
      .join('path')
        .attr('class', 'country-bg')
        .attr('d', path)
        .each(function(feat) {
          const c = getCountryByNum(feat.id);
          if (c) d3.select(this).classed('origin', true);
          if (feat.id === '214' || feat.properties.name === 'Dominican Rep.' || feat.properties.name === 'Dominican Republic')
            d3.select(this).classed('dr', true);
        });

    // DR pulse rings
    const dr = projection(DR_LL);
    if (dr) {
      const pulse = svg.append('g').attr('class', 'g-pulse')
        .attr('transform', `translate(${dr[0]},${dr[1]})`);
      pulse.append('circle').attr('class', 'dr-pulse-ring').attr('r', 5);
      pulse.append('circle').attr('class', 'dr-pulse-ring').attr('r', 5)
        .style('animation-delay', '1s');
      pulse.append('circle').attr('r', 5).attr('class', 'dr-pulse');
      svg.append('text').attr('class', 'dr-label')
        .attr('x', dr[0]).attr('y', dr[1] + 24)
        .attr('text-anchor', 'middle')
        .text('Dominican Republic');
    }

    setupSlider();
    setupPlay();
    inited = true;
    refresh();
  }

  function setupSlider() {
    const slider = document.getElementById('ov-slider');
    slider.value = App.currentYear;
    document.getElementById('ov-year').textContent = App.currentYear;
    slider.addEventListener('input', e => {
      App.currentYear = +e.target.value;
      document.getElementById('ov-year').textContent = App.currentYear;
      // sync to other slider uis
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

  function buildArcPath(origin, dest) {
    // Quadratic Bezier with bowing toward the upper hemisphere for visual flow.
    const o = projection(origin);
    const d = projection(dest);
    if (!o || !d) return null;
    const mx = (o[0] + d[0]) / 2;
    const my = (o[1] + d[1]) / 2;
    // perpendicular offset for the bow
    const dx = d[0] - o[0], dy = d[1] - o[1];
    const dist = Math.hypot(dx, dy);
    const bow = Math.min(180, Math.max(40, dist * 0.32));
    // perpendicular unit, biased upward (negative y)
    let nx = -dy / dist, ny = dx / dist;
    if (ny > 0) { nx = -nx; ny = -ny; } // ensure curve goes up
    const cx = mx + nx * bow;
    const cy = my + ny * bow;
    return { d: `M ${o[0]} ${o[1]} Q ${cx} ${cy} ${d[0]} ${d[1]}`, o, dst: d, c: [cx, cy] };
  }

  function refresh() {
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

    // Big stat
    const yearTotal = App.data.globalTotals[year].total;
    document.getElementById('ov-bignum').textContent = fmtCompact(yearTotal);

    // Thinner stroke scale; sqrt keeps small flows visible without dwarfing big ones
    const maxV = rows.length ? rows[0].total : 1;
    const wScale       = d3.scaleSqrt().domain([1, maxV]).range([0.35, 3.2]);
    const opacityScale = d3.scaleSqrt().domain([1, maxV]).range([0.30, 0.92]);

    // Arcs
    const arcsData = rows.map(r => {
      const arc = buildArcPath([r.lon, r.lat], DR_LL);
      if (!arc) return null;
      return { ...r, ...arc, w: wScale(Math.max(1, r.total)) };
    }).filter(Boolean);

    // Glow underlay (subtle — only on the larger flows so it doesn't smear small ones)
    const glow = gArcs.selectAll('path.arc-glow').data(arcsData, d => d.iso);
    glow.join(
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
    const arcs = gArcs.selectAll('path.arc').data(arcsData, d => d.iso);
    arcs.join(
      enter => {
        const sel = enter.append('path')
          .attr('class', 'arc')
          .attr('d', d => d.d)
          .attr('marker-end', 'url(#ov-arrow)')
          .attr('stroke-width', d => d.w)
          .attr('opacity', 0);
        // Animate stroke draw
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

    // Origin dots + labels (top 12 get labels to avoid clutter)
    const top = arcsData.slice(0, 12);
    const dotR = d3.scaleSqrt().domain([1, maxV]).range([1.8, 5.5]);

    const dots = gOrigins.selectAll('circle.origin-dot').data(arcsData, d => d.iso);
    dots.join(
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

    const labels = gOrigins.selectAll('text.origin-label').data(top, d => d.iso);
    labels.join(
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

    const vals = gOrigins.selectAll('text.origin-value').data(top, d => d.iso);
    vals.join(
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

    // Leaderboard
    drawLeaderboard(rows, yearTotal);
  }

  function drawLeaderboard(rows, yearTotal) {
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
      `<div class="lb-foot">${rows.length} origin countries shown</div>`;
  }

  return { init, refresh };
})();
