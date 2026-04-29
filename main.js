// ============== Boot ==============
(async function boot() {
  // Load mock data and world topology in parallel
  const [data, world] = await Promise.all([
    d3.json('data/passengers.json'),
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
  ]);

  App.data = data;
  App.world = { features: topojson.feature(world, world.objects.countries).features };

  // Build numeric → ISO3 lookup for our 20 countries
  Object.entries(data.countries).forEach(([iso, c]) => {
    // Index both padded and un-padded forms so any topojson ID format matches
    const padded = String(c.isoNum).padStart(3, '0');
    const unpadded = String(c.isoNum).replace(/^0+/, '') || '0';
    App.numToIso3[padded] = iso;
    App.numToIso3[unpadded] = iso;
  });

  buildExplorerScales();

  // Initialize Overview immediately (default view)
  App.currentMode = 'overview';
  Overview.init();

  // Mode switching: lazily init heavier views on first show
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === App.currentMode) return;
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === mode));
      App.currentMode = mode;

      // Defer init until container is visible (so SVG has size)
      requestAnimationFrame(() => {
        if      (mode === 'overview') { Overview.init(); Overview.refresh(); }
        else if (mode === 'explorer') { Explorer.init(); Explorer.refresh(); }
        else if (mode === 'gender')   { Gender.init();   Gender.refresh(); }
        else if (mode === 'compare')  { Compare.init();  Compare.refresh(); }
      });
    });
  });

  // Resize handling — simple full reload of geometry on resize
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      // crude: reload page on dramatic resize is fine; keep it simple
    }, 250);
  });
})();
