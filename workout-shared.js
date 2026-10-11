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
    escapeHtml: function (s) {
      var d = document.createElement('div');
      d.textContent = s == null ? '' : String(s);
      return d.innerHTML;
    },
    isDistanceCategoryName: function (cat) { return /run|walk|ruck|jog|hike/i.test(cat || ''); },

    // ---- strength maths ----
    // Reps of one set. For left/right sets, the weaker side, to stay conservative.
    setReps: function (s) {
      if (!s || typeof s !== 'object') return 0;
      if (typeof s.reps === 'number') return s.reps;
      if (s.left !== undefined) return Math.min(Number(s.left) || 0, Number(s.right) || 0);
      return 0;
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
