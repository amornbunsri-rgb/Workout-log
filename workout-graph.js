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
  let bodyweightLog = [];
  let measurementsLog = []; // [{ id, type, date, value }] from the profile's Measurements (values in cm / % / degrees)
  let libMeasure = [];      // measurement types from workout-library.json (range-of-motion types list the exercises they relate to) // [{ id, date: 'YYYY-MM-DD', kg }] from the main app's Bodyweight section
  let selectedExercise = null;
  let selectedVariation = 'all'; // 'all', '__none__' (sets without a variation) or a variation name
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
    measurementsLog = (obj.parts && Array.isArray(obj.parts.measurements)) ? obj.parts.measurements.filter(m => m && m.type && m.date && isFinite(m.value)) : [];
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
      try { const ml = JSON.parse(localStorage.getItem('workout-log-measurements-v1') || '[]'); measurementsLog = Array.isArray(ml) ? ml.filter(m => m && m.type && m.date && isFinite(m.value)) : []; } catch (e2) { measurementsLog = []; }
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
  let weekStart = Shared.loadWeekStart();
  function renderUnitsToggle() {
    document.querySelectorAll('#unitsToggle .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.units === unitSystem);
    });
  }
  document.querySelectorAll('#unitsToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      unitSystem = btn.dataset.units;
      try { localStorage.setItem(UNITS_KEY, unitSystem); localStorage.setItem('workout-log-prefs-ts-v1', String(Date.now())); } catch (e) { /* ignore */ }
      renderUnitsToggle();
      if (selectedExercise) renderAll();
    };
  });
  renderUnitsToggle();
  function renderWeekToggle() { document.querySelectorAll('#weekToggle .mode-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.week === weekStart)); }
  document.querySelectorAll('#weekToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      weekStart = +btn.dataset.week;
      try { localStorage.setItem(Shared.WEEK_KEY, String(weekStart)); localStorage.setItem('workout-log-prefs-ts-v1', String(Date.now())); } catch (e) { /* ignore */ }
      renderWeekToggle();
      renderActivityHeatmap();
      renderBalance();
      renderStraightArm();
      if (selectedExercise) renderAll();
    };
  });
  renderWeekToggle();
  renderModeToggle();

  // Recalculate PRs: the PR rules live in the main app, so it is opened invisibly, does the work, and reports back.
  document.getElementById('recalcPrBtn').onclick = () => {
    const status = document.getElementById('recalcPrStatus'), btn = document.getElementById('recalcPrBtn');
    if (location.protocol === 'file:') { status.textContent = 'This needs the hosted app, not a file opened from disk.'; return; }
    btn.disabled = true; status.textContent = 'Recalculating…';
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
    let finished = false, timer = 0;
    function finish(msg) { if (finished) return; finished = true; clearTimeout(timer); window.removeEventListener('message', onMsg); frame.remove(); btn.disabled = false; status.textContent = msg; }
    function onMsg(ev) {
      if (ev.source !== frame.contentWindow || !ev.data || ev.data.type !== 'recalc-done') return;
      const n = ev.data.n || 0;
      if (tryLoadFromMainAppKeys()) init(); // pick up the corrected badges
      finish(n ? 'PR badges updated on ' + n + (n === 1 ? ' entry' : ' entries') : 'PR badges are already up to date');
    }
    window.addEventListener('message', onMsg);
    timer = setTimeout(() => finish('Could not reach the main app. Open it once, then try again.'), 20000);
    frame.src = 'workout-log-standalone.html#recalc';
    document.body.appendChild(frame);
  };

  function allEntries() {
    const flat = [];
    Object.keys(data).forEach(cat => (data[cat] || []).forEach(e => flat.push(e)));
    return flat;
  }

  // ---- activity heatmap: GitHub-style contribution grid, all exercises combined ----
  // ---- best per session (plateaus), range of motion, straight-arm load ----
  function exKey(n) { return Shared.exKey(n); }
  function dateLabels(dates) {
    const multi = dates.length && dates[0].slice(0, 4) !== dates[dates.length - 1].slice(0, 4);
    return dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, multi ? { month: 'short', day: 'numeric', year: '2-digit' } : { month: 'short', day: 'numeric' }));
  }
  // one point per training day: the best hold (or best reps) that day, a 5-session average, and the best estimated 1RM of added weight
  function trendSeries(entries, isometric) {
    const byDate = {};
    entries.forEach(e => {
      if (!e.date) return;
      const o = byDate[e.date] || (byDate[e.date] = { main: 0, e1: null });
      (e.sets || []).forEach(s => {
        if (!s || typeof s !== 'object' || s.formBroke) return; // sloppy sets do not count
        const v = Shared.setReps(s);
        if (v > o.main) o.main = v;
        if (!isometric && Number(s.kg) > 0) {
          const bw = bodyweightOn(e.date);
          const x = Shared.est1rmAdded(bw ? bw.kg : 0, Number(s.kg), v);
          if (x != null && (o.e1 == null || x > o.e1)) o.e1 = x;
        }
      });
      if (isometric) (e.attempts || []).forEach(a => { if (Number(a) > o.main) o.main = Number(a); });
    });
    const dates = Object.keys(byDate).filter(d => byDate[d].main > 0).sort();
    const main = dates.map(d => byDate[d].main);
    const avg = main.map((_, i) => { const w = main.slice(Math.max(0, i - 4), i + 1); return round2(w.reduce((a, b) => a + b, 0) / w.length); });
    const e1 = dates.map(d => byDate[d].e1 != null ? round2(kgToDisplay(byDate[d].e1)) : null);
    return { dates, main, avg, e1, hasE1: e1.some(x => x != null) };
  }
  function makeTrendChart(ctx, entries, isometric) {
    const ser = trendSeries(entries, isometric);
    if (!ser.dates.length) return null;
    const color = accentColor();
    const datasets = [
      { label: isometric ? 'Best hold per session (s)' : 'Best reps per session', data: ser.main, borderColor: color, backgroundColor: color, tension: 0.2, pointRadius: 3, yAxisID: 'y' },
      { label: '5-session average', data: ser.avg, borderColor: '#999999', borderDash: [5, 4], pointRadius: 0, tension: 0.3, yAxisID: 'y' }
    ];
    const scales = { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 8 } } };
    if (ser.hasE1) {
      datasets.push({ label: 'Est. 1RM, added load (' + weightUnitLabel() + ')', data: ser.e1, borderColor: SET_COLORS[4], backgroundColor: SET_COLORS[4], pointRadius: 3, tension: 0.2, spanGaps: true, yAxisID: 'y2' });
      scales.y2 = { position: 'right', grid: { drawOnChartArea: false } };
    }
    return new Chart(ctx, { type: 'line', data: { labels: dateLabels(ser.dates), datasets }, options: { responsive: true, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true } }, scales } });
  }
  let trendChartInstance = null, romChartInstance = null, straightChartInstance = null;
  function renderTrendCard(entries, isometric, isDistance) {
    const card = document.getElementById('trendCard');
    if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
    const ser = trendSeries(entries, isometric);
    if (isDistance || typeof Chart === 'undefined' || ser.dates.length < 2) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    trendChartInstance = makeTrendChart(document.getElementById('trendChart').getContext('2d'), entries, isometric);
    let best = 0, bestIdx = -1;
    ser.main.forEach((v, i) => { if (v > best) { best = v; bestIdx = i; } });
    const since = ser.main.length - 1 - bestIdx;
    document.getElementById('trendNote').textContent = (ser.main.length >= 6 && since >= 5)
      ? 'Plateau: no new best in ' + since + ' sessions (the best was ' + best + (isometric ? ' s' : ' reps') + ' on ' + ser.dates[bestIdx] + ').'
      : 'Best so far: ' + best + (isometric ? ' s' : ' reps') + ' on ' + ser.dates[bestIdx] + '. The dashed line is the average of your last 5 sessions. Sets where form broke are left out.';
  }
  function romShown(t, v) { return t.unit === 'length' && unitSystem === 'imperial' ? round2(v / 2.54) : round2(v); }
  function romUnit(t) { return t.unit === 'degrees' ? '°' : (t.unit === 'percent' ? '%' : (unitSystem === 'imperial' ? 'in' : 'cm')); }
  function renderRomCard(entries, isometric, isDistance) {
    const card = document.getElementById('romCard');
    if (romChartInstance) { romChartInstance.destroy(); romChartInstance = null; }
    if (isDistance || typeof Chart === 'undefined' || !selectedExercise) { card.classList.add('hidden'); return; }
    const k = exKey(selectedExercise);
    const types = libMeasure.filter(t => Array.isArray(t.exercises) && t.exercises.some(n => exKey(n) === k) && measurementsLog.some(m => m.type === t.id));
    if (!types.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const ser = trendSeries(entries, isometric), mainBy = {};
    ser.dates.forEach((d, i) => { mainBy[d] = ser.main[i]; });
    const set = new Set(ser.dates);
    types.forEach(t => measurementsLog.filter(m => m.type === t.id).forEach(m => set.add(m.date)));
    const dates = Array.from(set).sort();
    const datasets = types.map((t, i) => ({
      label: t.name + ' (' + romUnit(t) + ')', yAxisID: 'y', spanGaps: true, tension: 0.2, pointRadius: 4,
      borderColor: SET_COLORS[(i + 1) % SET_COLORS.length], backgroundColor: SET_COLORS[(i + 1) % SET_COLORS.length],
      data: dates.map(d => { const m = measurementsLog.find(x => x.type === t.id && x.date === d); return m ? romShown(t, Number(m.value)) : null; })
    }));
    datasets.push({ label: isometric ? 'Best hold (s)' : 'Best reps', yAxisID: 'y2', spanGaps: true, borderDash: [5, 4], pointRadius: 3, borderColor: accentColor(), backgroundColor: accentColor(), data: dates.map(d => mainBy[d] != null ? mainBy[d] : null) });
    romChartInstance = new Chart(document.getElementById('romChart').getContext('2d'), {
      type: 'line',
      data: { labels: dateLabels(dates), datasets },
      options: { responsive: true, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true } }, scales: { y: { position: 'left' }, y2: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }, x: { ticks: { maxTicksLimit: 8 } } } }
    });
    document.getElementById('romNote').textContent = 'Your range-of-motion measurements (left axis) next to your best ' + (isometric ? 'hold' : 'reps') + ' per session (right axis, dashed). Add measurements in Profile.';
  }
  function loadLibraryTypes() {
    try { const raw = JSON.parse(localStorage.getItem('workout-library-cache-v1')); if (raw && Array.isArray(raw.measurementTypes)) { libMeasure = raw.measurementTypes; return; } } catch (e) { /* fall through */ }
    if (typeof fetch === 'function') fetch('workout-library.json').then(r => r.json()).then(j => { libMeasure = (j && j.measurementTypes) || []; if (selectedExercise) renderAll(); }).catch(() => { /* no library: no range-of-motion chart */ });
  }
  loadLibraryTypes();
  function isSAName(name) {
    for (const cat of categories) { const f = (exerciseLists[cat] || []).find(e => e.name === name); if (f) return Shared.isStraightArm(f, name); }
    return Shared.isStraightArm(null, name);
  }
  function renderStraightArm() {
    const card = document.getElementById('straightCard');
    if (!card) return;
    if (straightChartInstance) { straightChartInstance.destroy(); straightChartInstance = null; }
    const rep = Shared.straightArmReport(allEntries(), isSAName, weekStart, fmtDate(new Date()));
    if (!rep.hasData || typeof Chart === 'undefined') { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const color = accentColor();
    straightChartInstance = new Chart(document.getElementById('straightChart').getContext('2d'), {
      type: 'bar',
      data: { labels: rep.rows.map(r => new Date(r.week + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })), datasets: [{ label: 'Straight-arm holding (s)', data: rep.rows.map(r => Math.round(r.sec)), backgroundColor: color, borderRadius: 3 }] },
      options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => rep.rows[c.dataIndex].sets + ' sets' } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Seconds per week' } } } }
    });
    const cur = rep.rows[rep.rows.length - 1];
    document.getElementById('straightNow').textContent = 'This week: ' + Math.round(cur.sec) + ' s of straight-arm holding over ' + cur.sets + ' sets · average of the 4 weeks before: ' + Math.round(rep.avg) + ' s';
    document.getElementById('straightFlags').innerHTML = rep.flags.map(f => `<div class="balance-flag ${f[0]}">${escapeHtml(f[1])}</div>`).join('');
  }

  // ---- weekly balance: sets per movement pattern, last 8 weeks, with flags ----
  let balanceChartInstance = null;
  function patternOfExercise(name) {
    for (const cat of categories) {
      const f = (exerciseLists[cat] || []).find(e => e.name === name);
      if (f) return Shared.patternOf(f, name);
    }
    return Shared.guessPattern(name);
  }
  function balanceFlags(rows) {
    const flags = [];
    const sum = (rs, ids) => rs.reduce((a, r) => a + ids.reduce((b, id) => b + (r.c[id] || 0), 0), 0);
    const last4 = rows.slice(-4), last2 = rows.slice(-2);
    const push4 = sum(last4, ['vpush', 'hpush']), pull4 = sum(last4, ['vpull', 'hpull']);
    if (push4 + pull4 >= 8) {
      const ratio = push4 / Math.max(pull4, 0.5);
      if (ratio > 1.25) flags.push(['warn', `Push-heavy over the last 4 weeks: ${push4} push vs ${pull4} pull sets (${ratio.toFixed(1)}:1). Aim for about 1:1, or a little more pulling, to look after your shoulders.`]);
      else if (ratio < 0.6) flags.push(['note', `Pull-heavy over the last 4 weeks: ${push4} push vs ${pull4} pull sets. Add some pushing if your push skills have stalled.`]);
    }
    const ratios = last4.map(r => { const a = (r.c.vpush || 0) + (r.c.hpush || 0), b = (r.c.vpull || 0) + (r.c.hpull || 0); return a + b >= 4 ? a / Math.max(b, 0.5) : null; }).filter(x => x != null);
    if (ratios.length >= 3) {
      const t = ratios.slice(-3);
      if (t[0] < t[1] && t[1] < t[2] && t[2] > 1) flags.push(['warn', `Drifting toward push: the push to pull ratio went ${t.map(x => x.toFixed(1)).join(' → ')} over the last 3 weeks.`]);
      else if (t[0] > t[1] && t[1] > t[2] && t[2] < 0.8) flags.push(['note', `Drifting toward pull: the push to pull ratio went ${t.map(x => x.toFixed(1)).join(' → ')} over the last 3 weeks.`]);
    }
    [['push', 'vpush', 'hpush'], ['pull', 'vpull', 'hpull']].forEach(g => {
      const v = sum(last4, [g[1]]), h = sum(last4, [g[2]]);
      if (Math.max(v, h) >= 6 && Math.min(v, h) * 2.5 < Math.max(v, h)) flags.push(['note', `${v > h ? 'Vertical' : 'Horizontal'} ${g[0]} outweighs ${v > h ? 'horizontal' : 'vertical'} ${g[0]} (${v} vs ${h} sets in 4 weeks).`]);
    });
    const other2 = sum(last2, ['vpush', 'hpush', 'vpull', 'hpull', 'core', 'legs']);
    if (other2 >= 8 && sum(last2, ['legs']) === 0) flags.push(['warn', 'No leg work in the last 2 weeks.']);
    if (other2 >= 8 && sum(last2, ['core']) === 0) flags.push(['note', 'No dedicated core work in the last 2 weeks.']);
    if (!flags.length) flags.push(['ok', push4 + pull4 >= 8 ? 'No imbalances flagged over the last 4 weeks.' : 'Log a few more weeks of training to see balance patterns.']);
    return flags;
  }
  function renderBalance() {
    const card = document.getElementById('balanceCard');
    if (!card) return;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const base = new Date(Shared.weekStartISO(fmtDate(t), weekStart) + 'T00:00:00');
    const rows = [], idx = {};
    for (let i = 7; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - 7 * i); const k = fmtDate(d); idx[k] = rows.length; rows.push({ week: k, c: {} }); }
    allEntries().forEach(e => {
      if (!e.date || !e.exercise) return;
      const r = rows[idx[Shared.weekStartISO(e.date, weekStart)]];
      if (!r) return;
      const p = patternOfExercise(e.exercise);
      if (!p) return;
      const n = (e.sets && e.sets.length) ? e.sets.length : ((e.distance != null || (e.attempts && e.attempts.length)) ? 1 : 0);
      r.c[p] = (r.c[p] || 0) + n;
    });
    if (balanceChartInstance) { balanceChartInstance.destroy(); balanceChartInstance = null; }
    if (!rows.some(r => Object.keys(r.c).some(k => r.c[k] > 0)) || typeof Chart === 'undefined') { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    balanceChartInstance = new Chart(document.getElementById('balanceChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: rows.map(r => new Date(r.week + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: Shared.PATTERNS.map(p => ({ label: p.label, data: rows.map(r => r.c[p.id] || 0), backgroundColor: p.color, borderRadius: 2 }))
      },
      options: { responsive: true, plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
    });
    const cur = rows[rows.length - 1].c;
    const push = (cur.vpush || 0) + (cur.hpush || 0), pull = (cur.vpull || 0) + (cur.hpull || 0);
    document.getElementById('balanceNow').textContent = 'This week (sets): ' + Shared.PATTERNS.filter(p => p.id !== 'mobility').map(p => p.short + ' ' + (cur[p.id] || 0)).join(' · ') + (push + pull ? ' · push:pull ' + push + ':' + pull : '');
    document.getElementById('balanceFlags').innerHTML = balanceFlags(rows).map(f => `<div class="balance-flag ${f[0]}">${escapeHtml(f[1])}</div>`).join('');
  }
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
    start.setDate(start.getDate() - ((start.getDay() - weekStart + 7) % 7)); // roll back to the first day of the week

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
        selectedVariation = 'all';
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
      const dow = (d.getDay() - weekStart + 7) % 7; // 0 = first day of the week
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

  function setVarKey(s) { return (s && typeof s === 'object' && s.variation) ? String(s.variation) : ''; }
  function entriesOfSelectedExercise() { return allEntries().filter(e => e.exercise === selectedExercise); }
  // With a variation chosen, only that variation's sets count, so every chart and stat below follows it.
  function entriesForSelected() {
    const all = entriesOfSelectedExercise();
    if (selectedVariation === 'all') return all;
    const want = selectedVariation === '__none__' ? '' : selectedVariation;
    return all.map(e => {
      if (!(e.sets || []).length) return (e.variation || '') === want ? e : null; // hold attempts count as standard; runs carry their variation on the entry
      const sets = e.sets.filter(s => setVarKey(s) === want);
      return sets.length ? Object.assign({}, e, { sets }) : null;
    }).filter(Boolean);
  }
  // chips: All / Standard / each variation that exists in the logged data (hidden when none was ever used)
  function renderVariationFilter() {
    const box = document.getElementById('variationFilter');
    const counts = {};
    entriesOfSelectedExercise().forEach(e => {
      if (!(e.sets || []).length && e.distance != null) { const k = e.variation || ''; counts[k] = (counts[k] || 0) + 1; }
      (e.sets || []).forEach(s => { const k = setVarKey(s); counts[k] = (counts[k] || 0) + 1; });
    });
    const named = Object.keys(counts).filter(k => k !== '').sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    if (!named.length) { box.classList.add('hidden'); box.innerHTML = ''; if (selectedVariation !== 'all') selectedVariation = 'all'; return; }
    const chips = [['all', 'All']];
    if (counts['']) chips.push(['__none__', 'Standard']);
    named.forEach(k => chips.push([k, k]));
    if (!chips.some(c => c[0] === selectedVariation)) selectedVariation = 'all';
    box.innerHTML = chips.map(c => `<button type="button" class="lib-chip${c[0] === selectedVariation ? ' on' : ''}" data-var="${escapeHtml(c[0])}" aria-pressed="${c[0] === selectedVariation}">${escapeHtml(c[1])}${c[0] !== 'all' ? ' <small>' + (c[0] === '__none__' ? counts[''] : counts[c[0]]) + '</small>' : ''}</button>`).join('');
    box.classList.remove('hidden');
  }
  document.getElementById('variationFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-var]'); if (!b) return;
    selectedVariation = b.dataset.var;
    renderAll();
  });

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
    let uni = false;
    entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      (e.sets || []).forEach(s => {
        if (typeof s.reps === 'number') byDate[e.date].push({ l: s.reps, r: s.reps });
        else { uni = true; byDate[e.date].push({ l: s.left || 0, r: s.right || 0 }); }
      });
    });
    const dates = Object.keys(byDate).sort();
    const maxSets = dates.reduce((m, d) => Math.max(m, byDate[d].length), 0);
    const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const datasets = [];
    for (let i = 0; i < maxSets; i++) {
      if (!uni) datasets.push({ label: 'Set ' + (i + 1), idx: i, data: dates.map(d => (byDate[d][i] ? byDate[d][i].l : null)) });
      else {
        datasets.push({ label: 'Set ' + (i + 1) + ' L', idx: i, side: 'l', data: dates.map(d => (byDate[d][i] ? byDate[d][i].l : null)) });
        datasets.push({ label: 'Set ' + (i + 1) + ' R', idx: i, side: 'r', data: dates.map(d => (byDate[d][i] ? byDate[d][i].r : null)) });
      }
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
          label: ds.label, data: ds.data, backgroundColor: SET_COLORS[(ds.idx != null ? ds.idx : i) % SET_COLORS.length] + (ds.side === 'r' ? '99' : ''), borderRadius: 3
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
          e.variation ? `<span class="set-chip">${escapeHtml(e.variation)}</span>` : '',
          e.distance != null ? `<span class="set-chip">${round2(kmToDisplay(e.distance))} ${distanceUnitLabel()}</span>` : '',
          pace ? `<span class="set-chip">${pace} /${distanceUnitLabel()}</span>` : '',
          e.timeMinutes != null ? `<span class="set-chip">${formatDuration(e.timeMinutes)}</span>` : '',
          e.ruckKg != null ? `<span class="set-chip">Rucking ${round2(kgToDisplay(e.ruckKg))}${weightUnitLabel()}</span>` : '',
          e.elevation != null ? `<span class="set-chip">↑ ${round2(mToDisplay(e.elevation))}${elevationUnitLabel()}</span>` : ''
        ].join('') || '<span class="set-chip">No distance data logged</span>';
      } else {
        chips = (e.sets || []).map((s, idx) => {
          const kg = (s.kg != null && s.kg !== '' && Number(s.kg) !== 0) ? ' @' + (Number(s.kg) > 0 ? '+' : 'banded ') + round2(kgToDisplay(Number(s.kg))) + weightUnitLabel() : '';
          const ecc = s.eccentric != null ? ' · ecc ' + s.eccentric + 's' : '';
          const val = typeof s.reps === 'number' ? s.reps + unit : (s.left || 0) + '/' + (s.right || 0) + unit + ((s.left || 0) !== (s.right || 0) ? ' (Δ' + Math.abs((s.left || 0) - (s.right || 0)) + ')' : '');
          return `<span class="set-chip">Set ${idx + 1}: ${escapeHtml(val)}${kg}${ecc}${escapeHtml((s.variation ? ' · ' + s.variation : '') + (s.equipment ? ' · ' + s.equipment : '') + (s.rpe ? ' · RPE ' + s.rpe : '') + (s.pain ? ' · pain' : '') + (s.formBroke ? ' · form broke' : '') + (s.chain ? ' · chained' : ''))}</span>`;
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
        const bwU = bw.kg; // set weights and bodyweight are both stored in kg
        const pct = kg / bwU * 100;
        const base = { date: e.date, approx: bw.approx };
        if (kg > 0) {
          if (!out.bestAdded || pct > out.bestAdded.pct) out.bestAdded = Object.assign({ kg, pct }, base);
          if (!isometric) {
            const e1 = est1rmAdded(bwU, kg, Shared.cleanReps(s));
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
    const fmt = (x) => `${x.kg > 0 ? '+' : ''}${round2(kgToDisplay(x.kg))}${weightUnitLabel()} = ${round2(x.pct)}% BW (${x.date})${x.approx ? ' · est. BW' : ''}`;
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
    const load = dates.map(d => byDate[d] !== undefined ? round2(kgToDisplay(byDate[d])) : null);
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
    renderFormNote(document.getElementById('statFormNote'), entries);
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

      let bestSet = null, bestKg = null, bestGap = null;
      entries.forEach(e => (e.sets || []).forEach(s => {
        const val = Shared.cleanReps(s); // weaker side for one-sided sets; sets where form broke do not count
        if (s.left !== undefined) { const g = Math.abs((s.left || 0) - (s.right || 0)); if (g > 0 && (!bestGap || g > bestGap.value)) bestGap = { value: g, date: e.date }; }
        if (!bestSet || val > bestSet.value) bestSet = { value: val, date: e.date };
        if (s.kg != null && s.kg > 0 && (!bestKg || s.kg > bestKg.value)) bestKg = { value: s.kg, date: e.date };
      }));
      bestsEl.innerHTML = '';
      addLine(isometric ? 'Longest hold, single set' : 'Most reps, single set', bestSet ? bestSet.value + (isometric ? 's' : '') + ' (' + bestSet.date + ')' : '—');
      if (bestGap) addLine('Biggest left/right gap', bestGap.value + (isometric ? 's' : ' reps') + ' (' + bestGap.date + ')');
      addLine('Heaviest set logged', bestKg ? round2(kgToDisplay(bestKg.value)) + weightUnitLabel() + ' (' + bestKg.date + ')' : '—');
      renderRelativeStrength(entries, isometric, addLine, bestsEl);
    }
    renderBwChart(entries, isDistance);
    renderTrendCard(entries, isometric, isDistance);
    renderRomCard(entries, isometric, isDistance);

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

  // sets flagged "form broke" are counted in totals and set charts but never in bests or trends: say so instead of leaving it to guesswork
  function renderFormNote(el, entries) {
    if (!el) return;
    const n = entries.reduce((a, e) => a + (e.sets || []).filter(s => s && s.formBroke).length, 0);
    el.classList.toggle('hidden', !n);
    el.textContent = n ? n + (n === 1 ? ' set was' : ' sets were') + ' flagged "form broke": counted in the totals and the set charts, left out of bests and trends.' : '';
  }
  function renderAll() {
    if (!selectedExercise) return;
    renderVariationFilter();
    document.getElementById('selectedExerciseLabel').textContent = selectedExercise + (selectedVariation === 'all' ? '' : ' · ' + (selectedVariation === '__none__' ? 'Standard' : selectedVariation));

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
    renderFormNote(document.getElementById('periodFormNote'), entries);
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
    if (rangeMode === 'year' && !isDistance && typeof Chart !== 'undefined') {
      // over a whole year the bars of every set are unreadable: show the best of each session and its 5-session average instead
      const trend = makeTrendChart(document.getElementById('repsChart').getContext('2d'), entries, isometric);
      if (trend) { if (repsChartInstance) repsChartInstance.destroy(); repsChartInstance = trend; document.getElementById('repsChartLabel').textContent = 'Best per session'; }
    }
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
    renderBalance();
    renderStraightArm();
    renderExerciseNav();
    renderAll();
  }

  if ((tryLoadFromMainAppKeys() && allEntries().length) || (tryLoadFromGraphCache() && allEntries().length)) {
    init();
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('activityHeatmapCard').classList.add('hidden');
    document.getElementById('balanceCard').classList.add('hidden');
    document.getElementById('straightCard').classList.add('hidden');
  }
})();
