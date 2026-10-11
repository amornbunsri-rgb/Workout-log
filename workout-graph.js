/* Workout log: progress graph page script.
   Loaded by workout-graph.html after workout-shared.js (units, formatting and strength maths shared with the main page). */
(function () {
  const DATA_KEY = "workout-log-data-v1";
  const LISTS_KEY = "workout-log-lists-v3";
  const LEGACY_LISTS_KEYS = ["workout-log-lists-v2", "workout-log-lists-v1"];
  const GRAPH_CACHE_KEY = "workout-graph-cache-v1"; // this page's own remembered copy of the last backup loaded
  const BODYWEIGHT_KEY = "workout-log-bodyweight-v1";

  let categories = [];
  let exerciseLists = {};
  let categoryColors = {};
  let data = {};
  let bodyweightLog = []; // [{ id, date: 'YYYY-MM-DD', kg }] from the main app's Bodyweight section
  let selectedExercise = null;
  let rangeMode = 'week'; // week | month | year | stats
  let periodOffset = 0;
  let setsChartInstance = null;
  let repsChartInstance = null;
  let elevChartInstance = null;
  let bwChartInstance = null;

  const Shared = window.WorkoutShared; // helpers shared with the main page (workout-shared.js)
  const COLOR_PALETTE = Shared.COLOR_PALETTE;
  function getCategoryColor(cat) {
    if (categoryColors[cat]) return categoryColors[cat];
    const idx = Math.max(0, categories.indexOf(cat));
    return COLOR_PALETTE[idx % COLOR_PALETTE.length];
  }
  const DISTANCE_CATEGORY_PATTERN = Shared.DISTANCE_CATEGORY_PATTERN;
  function isDistanceCategoryName(cat) { return Shared.isDistanceCategoryName(cat); }
  function exerciseCategoryFor(name) {
    for (const cat of categories) {
      if ((exerciseLists[cat] || []).some(e => e.name === name)) return cat;
    }
    return null;
  }
  function isDistanceExercise(name) {
    // Recognize by the exercise's own name too (e.g. "Running" or "Walking" filed
    // under a non-distance category like "Legs"), not just by category name.
    return isDistanceCategoryName(exerciseCategoryFor(name)) || DISTANCE_CATEGORY_PATTERN.test(name || '');
  }

  // ---- unit conversion (mirrors the main app; only affects display, not the stored km/kg/m values) ----
  const { KM_TO_MI, KG_TO_LB, M_TO_FT } = Shared;
  function distanceUnitLabel() { return Shared.distanceUnitLabel(unitSystem); }
  function weightUnitLabel() { return Shared.weightUnitLabel(unitSystem); }
  function elevationUnitLabel() { return Shared.elevationUnitLabel(unitSystem); }
  function kmToDisplay(km) { return Shared.kmToDisplay(unitSystem, km); }
  function kgToDisplay(kg) { return Shared.kgToDisplay(unitSystem, kg); }
  function mToDisplay(m) { return Shared.mToDisplay(unitSystem, m); }
  function round2(n) { return Shared.round2(n); }
  function formatDuration(totalMinutes) { return Shared.formatDuration(totalMinutes); }
  function formatPace(minutesPerUnit) { return Shared.formatPace(minutesPerUnit); }
  function paceForEntry(entry) { return Shared.paceForEntry(unitSystem, entry); }
  function escapeHtml(s) { return Shared.escapeHtml(s); }

  function applyBackupObject(obj) {
    if (obj.lists) {
      categories = obj.lists.categories || [];
      exerciseLists = obj.lists.exercises || {};
      categoryColors = obj.lists.colors || {};
    }
    data = obj.data || {};
    bodyweightLog = cleanBodyweight(obj.bodyweight);
  }
  function cleanBodyweight(arr) {
    return Array.isArray(arr) ? arr.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number(e.kg) > 0).map(e => ({ id: e.id, date: e.date, kg: Number(e.kg) })) : [];
  }

  // Auto-carried data from the main app (see its graphLink click handler): this
  // page is opened via window.open, so the opener can postMessage us the current
  // data instead of requiring a manual export + "Load backup" here. We announce
  // readiness once our listener is live; the opener also does a short delayed
  // push on its side to cover the case where this window was already open (no
  // reload, so no fresh "ready" announcement would otherwise be sent).
  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.type !== 'workout-data' || !ev.data.backup) return;
    applyBackupObject(ev.data.backup);
    try { localStorage.setItem(GRAPH_CACHE_KEY, JSON.stringify({ backup: ev.data.backup, savedAt: Date.now() })); } catch (e) { /* ignore */ }
    const status = document.getElementById('importStatus');
    if (status) status.textContent = 'Synced live from the main app';
    if (selectedExercise && !exercisesWithHistory().some(x => x.name === selectedExercise)) selectedExercise = null;
    init();
  });
  if (window.opener) {
    try { window.opener.postMessage({ type: 'graph-ready' }, '*'); } catch (e) { /* ignore */ }
  }

  // Priority: (1) the main app's live keys, in case this page really is same-origin
  // with it — then it just works with zero setup; (2) this page's own remembered
  // copy of the last backup someone loaded here, so a one-time "Load backup" is
  // all that's ever needed, not a re-import on every visit.
  function tryLoadFromMainAppKeys() {
    let listsRaw = null;
    [LISTS_KEY, ...LEGACY_LISTS_KEYS].forEach(k => { if (!listsRaw) listsRaw = localStorage.getItem(k); });
    const dataRaw = localStorage.getItem(DATA_KEY);
    if (!listsRaw && !dataRaw) return false;
    try {
      if (listsRaw) {
        const parsed = JSON.parse(listsRaw);
        categories = parsed.categories || [];
        exerciseLists = parsed.exercises || {};
        categoryColors = parsed.colors || {};
      }
      if (dataRaw) data = JSON.parse(dataRaw) || {};
      bodyweightLog = cleanBodyweight(JSON.parse(localStorage.getItem(BODYWEIGHT_KEY) || '[]'));
      return true;
    } catch (e) { return false; }
  }
  function tryLoadFromGraphCache() {
    const raw = localStorage.getItem(GRAPH_CACHE_KEY);
    if (!raw) return false;
    try {
      const cached = JSON.parse(raw);
      applyBackupObject(cached.backup || {});
      const status = document.getElementById('importStatus');
      if (status && cached.savedAt) status.textContent = 'Last loaded ' + new Date(cached.savedAt).toLocaleString();
      return true;
    } catch (e) { return false; }
  }

  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importBtnEmpty').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        applyBackupObject(backup);
        // remember it under this page's own storage so future visits don't need re-importing
        try { localStorage.setItem(GRAPH_CACHE_KEY, JSON.stringify({ backup: backup, savedAt: Date.now() })); } catch (e2) { /* ignore */ }
        selectedExercise = null;
        periodOffset = 0;
        document.getElementById('importStatus').textContent = 'Loaded "' + file.name + '" — remembered for next time';
        init();
      } catch (err) {
        document.getElementById('importStatus').textContent = '';
        alert("Could not read that file — is it a workout log backup (Export > Export backup)?");
      }
    };
    reader.readAsText(file);
  });

  // ---- header menu + theme mode (mirrors the main app's settings menu) ----
  const MODE_KEY = "workout-log-mode-v1";
  const UNITS_KEY = "workout-log-units-v1";
  const menuBtn = document.getElementById('menuBtn');
  const menuPanel = document.getElementById('menuPanel');
  menuBtn.onclick = (e) => { e.stopPropagation(); menuPanel.classList.toggle('hidden'); };
  document.addEventListener('click', (e) => {
    if (!menuPanel.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) menuPanel.classList.add('hidden');
  });
  function renderModeToggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    document.querySelectorAll('#modeToggle .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === current);
    });
  }
  // Same colour theme as the main app (chosen there, stored under the same key).
  function applyColourTheme() { Shared.applyTheme(Shared.loadTheme(), document.documentElement.getAttribute('data-theme') || 'light'); }
  applyColourTheme();
  document.querySelectorAll('#modeToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      document.documentElement.setAttribute('data-theme', btn.dataset.mode);
      try { localStorage.setItem(MODE_KEY, btn.dataset.mode); } catch (e) { /* ignore */ }
      renderModeToggle();
      applyColourTheme();
      if (typeof renderAll === 'function') { try { renderAll(); } catch (e) { /* charts redraw on next change */ } }
    };
  });
  function loadUnits() { return Shared.loadUnits(); }
  let unitSystem = loadUnits();
  function renderUnitsToggle() {
    document.querySelectorAll('#unitsToggle .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.units === unitSystem);
    });
  }
  document.querySelectorAll('#unitsToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      unitSystem = btn.dataset.units;
      try { localStorage.setItem(UNITS_KEY, unitSystem); } catch (e) { /* ignore */ }
      renderUnitsToggle();
      if (selectedExercise) renderAll();
    };
  });
  renderUnitsToggle();
  renderModeToggle();

  function allEntries() {
    const flat = [];
    Object.keys(data).forEach(cat => (data[cat] || []).forEach(e => flat.push(e)));
    return flat;
  }

  // ---- activity heatmap: GitHub-style contribution grid, all exercises combined ----
  function renderActivityHeatmap() {
    const card = document.getElementById('activityHeatmapCard');
    const grid = document.getElementById('activityHeatmapGrid');
    const entries = allEntries();
    if (!entries.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    grid.innerHTML = '';

    const counts = {};
    entries.forEach(e => { if (e.date) counts[e.date] = (counts[e.date] || 0) + 1; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const WEEKS = 53;
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - start.getDay()); // roll back to the Sunday on/before start

    const days = [];
    const cursor = new Date(start);
    while (cursor <= today) { days.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
    while (days.length % 7 !== 0) { // pad through the end of the final week
      const next = new Date(days[days.length - 1]);
      next.setDate(next.getDate() + 1);
      days.push(next);
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const maxCount = Math.max(1, ...Object.values(counts));
    const level = (c) => {
      if (!c) return 0;
      const ratio = c / maxCount;
      if (ratio > 0.75) return 4;
      if (ratio > 0.5) return 3;
      if (ratio > 0.25) return 2;
      return 1;
    };

    let lastMonth = -1;
    weeks.forEach(week => {
      const col = document.createElement('div');
      col.className = 'heatmap-week';
      const monthLabel = document.createElement('div');
      monthLabel.className = 'heatmap-month-label';
      const monthStart = week.find(d => d.getDate() <= 7);
      if (monthStart && monthStart.getMonth() !== lastMonth) {
        monthLabel.textContent = monthStart.toLocaleDateString(undefined, { month: 'short' });
        lastMonth = monthStart.getMonth();
      }
      col.appendChild(monthLabel);
      week.forEach(d => {
        const cell = document.createElement('div');
        if (d > today) {
          cell.className = 'heatmap-cell hm-future';
        } else {
          const iso = fmtDate(d);
          const c = counts[iso] || 0;
          cell.className = 'heatmap-cell hm-' + level(c);
          cell.title = `${iso}: ${c} ${c === 1 ? 'entry' : 'entries'}`;
        }
        col.appendChild(cell);
      });
      grid.appendChild(col);
    });
  }

  function exerciseColor(name) {
    for (const cat of categories) {
      const found = (exerciseLists[cat] || []).find(e => e.name === name);
      if (found) return found.color || null;
    }
    return null;
  }

  function exerciseIsIsometric(name, entriesForIt) {
    if (entriesForIt.some(e => e.isometric)) return true;
    for (const cat of categories) {
      const found = (exerciseLists[cat] || []).find(e => e.name === name);
      if (found) return !!found.isometric;
    }
    return false;
  }

  function exercisesWithHistory() {
    const map = {};
    allEntries().forEach(e => {
      if (!e.exercise) return;
      if (!map[e.exercise]) map[e.exercise] = { name: e.exercise, count: 0 };
      map[e.exercise].count++;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- workout search (filters the Workouts list; icon toggles the search row) ----
  let exerciseSearchQuery = '';
  const exerciseSearchBtn = document.getElementById('exerciseSearchBtn');
  const exerciseSearchRow = document.getElementById('exerciseSearchRow');
  const exerciseSearchInput = document.getElementById('exerciseSearchInput');
  function setExerciseSearchOpen(open) {
    exerciseSearchRow.classList.toggle('hidden', !open);
    exerciseSearchBtn.classList.toggle('on', open);
    if (open) exerciseSearchInput.focus();
    else { exerciseSearchInput.value = ''; exerciseSearchQuery = ''; renderExerciseNav(); }
  }
  exerciseSearchBtn.onclick = () => setExerciseSearchOpen(exerciseSearchRow.classList.contains('hidden'));
  exerciseSearchInput.addEventListener('input', () => { exerciseSearchQuery = exerciseSearchInput.value; renderExerciseNav(); });
  exerciseSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') setExerciseSearchOpen(false); });
  document.getElementById('exerciseSearchClear').onclick = () => {
    if (exerciseSearchInput.value) { exerciseSearchInput.value = ''; exerciseSearchQuery = ''; renderExerciseNav(); exerciseSearchInput.focus(); }
    else setExerciseSearchOpen(false);
  };

  function renderExerciseNav() {
    const list = document.getElementById('exerciseNavList');
    list.innerHTML = '';
    const allItems = exercisesWithHistory();
    if (!allItems.length) {
      list.innerHTML = '<div class="empty" style="padding:8px 0;">No logged workouts yet.</div>';
      return;
    }
    // selection is validated against the full list so filtering never changes what's charted
    if (!selectedExercise || !allItems.some(i => i.name === selectedExercise)) selectedExercise = allItems[0].name;
    const q = exerciseSearchQuery.trim().toLowerCase();
    const items = q
      ? allItems.filter(i => i.name.toLowerCase().includes(q) || (exerciseCategoryFor(i.name) || '').toLowerCase().includes(q))
      : allItems;
    if (!items.length) {
      list.innerHTML = '<div class="empty" style="padding:8px 0;">No workouts match your search.</div>';
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ex-nav-item' + (item.name === selectedExercise ? ' active' : '');
      const color = exerciseColor(item.name) || '#999';
      const cat = exerciseCategoryFor(item.name);
      const catTag = cat ? `<span class="badge" style="background:${getCategoryColor(cat)}22; color:${getCategoryColor(cat)};">${escapeHtml(cat)}</span>` : '';
      row.innerHTML = `<span class="dot" style="background:${color}"></span><span>${escapeHtml(item.name)}</span>${catTag}<span class="count">${item.count}</span>`;
      row.onclick = () => {
        selectedExercise = item.name;
        periodOffset = 0;
        renderExerciseNav();
        renderAll();
      };
      list.appendChild(row);
    });
  }

  // ---- period math (all in LOCAL time — never toISOString, which shifts by timezone) ----
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getPeriodRange() {
    const now = new Date();
    if (rangeMode === 'week') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dow = (d.getDay() + 6) % 7; // 0 = Monday
      d.setDate(d.getDate() - dow + periodOffset * 7);
      const start = new Date(d);
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      return { start, end, bucket: 'day' };
    } else if (rangeMode === 'month') {
      const base = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
      const start = new Date(base.getFullYear(), base.getMonth(), 1);
      const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      return { start, end, bucket: 'day' };
    } else {
      const y = now.getFullYear() + periodOffset;
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31), bucket: 'month' };
    }
  }

  function periodLabelText(range) {
    if (rangeMode === 'week') {
      return range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' +
        range.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (rangeMode === 'month') return range.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return String(range.start.getFullYear());
  }

  function entriesForSelected() {
    return allEntries().filter(e => e.exercise === selectedExercise);
  }

  function entriesInRange(range) {
    const startStr = fmtDate(range.start), endStr = fmtDate(range.end);
    return entriesForSelected().filter(e => e.date >= startStr && e.date <= endStr);
  }

  function setsCount(entry) { return (entry.sets || []).length; }
  function repsTotal(entry) {
    return (entry.sets || []).reduce((sum, s) => {
      if (typeof s.reps === 'number') return sum + s.reps;
      return sum + (s.left || 0) + (s.right || 0);
    }, 0);
  }

  function buildBuckets(range) {
    const buckets = [];
    if (range.bucket === 'day') {
      const cur = new Date(range.start);
      while (cur <= range.end) {
        buckets.push({ key: fmtDate(cur), label: cur.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      for (let m = 0; m < 12; m++) {
        const d = new Date(range.start.getFullYear(), m, 1);
        buckets.push({ key: d.getFullYear() + '-' + String(m + 1).padStart(2, '0'), label: d.toLocaleDateString(undefined, { month: 'short' }) });
      }
    }
    return buckets;
  }

  function aggregate(entries, range) {
    const buckets = buildBuckets(range);
    const setsMap = {};
    buckets.forEach(b => { setsMap[b.key] = 0; });
    entries.forEach(e => {
      const key = range.bucket === 'day' ? e.date : e.date.slice(0, 7);
      if (setsMap[key] === undefined) return;
      setsMap[key] += setsCount(e);
    });
    return { labels: buckets.map(b => b.label), sets: buckets.map(b => setsMap[b.key]) };
  }

  // Distance-mode equivalent of aggregate(): sums distance/time/elevation per bucket instead of set count.
  function aggregateDistance(entries, range) {
    const buckets = buildBuckets(range);
    const distMap = {}, timeMap = {}, elevMap = {};
    buckets.forEach(b => { distMap[b.key] = 0; timeMap[b.key] = 0; elevMap[b.key] = 0; });
    entries.forEach(e => {
      const key = range.bucket === 'day' ? e.date : e.date.slice(0, 7);
      if (distMap[key] === undefined) return;
      if (e.distance != null) distMap[key] += e.distance;
      if (e.timeMinutes != null) timeMap[key] += e.timeMinutes;
      if (e.elevation != null) elevMap[key] += e.elevation;
    });
    return {
      labels: buckets.map(b => b.label),
      distance: buckets.map(b => round2(kmToDisplay(distMap[b.key]))),
      time: buckets.map(b => timeMap[b.key]),
      elevation: buckets.map(b => round2(mToDisplay(elevMap[b.key])))
    };
  }

  // Every individual set, in chronological order, as its own data point —
  // this is what actually shows "reps per set" rather than a daily total.
  const SET_COLORS = ["#4B0F45", "#E4599C", "#FE9214", "#6FE3CC", "#185D7A", "#C8DB2A", "#EF4687", "#F8CF9B", "#E1D571", "#A5442F"];

  // Groups sets by day so each day's sets sit clustered right next to each
  // other on the x-axis (one dataset per "Set N" position, Chart.js clusters
  // same-index bars per label automatically), instead of one long flat strip.
  function perSetSeries(entries) {
    const byDate = {};
    entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      (e.sets || []).forEach(s => {
        const value = typeof s.reps === 'number' ? s.reps : (s.left || 0) + (s.right || 0);
        byDate[e.date].push(value);
      });
    });
    const dates = Object.keys(byDate).sort();
    const maxSets = dates.reduce((m, d) => Math.max(m, byDate[d].length), 0);
    const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const datasets = [];
    for (let i = 0; i < maxSets; i++) {
      datasets.push({ label: 'Set ' + (i + 1), data: dates.map(d => (byDate[d][i] != null ? byDate[d][i] : null)) });
    }
    return { labels: dates.map(shortDate), datasets };
  }

  function accentColor() {
    return (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#b5502f').trim() || '#b5502f';
  }

  function renderCharts(agg, perSet, isometric, isDistance, aggDist) {
    if (typeof Chart === 'undefined') return; // chart library failed to load (e.g. offline) — data below still works
    const color = accentColor();
    const setsCtx = document.getElementById('setsChart').getContext('2d');
    const repsCtx = document.getElementById('repsChart').getContext('2d');
    const elevCtx = document.getElementById('elevChart').getContext('2d');
    if (setsChartInstance) setsChartInstance.destroy();
    if (repsChartInstance) repsChartInstance.destroy();
    if (elevChartInstance) elevChartInstance.destroy();
    document.getElementById('elevChartCard').classList.toggle('hidden', !isDistance);
    const commonOptions = {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    };
    if (isDistance) {
      document.getElementById('setsChartLabel').textContent = `Distance (${distanceUnitLabel()})`;
      setsChartInstance = new Chart(setsCtx, {
        type: 'line',
        data: { labels: aggDist.labels, datasets: [{ label: 'Distance', data: aggDist.distance, borderColor: color, backgroundColor: color, tension: 0.25, fill: false }] },
        options: commonOptions
      });
      document.getElementById('repsChartLabel').textContent = 'Time (minutes)';
      repsChartInstance = new Chart(repsCtx, {
        type: 'line',
        data: { labels: aggDist.labels, datasets: [{ label: 'Time', data: aggDist.time, borderColor: SET_COLORS[1], backgroundColor: SET_COLORS[1], tension: 0.25, fill: false }] },
        options: commonOptions
      });
      elevChartInstance = new Chart(elevCtx, {
        type: 'line',
        data: { labels: aggDist.labels, datasets: [{ label: `Elevation (${elevationUnitLabel()})`, data: aggDist.elevation, borderColor: SET_COLORS[4], backgroundColor: SET_COLORS[4], tension: 0.25, fill: false }] },
        options: commonOptions
      });
      return;
    }
    document.getElementById('setsChartLabel').textContent = 'Sets';
    setsChartInstance = new Chart(setsCtx, {
      type: 'bar',
      data: { labels: agg.labels, datasets: [{ label: 'Sets', data: agg.sets, backgroundColor: color, borderRadius: 4 }] },
      options: commonOptions
    });
    repsChartInstance = new Chart(repsCtx, {
      type: 'bar',
      data: {
        labels: perSet.labels,
        datasets: perSet.datasets.map((ds, i) => ({
          label: ds.label, data: ds.data, backgroundColor: SET_COLORS[i % SET_COLORS.length], borderRadius: 3
        }))
      },
      options: {
        responsive: true,
        plugins: { legend: { display: perSet.datasets.length > 1 } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderEntriesList(entries, isometric, isDistance) {
    const list = document.getElementById('entriesList');
    list.innerHTML = '';
    if (!entries.length) {
      list.innerHTML = '<div class="empty" style="padding:8px 0;">Nothing logged in this period.</div>';
      return;
    }
    const unit = isometric ? 's' : '';
    entries.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach(e => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      let chips;
      if (isDistance) {
        const pace = paceForEntry(e);
        chips = [
          e.distance != null ? `<span class="set-chip">${round2(kmToDisplay(e.distance))} ${distanceUnitLabel()}</span>` : '',
          pace ? `<span class="set-chip">${pace} /${distanceUnitLabel()}</span>` : '',
          e.timeMinutes != null ? `<span class="set-chip">${formatDuration(e.timeMinutes)}</span>` : '',
          e.ruckKg != null ? `<span class="set-chip">Rucking ${round2(kgToDisplay(e.ruckKg))}${weightUnitLabel()}</span>` : '',
          e.elevation != null ? `<span class="set-chip">↑ ${round2(mToDisplay(e.elevation))}${elevationUnitLabel()}</span>` : ''
        ].join('') || '<span class="set-chip">No distance data logged</span>';
      } else {
        chips = (e.sets || []).map((s, idx) => {
          const kg = (s.kg != null && s.kg !== '' && Number(s.kg) !== 0) ? ' @' + (Number(s.kg) > 0 ? '+' : '') + s.kg + weightUnitLabel() : '';
          const ecc = s.eccentric != null ? ' · ecc ' + s.eccentric + 's' : '';
          const val = typeof s.reps === 'number' ? s.reps + unit : (s.left || 0) + '/' + (s.right || 0) + unit;
          return `<span class="set-chip">Set ${idx + 1}: ${escapeHtml(val)}${kg}${ecc}</span>`;
        }).join('') || '<span class="set-chip">No sets logged</span>';
      }
      row.innerHTML = `
        <span class="name">${escapeHtml(e.date)}${e.isPR ? ` <span class="badge badge-pr" title="${escapeHtml(e.prTypes ? 'New PR: ' + e.prTypes.join(', ') : 'New PR')}"><i class="fa-solid fa-trophy" aria-hidden="true"></i> PR</span>` : ''}</span>
        <div class="entry-chips-col">
          <div class="entry-sets">${chips}</div>
          ${e.notes ? `<div class="entry-notes">${escapeHtml(e.notes)}</div>` : ''}
        </div>`;
      list.appendChild(row);
    });
  }

  // ---- bodyweight-relative strength ----
  function sortedBodyweight() { return bodyweightLog.slice().sort((a, b) => a.date.localeCompare(b.date)); }
  // The bodyweight that applies on a date: the latest weigh-in on or before it. If the
  // date predates every weigh-in, fall back to the earliest one and flag it as an estimate.
  function bodyweightOn(dateStr) { return Shared.bodyweightKgOn(sortedBodyweight(), dateStr); }
  function setReps(s) { return Shared.setReps(s); }
  // Epley on the TOTAL load (bodyweight + added), minus bodyweight = estimated 1RM of the added load.
  // Only trusted for 1-12 reps; a single rep is just the load itself.
  function est1rmAdded(bwKg, addedKg, reps) { return Shared.est1rmAdded(bwKg, addedKg, reps); }
  function relativeStrength(entries, isometric) {
    const out = { hasLoad: false, bestAdded: null, best1rm: null, bestAssist: null };
    entries.forEach(e => {
      const bw = bodyweightOn(e.date);
      (e.sets || []).forEach(s => {
        const kg = (s.kg != null && s.kg !== '') ? Number(s.kg) : 0;
        if (!kg || isNaN(kg)) return;
        out.hasLoad = true;
        if (!bw) return;
        const bwU = kgToDisplay(bw.kg); // set weights are in the user's display unit, so compare like with like
        const pct = kg / bwU * 100;
        const base = { date: e.date, approx: bw.approx };
        if (kg > 0) {
          if (!out.bestAdded || pct > out.bestAdded.pct) out.bestAdded = Object.assign({ kg, pct }, base);
          if (!isometric) {
            const e1 = est1rmAdded(bwU, kg, setReps(s));
            if (e1 != null) {
              const p1 = e1 / bwU * 100;
              if (!out.best1rm || p1 > out.best1rm.pct) out.best1rm = Object.assign({ kg: e1, pct: p1 }, base);
            }
          }
        } else if (!out.bestAssist || pct > out.bestAssist.pct) {
          out.bestAssist = Object.assign({ kg, pct }, base); // least assistance = closest to zero
        }
      });
    });
    return out;
  }
  function renderRelativeStrength(entries, isometric, addLine, bestsEl) {
    const rs = relativeStrength(entries, isometric);
    if (!rs.hasLoad) return; // nothing weighted or assisted logged, so nothing to compare to bodyweight
    const note = (text) => {
      const n = document.createElement('div');
      n.className = 'empty';
      n.style.cssText = 'padding:8px 0 0; font-size:12px;';
      n.textContent = text;
      bestsEl.appendChild(n);
    };
    if (!bodyweightLog.length) {
      note('Log your bodyweight (Manage page → Bodyweight) to see this exercise relative to bodyweight.');
      return;
    }
    const fmt = (x) => `${x.kg > 0 ? '+' : ''}${round2(x.kg)}${weightUnitLabel()} = ${round2(x.pct)}% BW (${x.date})${x.approx ? ' · est. BW' : ''}`;
    if (rs.bestAdded) addLine('Best added load vs bodyweight', fmt(rs.bestAdded));
    if (rs.best1rm) addLine('Est. 1RM, added load', fmt(rs.best1rm));
    if (rs.bestAssist) addLine('Least assistance', fmt(rs.bestAssist));
    const latest = sortedBodyweight().slice(-1)[0];
    addLine('Latest bodyweight', round2(kgToDisplay(latest.kg)) + weightUnitLabel() + ' (' + latest.date + ')');
    if (rs.best1rm) note('1RM assumes the movement loads about your full bodyweight (true for pull-ups and dips, less so for push-ups or rows) — treat it as a guide.');
    if (rs.bestAdded && rs.bestAdded.approx || rs.best1rm && rs.best1rm.approx || rs.bestAssist && rs.bestAssist.approx) note('"est. BW" = logged before your first weigh-in, so your earliest weigh-in was used.');
  }
  // Strength (best added load per session) against bodyweight over time, so a plateau that is
  // really "I gained 4kg" reads correctly. Sessions with no weight logged count as 0 added load
  // (the bodyweight point on the assisted <-> weighted continuum).
  function renderBwChart(entries, isDistance) {
    const card = document.getElementById('bwChartCard');
    if (bwChartInstance) { bwChartInstance.destroy(); bwChartInstance = null; }
    const hasLoad = !isDistance && entries.some(e => (e.sets || []).some(s => s.kg != null && s.kg !== '' && Number(s.kg) !== 0 && !isNaN(Number(s.kg))));
    if (!hasLoad || !bodyweightLog.length || typeof Chart === 'undefined') { card.classList.add('hidden'); return; }
    const byDate = {};
    entries.forEach(e => {
      if (!(e.sets || []).length) return;
      let best = null;
      e.sets.forEach(s => {
        const kg = (s.kg != null && s.kg !== '' && !isNaN(Number(s.kg))) ? Number(s.kg) : 0;
        if (best === null || kg > best) best = kg;
      });
      if (byDate[e.date] === undefined || best > byDate[e.date]) byDate[e.date] = best;
    });
    const sessionDates = Object.keys(byDate).sort();
    if (!sessionDates.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const first = sessionDates[0], last = sessionDates[sessionDates.length - 1];
    const bwSorted = sortedBodyweight();
    // weigh-ins inside the exercise's active window, plus the nearest one either side so the line spans it
    const bwWin = bwSorted.filter(b => b.date >= first && b.date <= last);
    const before = bwSorted.filter(b => b.date < first).pop();
    const after = bwSorted.find(b => b.date > last);
    if (before) bwWin.unshift(before);
    if (after) bwWin.push(after);
    const bwByDate = {};
    bwWin.forEach(b => { bwByDate[b.date] = round2(kgToDisplay(b.kg)); });
    const dates = Array.from(new Set(sessionDates.concat(bwWin.map(b => b.date)))).sort();
    const load = dates.map(d => byDate[d] !== undefined ? byDate[d] : null);
    const bw = dates.map(d => bwByDate[d] !== undefined ? bwByDate[d] : null);
    const pct = dates.map((d, i) => {
      const ref = bodyweightOn(d);
      return load[i] === null || !ref ? null : round2(load[i] / kgToDisplay(ref.kg) * 100);
    });
    const multiYear = dates[0].slice(0, 4) !== dates[dates.length - 1].slice(0, 4);
    const labels = dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, multiYear ? { month: 'short', day: 'numeric', year: '2-digit' } : { month: 'short', day: 'numeric' }));
    const color = accentColor();
    bwChartInstance = new Chart(document.getElementById('bwChart').getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: `Best added load (${weightUnitLabel()})`, data: load, borderColor: color, backgroundColor: color, yAxisID: 'y', tension: 0.25, spanGaps: true, pointRadius: 3 },
          { label: `Bodyweight (${weightUnitLabel()})`, data: bw, borderColor: SET_COLORS[4], backgroundColor: SET_COLORS[4], borderDash: [5, 4], yAxisID: 'y2', tension: 0.25, spanGaps: true, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true },
          tooltip: { callbacks: { afterLabel: (c) => (c.datasetIndex === 0 && pct[c.dataIndex] != null) ? pct[c.dataIndex] + '% of bodyweight' : '' } }
        },
        scales: {
          y: { position: 'left', title: { display: true, text: `Added load (${weightUnitLabel()})` } },
          y2: { position: 'right', title: { display: true, text: `Bodyweight (${weightUnitLabel()})` }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // ---- all-time statistics (not tied to a period) ----
  function renderStats() {
    if (!selectedExercise) return;
    const entries = entriesForSelected();
    const isometric = exerciseIsIsometric(selectedExercise, entries);
    const isDistance = isDistanceExercise(selectedExercise);
    const bestsEl = document.getElementById('statBests');
    const addLine = (label, val) => {
      const row = document.createElement('div');
      row.className = 'stat-line';
      row.innerHTML = `<span>${escapeHtml(label)}</span><span class="val">${escapeHtml(val)}</span>`;
      bestsEl.appendChild(row);
    };

    if (isDistance) {
      document.getElementById('statSetsLabelWrap').childNodes[0].textContent = `Total ${distanceUnitLabel()}`;
      document.getElementById('statRepsLabelWrap').childNodes[0].textContent = 'Total time';
      const totalDist = entries.reduce((s, e) => s + (e.distance || 0), 0);
      const totalTime = entries.reduce((s, e) => s + (e.timeMinutes || 0), 0);
      document.getElementById('statSessions').textContent = entries.length;
      document.getElementById('statSets').textContent = round2(kmToDisplay(totalDist));
      document.getElementById('statReps').textContent = formatDuration(totalTime) || '0m';

      let bestDist = null, bestElev = null, bestPace = null;
      entries.forEach(e => {
        if (e.distance != null && (!bestDist || e.distance > bestDist.value)) bestDist = { value: e.distance, date: e.date };
        if (e.elevation != null && (!bestElev || e.elevation > bestElev.value)) bestElev = { value: e.elevation, date: e.date };
        const pace = paceForEntry(e);
        if (pace) {
          const paceMinutes = e.timeMinutes / kmToDisplay(e.distance);
          if (!bestPace || paceMinutes < bestPace.minutes) bestPace = { minutes: paceMinutes, pace, date: e.date };
        }
      });
      bestsEl.innerHTML = '';
      addLine('Longest run', bestDist ? round2(kmToDisplay(bestDist.value)) + ' ' + distanceUnitLabel() + ' (' + bestDist.date + ')' : '—');
      addLine('Fastest pace', bestPace ? bestPace.pace + ' /' + distanceUnitLabel() + ' (' + bestPace.date + ')' : '—');
      addLine('Biggest elevation gain', bestElev ? round2(mToDisplay(bestElev.value)) + elevationUnitLabel() + ' (' + bestElev.date + ')' : '—');
    } else {
      document.getElementById('statSetsLabelWrap').childNodes[0].textContent = 'Total sets';
      document.getElementById('statRepsLabelWrap').childNodes[0].textContent = isometric ? 'Total seconds' : 'Total reps';
      const totalSets = entries.reduce((s, e) => s + setsCount(e), 0);
      const totalReps = entries.reduce((s, e) => s + repsTotal(e), 0);
      document.getElementById('statSessions').textContent = entries.length;
      document.getElementById('statSets').textContent = totalSets;
      document.getElementById('statReps').textContent = totalReps;

      let bestSet = null, bestKg = null;
      entries.forEach(e => (e.sets || []).forEach(s => {
        const val = typeof s.reps === 'number' ? s.reps : (s.left || 0) + (s.right || 0);
        if (!bestSet || val > bestSet.value) bestSet = { value: val, date: e.date };
        if (s.kg != null && s.kg > 0 && (!bestKg || s.kg > bestKg.value)) bestKg = { value: s.kg, date: e.date };
      }));
      bestsEl.innerHTML = '';
      addLine(isometric ? 'Longest hold, single set' : 'Most reps, single set', bestSet ? bestSet.value + (isometric ? 's' : '') + ' (' + bestSet.date + ')' : '—');
      addLine('Heaviest set logged', bestKg ? bestKg.value + 'kg (' + bestKg.date + ')' : '—');
      renderRelativeStrength(entries, isometric, addLine, bestsEl);
    }
    renderBwChart(entries, isDistance);

    const dates = entries.map(e => e.date).sort();
    const historyEl = document.getElementById('statHistory');
    historyEl.innerHTML = '';
    const addHist = (label, val) => {
      const row = document.createElement('div');
      row.className = 'stat-line';
      row.innerHTML = `<span>${escapeHtml(label)}</span><span class="val">${escapeHtml(val)}</span>`;
      historyEl.appendChild(row);
    };
    addHist('First logged', dates[0] || '—');
    addHist('Most recent', dates[dates.length - 1] || '—');
  }

  function renderAll() {
    if (!selectedExercise) return;
    document.getElementById('selectedExerciseLabel').textContent = selectedExercise;

    if (rangeMode === 'stats') {
      document.getElementById('periodView').classList.add('hidden');
      document.getElementById('statsView').classList.remove('hidden');
      renderStats();
      return;
    }
    document.getElementById('periodView').classList.remove('hidden');
    document.getElementById('statsView').classList.add('hidden');

    const range = getPeriodRange();
    document.getElementById('periodLabel').textContent = periodLabelText(range);
    const entries = entriesInRange(range);
    const isometric = exerciseIsIsometric(selectedExercise, entries);
    const isDistance = isDistanceExercise(selectedExercise);
    const agg = isDistance ? null : aggregate(entries, range);
    const perSet = isDistance ? null : perSetSeries(entries);
    const aggDist = isDistance ? aggregateDistance(entries, range) : null;

    document.getElementById('totalEntries').textContent = entries.length;
    document.getElementById('totalElevLabelWrap').classList.toggle('hidden', !isDistance);
    if (isDistance) {
      const totalDist = entries.reduce((s, e) => s + (e.distance || 0), 0);
      const totalTime = entries.reduce((s, e) => s + (e.timeMinutes || 0), 0);
      const totalElev = entries.reduce((s, e) => s + (e.elevation || 0), 0);
      document.querySelector('#totalSetsLabelWrap').childNodes[0].textContent = `Distance (${distanceUnitLabel()})`;
      document.getElementById('totalSets').textContent = round2(kmToDisplay(totalDist));
      document.querySelector('#totalRepsLabelWrap').childNodes[0].textContent = 'Time';
      document.getElementById('totalReps').textContent = formatDuration(totalTime) || '0m';
      document.querySelector('#totalElevLabelWrap').childNodes[0].textContent = `Elevation (${elevationUnitLabel()})`;
      document.getElementById('totalElev').textContent = round2(mToDisplay(totalElev));
    } else {
      const totalSets = entries.reduce((s, e) => s + setsCount(e), 0);
      const totalReps = entries.reduce((s, e) => s + repsTotal(e), 0);
      document.querySelector('#totalSetsLabelWrap').childNodes[0].textContent = 'Total sets';
      document.getElementById('totalSets').textContent = totalSets;
      document.querySelector('#totalRepsLabelWrap').childNodes[0].textContent = isometric ? 'Total seconds' : 'Total reps';
      document.getElementById('totalReps').textContent = totalReps;
    }
    document.getElementById('repsChartLabel').textContent = isDistance ? 'Time (minutes)' : (isometric ? 'Seconds per set' : 'Reps per set');

    renderCharts(agg, perSet, isometric, isDistance, aggDist);
    renderEntriesList(entries, isometric, isDistance);
  }

  document.querySelectorAll('#rangeTabs .tab').forEach(btn => {
    btn.onclick = () => {
      rangeMode = btn.dataset.range;
      periodOffset = 0;
      document.querySelectorAll('#rangeTabs .tab').forEach(b => b.classList.toggle('active', b === btn));
      renderAll();
    };
  });
  document.getElementById('periodPrevBtn').onclick = () => { periodOffset--; renderAll(); };
  document.getElementById('periodNextBtn').onclick = () => { periodOffset++; renderAll(); };

  function init() {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('mainView').classList.remove('hidden');
    renderActivityHeatmap();
    renderExerciseNav();
    renderAll();
  }

  if ((tryLoadFromMainAppKeys() && allEntries().length) || (tryLoadFromGraphCache() && allEntries().length)) {
    init();
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('activityHeatmapCard').classList.add('hidden');
  }
})();
