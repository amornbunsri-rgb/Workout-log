/* Helpers used by both pages (workout-log.js and workout-graph.js), kept in one place so they can't drift apart.
   Everything here is pure: the unit system and data are passed in, nothing reads page state.
   Load this file before either page's script. */
(function () {
  'use strict';
  var KM_TO_MI = 0.621371, KG_TO_LB = 2.20462, M_TO_FT = 3.28084;
  var UNITS_KEY = 'workout-log-units-v1';
  var E1RM_MAX_REPS = 12; // an estimated 1RM is only trusted for sets of 1 to 12 reps

  function imperial(sys) { return sys === 'imperial'; }

  // Colour themes: accent plus a soft tint and border for light mode. "dark" is the lighter accent used in dark mode.
  var THEME_KEY = 'workout-log-theme-v1';
  var THEMES = [
    { name: "Terracotta", accent: "#b5502f", bg: "#fbe9e2", border: "#e0a68e" },
    { name: "Fresh Meadow", accent: "#1f9a45", bg: "#d8f2cd", border: "#a1d5b1", dark: "#5ddc7b" },
    { name: "Alpine Lake", accent: "#1976d2", bg: "#d0e6ff", border: "#9ec5ec", dark: "#5aa9ff" },
    { name: "Plum", accent: "#8a4fb5", bg: "#f1e6fb", border: "#cfa8e8" },
    { name: "Sunrise Canyon", accent: "#e8590c", bg: "#ffddc2", border: "#f5b999", dark: "#ff9a50" },
    { name: "Slate", accent: "#4a5568", bg: "#e8eaed", border: "#b0b8c4" },
    { name: "Spring Blossom", accent: "#e0426f", bg: "#fddbe6", border: "#f2b0c3", dark: "#ff7aa0" },
    { name: "Tropical Lagoon", accent: "#009688", bg: "#c6f0ea", border: "#94d3cd", dark: "#2dd4bf" },
    { name: "Indigo", accent: "#4a4fb5", bg: "#e9e9fb", border: "#b3b5e8" },
    { name: "Olive", accent: "#6b7a2f", bg: "#eef2df", border: "#c3d19a" }
  ];

  window.WorkoutShared = {
    KM_TO_MI: KM_TO_MI, KG_TO_LB: KG_TO_LB, M_TO_FT: M_TO_FT, UNITS_KEY: UNITS_KEY, E1RM_MAX_REPS: E1RM_MAX_REPS,
    // movement patterns for the weekly balance view
    PATTERNS: [
      { id: 'vpush', label: 'Vertical push', short: 'V push', color: '#d9534f' },
      { id: 'hpush', label: 'Horizontal push', short: 'H push', color: '#e8913a' },
      { id: 'vpull', label: 'Vertical pull', short: 'V pull', color: '#2f7a5c' },
      { id: 'hpull', label: 'Horizontal pull', short: 'H pull', color: '#3aa6a0' },
      { id: 'core', label: 'Core', short: 'Core', color: '#8a4fb5' },
      { id: 'legs', label: 'Legs', short: 'Legs', color: '#3061b0' },
      { id: 'mobility', label: 'Mobility', short: 'Mobility', color: '#b58a2f' }
    ],
    // best guess from the name, used when an exercise has no pattern set and is not in the library
    guessPattern: function (name) {
      var n = String(name || '').toLowerCase();
      if (/stretch|mobility|\bcars\b|rotation|cat-?cow|child|pose|slides|angels|couch|pigeon|90\/90|pancake|roller|wrist (rock|conditioning|warm)|shoulder (circle|flexion)|arm circle|leg swing|deep squat/.test(n)) return 'mobility';
      if (/plank|hollow|dragon|l[ -]?sit|leg raise|knee raise|dead bug|bird dog|\bcore\b|crunch|toes.?to.?bar|mountain/.test(n)) return 'core';
      if (/pull-?up|pull up|chin|muscle|scap|dead hang|\bneg\b|archer|soviet|\bwide\b|\bhigh\b|one[ -]?arm|face pull|\bhang\b/.test(n)) return 'vpull';
      if (/\brows?\b|lever|ice cream|human flag/.test(n)) return 'hpull';
      if (/hspu|handstand|pike|\bdips?\b|parallette support|assisted hs/.test(n)) return 'vpush';
      if (/push|planche|tricep|pseudo|\boap\b/.test(n)) return 'hpush';
      if (/squat|lunge|nordic|pistol|calf|glute|bridge|step-?up|\brun|sprint|trail|5k|jump|burpee|\bleg|walk|hike|ruck/.test(n)) return 'legs';
      return '';
    },
    patternOf: function (exObj, name) { return (exObj && exObj.pattern) || window.WorkoutShared.guessPattern(name); },
    // straight-arm skills (planche, levers, handstands, supports) load the elbows and wrists
    guessStraightArm: function (name) {
      var n = String(name || '').toLowerCase();
      if (/\brows?\b|pull|push-?up|hspu|press|shrug/.test(n)) return false;
      return /planche|lever|handstand|human flag|maltese|iron cross|l[ -]?sit|support hold/.test(n);
    },
    isStraightArm: function (exObj, name) {
      if (exObj && exObj.straightArm !== undefined) return !!exObj.straightArm;
      return window.WorkoutShared.guessStraightArm(name);
    },
    // reps/seconds of a set for bests and progression; a set flagged "form broke" does not count
    cleanReps: function (s) { return s && s.formBroke ? 0 : window.WorkoutShared.setReps(s); },
    // weekly straight-arm holding time (last 8 weeks), plus warnings. entries: flat list; isSA(name) -> bool
    straightArmReport: function (entries, isSA, ws, todayISO) {
      var S = window.WorkoutShared;
      function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
      function back(days) { var d = new Date(todayISO + 'T00:00:00'); d.setDate(d.getDate() - days); return iso(d); }
      var base = new Date(S.weekStartISO(todayISO, ws) + 'T00:00:00'), rows = [], idx = {}, i;
      for (i = 7; i >= 0; i--) { var d = new Date(base); d.setDate(d.getDate() - 7 * i); var k = iso(d); idx[k] = rows.length; rows.push({ week: k, sec: 0, sets: 0, hard: 0 }); }
      var cut14 = back(14), cut7 = back(7), days = {}, pain = [], hasData = false;
      entries.forEach(function (e) {
        if (!e || !e.date) return;
        var sa = isSA(e.exercise), r = rows[idx[S.weekStartISO(e.date, ws)]];
        (e.sets || []).forEach(function (s) {
          if (!s || typeof s !== 'object') return;
          if (s.pain && e.date >= cut14) pain.push(e.exercise);
          if (!sa || !r) return;
          hasData = true; r.sets++;
          if (e.isometric) r.sec += (s.reps != null ? Number(s.reps) || 0 : (Number(s.left) || 0) + (Number(s.right) || 0));
          if (Number(s.rpe) >= 9 && e.date >= cut7) r.hard++;
        });
        if (sa && r) { (e.attempts || []).forEach(function (a) { r.sec += Number(a) || 0; }); if (e.date >= cut14) days[e.date] = 1; }
      });
      var flags = [], cur = rows[rows.length - 1], prev = rows.slice(-5, -1);
      var avg = prev.reduce(function (a, r) { return a + r.sec; }, 0) / 4;
      if (avg >= 60 && cur.sec > 1.3 * avg && cur.sec - avg >= 45) flags.push(['warn', 'Straight-arm holding is up ' + Math.round((cur.sec / avg - 1) * 100) + '% on your 4-week average (' + Math.round(cur.sec) + ' s vs ' + Math.round(avg) + ' s). Build up by roughly 10 to 20% a week.']);
      var run = 0, best = 0;
      for (i = 13; i >= 0; i--) { if (days[back(i)]) { run++; if (run > best) best = run; } else run = 0; }
      if (best >= 3) flags.push(['warn', 'Straight-arm work on ' + best + ' days in a row. Leave about 48 hours between hard sessions.']);
      if (pain.length) {
        var uniq = pain.filter(function (x, j) { return pain.indexOf(x) === j; });
        flags.push(['warn', 'Pain flagged on ' + pain.length + (pain.length === 1 ? ' set' : ' sets') + ' in the last 14 days (' + uniq.slice(0, 4).join(', ') + '). Back off those moves for a few days, and get it checked if it lingers.']);
      }
      if (cur.hard >= 3) flags.push(['note', cur.hard + ' straight-arm sets at RPE 9 or more in the last 7 days. Keep most holds around RPE 7 to 8.']);
      if (!flags.length && hasData) flags.push(['ok', 'Straight-arm load looks steady.']);
      return { rows: rows, flags: flags, hasData: hasData, avg: avg };
    },
    // remembers which sections are folded up or open (this browser only)
    ui: (function () {
      var KEY = 'workout-log-ui-v1';
      function all() { try { var o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
      function get(k, d) { var o = all(); return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d; }
      function set(k, v) { var o = all(); o[k] = v; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
      // a <details> element keeps its open or closed state
      function details(el, key) { if (!el) return; var v = get(key); if (typeof v === 'boolean') el.open = v; el.addEventListener('toggle', function () { set(key, el.open); }); }
      // a chevron button that folds a section up and down
      function collapse(btn, body, key) {
        if (!btn || !body) return;
        function apply(c) {
          body.classList.toggle('hidden', c);
          btn.innerHTML = '<i class="fa-solid fa-chevron-' + (c ? 'right' : 'down') + '" aria-hidden="true"></i>';
          btn.title = c ? 'Expand' : 'Collapse';
          btn.setAttribute('aria-label', (c ? 'Expand' : 'Collapse') + ' section');
          btn.setAttribute('aria-expanded', String(!c));
        }
        apply(!!get(key, false));
        btn.onclick = function () { var c = !body.classList.contains('hidden'); apply(c); set(key, c); };
      }
      return { KEY: KEY, get: get, set: set, details: details, collapse: collapse };
    })(),
    WEEK_KEY: 'workout-log-weekstart-v1',
    // 1 = weeks start on Monday (default), 0 = Sunday; used by both pages
    loadWeekStart: function () {
      try { var v = localStorage.getItem('workout-log-weekstart-v1'); if (v === '0' || v === '1') return +v; } catch (e) { /* ignore */ }
      return 1;
    },
    weekStartISO: function (dateStr, ws) {
      var d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() - ((d.getDay() - ws + 7) % 7));
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    },
    COLOR_PALETTE: ['#b5502f', '#2f7a5c', '#3061b0', '#8a4fb5', '#b58a2f', '#2f9cb5', '#b52f74', '#5c8a2f'],
    DISTANCE_CATEGORY_PATTERN: /run|walk|ruck|jog|hike/i,

    // ---- colour theme (used by both pages so they always match) ----
    THEME_KEY: THEME_KEY,
    THEMES: THEMES,
    loadTheme: function () {
      try {
        var n = parseInt(localStorage.getItem(THEME_KEY), 10);
        if (!isNaN(n) && THEMES[n]) return n;
      } catch (e) { /* ignore */ }
      return 0;
    },
    applyTheme: function (idx, mode) {
      var t = THEMES[idx] || THEMES[0], root = document.documentElement.style;
      var accent = (mode === 'dark' && t.dark) ? t.dark : t.accent;
      root.setProperty('--accent', accent);
      if (mode === 'dark') {
        // pastel tints read poorly on a dark surface, so use a translucent wash of the accent itself
        root.setProperty('--accent-bg', accent + '2a');
        root.setProperty('--accent-border', accent + '70');
      } else {
        root.setProperty('--accent-bg', t.bg);
        root.setProperty('--accent-border', t.border);
      }
    },

    // ---- units (sys is 'metric' or 'imperial'; only the shown number changes, stored values stay km / kg / m) ----
    loadUnits: function () {
      try {
        var saved = localStorage.getItem(UNITS_KEY);
        if (saved === 'metric' || saved === 'imperial') return saved;
      } catch (e) { /* ignore */ }
      return 'metric';
    },
    distanceUnitLabel: function (sys) { return imperial(sys) ? 'mi' : 'km'; },
    weightUnitLabel: function (sys) { return imperial(sys) ? 'lb' : 'kg'; },
    elevationUnitLabel: function (sys) { return imperial(sys) ? 'ft' : 'm'; },
    kmToDisplay: function (sys, km) { return imperial(sys) ? km * KM_TO_MI : km; },
    kgToDisplay: function (sys, kg) { return imperial(sys) ? kg * KG_TO_LB : kg; },
    mToDisplay: function (sys, m) { return imperial(sys) ? m * M_TO_FT : m; },

    // ---- formatting ----
    round2: function (n) { return Math.round(n * 100) / 100; },
    formatDuration: function (totalMinutes) {
      if (totalMinutes == null || isNaN(totalMinutes)) return '';
      var h = Math.floor(totalMinutes / 60), m = totalMinutes % 60;
      return h > 0 ? h + 'h' + String(m).padStart(2, '0') + 'm' : m + 'm';
    },
    // minutes per distance unit -> "M:SS"
    formatPace: function (minutesPerUnit) {
      if (minutesPerUnit == null || !isFinite(minutesPerUnit) || minutesPerUnit <= 0) return null;
      var mins = Math.floor(minutesPerUnit), secs = Math.round((minutesPerUnit - mins) * 60);
      if (secs === 60) { secs = 0; mins += 1; }
      return mins + ':' + String(secs).padStart(2, '0');
    },
    paceForEntry: function (sys, entry) {
      if (!entry || entry.distance == null || entry.distance <= 0 || entry.timeMinutes == null) return null;
      return window.WorkoutShared.formatPace(entry.timeMinutes / window.WorkoutShared.kmToDisplay(sys, entry.distance));
    },
    // safe for text and for attribute values (quotes are escaped too)
    escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    },
    // exercise names compared loosely: case, spaces, punctuation, "tucked" vs "tuck" and a plural s are ignored
    exKey: function (n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/tucked/g, 'tuck').replace(/s$/, ''); },
    // today as YYYY-MM-DD in local time
    todayISO: function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); },
    isDistanceCategoryName: function (cat) { return /run|walk|ruck|jog|hike/i.test(cat || ''); },

    // ---- strength maths ----
    // Reps of one set. For left/right sets, the weaker side, to stay conservative.
    // Also accepts the oldest format, where a set was just a number.
    setReps: function (s) {
      if (s == null) return 0;
      if (typeof s !== 'object') { var n0 = Number(s); return isNaN(n0) ? 0 : n0; }
      if (s.left !== undefined) return Math.min(Number(s.left) || 0, Number(s.right) || 0);
      var n = Number(s.reps);
      return isNaN(n) ? 0 : n;
    },
    // Epley on the TOTAL load (bodyweight + added), minus bodyweight = estimated 1RM of the added load.
    // With no bodyweight (0) this is plain Epley on the added weight. A single rep is just the load itself.
    est1rmAdded: function (bwKg, addedKg, reps) {
      if (!(addedKg > 0) || reps < 1 || reps > E1RM_MAX_REPS) return null;
      if (reps === 1) return addedKg;
      return ((bwKg || 0) + addedKg) * (1 + reps / 30) - (bwKg || 0);
    },
    // Latest weigh-in on or before a date from a log sorted oldest to newest; before the first one, the first one.
    bodyweightKgOn: function (sortedLog, dateStr) {
      if (!sortedLog || !sortedLog.length) return null;
      var found = null;
      for (var i = 0; i < sortedLog.length; i++) { if (sortedLog[i].date <= dateStr) found = sortedLog[i]; else break; }
      return found ? { kg: found.kg, approx: false } : { kg: sortedLog[0].kg, approx: true };
    }
  };
})();
