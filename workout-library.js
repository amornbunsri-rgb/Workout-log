/* Library for the Skills page: full programmes, single workouts and "My program".
   All content lives in workout-library.json (programmes, workouts, skill progressions, achievements,
   measurement types, filter options). This file only loads it and draws the UI.
   If the JSON can't be fetched (e.g. the app was opened straight from disk), the last good copy cached
   in this browser is used, and the page offers a file picker so you can load it by hand. */
(function () {
  'use strict';
  var App = window.WorkoutApp;
  var page = document.getElementById('page-skills');
  if (!App || !page) return;

  var LIB_URL = 'workout-library.json';
  var CACHE_KEY = 'workout-library-cache-v1';
  var MY_KEY = 'workout-log-myprogram-v1';

  function arr(x) { return Array.isArray(x) ? x : []; }
  function esc(s) { return window.WorkoutShared.escapeHtml(s); }
  function uid() { return 'mp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function todayISO() { return window.WorkoutShared.todayISO(); }

  // ---------------- load the JSON ----------------
  var lib = null, listeners = [];
  var DEFAULT_META = {
    levels: [{ id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' }, { id: 'expert', label: 'Expert' }],
    types: [{ id: 'strength', label: 'Strength' }, { id: 'skill', label: 'Skill' }, { id: 'mobility', label: 'Mobility' }, { id: 'circuit', label: 'Superset / circuit' }],
    maxWeeks: 6
  };
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var meta = raw.meta || {};
    var n = {
      meta: { levels: arr(meta.levels).length ? meta.levels : DEFAULT_META.levels, types: arr(meta.types).length ? meta.types : DEFAULT_META.types, maxWeeks: +meta.maxWeeks || 6 },
      programmes: arr(raw.programmes).filter(function (p) { return p && p.id && p.name; }),
      workouts: arr(raw.workouts).filter(function (w) { return w && w.id && w.name; }),
      skills: arr(raw.skills).filter(function (s) { return s && s.name && arr(s.steps).length; }),
      achievements: arr(raw.achievements),
      measurementTypes: arr(raw.measurementTypes),
      exercises: arr(raw.exercises).filter(function (x) { return x && x.name; }),
      variations: arr(raw.variations).filter(function (v) { return v && v.exercise && arr(v.variations).length; }),
      variationAliases: arr(raw.variationAliases).filter(function (a) { return a && a.name && a.exercise; }),
      warmups: arr(raw.warmups).filter(function (r) { return r && r.id && arr(r.exercises).length; }),
      stretches: arr(raw.stretches).filter(function (r) { return r && r.id && arr(r.exercises).length; })
    };
    return (n.programmes.length || n.workouts.length || n.skills.length || n.achievements.length) ? n : null;
  }
  function cacheRaw(raw) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch (e) { /* storage full or blocked */ } }
  var ready = new Promise(function (resolve) {
    var go = typeof fetch === 'function' ? fetch(LIB_URL, { cache: 'no-cache' }) : Promise.reject(new Error('no fetch'));
    go.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (raw) { var n = normalize(raw); if (!n) throw new Error('empty'); cacheRaw(raw); return n; })
      .then(null, function () { try { return normalize(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch (e) { return null; } })
      .then(function (n) { lib = n; catIndex = null; resolve(n); });
  });
  function notify() { listeners.forEach(function (fn) { try { fn(lib); } catch (e) { /* ignore */ } }); }
  function pickFile() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var raw = JSON.parse(r.result), n = normalize(raw);
          if (!n) throw new Error('bad');
          cacheRaw(raw); lib = n; catIndex = null; notify(); renderAll(); App.showToast('Library loaded');
        } catch (e) { App.showToast('That file is not a valid workout library'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }
  window.WorkoutLibrary = {
    ready: ready, get: function () { return lib; }, pickFile: pickFile,
    onChange: function (fn) { listeners.push(fn); }
  };

  // ---------------- warm-up and post-workout stretch ----------------
  var OPT_KEY = 'workout-log-plan-options-v1';
  var opts = { warmStretch: true };
  try { var savedOpts = JSON.parse(localStorage.getItem(OPT_KEY)); if (savedOpts && savedOpts.warmStretch === false) opts.warmStretch = false; } catch (e) { /* defaults */ }
  function saveOpts() { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) { /* ignore */ } }
  // Each programme day / workout names its warm-up and stretch in the JSON (null = none).
  // Your own workouts get the general warm-up and full-body stretch.
  function routineFor(item, day, kind) {
    if (!lib) return null;
    var src = day || item, key = kind === 'warm' ? 'warmup' : 'stretch', id = src[key];
    if (id === undefined && item.kind === 'custom') id = kind === 'warm' ? 'wu-general' : 'st-full';
    if (!id) return null;
    return arr(kind === 'warm' ? lib.warmups : lib.stretches).filter(function (r) { return r.id === id; })[0] || null;
  }

  // ---------------- exercises behind a plan ----------------
  // Plan lines are free text ("A1 Weighted pull-ups"); the JSON catalogue says which real exercise they are,
  // which category it belongs in, and whether it is a hold or per-side exercise.
  function exKey(n) { return window.WorkoutShared.exKey(n); }
  var catIndex = null;
  var varAliasIndex = null;
  function buildIndex() {
    catIndex = {};
    varAliasIndex = {};
    if (!lib) return;
    arr(lib.variationAliases).forEach(function (a) { if (!a.category) varAliasIndex[exKey(a.name)] = a; }); // category-limited aliases are only for the merge tool
    arr(lib.exercises).forEach(function (c) {
      catIndex[exKey(c.name)] = c;
      arr(c.aliases).forEach(function (a) { catIndex[exKey(a)] = c; });
    });
  }
  function resolveEx(x) {
    var nm = String(x.name || '').replace(/^[A-Z]\d\s+/, '').trim();
    if (!catIndex) buildIndex();
    // "Negative pull-ups" is the Pull-ups exercise with the Negative variation, not an exercise of its own
    var va = varAliasIndex[exKey(nm)];
    var base = va ? catIndex[exKey(va.exercise)] : null;
    if (base) return { name: base.name, category: base.category, isometric: !!base.isometric, unilateral: !!base.unilateral, pattern: base.pattern, variation: va.variation || null };
    var c = catIndex[exKey(nm)];
    if (c) return { name: c.name, category: c.category, isometric: !!c.isometric, unilateral: !!c.unilateral, pattern: c.pattern };
    var t = x.target || '';
    return { name: nm, category: 'Skill', isometric: /\d\s*(s|sec|min)\b/i.test(t) && !/rep/i.test(t), unilateral: /(per|each) (leg|side|arm)/i.test(t) };
  }
  function withRoutines(item, d, exs) {
    var w = opts.warmStretch ? routineFor(item, d, 'warm') : null, s = opts.warmStretch ? routineFor(item, d, 'stretch') : null;
    function tag(list, part) { return arr(list).map(function (x) { var r = resolveEx(x); r.sets = x.sets; r.target = x.target; r.part = part; return r; }); }
    return tag(w && w.exercises, 'warm').concat(tag(exs, 'plan'), tag(s && s.exercises, 'stretch'));
  }
  // warm-up first, then the plan, then the stretch
  function planList(item, dayIdx) {
    var d = (dayIdx != null) ? arr(item.days)[dayIdx] : null;
    return withRoutines(item, d, d ? d.exercises : item.exercises);
  }
  function allList(item) {
    var out = [];
    arr(item.days).forEach(function (d) { out = out.concat(withRoutines(item, d, d.exercises)); });
    if (arr(item.exercises).length) out = out.concat(withRoutines(item, null, item.exercises));
    return out;
  }
  function blockName(item, dayIdx) {
    var d = (dayIdx != null) ? arr(item.days)[dayIdx] : null;
    return d ? item.name + ' · ' + d.name : item.name;
  }
  // Builds the block from this plan day, adds any exercises you don't have yet, and switches to the log page.
  function startPlan(item, dayIdx) {
    var res = App.ensureExercises(planList(item, dayIdx));
    if (!res.refs.length) { App.showToast('This plan has no exercises to start'); return; }
    var finalName = App.startPlanBlock(blockName(item, dayIdx), res.refs);
    if (App.registerPlanBlock) App.registerPlanBlock(finalName, { uid: item.uid, name: item.name, dayIdx: dayIdx, dayNames: arr(item.days).map(function (d) { return d.name; }), weeks: item.weeks || 0, dpw: item.daysPerWeek || arr(item.days).length || 1, progression: item.progression || '' });
    item.blockNames = arr(item.blockNames);
    if (item.blockNames.indexOf(finalName) < 0) item.blockNames.push(finalName);
    saveMine();
  }

  // ---------------- my program (saved items) ----------------
  var mine = [];
  try { mine = arr(JSON.parse(localStorage.getItem(MY_KEY))).filter(function (x) { return x && x.uid && x.name; }); } catch (e) { mine = []; }
  function saveMine() { try { localStorage.setItem(MY_KEY, JSON.stringify(mine)); } catch (e) { /* ignore */ } }
  function inMine(srcId) { return mine.some(function (m) { return m.srcId === srcId; }); }
  function addToMine(item, kind, silent) {
    var copy = JSON.parse(JSON.stringify(item));
    copy.uid = uid(); copy.kind = kind; copy.srcId = item.id || null; copy.added = todayISO(); delete copy.id;
    mine.push(copy); saveMine();
    // every exercise in the plan becomes one of your exercises, so it can be logged
    var res = App.ensureExercises(allList(copy));
    renderAll();
    if (!silent) App.showToast('Added to My program' + (res.added ? ' · ' + res.added + ' new exercise' + (res.added === 1 ? '' : 's') : ''));
    return copy;
  }
  function removeFromMine(u) {
    var gone = mine.filter(function (m) { return m.uid === u; })[0];
    if (gone && App.deletePlanBlocks) App.deletePlanBlocks(gone.blockNames);
    mine = mine.filter(function (m) { return m.uid !== u; }); saveMine(); renderAll();
  }
  function startFromLib(item, dayIdx, kind) {
    var copy = mine.filter(function (m) { return m.srcId === item.id; })[0] || addToMine(item, kind, true);
    startPlan(copy, dayIdx);
  }
  if (App.registerBackupPart) {
    App.registerBackupPart('myProgram', {
      get: function () { return mine; },
      merge: function (incoming) {
        var haveUid = {}, haveSrc = {};
        mine.forEach(function (m) { haveUid[m.uid] = 1; if (m.srcId) haveSrc[m.srcId] = 1; });
        arr(incoming).forEach(function (m) {
          if (m && m.uid && m.name && !haveUid[m.uid] && !(m.srcId && haveSrc[m.srcId])) mine.push(m);
        });
        saveMine(); renderAll();
      }
    });
  }

  // ---------------- UI scaffolding ----------------
  var state = { tab: 'programmes', levels: [], weeks: [], types: [], open: {} };
  var root = document.createElement('div');
  root.id = 'libRoot';
  root.innerHTML =
    '<div class="lib-tabs" role="tablist" aria-label="Skills library">' +
      '<button type="button" role="tab" class="lib-tab" data-tab="programmes"><i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Programmes</button>' +
      '<button type="button" role="tab" class="lib-tab" data-tab="workouts"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i> Workouts</button>' +
      '<button type="button" role="tab" class="lib-tab" data-tab="mine"><i class="fa-solid fa-user-check" aria-hidden="true"></i> My program</button>' +
    '</div>' +
    '<label class="lib-opt"><input type="checkbox" id="libWarmStretch" /> Include a warm-up and post-workout stretch when I start a plan</label>' +
    '<div class="module lib-browse" id="libBrowse">' +
      '<div class="lib-filters" id="libFilters"></div>' +
      '<div class="lib-count" id="libCount"></div>' +
      '<div id="libList"></div>' +
    '</div>' +
    '<div class="module lib-mine" id="libMine">' +
      '<div class="section-label-row"><div class="section-label">My plan</div></div>' +
      '<div id="libMineList"></div>' +
      '<details class="lib-create"><summary><i class="fa-solid fa-plus" aria-hidden="true"></i> Create your own workout</summary>' +
        '<input type="text" id="libNewName" placeholder="Workout name (e.g. Friday pull session)" maxlength="60" />' +
        '<textarea id="libNewLines" rows="5" placeholder="One exercise per line, for example:\nPull-ups - 4 x 6\nDips - 4 x 8\nHollow hold - 3 x 30 s"></textarea>' +
        '<button type="button" id="libNewAdd" class="primary-btn">Add to My program</button>' +
      '</details>' +
      '<button type="button" class="text-btn lib-addall" id="libAddAllEx"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i> Add all library exercises to my exercises</button>' +
    '</div>';
  page.insertBefore(root, page.firstChild);
  var modNext = document.getElementById('module-skills-next');
  var modLines = document.getElementById('module-skills-lines');

  // skill progression templates (from the JSON) are offered under the user's own skill lines
  var tplBox = document.createElement('div');
  tplBox.id = 'libSkillTemplates';
  tplBox.className = 'lib-templates';
  modLines.appendChild(tplBox);

  function metaLabel(list, id) { var f = arr(list).filter(function (x) { return x.id === id; })[0]; return f ? f.label : id; }

  var warmBox = document.getElementById('libWarmStretch');
  warmBox.checked = opts.warmStretch;
  warmBox.onchange = function () { opts.warmStretch = warmBox.checked; saveOpts(); renderAll(); };

  // ---------------- tabs ----------------
  function setTab(t) { state.tab = t; renderAll(); }
  root.querySelector('.lib-tabs').onclick = function (e) {
    var b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab);
  };

  // ---------------- filters ----------------
  function toggleIn(list, v) { var i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); }
  function chipGroup(label, key, options) {
    var h = '<div class="lib-filter-group"><div class="lib-filter-label">' + esc(label) + '</div><div class="lib-chip-row">';
    options.forEach(function (o) {
      var on = state[key].indexOf(o.id) >= 0;
      h += '<button type="button" class="lib-chip' + (on ? ' on' : '') + '" data-fkey="' + key + '" data-fval="' + esc(o.id) + '" aria-pressed="' + on + '">' + esc(o.label) + '</button>';
    });
    return h + '</div></div>';
  }
  function renderFilters() {
    var el = document.getElementById('libFilters');
    if (!lib) { el.innerHTML = ''; return; }
    var weekOpts = [];
    for (var w = 1; w <= lib.meta.maxWeeks; w++) weekOpts.push({ id: w, label: w + (w === 1 ? ' wk' : ' wks') });
    var h = chipGroup('Level', 'levels', lib.meta.levels);
    if (state.tab === 'programmes') h += chipGroup('Length', 'weeks', weekOpts);
    h += chipGroup('Type', 'types', lib.meta.types);
    var any = state.levels.length || state.types.length || (state.tab === 'programmes' && state.weeks.length);
    h += '<button type="button" class="text-btn lib-clear' + (any ? '' : ' hidden') + '" id="libClear"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Clear filters</button>';
    el.innerHTML = h;
  }
  document.getElementById('libFilters').onclick = function (e) {
    var c = e.target.closest('.lib-chip');
    if (c) {
      var key = c.dataset.fkey, val = key === 'weeks' ? +c.dataset.fval : c.dataset.fval;
      toggleIn(state[key], val); renderBrowse(); return;
    }
    if (e.target.closest('#libClear')) { state.levels = []; state.weeks = []; state.types = []; renderBrowse(); }
  };
  function matches(item) {
    if (state.levels.length && state.levels.indexOf(item.level) < 0) return false;
    if (state.tab === 'programmes' && state.weeks.length && state.weeks.indexOf(+item.weeks) < 0) return false;
    if (state.types.length && !arr(item.types).some(function (t) { return state.types.indexOf(t) >= 0; })) return false;
    return true;
  }

  // ---------------- cards ----------------
  function exLine(x) {
    var s = esc(x.name);
    var amount = (x.sets ? x.sets + ' × ' : '') + (x.target || '');
    if (amount) s += ' — ' + esc(amount);
    if (x.note) s += ' <span class="lib-note">(' + esc(x.note) + ')</span>';
    return '<li>' + s + '</li>';
  }
  function routineLine(r, label) {
    if (!r) return '';
    var list = arr(r.exercises).map(function (x) { return esc(x.name) + (x.target ? ' ' + esc(x.target) : ''); }).join(' · ');
    return '<p class="lib-routine"><b>' + label + ' (' + esc(r.name) + ', ~' + (r.minutes || 5) + ' min):</b> ' + list + ' <button type="button" class="text-btn lib-play" data-act="play" data-routine="' + esc(r.id) + '"><i class="fa-solid fa-play" aria-hidden="true"></i> Play</button></p>';
  }
  function detailsHTML(item) {
    var h = '';
    if (arr(item.days).length) {
      item.days.forEach(function (d) {
        h += '<div class="lib-day"><div class="lib-day-name">' + esc(d.name) + '</div>' + routineLine(routineFor(item, d, 'warm'), 'Warm-up') +
          '<ul>' + arr(d.exercises).map(exLine).join('') + '</ul>' + routineLine(routineFor(item, d, 'stretch'), 'Stretch') + '</div>';
      });
    }
    if (arr(item.exercises).length) h += routineLine(routineFor(item, null, 'warm'), 'Warm-up') + '<ul>' + item.exercises.map(exLine).join('') + '</ul>' + routineLine(routineFor(item, null, 'stretch'), 'Stretch');
    if (item.rest) h += '<p class="lib-extra"><b>Rest:</b> ' + esc(item.rest) + '</p>';
    if (item.progression) h += '<p class="lib-extra"><b>Progression:</b> ' + esc(item.progression) + '</p>';
    return h || '<p class="lib-extra">No details.</p>';
  }
  function startRowHTML(item) {
    var days = arr(item.days);
    if (days.length > 1) {
      return '<div class="lib-start"><span class="lib-start-label">Start</span>' + days.map(function (d, i) {
        return '<button type="button" class="lib-start-btn" data-act="start" data-day="' + i + '">' + esc(d.name) + '</button>';
      }).join('') + '</div>';
    }
    return '<div class="lib-start"><button type="button" class="lib-start-btn primary" data-act="start"' + (days.length === 1 ? ' data-day="0"' : '') + '><i class="fa-solid fa-play" aria-hidden="true"></i> Start</button></div>';
  }
  function formatLabel(f) { return f === 'superset' ? 'Superset' : f === 'circuit' ? 'Circuit' : ''; }
  function planLine(item) {
    if (!item.weeks || !App.planSessions) return '';
    var days = arr(item.days), dpw = item.daysPerWeek || days.length || 1, total = item.weeks * dpw, n = App.planSessions(item.uid);
    if (!n) return '';
    if (n >= total) return '<div class="lib-bits plan-line">Programme complete · ' + n + ' sessions</div>';
    return '<div class="lib-bits plan-line">Week ' + (Math.floor(n / dpw) + 1) + ' of ' + item.weeks + ' · next: ' + esc(days.length ? days[n % days.length].name : 'session') + '</div>';
  }
  function buildCard(item, mode) {
    var key = (mode === 'mine' ? item.uid : item.id);
    var open = !!state.open[key];
    var bits = [];
    if (item.weeks) bits.push(item.weeks + (item.weeks === 1 ? ' week' : ' weeks') + (item.daysPerWeek ? ' · ' + item.daysPerWeek + ' days/wk' : ''));
    if (item.durationMin) bits.push('~' + item.durationMin + ' min');
    if (formatLabel(item.format)) bits.push(formatLabel(item.format));
    var card = document.createElement('div');
    card.className = 'lib-card';
    var act;
    if (mode === 'mine') act = '<button type="button" class="icon-btn" data-act="remove" aria-label="Remove from My program" title="Remove"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>';
    else if (inMine(item.id)) act = '<button type="button" class="icon-btn on" disabled aria-label="Already in My program" title="In My program"><i class="fa-solid fa-check" aria-hidden="true"></i></button>';
    else act = '<button type="button" class="icon-btn" data-act="add" aria-label="Add to My program" title="Add to My program"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>';
    card.innerHTML =
      '<div class="lib-card-head"><div class="lib-card-title">' + esc(item.name) + '</div>' + act + '</div>' +
      '<div class="lib-badges">' +
        (item.level ? '<span class="lib-badge lvl-' + esc(item.level) + '">' + esc(metaLabel(lib && lib.meta.levels, item.level)) + '</span>' : '') +
        arr(item.types).map(function (t) { return '<span class="lib-badge">' + esc(metaLabel(lib && lib.meta.types, t)) + '</span>'; }).join('') +
        (mode === 'mine' && item.kind === 'custom' ? '<span class="lib-badge">Custom</span>' : '') +
      '</div>' +
      (bits.length ? '<div class="lib-bits">' + esc(bits.join('  ·  ')) + '</div>' : '') +
      (mode === 'mine' && item.uid ? planLine(item) : '') +
      (item.summary ? '<div class="lib-summary">' + esc(item.summary) + '</div>' : '') +
      startRowHTML(item) +
      '<button type="button" class="text-btn lib-more" data-act="more" aria-expanded="' + open + '">' + (open ? 'Hide details' : 'Show details') + '</button>' +
      '<div class="lib-details' + (open ? '' : ' hidden') + '">' + detailsHTML(item) + '</div>';
    card.onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      if (b.dataset.act === 'play') { if (window.WorkoutRoutines) window.WorkoutRoutines.play(b.dataset.routine); return; }
      if (b.dataset.act === 'more') { state.open[key] = !state.open[key]; renderBrowse(); renderMine(); }
      else if (b.dataset.act === 'add') addToMine(item, state.tab === 'workouts' ? 'workout' : 'programme');
      else if (b.dataset.act === 'start') {
        var di = b.dataset.day != null ? +b.dataset.day : null;
        if (mode === 'mine') startPlan(item, di); else startFromLib(item, di, state.tab === 'workouts' ? 'workout' : 'programme');
      }
      else if (b.dataset.act === 'remove') { if (confirm('Remove "' + item.name + '" from My program?')) removeFromMine(item.uid); }
    };
    return card;
  }

  function notLoadedCard() {
    var d = document.createElement('div');
    d.className = 'lib-empty';
    d.innerHTML = '<p>The library file <code>workout-library.json</code> could not be loaded. Keep it in the same folder as the app and open the app from a web address, or pick the file by hand.</p>' +
      '<button type="button" class="text-btn" id="libPick"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Choose workout-library.json</button>';
    d.querySelector('#libPick').onclick = pickFile;
    return d;
  }

  function renderBrowse() {
    var box = document.getElementById('libList'), cnt = document.getElementById('libCount');
    renderFilters();
    box.innerHTML = '';
    if (!lib) { cnt.textContent = ''; box.appendChild(notLoadedCard()); return; }
    var items = (state.tab === 'programmes' ? lib.programmes : lib.workouts).filter(matches);
    cnt.textContent = items.length + (state.tab === 'programmes' ? (items.length === 1 ? ' programme' : ' programmes') : (items.length === 1 ? ' workout' : ' workouts'));
    if (!items.length) {
      var d = document.createElement('div'); d.className = 'lib-empty';
      d.innerHTML = '<p>Nothing matches those filters.</p>';
      box.appendChild(d); return;
    }
    items.forEach(function (it) { box.appendChild(buildCard(it, 'lib')); });
  }

  // ---------------- my program ----------------
  function renderMine() {
    var box = document.getElementById('libMineList');
    box.innerHTML = '';
    if (!mine.length) {
      var d = document.createElement('div'); d.className = 'lib-empty';
      d.innerHTML = '<p>Nothing saved yet. Add programmes or workouts with the + button, or create your own below.</p>' +
        '<button type="button" class="text-btn" data-go="programmes">Browse programmes</button> <button type="button" class="text-btn" data-go="workouts">Browse workouts</button>';
      d.onclick = function (e) { var g = e.target.closest('[data-go]'); if (g) setTab(g.dataset.go); };
      box.appendChild(d); return;
    }
    mine.forEach(function (m) { box.appendChild(buildCard(m, 'mine')); });
  }
  document.getElementById('libAddAllEx').onclick = function () {
    if (!lib || !arr(lib.exercises).length) { App.showToast('The library file is not loaded'); return; }
    var res = App.ensureExercises(lib.exercises.map(function (c) { return { name: c.name, category: c.category, isometric: c.isometric, unilateral: c.unilateral }; }));
    App.showToast(res.added ? res.added + ' exercises added to your lists' : 'You already have all of them');
  };
  document.getElementById('libNewAdd').onclick = function () {
    var name = document.getElementById('libNewName').value.trim();
    var lines = document.getElementById('libNewLines').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (!name) { App.showToast('Give the workout a name'); return; }
    if (!lines.length) { App.showToast('Add at least one exercise'); return; }
    var exercises = lines.map(function (l) {
      var m = l.match(/^(.+?)\s+[–—-]\s+(.+)$/) || l.match(/^(.+?):\s*(.+)$/);
      return m ? { name: m[1].trim(), target: m[2].trim() } : { name: l };
    });
    var custom = { uid: uid(), kind: 'custom', srcId: null, name: name, types: [], exercises: exercises, added: todayISO() };
    mine.push(custom);
    saveMine();
    App.ensureExercises(allList(custom));
    document.getElementById('libNewName').value = ''; document.getElementById('libNewLines').value = '';
    root.querySelector('.lib-create').open = false;
    renderAll(); App.showToast('Added to My program');
  };

  // ---------------- skill progression templates (from the JSON) ----------------
  function renderTemplates() {
    if (!lib || !lib.skills.length) {
      tplBox.innerHTML = lib ? '' : '<div class="empty">Skill templates need <code>workout-library.json</code>. <button type="button" class="text-btn" id="libPick2">Choose file</button></div>';
      var b = document.getElementById('libPick2'); if (b) b.onclick = pickFile;
      return;
    }
    var have = (App.skillLineNames ? App.skillLineNames() : []).map(function (n) { return n.toLowerCase(); });
    var avail = lib.skills.filter(function (s) { return have.indexOf(String(s.name).toLowerCase()) < 0; });
    if (!avail.length) { tplBox.innerHTML = ''; return; }
    tplBox.innerHTML = '<div class="lib-filter-label">Add a progression from the library</div><div class="lib-chip-row">' +
      avail.map(function (s, i) { return '<button type="button" class="lib-chip" data-tpl="' + esc(s.name) + '"><i class="fa-solid fa-plus" aria-hidden="true"></i> ' + esc(s.name) + '</button>'; }).join('') + '</div>';
  }
  tplBox.onclick = function (e) {
    var c = e.target.closest('[data-tpl]'); if (!c || !lib) return;
    var tpl = lib.skills.filter(function (s) { return s.name === c.dataset.tpl; })[0];
    if (tpl && App.addSkillTemplates) App.addSkillTemplates([tpl]);
  };
  App.onSkillsRender = renderTemplates;

  // ---------------- show the right tab ----------------
  function renderAll() {
    Array.prototype.forEach.call(root.querySelectorAll('.lib-tab'), function (b) {
      var on = b.dataset.tab === state.tab;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var browse = state.tab !== 'mine';
    document.getElementById('libBrowse').classList.toggle('hidden', !browse);
    document.getElementById('libMine').classList.toggle('hidden', browse);
    if (modNext) modNext.classList.toggle('hidden', browse);
    if (modLines) modLines.classList.toggle('hidden', browse);
    if (browse) renderBrowse(); else renderMine();
    renderTemplates();
  }

  renderAll();
  ready.then(function () {
    if (App.refreshVariations) App.refreshVariations();
    if (App.fillPatterns) App.fillPatterns();
    if ((App.skillLineNames && App.skillLineNames().length) || mine.length) state.tab = 'mine';
    notify(); renderAll();
  });
})();
