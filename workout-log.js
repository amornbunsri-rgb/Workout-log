/* Workout log: main app script.
   Loaded by workout-log-standalone.html right after the page markup, so every element it uses already exists.
   Extra features live in workout-tools.js, workout-library.js and workout-profile.js (loaded afterwards). */
(function () {
  // ---------- Everything below is self-contained: no other files required ----------
  const LEGACY_MAIN_CATEGORY = "Main workout"; // retired category: ignored when loading or importing old data
  const UNCATEGORIZED_NAME = "Uncategorized";
  const DEFAULT_EXERCISE_LISTS = {
    "Push": [
      { name: "Assisted HS push/hold", color: "#c7a6e0", isometric: true },
      { name: "Pseudo planche", color: "#e0cd9e", isometric: true },
      { name: "Push-ups", color: null, isometric: false },
      { name: "Pike raised", color: null, isometric: false },
      { name: "Pike Def", color: null, isometric: false },
      { name: "Dips", color: null, isometric: false },
      { name: "Tricep dips", color: null, isometric: false },
      { name: "OAP", color: null, isometric: false },
      { name: "HSPU", color: null, isometric: false }
    ],
    "Pull": [
      { name: "Pull-ups", color: null, isometric: false }
    ],
    "Legs": [
      { name: "Running", color: null, isometric: false },
      { name: "Reverse Nordic", color: null, isometric: false },
      { name: "Nordic 15kg", color: null, isometric: false },
      { name: "Pistol squat", color: null, isometric: false },
      { name: "Pistol R", color: null, isometric: false },
      { name: "Pistol L", color: null, isometric: false }
    ],
    "Skill": [
      { name: "Tucked lever", color: "#8ec9ac", isometric: true, unilateral: true },
      { name: "Tucked planche", color: "#9db8e8", isometric: true },
      { name: "Full extend", color: null, isometric: false }
    ]
  };
  const Shared = window.WorkoutShared; // helpers shared with the graph page (workout-shared.js)
  const COLOR_PALETTE = Shared.COLOR_PALETTE;
  const EX_COLOR_PALETTE = ["#4B0F45", "#FFEEE4", "#E1D571", "#E4599C", "#FE9214", "#6FE3CC", "#185D7A", "#C8DB2A", "#EF4687", "#F8CF9B"];
  const PER_LEG_EXERCISES = ["tucked lever"];
  const MIN_SETS = 1;
  const MAX_SETS = 20;
  const DEFAULT_NUM_SETS = 1; // every exercise starts with one set; Add set / Remove set only change the current screen

  const DATA_KEY = "workout-log-data-v1";
  const LISTS_KEY = "workout-log-lists-v3";
  const LAYOUT_KEY = "workout-log-layout-v1";
  const NUMSETS_KEY = "workout-log-numsets-v1"; // no longer used; kept so Reset still clears an old saved value
  const THEME_KEY = "workout-log-theme-v1";
  // older keys this page can recover data from, so nothing gets lost switching versions
  const LEGACY_LISTS_KEYS = ["workout-log-lists-v2", "workout-log-lists-v1"];

  const THEMES = Shared.THEMES; // the colour themes live in workout-shared.js so the graph page matches

  // Generic localStorage helpers - shared by numSets/theme/layout/lists, all of
  // which just need "read an int/JSON value, falling back safely if absent or bad".
  function lsSet(key, value) { try { localStorage.setItem(key, String(value)); } catch (e) { /* ignore */ } }
  function lsInt(key, isValid, fallback) {
    try {
      const n = parseInt(localStorage.getItem(key), 10);
      if (!isNaN(n) && isValid(n)) return n;
    } catch (e) { /* ignore */ }
    return fallback;
  }
  function loadNumSets() { return DEFAULT_NUM_SETS; }
  function loadTheme() { return lsInt(THEME_KEY, idx => !!THEMES[idx], 0); }
  function applyTheme(idx) { Shared.applyTheme(idx, themeMode); }
  function saveTheme(idx) { lsSet(THEME_KEY, idx); }

  // ---- Light / dark appearance mode (independent of the accent colour theme above) ----
  const MODE_KEY = "workout-log-mode-v1";
  const UNITS_KEY = Shared.UNITS_KEY;
  function loadUnits() { return Shared.loadUnits(); }
  function saveUnits(units) { lsSet(UNITS_KEY, units); }
  let unitSystem = loadUnits();
  let weekStart = Shared.loadWeekStart();
  const { KM_TO_MI, KG_TO_LB, M_TO_FT } = Shared;
  // These convert the distance-mode fields (km/rucking kg/elevation) and the per-set "Weighted" label —
  // the underlying stored kg value itself is not converted, only the displayed unit text.
  function distanceUnitLabel() { return Shared.distanceUnitLabel(unitSystem); }
  function weightUnitLabel() { return Shared.weightUnitLabel(unitSystem); }
  function elevationUnitLabel() { return Shared.elevationUnitLabel(unitSystem); }
  function kmToDisplay(km) { return Shared.kmToDisplay(unitSystem, km); }
  function displayToKm(v) { return unitSystem === 'imperial' ? v / KM_TO_MI : v; }
  function kgToDisplay(kg) { return Shared.kgToDisplay(unitSystem, kg); }
  function displayToKg(v) { return unitSystem === 'imperial' ? v / KG_TO_LB : v; }
  function round2(n) { return Shared.round2(n); }
  // set weights are stored in kg; the weight field is typed in the unit chosen in settings
  function kgFromInput(v) { return Math.round(displayToKg(Number(v)) * 1000) / 1000; }
  function mToDisplay(m) { return Shared.mToDisplay(unitSystem, m); }
  function displayToM(v) { return unitSystem === 'imperial' ? v / M_TO_FT : v; }
  // Accepts "2:50", "2.50" (hours + literal minutes, not a decimal fraction) or a plain
  // number of minutes ("45"), and returns the total in minutes.
  function parseTimeInput(str) {
    if (str == null) return null;
    const s = String(str).trim();
    if (s === '') return null;
    const m = s.match(/^(\d+)[:.](\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const n = Number(s);
    return isNaN(n) ? null : Math.round(n);
  }
  function formatDuration(totalMinutes) { return Shared.formatDuration(totalMinutes); }
  // Same total, formatted back into the "H:MM" shape the time input accepts, for prefilling edit prompts.
  function timeMinutesToInputString(totalMinutes) {
    if (totalMinutes == null || isNaN(totalMinutes)) return '';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : String(m);
  }
  // Pace as minutes-per-distance-unit -> "M:SS" (e.g. a 5:30/km pace).
  function formatPace(minutesPerUnit) { return Shared.formatPace(minutesPerUnit); }
  // Distance entries only: minutes per km/mi, derived from the logged time and distance.
  function paceForEntry(entry) { return Shared.paceForEntry(unitSystem, entry); }
  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function loadMode() {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) { /* ignore */ }
    return systemPrefersDark() ? 'dark' : 'light';
  }
  function applyMode(mode) { document.documentElement.setAttribute('data-theme', mode); }
  function saveMode(mode) { lsSet(MODE_KEY, mode); }
  function renderModeToggle() {
    document.querySelectorAll('#modeToggle .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === themeMode);
    });
  }
  document.querySelectorAll('#modeToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      themeMode = btn.dataset.mode;
      applyMode(themeMode);
      saveMode(themeMode);
      renderModeToggle();
      applyTheme(themeIndex);
    };
  });
  function renderUnitsToggle() {
    document.querySelectorAll('#unitsToggle .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.units === unitSystem);
    });
  }
  document.querySelectorAll('#unitsToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      unitSystem = btn.dataset.units;
      saveUnits(unitSystem);
      lsSet('workout-log-prefs-ts-v1', Date.now());
      renderUnitsToggle();
      renderModifiers();
      renderBodyweightList(); // weigh-in list + its input placeholder show the unit
    };
  });
  renderUnitsToggle();
  function renderWeekToggle() { document.querySelectorAll('#weekToggle .mode-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.week === weekStart)); }
  document.querySelectorAll('#weekToggle .mode-btn').forEach(btn => {
    btn.onclick = () => {
      weekStart = +btn.dataset.week;
      lsSet(Shared.WEEK_KEY, weekStart);
      lsSet('workout-log-prefs-ts-v1', Date.now());
      renderWeekToggle();
      expandedWeeks = new Set(); weeksNeedDefaultExpand = true;
      renderCalendar(); renderEntries();
    };
  });
  renderWeekToggle();
  (function setupFlagsToggle() {
    const KEY = 'workout-log-setflags-v1', box = document.getElementById('setFlagsToggle');
    let on = false;
    try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* off */ }
    document.documentElement.classList.toggle('flags-on', on);
    if (!box) return;
    box.checked = on;
    box.onchange = () => { document.documentElement.classList.toggle('flags-on', box.checked); lsSet(KEY, box.checked ? '1' : '0'); };
  })();
  let showLast = true;
  try { showLast = localStorage.getItem('workout-log-showlast-v1') !== '0'; } catch (e) { /* on */ }
  function resetEccPlaceholders() { document.querySelectorAll('#setsGrid input.ecc-input').forEach(i => { i.placeholder = 'sec'; }); }
  (function () {
    const box = document.getElementById('showLastToggle');
    if (!box) return;
    box.checked = showLast;
    box.onchange = () => { showLast = box.checked; lsSet('workout-log-showlast-v1', showLast ? '1' : '0'); resetEccPlaceholders(); renderModifiers(); };
  })();
  let themeMode = loadMode();
  let numSets = loadNumSets();
  let themeIndex = loadTheme();

  const DEFAULT_LAYOUT = [
    { id: "exercise", visible: true },
    { id: "metrics", visible: true },
    { id: "notes", visible: true },
    { id: "addButton", visible: true },
    { id: "calendar", visible: true },
    { id: "entries", visible: true }
  ];
  const MODULE_LABELS = {
    exercise: "Exercise", metrics: "Sets & reps",
    notes: "Notes", addButton: "Add entry button", calendar: "Calendar",
    entries: "Entries list"
  };

  function normalizeExercise(e) {
    if (typeof e === "string") return { name: e, color: null, isometric: false, unilateral: false };
    return Object.assign({}, e, {
      name: e.name || "", color: e.color || null,
      isometric: !!e.isometric,
      unilateral: e.unilateral !== undefined ? !!e.unilateral : PER_LEG_EXERCISES.includes((e.name || '').trim().toLowerCase())
    });
  }
  function migrateList(arr) { return (arr || []).map(normalizeExercise); }

  function loadLists() {
    // try current format first, then fall back through older formats so
    // nothing you already saved gets lost.
    const keysToTry = [LISTS_KEY, ...LEGACY_LISTS_KEYS];
    for (const key of keysToTry) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.categories && parsed.exercises) {
          const categories = parsed.categories.filter(c => c !== LEGACY_MAIN_CATEGORY);
          const exerciseLists = {};
          categories.forEach(c => {
            exerciseLists[c] = migrateList(parsed.exercises[c]);
          });
          const categoryColors = parsed.colors || {};
          return { categories, exerciseLists, categoryColors };
        }
      } catch (e) { /* try next key */ }
    }
    const categories = Object.keys(DEFAULT_EXERCISE_LISTS);
    const exerciseLists = {};
    categories.forEach(c => { exerciseLists[c] = migrateList(DEFAULT_EXERCISE_LISTS[c]); });
    return { categories, exerciseLists, categoryColors: {} };
  }

  function saveLists() {
    lsSet(LISTS_KEY, JSON.stringify({ categories, exercises: exerciseLists, colors: categoryColors }));
  }

  let { categories, exerciseLists, categoryColors } = loadLists();
  let active = categories[0];

  // ---- Blocks: named groupings (e.g. "Day A") that can pull exercises from
  // any category. Unlike Main workout (a single fixed aggregator), you can
  // have any number of blocks. A block owns no exercises itself, only
  // { name, refCategory } pointers, resolved the same way Main workout's are.
  const BLOCKS_KEY = "workout-log-blocks-v1";
  function loadBlocks() {
    try {
      const raw = localStorage.getItem(BLOCKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.blocks) && parsed.blockRefs) {
          return { blocks: parsed.blocks, blockRefs: parsed.blockRefs, hiddenBlocks: Array.isArray(parsed.hiddenBlocks) ? parsed.hiddenBlocks : [], planBlocks: Array.isArray(parsed.planBlocks) ? parsed.planBlocks : [] };
        }
      }
    } catch (e) { /* ignore */ }
    return { blocks: [], blockRefs: {}, hiddenBlocks: [], planBlocks: [] };
  }
  function saveBlocks() { lsSet(BLOCKS_KEY, JSON.stringify({ blocks, blockRefs, hiddenBlocks, planBlocks })); }
  // planBlocks: the blocks created by starting a plan from My program (shown under "Plans" in the block picker)
  let { blocks, blockRefs, hiddenBlocks, planBlocks } = loadBlocks();
  // plan progress: which plan day each plan block is, and the sessions logged per plan (for "Week 2 of 6, Day B")
  const PLANMETA_KEY = 'workout-log-planmeta-v1', PLANPROG_KEY = 'workout-log-planprogress-v1';
  function loadObj(key) { try { const o = JSON.parse(localStorage.getItem(key)); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch (e) { /* none yet */ } return {}; }
  let planMeta = loadObj(PLANMETA_KEY), planProgress = loadObj(PLANPROG_KEY);
  function savePlanMeta() { lsSet(PLANMETA_KEY, JSON.stringify(planMeta)); }
  function savePlanProgress() { lsSet(PLANPROG_KEY, JSON.stringify(planProgress)); }
  // exercises removed on this device (merged away or deleted), so sync does not bring them back; keyed by lower-case name
  const REMOVEDEX_KEY = 'workout-log-removedex-v1';
  let removedExercises = loadObj(REMOVEDEX_KEY);
  function saveRemovedEx() { lsSet(REMOVEDEX_KEY, JSON.stringify(removedExercises)); }
  function markExerciseRemoved(name) { if (!name) return; removedExercises[String(name).toLowerCase()] = Date.now(); saveRemovedEx(); }
  // true when the exercise is older than its removal (an exercise created again afterwards is kept)
  function exRemovedAfter(ex) { const ts = removedExercises[String((ex && ex.name) || '').toLowerCase()]; return !!ts && (ex.createdAt || 0) < ts; }
  let activeBlock = null; // name of the block currently filtering the exercise grid, or null for "no block"
  let bulkQuiet = false; // true while several items are deleted at once (one confirmation for the lot)

  // ---- Equipment: a small user-editable tag list (bar/rings/parallettes/...) attachable to any logged entry ----
  const EQUIPMENT_KEY = "workout-log-equipment-v1";
  const DEFAULT_EQUIPMENT = ["Bar", "Rings", "Parallettes", "Floor", "Wall"];
  function loadEquipment() {
    try {
      const raw = localStorage.getItem(EQUIPMENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.equipment)) {
          return { equipmentList: parsed.equipment, equipmentColors: parsed.colors || {} };
        }
      }
    } catch (e) { /* ignore */ }
    return { equipmentList: DEFAULT_EQUIPMENT.slice(), equipmentColors: {} };
  }
  function saveEquipment() { lsSet(EQUIPMENT_KEY, JSON.stringify({ equipment: equipmentList, colors: equipmentColors })); }
  let { equipmentList, equipmentColors } = loadEquipment();
  function getEquipmentColor(name) {
    if (!equipmentColors[name]) {
      const used = Object.keys(equipmentColors).length;
      equipmentColors[name] = COLOR_PALETTE[used % COLOR_PALETTE.length];
      saveEquipment();
    }
    return equipmentColors[name];
  }

  // ---- Bodyweight log: dated weigh-ins, stored in kg. The graph page reads this
  // to work out strength relative to bodyweight and to plot it against strength. ----
  const BODYWEIGHT_KEY = "workout-log-bodyweight-v1";
  function loadBodyweight() {
    try {
      const raw = localStorage.getItem(BODYWEIGHT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number(e.kg) > 0);
      }
    } catch (e) { /* ignore */ }
    return [];
  }
  function saveBodyweight() { lsSet(BODYWEIGHT_KEY, JSON.stringify(bodyweightLog)); }
  let bodyweightLog = loadBodyweight();

  // ---- Skill progressions: ordered checklists per skill. Stored as
  // [{ id, name, steps: [{ id, name, exercise|null, metric: 'hold'|'reps', target, sets, doneDate|null }] }] ----
  const SKILLS_KEY = "workout-log-skills-v1";
  function newSkillId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cleanSkillStep(st) {
    if (!st || typeof st.name !== 'string' || !st.name.trim()) return null;
    const metric = st.metric === 'reps' ? 'reps' : 'hold';
    const target = Number(st.target);
    const sets = Math.round(Number(st.sets));
    return {
      id: (typeof st.id === 'string' && st.id) ? st.id : newSkillId(),
      name: st.name.trim(),
      exercise: (typeof st.exercise === 'string' && st.exercise) ? st.exercise : null,
      variation: (typeof st.variation === 'string' && st.variation) ? st.variation : null,
      metric,
      target: target > 0 ? target : (metric === 'hold' ? 20 : 5),
      sets: sets >= 1 ? Math.min(sets, 20) : 3,
      doneDate: (typeof st.doneDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(st.doneDate)) ? st.doneDate : null
    };
  }
  function cleanSkillLine(l) {
    if (!l || typeof l.name !== 'string' || !l.name.trim()) return null;
    return {
      id: (typeof l.id === 'string' && l.id) ? l.id : newSkillId(),
      name: l.name.trim(),
      steps: (Array.isArray(l.steps) ? l.steps : []).map(cleanSkillStep).filter(Boolean)
    };
  }
  function loadSkills() {
    try {
      const raw = localStorage.getItem(SKILLS_KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.map(cleanSkillLine).filter(Boolean); }
    } catch (e) { /* ignore */ }
    return [];
  }
  function saveSkills() { lsSet(SKILLS_KEY, JSON.stringify(skillLines)); }
  let skillLines = loadSkills();

  let selectedExercise = "";
  let sortMode = "ascending";
  let calViewDate = new Date();
  let selectedCalDate = null;
  let expandedWeeks = new Set();
  let lastEntriesMonthKey = null;
  let weeksNeedDefaultExpand = true;
  let data = {};
  categories.forEach(c => data[c] = []);
  let layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));

  function findExerciseOwner(name) {
    for (const cat of categories) {
      const found = (exerciseLists[cat] || []).find(e => e.name === name);
      if (found) return { category: cat, exObj: found };
    }
    return null;
  }
  function resolveRefs(refs) {
    const resolved = [];
    (refs || []).forEach(ref => {
      let cat = ref.refCategory;
      let exObj = (exerciseLists[cat] || []).find(e => e.name === ref.name);
      if (!exObj) {
        // the exercise was moved to another category since the block was made: find it by name instead of dropping it
        cat = Object.keys(exerciseLists).find(c => (exerciseLists[c] || []).some(e => e.name === ref.name)) || null;
        if (cat) exObj = exerciseLists[cat].find(e => e.name === ref.name);
      }
      if (exObj && !resolved.some(r => r.exObj === exObj)) resolved.push({ exObj, originCategory: cat });
    });
    return resolved;
  }
  // For the active tab, returns [{ exObj, originCategory }]. When a block is
  // active it owns no exercises itself — it holds lightweight references
  // ({ name, refCategory }) resolved against their real home category.
  // Otherwise the active category tab just lists its own exercises.
  function getDisplayExerciseList() {
    if (activeBlock) return resolveRefs(blockRefs[activeBlock]);
    return (exerciseLists[active] || []).map(exObj => ({ exObj, originCategory: active }));
  }

  const catEditList = document.getElementById('catEditList');
  const newCatInput = document.getElementById('newCatInput');

  const exerciseGrid = document.getElementById('exerciseGrid');
  const exerciseText = document.getElementById('exerciseText');
  let lastExerciseTextValue = '';
  exerciseText.addEventListener('focus', () => { lastExerciseTextValue = exerciseText.value; });
  exerciseText.addEventListener('change', () => {
    const newVal = exerciseText.value;
    if (newVal !== lastExerciseTextValue) switchExerciseInputs(lastExerciseTextValue, newVal);
    lastExerciseTextValue = newVal;
  });
  const exEditBtn = document.getElementById('editExBtn');
  const exEditPanel = document.getElementById('exEditPanel');
  const exEditList = document.getElementById('exEditList');
  const newExInput = document.getElementById('newExInput');
  const newExColor = document.getElementById('newExColor');
  const newExIsoBtn = document.getElementById('newExIsoBtn');
  const newExUniBtn = document.getElementById('newExUniBtn');
  const sortToggleBtn = document.getElementById('sortToggleBtn');

  const modifiersRow = document.getElementById('modifiersRow');
  const setsGrid = document.getElementById('setsGrid');
  const attemptsGrid = document.getElementById('attemptsGrid');
  const distanceRow = document.getElementById('distanceRow');
  const distanceInput = document.getElementById('distanceInput');
  const metricsLabel = document.getElementById('metricsLabel');
  const entriesEl = document.getElementById('entries');
  const dateInput = document.getElementById('dateInput');
  const headerDateBtn = document.getElementById('headerDateBtn');
  const notesInput = document.getElementById('notesInput');
  const errEl = document.getElementById('err');
  const toastEl = document.getElementById('toast');
  const calTitle = document.getElementById('calTitle');
  const calGrid = document.getElementById('calGrid');

  dateInput.valueAsDate = new Date();

  function updateHeaderDateDisplay() {
    if (!dateInput.value) { headerDateBtn.textContent = ''; return; }
    const d = new Date(dateInput.value + 'T00:00:00');
    if (isNaN(d.getTime())) { headerDateBtn.textContent = ''; return; }
    const month = d.toLocaleDateString(undefined, { month: 'short' });
    const day = String(d.getDate()).padStart(2, '0');
    headerDateBtn.innerHTML = `<i class="fa-solid fa-calendar-day" aria-hidden="true"></i> ${month} ${day}`;
    dateInput.style.width = headerDateBtn.offsetWidth + 'px';
  }
  headerDateBtn.onclick = () => {
    if (dateInput.showPicker) {
      try { dateInput.showPicker(); } catch (e) { dateInput.focus(); }
    } else {
      dateInput.focus();
    }
  };
  dateInput.addEventListener('change', updateHeaderDateDisplay);
  dateInput.addEventListener('change', () => { if (activeBlock) updateExercisePicker(); });

  // ---- Superset (group several exercises logged back-to-back) ----
  let activeSuperset = null; // { id, date, count } or null when not actively grouping
  // Exercises picked for the running superset (shown accented). Adding more than one records all of them at once.
  let supersetMembers = new Set();
  function supersetMemberNames() {
    return activeSuperset ? sortedExerciseList().map(p => p.exObj.name).filter(n => supersetMembers.has(n)) : [];
  }
  function updateSupersetUI() {
    if (!activeSuperset) supersetMembers.clear();
    const btn = document.getElementById('supersetToggleBtn');
    if (activeSuperset) {
      btn.classList.add('on');
      const picked = supersetMembers.size;
      btn.innerHTML = `<i class="fa-solid fa-link-slash" aria-hidden="true"></i> <span class="pill-full">${picked ? picked + ' selected · ' : ''}${activeSuperset.count} logged · End</span><span class="pill-short">End${picked ? ' (' + picked + ')' : ''}</span>`;
      btn.title = 'Tap to end superset. Tap exercises to add or remove them; Add logs every selected exercise that has values.';
    } else {
      btn.classList.remove('on');
      btn.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i> Superset';
      btn.title = 'Superset: group exercises logged together';
    }
    btn.setAttribute('aria-label', btn.title);
  }
  document.getElementById('supersetToggleBtn').onclick = () => {
    activeSuperset = activeSuperset
      ? null
      : { id: 'ss' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: dateInput.value, count: 0 };
    supersetMembers.clear();
    if (activeSuperset && selectedExercise) supersetMembers.add(selectedExercise); // the exercise you're on joins first
    updateSupersetUI();
    updateExercisePicker();
  };
  // switching the day mid-superset almost always means you meant to stop grouping
  dateInput.addEventListener('change', () => {
    if (activeSuperset && dateInput.value !== activeSuperset.date) {
      activeSuperset = null;
      updateSupersetUI();
      updateExercisePicker();
    }
  });
  updateHeaderDateDisplay();

  let exEditMode = false;
  let newExIsometric = false;
  let newExUnilateral = false;

  const DISTANCE_CATEGORY_PATTERN = Shared.DISTANCE_CATEGORY_PATTERN;
  function isDistanceCategoryName(cat) { return Shared.isDistanceCategoryName(cat); }
  // Resolves which real category an exercise lives in, regardless of what's
  // currently active (search results and blocks can point at any category).
  function exerciseCategoryFor(name) {
    for (const cat of categories) {
      if ((exerciseLists[cat] || []).some(e => e.name === name)) return cat;
    }
    return active;
  }
  function isDistanceExercise(name) {
    // Recognize by the exercise's own name too (e.g. "Running" or "Walking" filed
    // under a non-distance category like "Legs"), not just by category name.
    return isDistanceCategoryName(exerciseCategoryFor(name)) || DISTANCE_CATEGORY_PATTERN.test(name || '');
  }
  function findActiveExerciseObj(name) {
    if (activeBlock) {
      const owner = findExerciseOwner(name);
      return owner ? owner.exObj : null;
    }
    return (exerciseLists[active] || []).find(e => e.name === name) || null;
  }
  function isIsometricExercise(name) {
    const obj = findActiveExerciseObj(name);
    if (obj) return !!obj.isometric;
    return false;
  }
  // Weighted can go negative to represent band/machine assistance (e.g. -15kg),
  // on the same continuum as added weight (e.g. +10kg), for the same exercise.
  function formatLoadKg(kg) {
    if (kg === null || kg === undefined || kg === '' || Number(kg) === 0) return '';
    const n = round2(kgToDisplay(Number(kg)));
    return (n > 0 ? '+' : 'banded ') + n + weightUnitLabel();
  }
  // Load metrics for one set that has added weight: volume = kg x reps, and an estimated 1RM
  // (shared formula, see workout-shared.js: Epley on bodyweight + added load, trusted for 1-12 reps).
  // Added weight only; assistance (negative) loads and plain bodyweight sets return null.
  // bwKg is your bodyweight on the day of the set (0 when no weigh-in is logged yet).
  function setLoadMetrics(s, bwKg) {
    if (!s || typeof s !== 'object' || s.formBroke || s.kg == null || s.kg === '') return null;
    const kg = Number(s.kg), reps = Shared.setReps(s);
    if (isNaN(kg) || kg <= 0 || !(reps > 0)) return null;
    return { volume: kg * reps, e1rm: Shared.est1rmAdded(bwKg || 0, kg, reps) };
  }
  function sortedBodyweightLog() { return bodyweightLog.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))); }
  function bodyweightKgOnDate(sorted, date) { const b = Shared.bodyweightKgOn(sorted, date); return b ? b.kg : 0; }
  // Scans every logged entry for this exercise and returns the best-ever value along
  // each dimension that applies to it: isometric hold, reps, added weight (heaviest,
  // negative/assistance loads never count as a PR here), and — for distance exercises —
  // longest distance, longest time, most elevation, and fastest pace (lower is better).
  // varKey: undefined = count every set; otherwise only sets with that variation ('' = no variation).
  function entryKey(e) { return String(e.date || '') + '|' + String(e.id || '').padStart(20, '0'); }
  function computeExerciseBests(name, varKey, cutoffKey) {
    const bwSorted = sortedBodyweightLog();
    let bestHold = null, bestReps = null, bestWeight = null, bestE1RM = null, bestSetVolume = null;
    let bestDistance = null, bestTime = null, bestElevation = null, bestPaceMinPerKm = null;
    categories.forEach(cat => {
      (data[cat] || []).forEach(e => {
        if (e.exercise !== name) return;
        if (cutoffKey && entryKey(e) >= cutoffKey) return; // only what came before this entry
        if (e.distance != null && varKey !== undefined && (e.variation || '') !== varKey) return; // runs: bests per variation
        if (e.distance != null && e.distance > 0 && (bestDistance === null || e.distance > bestDistance)) bestDistance = e.distance;
        if (e.timeMinutes != null && e.timeMinutes > 0 && (bestTime === null || e.timeMinutes > bestTime)) bestTime = e.timeMinutes;
        if (e.elevation != null && e.elevation > 0 && (bestElevation === null || e.elevation > bestElevation)) bestElevation = e.elevation;
        if (e.distance != null && e.distance > 0 && e.timeMinutes != null && e.timeMinutes > 0) {
          const pace = e.timeMinutes / e.distance; // minutes per km, unaffected by display-unit setting
          if (bestPaceMinPerKm === null || pace < bestPaceMinPerKm) bestPaceMinPerKm = pace;
        }
        (e.sets || []).filter(s => varKey === undefined || setVar(s) === varKey).forEach(s => {
          if (e.isometric) {
            const hold = Shared.cleanReps(s);
            if (hold > 0 && (bestHold === null || hold > bestHold)) bestHold = hold;
          } else {
            const reps = Shared.cleanReps(s);
            if (reps > 0 && (bestReps === null || reps > bestReps)) bestReps = reps;
          }
          if (s && typeof s === 'object' && s.kg != null && s.kg !== '') {
            const kg = Number(s.kg);
            if (!isNaN(kg) && kg > 0 && (bestWeight === null || kg > bestWeight)) bestWeight = kg;
          }
          if (!e.isometric) {
            const load = setLoadMetrics(s, bodyweightKgOnDate(bwSorted, e.date));
            if (load) {
              if (bestSetVolume === null || load.volume > bestSetVolume) bestSetVolume = load.volume;
              if (load.e1rm !== null && (bestE1RM === null || load.e1rm > bestE1RM)) bestE1RM = load.e1rm;
            }
          }
        });
        if (e.isometric && (varKey === undefined || varKey === '')) {
          (e.attempts || []).forEach(a => {
            const v = Number(a);
            if (!isNaN(v) && v > 0 && (bestHold === null || v > bestHold)) bestHold = v;
          });
        }
      });
    });
    return { bestHold, bestReps, bestWeight, bestE1RM, bestSetVolume, bestDistance, bestTime, bestElevation, bestPaceMinPerKm };
  }
  function isUnilateralExercise(name) {
    const obj = findActiveExerciseObj(name);
    if (obj) return !!obj.unilateral;
    // legacy fallback for free-text categories with no stored exercise object
    return PER_LEG_EXERCISES.includes((name || '').trim().toLowerCase());
  }
  function hasLeverageTag(name) {
    const obj = findActiveExerciseObj(name);
    return !!(obj && obj.hasLeverage);
  }
  let lastToastMs = 2000, toastTimer = null;
  function showToast(msg) {
    lastToastMs = Math.min(5000, Math.max(2000, String(msg).length * 40));
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), lastToastMs);
  }
  function getCategoryColor(cat) {
    if (!categoryColors[cat]) {
      const used = Object.keys(categoryColors).length;
      categoryColors[cat] = COLOR_PALETTE[used % COLOR_PALETTE.length];
      saveLists();
    }
    return categoryColors[cat];
  }
  function ensureExerciseColor(cat, exObj) {
    if (exObj.color) return exObj.color;
    const list = exerciseLists[cat] || [];
    const colored = list.filter(e => e.color).length;
    exObj.color = EX_COLOR_PALETTE[colored % EX_COLOR_PALETTE.length];
    return exObj.color;
  }

  // ---- build the set inputs (reps/hold seconds + eccentric seconds + kg add-on, cascading fill) ----
  // Every set stays visible, each prefixed with its (numeric) set number.
  // "Add set" grows numSets (up to MAX_SETS) and appends the new one below the rest.
  let eccEdited = [];
  let equipEdited = [];
  let varEdited = [];
  let kgEdited = [];
  let setsScrollOffset = 0;
  const SETS_WINDOW = 4;
  // Unilateral sets (reps or holds): a value typed for one side is copied to the other side until that
  // other side is changed by hand. Works whichever side you fill first.
  function wireSideMirror(a, b) {
    [[a, b], [b, a]].forEach(([src, dst]) => {
      src.addEventListener('focus', () => { src.dataset.last = src.value; });
      src.addEventListener('input', () => {
        const before = src.dataset.last === undefined ? '' : src.dataset.last;
        if (dst.value === '' || (dst.dataset.mirrored === '1' && dst.value === before)) {
          dst.value = src.value;
          dst.dataset.mirrored = '1';
        }
        src.dataset.mirrored = ''; // typed by hand, so it no longer follows the other side
        src.dataset.last = src.value;
      });
    });
  }
  function buildSetsGrid() {
    // Preserve anything already typed before rebuilding.
    const prev = {};
    setsGrid.querySelectorAll('input, select').forEach(inp => { prev[inp.id] = inp.value; });
    setsGrid.innerHTML = '';
    eccEdited = new Array(numSets + 1).fill(false);
    kgEdited = new Array(numSets + 1).fill(false);
    equipEdited = new Array(numSets + 1).fill(false);
    varEdited = new Array(numSets + 1).fill(false);
    for (let i = 1; i <= numSets; i++) {
      const col = document.createElement('div');
      col.className = 'set-col';
      col.innerHTML = `
        <div class="set-num" aria-hidden="true">${i}</div>
        <div class="set-body">${i > 1 ? `<div class="chain-between"><button type="button" class="chain-pill" id="chainBtn${i}" aria-pressed="false" title="Count this set as one continuous rep with the previous set"><i class="fa-solid fa-link" aria-hidden="true"></i> Chained to previous</button><input type="hidden" id="chain${i}" /></div>` : ''}<div class="set-row"><div class="set-field set-field-reps">
          <label for="set${i}">Reps</label>
          <input type="number" min="1" id="set${i}" placeholder="reps" />
          <div class="lr-row hidden" id="lr${i}">
            <input type="number" min="1" id="left${i}" placeholder="L" />
            <input type="number" min="1" id="right${i}" placeholder="R" />
          </div>
        </div>
        <div class="set-field ecc-field">
          <label for="ecc${i}">Eccentric</label>
          <input type="number" min="0" id="ecc${i}" placeholder="sec" class="ecc-input" />
        </div>
        <div class="set-field">
          <label for="kg${i}">Weight ±</label>
          <input type="number" step="0.5" id="kg${i}" placeholder="±${weightUnitLabel()}" class="kg-input" />
        </div>
        <div class="set-field angle-field hidden">
          <label for="angle${i}">Angle/leverage</label>
          <input type="text" id="angle${i}" placeholder="e.g. 15° or tuck" class="angle-input" />
        </div>
        </div><div class="set-row set-row-sub">
        <div class="set-field variation-field hidden">
          <select id="var${i}" class="equip-select var-select" required aria-label="Variation for set ${i}"></select>
        </div>
        <div class="set-field equip-field">
          <select id="equip${i}" class="equip-select" required aria-label="Equipment for set ${i}"></select>
        </div></div><div class="set-row set-row-flags">
          <div class="set-field"><select id="rpe${i}" class="equip-select" required aria-label="RPE for set ${i}"><option value="">RPE</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option></select></div>
          <div class="set-field"><select id="flag${i}" class="equip-select" required aria-label="Flag for set ${i}"><option value="">Flag</option><option value="broke">Form broke</option><option value="pain">Pain</option><option value="both">Pain + form broke</option></select></div>
        </div></div>`;
      setsGrid.appendChild(col);
      // a set that didn't exist before (Add set) starts with the previous set's equipment
      const equipStart = prev['equip' + i] !== undefined ? prev['equip' + i] : (i > 1 ? document.getElementById('equip' + (i - 1)).value : '');
      fillEquipSelect(document.getElementById('equip' + i), equipStart);
      // same for the variation: a new set starts with the previous set's variation
      const varStart = prev['var' + i] !== undefined ? prev['var' + i] : (i > 1 ? document.getElementById('var' + (i - 1)).value : '');
      fillVarSelect(document.getElementById('var' + i), varStart);
      document.getElementById('set' + i).value = prev['set' + i] || '';
      document.getElementById('left' + i).value = prev['left' + i] || '';
      document.getElementById('right' + i).value = prev['right' + i] || '';
      document.getElementById('ecc' + i).value = prev['ecc' + i] || '';
      document.getElementById('kg' + i).value = prev['kg' + i] || '';
      document.getElementById('angle' + i).value = prev['angle' + i] || '';
      document.getElementById('rpe' + i).value = prev['rpe' + i] || '';
      document.getElementById('flag' + i).value = prev['flag' + i] || '';
      { const ch = document.getElementById('chain' + i); if (ch) ch.value = prev['chain' + i] || ''; }
    }
    for (let i = 1; i <= numSets; i++) {
      document.getElementById('ecc' + i).addEventListener('input', () => onEccInput(i));
      document.getElementById('kg' + i).addEventListener('input', () => onKgInput(i));
      document.getElementById('equip' + i).addEventListener('change', () => onEquipInput(i));
      document.getElementById('var' + i).addEventListener('change', () => onVarInput(i));
      wireSideMirror(document.getElementById('left' + i), document.getElementById('right' + i));
    }
    syncChainPills();
    updateMetricsSection(currentExerciseName());
    renderAddSetBtn();
    applySetsScrollWindow();
  }
  // the "Chained to previous" pill above sets 2 and up; its state lives in a hidden field so drafts, clearing and removing sets keep working
  function syncChainPills() {
    for (let i = 2; i <= numSets; i++) {
      const v = document.getElementById('chain' + i), b = document.getElementById('chainBtn' + i);
      if (!v || !b) continue;
      const on = v.value === '1';
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    }
  }
  setsGrid.addEventListener('click', (e) => {
    const b = e.target.closest('.chain-pill'); if (!b) return;
    const v = document.getElementById('chain' + b.id.replace('chainBtn', ''));
    if (v) { v.value = v.value === '1' ? '' : '1'; syncChainPills(); }
  });
  function applySetsScrollWindow() {
    const maxOffset = Math.max(0, numSets - SETS_WINDOW);
    if (setsScrollOffset > maxOffset) setsScrollOffset = maxOffset;
    if (setsScrollOffset < 0) setsScrollOffset = 0;
    Array.from(setsGrid.children).forEach((col, idx) => {
      col.classList.toggle('hidden', idx < setsScrollOffset || idx >= setsScrollOffset + SETS_WINDOW);
    });
    const firstShown = Array.from(setsGrid.children).find(c => !c.classList.contains('hidden'));
    Array.from(setsGrid.children).forEach(c => c.classList.toggle('first-visible', c === firstShown)); // field labels only above the first visible set
    const upBtn = document.getElementById('setsScrollUpBtn');
    const downBtn = document.getElementById('setsScrollDownBtn');
    const scrollable = numSets > SETS_WINDOW;
    upBtn.classList.toggle('hidden', !scrollable);
    downBtn.classList.toggle('hidden', !scrollable);
    upBtn.disabled = setsScrollOffset <= 0;
    downBtn.disabled = setsScrollOffset >= maxOffset;
  }
  document.getElementById('setsScrollUpBtn').onclick = () => {
    setsScrollOffset = Math.max(0, setsScrollOffset - 1);
    applySetsScrollWindow();
  };
  document.getElementById('setsScrollDownBtn').onclick = () => {
    setsScrollOffset = Math.min(Math.max(0, numSets - SETS_WINDOW), setsScrollOffset + 1);
    applySetsScrollWindow();
  };
  function renderAddSetBtn() {
    const addSetBtn = document.getElementById('addSetBtn');
    const removeSetBtn = document.getElementById('removeSetBtn');
    const atMax = numSets >= MAX_SETS;
    const atMin = numSets <= MIN_SETS;
    addSetBtn.disabled = atMax;
    addSetBtn.classList.toggle('hidden', atMax);
    removeSetBtn.disabled = atMin;
  }
  function removeSet(idx) {
    if (numSets <= MIN_SETS) return;
    // Shift every later set's values up into this one, then drop the last slot.
    for (let j = idx; j < numSets; j++) {
      ['set', 'left', 'right', 'ecc', 'kg', 'angle', 'equip', 'var', 'rpe', 'flag', 'chain'].forEach(prefix => {
        const from = document.getElementById(prefix + (j + 1));
        const to = document.getElementById(prefix + j);
        if (from && to) to.value = from.value;
      });
    }
    numSets--;
    resetEccCascade();
    resetKgCascade();
    resetEquipCascade();
    buildSetsGrid();
  }

  // ---- Attempts (quick hold tries for isometric skills — a separate, lighter log than a working set) ----
  let holdMode = 'sets'; // 'sets' | 'attempts' — only meaningful for isometric exercises
  const DEFAULT_NUM_ATTEMPTS = 3;
  let numAttempts = DEFAULT_NUM_ATTEMPTS;
  let attemptsScrollOffset = 0;
  function buildAttemptsGrid() {
    const prev = {};
    attemptsGrid.querySelectorAll('input[type="number"]').forEach(inp => { prev[inp.id] = inp.value; });
    attemptsGrid.innerHTML = '';
    for (let i = 1; i <= numAttempts; i++) {
      const col = document.createElement('div');
      col.className = 'set-col';
      col.innerHTML = `
        <div class="set-num" aria-hidden="true">${i}</div>
        <div class="set-field">
          <label for="attempt${i}">Attempt</label>
          <input type="number" min="0" id="attempt${i}" placeholder="sec" />
        </div>`;
      attemptsGrid.appendChild(col);
      document.getElementById('attempt' + i).value = prev['attempt' + i] || '';
    }
    renderAttemptBtns();
    applyAttemptsScrollWindow();
  }
  function applyAttemptsScrollWindow() {
    const maxOffset = Math.max(0, numAttempts - SETS_WINDOW);
    if (attemptsScrollOffset > maxOffset) attemptsScrollOffset = maxOffset;
    if (attemptsScrollOffset < 0) attemptsScrollOffset = 0;
    Array.from(attemptsGrid.children).forEach((col, idx) => {
      col.classList.toggle('hidden', idx < attemptsScrollOffset || idx >= attemptsScrollOffset + SETS_WINDOW);
    });
    const firstShownA = Array.from(attemptsGrid.children).find(c => !c.classList.contains('hidden'));
    Array.from(attemptsGrid.children).forEach(c => c.classList.toggle('first-visible', c === firstShownA));
    const upBtn = document.getElementById('attemptsScrollUpBtn');
    const downBtn = document.getElementById('attemptsScrollDownBtn');
    const scrollable = numAttempts > SETS_WINDOW;
    upBtn.classList.toggle('hidden', !scrollable);
    downBtn.classList.toggle('hidden', !scrollable);
    upBtn.disabled = attemptsScrollOffset <= 0;
    downBtn.disabled = attemptsScrollOffset >= maxOffset;
  }
  document.getElementById('attemptsScrollUpBtn').onclick = () => {
    attemptsScrollOffset = Math.max(0, attemptsScrollOffset - 1);
    applyAttemptsScrollWindow();
  };
  document.getElementById('attemptsScrollDownBtn').onclick = () => {
    attemptsScrollOffset = Math.min(Math.max(0, numAttempts - SETS_WINDOW), attemptsScrollOffset + 1);
    applyAttemptsScrollWindow();
  };
  function renderAttemptBtns() {
    const addBtn = document.getElementById('addAttemptBtn');
    const removeBtn = document.getElementById('removeAttemptBtn');
    const atMax = numAttempts >= MAX_SETS;
    const atMin = numAttempts <= MIN_SETS;
    addBtn.disabled = atMax;
    addBtn.classList.toggle('hidden', atMax);
    removeBtn.disabled = atMin;
  }
  function clearAttemptInputs() {
    for (let i = 1; i <= numAttempts; i++) {
      const el = document.getElementById('attempt' + i);
      if (el) el.value = '';
    }
  }
  // Shared hard reset — blank slate, used after logging an entry (that exercise's
  // in-progress draft, if any, is now submitted and no longer needed).
  function resetLogInputs(opts) {
    opts = opts || {};
    clearSetInputs();
    numSets = 1;
    setsScrollOffset = 0;
    buildSetsGrid();
    clearAttemptInputs();
    numAttempts = DEFAULT_NUM_ATTEMPTS;
    attemptsScrollOffset = 0;
    buildAttemptsGrid();
    holdMode = 'sets';
    distanceInput.value = '';
    document.getElementById('ruckKgInput').value = '';
    document.getElementById('elevationInput').value = '';
    document.getElementById('timeInput').value = '';
    { const dv = document.getElementById('distVarSelect'); if (dv) dv.value = ''; }
    notesInput.value = '';
  }
  // Per-exercise scratch pad for not-yet-logged values, so switching between
  // exercises (as when alternating through a superset) never bleeds one
  // exercise's typed values into another's, and switching back restores
  // exactly what you'd typed before you left.
  let exerciseDrafts = {};
  function snapshotDraft(name) {
    if (!name) return;
    const setsValues = {};
    setsGrid.querySelectorAll('input, select').forEach(inp => { setsValues[inp.id] = inp.value; });
    const attemptsValues = {};
    attemptsGrid.querySelectorAll('input[type="number"]').forEach(inp => { attemptsValues[inp.id] = inp.value; });
    exerciseDrafts[name] = {
      numSets, numAttempts, holdMode, setsScrollOffset, attemptsScrollOffset,
      setsValues, attemptsValues,
      notes: notesInput.value,
      distance: distanceInput.value,
      ruckKg: document.getElementById('ruckKgInput').value,
      elevation: document.getElementById('elevationInput').value,
      time: document.getElementById('timeInput').value,
      distVar: (document.getElementById('distVarSelect') || {}).value || ''
    };
  }
  // Equipment from the most recent entry of this exercise (its last set that has one), if you still have that equipment.
  function lastEquipmentFor(name) {
    let best = null;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.exercise !== name || !Array.isArray(e.sets)) return;
      const key = String(e.date || '') + '|' + String(e.id || '').padStart(20, '0');
      if (best === null || key > best.key) best = { key, e };
    }));
    if (!best) return null;
    const sets = best.e.sets.slice().reverse();
    const hit = sets.find(s => s && typeof s === 'object' && s.equipment);
    return hit && equipmentList.includes(hit.equipment) ? hit.equipment : null;
  }
  // Copies it into every set; the later sets keep following set 1 until one is changed by hand.
  function prefillEquipment(name) {
    const eq = lastEquipmentFor(name);
    if (!eq) return;
    for (let i = 1; i <= numSets; i++) {
      const sel = document.getElementById('equip' + i);
      if (sel) sel.value = eq;
    }
  }
  function restoreDraft(name) {
    const d = name ? exerciseDrafts[name] : null;
    if (!d) { resetLogInputs({ clearEquipment: true }); if (name) { prefillEquipment(name); prefillVariation(name); } return; }
    numSets = d.numSets;
    setsScrollOffset = d.setsScrollOffset || 0;
    buildSetsGrid();
    Object.keys(d.setsValues).forEach(id => { const el = document.getElementById(id); if (el) el.value = d.setsValues[id]; });
    numAttempts = d.numAttempts;
    attemptsScrollOffset = d.attemptsScrollOffset || 0;
    buildAttemptsGrid();
    Object.keys(d.attemptsValues).forEach(id => { const el = document.getElementById(id); if (el) el.value = d.attemptsValues[id]; });
    holdMode = d.holdMode || 'sets';
    notesInput.value = d.notes || '';
    distanceInput.value = d.distance || '';
    document.getElementById('ruckKgInput').value = d.ruckKg || '';
    document.getElementById('elevationInput').value = d.elevation || '';
    document.getElementById('timeInput').value = d.time || '';
    updateMetricsSection(name);
    { const dv = document.getElementById('distVarSelect'); if (dv && d.distVar) dv.value = d.distVar; }
  }
  // Call when the exercise selection changes: saves what was typed for the
  // exercise you're leaving, then brings back whatever you'd typed for the
  // one you're switching to (or a blank slate if you've never touched it).
  function switchExerciseInputs(prevName, newName) {
    snapshotDraft(prevName);
    restoreDraft(newName);
  }
  function readAttempts() {
    const vals = [];
    for (let i = 1; i <= numAttempts; i++) {
      const el = document.getElementById('attempt' + i);
      if (el && el.value !== '') vals.push(Number(el.value));
    }
    return vals;
  }
  document.getElementById('addAttemptBtn').onclick = () => {
    if (numAttempts >= MAX_SETS) return;
    numAttempts++;
    attemptsScrollOffset = Math.max(0, numAttempts - SETS_WINDOW); // scroll to reveal the new attempt
    buildAttemptsGrid();
    const el = document.getElementById('attempt' + numAttempts);
    if (el) el.focus();
  };
  document.getElementById('removeAttemptBtn').onclick = () => {
    if (numAttempts <= MIN_SETS) return;
    numAttempts--;
    buildAttemptsGrid();
  };
  // one pill toggle: off = working sets, on = attempts (isometric exercises only)
  document.getElementById('holdModeToggleBtn').onclick = () => {
    holdMode = (holdMode === 'attempts') ? 'sets' : 'attempts';
    updateMetricsSection(currentExerciseName());
  };

  function onEccInput(idx) {
    eccEdited[idx] = true;
    const val = document.getElementById('ecc' + idx).value;
    for (let j = idx + 1; j <= numSets; j++) {
      if (eccEdited[j]) break;
      document.getElementById('ecc' + j).value = val;
    }
  }
  function resetEccCascade() { eccEdited = new Array(numSets + 1).fill(false); }
  function onKgInput(idx) {
    kgEdited[idx] = true;
    const val = document.getElementById('kg' + idx).value;
    for (let j = idx + 1; j <= numSets; j++) {
      if (kgEdited[j]) break;
      document.getElementById('kg' + j).value = val;
    }
  }
  function resetKgCascade() { kgEdited = new Array(numSets + 1).fill(false); }
  function onEquipInput(idx) {
    equipEdited[idx] = true;
    const val = document.getElementById('equip' + idx).value;
    for (let j = idx + 1; j <= numSets; j++) {
      if (equipEdited[j]) break;
      document.getElementById('equip' + j).value = val;
    }
  }
  function resetEquipCascade() { equipEdited = new Array(numSets + 1).fill(false); }

  // ---- Variations (lever position, grip, tempo...): one exercise, many variations, chosen per set ----
  function setVar(s) { return (s && typeof s === 'object' && s.variation) ? String(s.variation) : ''; }
  // Your own list for the exercise wins; otherwise the list from workout-library.json (matched by name).
  function exerciseVariations(name) {
    const owner = findExerciseOwner(name);
    if (owner && Array.isArray(owner.exObj.variations) && owner.exObj.variations.length) return owner.exObj.variations;
    const lib = window.WorkoutLibrary && window.WorkoutLibrary.get();
    if (!lib || !Array.isArray(lib.variations)) return [];
    const key = exKey(name);
    const hit = lib.variations.find(v => exKey(v.exercise) === key);
    return hit ? hit.variations : [];
  }
  // Some variations are one-sided even when the exercise is not (Archer, Typewriter, one-arm): their sets take left/right values.
  function isOneSidedVariation(name, variation) {
    if (!variation) return false;
    const lib = window.WorkoutLibrary && window.WorkoutLibrary.get();
    const hit = lib && Array.isArray(lib.variations) ? lib.variations.find(v => exKey(v.exercise) === exKey(name)) : null;
    return !!(hit && Array.isArray(hit.oneSided) && hit.oneSided.includes(variation));
  }
  function setIsUni(name, i) {
    if (isUnilateralExercise(name)) return true;
    const v = document.getElementById('var' + i);
    return !!(v && isOneSidedVariation(name, v.value));
  }
  function fillVarSelect(sel, current) {
    if (!sel) return;
    const keep = current !== undefined ? current : sel.value;
    const list = exerciseVariations(currentExerciseName());
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = ''; none.textContent = 'Variation';
    sel.appendChild(none);
    const all = keep && !list.includes(keep) ? list.concat(keep) : list; // never drop a value that is already chosen
    all.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    sel.value = all.includes(keep) ? keep : '';
  }
  function onVarInput(idx) {
    varEdited[idx] = true;
    const val = document.getElementById('var' + idx).value;
    for (let j = idx + 1; j <= numSets; j++) {
      if (varEdited[j]) break;
      document.getElementById('var' + j).value = val;
    }
    if (idx === 1) renderModifiers(); else updateMetricsSection(currentExerciseName()); // best-so-far tags and left/right fields follow the variation
  }
  function resetVarCascade() { varEdited = new Array(numSets + 1).fill(false); }
  // Variation from the most recent entry of this exercise (its last set that has one).
  function lastVariationFor(name) {
    let best = null;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.exercise !== name || !Array.isArray(e.sets)) return;
      const key = String(e.date || '') + '|' + String(e.id || '').padStart(20, '0');
      if (best === null || key > best.key) best = { key, e };
    }));
    if (!best) return null;
    const hit = best.e.sets.slice().reverse().find(s => setVar(s));
    return hit ? setVar(hit) : null;
  }
  // A started plan can name the variation for an exercise; otherwise use what you did last time.
  function prefillVariation(name) {
    const list = exerciseVariations(name);
    if (!list.length) return;
    let v = null;
    const refs = activeBlock ? (blockRefs[activeBlock] || []) : [];
    const ref = refs.find(r => r && r.name === name && r.variation);
    if (ref && list.includes(ref.variation)) v = ref.variation;
    if (!v) { const last = lastVariationFor(name); if (last && list.includes(last)) v = last; }
    if (!v) return;
    for (let i = 1; i <= numSets; i++) { const sel = document.getElementById('var' + i); if (sel) sel.value = v; }
  }
  // Which variation's bests to show: the one chosen on set 1 (undefined = this exercise has no variations).
  function bestVarKey(name) {
    if (!exerciseVariations(name).length) return undefined;
    const el = document.getElementById('var1');
    return el ? el.value : '';
  }
  function bestVarLabel(name, key) { return key === undefined ? '' : ` (${key || 'standard'})`; }
  document.getElementById('clearMetricsBtn').onclick = () => {
    clearSetInputs();
    distanceInput.value = '';
    document.getElementById('ruckKgInput').value = '';
    document.getElementById('elevationInput').value = '';
    document.getElementById('timeInput').value = '';
  };
  document.getElementById('addSetBtn').onclick = () => {
    if (numSets >= MAX_SETS) return;
    numSets++;
    setsScrollOffset = Math.max(0, numSets - SETS_WINDOW); // scroll to reveal the new set
    buildSetsGrid();
    focusRepsInput(numSets);
  };
  document.getElementById('removeSetBtn').onclick = () => {
    removeSet(numSets);
  };
  function focusRepsInput(idx) {
    const primary = document.getElementById('set' + idx);
    const left = document.getElementById('left' + idx);
    if (primary && !primary.classList.contains('hidden')) primary.focus();
    else if (left) left.focus();
  }

  // ---- Header menus ----
  const menuBtn = document.getElementById('menuBtn');
  const menuPanel = document.getElementById('menuPanel');
  const rearrangeToggleBtn = document.getElementById('rearrangeToggleBtn');
  const settingsListWrap = document.getElementById('settingsListWrap');
  menuBtn.onclick = (e) => {
    e.stopPropagation();
    menuPanel.classList.toggle('hidden');
  };
  rearrangeToggleBtn.onclick = (e) => {
    e.stopPropagation();
    const opening = settingsListWrap.classList.contains('hidden');
    settingsListWrap.classList.toggle('hidden', !opening);
    rearrangeToggleBtn.classList.toggle('open', opening);
    if (opening) renderSettingsList();
  };

  // ---- Reset (settings menu) ----
  const resetToggleBtn = document.getElementById('resetToggleBtn');
  const resetWrap = document.getElementById('resetWrap');
  resetToggleBtn.onclick = (e) => {
    e.stopPropagation();
    const opening = resetWrap.classList.contains('hidden');
    resetWrap.classList.toggle('hidden', !opening);
    resetToggleBtn.classList.toggle('open', opening);
  };
  const RESET_KEYS = {
    data: [DATA_KEY, "workout-log-deleted-v1"],
    lists: [LISTS_KEY, ...LEGACY_LISTS_KEYS, EQUIPMENT_KEY, REMOVEDEX_KEY, 'workout-log-premerge-v1'],
    blocks: [BLOCKS_KEY],
    layout: [LAYOUT_KEY],
    appearance: [NUMSETS_KEY, THEME_KEY, MODE_KEY, Shared.ui.KEY],
    profile: [BODYWEIGHT_KEY, 'workout-log-measurements-v1', 'workout-log-goals-v1'],
    plans: [SKILLS_KEY, 'workout-log-myprogram-v1', PLANMETA_KEY, PLANPROG_KEY, 'workout-log-plan-options-v1', 'workout-log-custom-routines-v1']
  };
  const RESET_LABELS = {
    data: 'logged entries (your workout history)',
    lists: 'categories, exercises & equipment',
    blocks: 'blocks',
    layout: 'section layout',
    appearance: 'appearance settings (theme)',
    profile: 'bodyweight, measurements & goals',
    plans: 'skill lines, My program & plan progress'
  };
  function clearResetGroup(key) {
    RESET_KEYS[key].forEach(k => localStorage.removeItem(k));
    if (key === 'lists') {
      // Just removing the key falls back to the app's built-in starter
      // categories/exercises on next load — that's not actually "empty".
      // Write a genuinely bare list instead: one category, zero exercises.
      lsSet(LISTS_KEY, JSON.stringify({ categories: ["General"], exercises: { General: [] }, colors: {} }));
    }
  }
  document.getElementById('resetSelectedBtn').onclick = () => {
    const checks = {
      data: document.getElementById('resetOptData').checked,
      lists: document.getElementById('resetOptLists').checked,
      blocks: document.getElementById('resetOptBlocks').checked,
      layout: document.getElementById('resetOptLayout').checked,
      profile: document.getElementById('resetOptProfile').checked,
      plans: document.getElementById('resetOptPlans').checked,
      appearance: document.getElementById('resetOptAppearance').checked
    };
    const chosen = Object.keys(checks).filter(k => checks[k]);
    if (!chosen.length) { alert('Choose at least one thing to reset first.'); return; }
    const list = chosen.map(k => RESET_LABELS[k]).join(', ');
    if (!confirm(`This will permanently erase: ${list}.\n\nThis can't be undone. Continue?`)) return;
    chosen.forEach(clearResetGroup);
    location.reload();
  };
  document.getElementById('resetAllBtn').onclick = () => {
    if (!confirm("This permanently erases EVERYTHING — all logged workouts, categories, exercises, blocks, equipment, skills, bodyweight, measurements, goals, plans and settings — and can't be undone. Photos, your profile picture and the Drive and backup settings are kept.\n\nReset the app completely?")) return;
    if (!confirm("Really sure? There's no way to get this data back once it's gone.")) return;
    Object.keys(RESET_KEYS).forEach(clearResetGroup);
    location.reload();
  };
  document.addEventListener('click', (e) => {
    if (!menuPanel.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) menuPanel.classList.add('hidden');
  });

  // ---- Layout (move / show / hide sections) ----
  // Calendar and entries live on the history page; everything else stays on home.
  const PAGE_OF_MODULE = { calendar: 'history', entries: 'history' };
  // Cached once, before any module is ever detached — getElementById can't find a
  // detached node again, so applyLayout must work from these stable references,
  // not re-query the DOM each time (that was why toggling a section back on
  // silently failed until a page reload rebuilt the DOM).
  const MODULE_ELEMENTS = {};
  DEFAULT_LAYOUT.forEach(d => {
    const el = document.getElementById('module-' + d.id);
    if (el) MODULE_ELEMENTS[d.id] = el;
  });
  function applyLayout() {
    layout.forEach(item => {
      const el = MODULE_ELEMENTS[item.id];
      if (!el) return;
      const pageEl = document.getElementById('page-' + (PAGE_OF_MODULE[item.id] || 'home'));
      if (item.visible) pageEl.appendChild(el);
      else if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  // ---- Page navigation (home <-> calendar/history) ----
  const pageHomeEl = document.getElementById('page-home');
  const pageHistoryEl = document.getElementById('page-history');
  const pageConfigEl = document.getElementById('page-config');
  const pageNavBtn = document.getElementById('pageNavBtn');
  const configBtn = document.getElementById('configBtn');
  const pageSkillsEl = document.getElementById('page-skills');
  const skillsBtn = document.getElementById('skillsBtn');
  let currentPage = 'home';
  function navigateTo(page) {
    currentPage = page;
    pageHomeEl.classList.toggle('hidden', page !== 'home');
    pageHistoryEl.classList.toggle('hidden', page !== 'history');
    pageConfigEl.classList.toggle('hidden', page !== 'config');
    pageSkillsEl.classList.toggle('hidden', page !== 'skills');
    pageNavBtn.classList.toggle('on', page === 'history');
    configBtn.classList.toggle('on', page === 'config');
    skillsBtn.classList.toggle('on', page === 'skills');
    if (page === 'home') {
      pageNavBtn.innerHTML = '<i class="fa-solid fa-calendar-days" aria-hidden="true"></i>';
      pageNavBtn.title = 'Calendar & history';
      pageNavBtn.setAttribute('aria-label', 'View calendar & history');
    } else {
      pageNavBtn.innerHTML = '<i class="fa-solid fa-house" aria-hidden="true"></i>';
      pageNavBtn.title = 'Home';
      pageNavBtn.setAttribute('aria-label', 'Back to home');
    }
    if (page === 'config') { renderCatEditList(); renderBlockEditList(); renderEquipmentEditList(); renderBodyweightList(); renderAllExercisesList(); }
    else { assigningBlock = null; assigningCategory = null; }
    if (page === 'skills') renderSkillsPage();
  }
  pageNavBtn.onclick = () => navigateTo(currentPage === 'home' ? 'history' : 'home');
  configBtn.onclick = () => navigateTo(currentPage === 'config' ? 'home' : 'config');
  skillsBtn.onclick = () => navigateTo(currentPage === 'skills' ? 'home' : 'skills');
  function saveLayout() { lsSet(LAYOUT_KEY, JSON.stringify(layout)); }
  function loadLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ids = parsed.map(p => p.id);
        DEFAULT_LAYOUT.forEach(d => { if (!ids.includes(d.id)) parsed.push(d); });
        layout = parsed.filter(p => MODULE_LABELS[p.id]);
      }
    } catch (e) { /* fall back to default */ }
    // Category, Calendar, and Entries list are fixed in place — not user-hideable.
    layout.forEach(item => { if (LOCKED_MODULES.includes(item.id)) item.visible = true; });
  }
  const LOCKED_MODULES = ['calendar', 'entries'];
  function renderSettingsList() {
    const listEl = document.getElementById('settingsList');
    listEl.innerHTML = '';
    const entries = layout.map((item, idx) => ({ item, idx })).filter(({ item }) => !LOCKED_MODULES.includes(item.id));
    entries.forEach(({ item, idx }, i) => {
      const row = document.createElement('div');
      row.className = 'settings-row' + (item.visible ? '' : ' hidden-module');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = MODULE_LABELS[item.id];
      const actions = document.createElement('div');
      actions.className = 'actions';

      const upBtn = document.createElement('button');
      upBtn.innerHTML = '<i class="fa-solid fa-angle-up" aria-hidden="true"></i>';
      upBtn.disabled = i === 0;
      upBtn.onclick = () => { const prevIdx = entries[i - 1].idx; [layout[prevIdx], layout[idx]] = [layout[idx], layout[prevIdx]]; commitLayout(); };

      const downBtn = document.createElement('button');
      downBtn.innerHTML = '<i class="fa-solid fa-angle-down" aria-hidden="true"></i>';
      downBtn.disabled = i === entries.length - 1;
      downBtn.onclick = () => { const nextIdx = entries[i + 1].idx; [layout[nextIdx], layout[idx]] = [layout[idx], layout[nextIdx]]; commitLayout(); };

      const eyeBtn = document.createElement('button');
      eyeBtn.className = item.visible ? 'eye-on' : '';
      eyeBtn.innerHTML = `<i class="fa-solid fa-${item.visible ? 'eye' : 'eye-slash'}" aria-hidden="true"></i>`;
      eyeBtn.onclick = () => { item.visible = !item.visible; commitLayout(); };

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(eyeBtn);
      row.appendChild(name);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }
  function commitLayout() {
    saveLayout();
    applyLayout();
    renderSettingsList();
    renderCalendar();
  }

  // ---- Category tabs + edit (add / rename / delete) ----
  function renderTabs() {
    // category pill next to the block pill; it shows "Category" while a block is selected
    const sel = document.getElementById('categorySelect');
    if (!sel) return;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Category'; ph.disabled = true;
    sel.appendChild(ph);
    categories.forEach(cat => { const o = document.createElement('option'); o.value = cat; o.textContent = cat; sel.appendChild(o); });
    sel.value = activeBlock ? '' : active;
    sel.onchange = () => {
      if (!sel.value) return;
      active = sel.value; activeBlock = null;
      renderBlockSelect(); updateExercisePicker(); render();
    };
  }

  // ---- Add/Edit exercise modal — shared by Blocks, Categories, and the Exercises list ----
  let exModalEditing = null; // { name, category } of the exercise being edited, or null when adding
  let exModalOnSaved = null; // callback(result) where result = { name, category } of the saved exercise, or null on delete

  function openExerciseModal(opts) {
    opts = opts || {};
    const exObj = opts.exObj || null;
    const category = opts.category || opts.defaultCategory || categories[0];
    exModalEditing = exObj ? { name: exObj.name, category: opts.category } : null;
    exModalOnSaved = opts.onSaved || null;
    document.getElementById('exModalTitle').textContent = exObj ? 'Edit exercise' : 'Add exercise';
    document.getElementById('exModalName').value = exObj ? exObj.name : '';
    const catSel = document.getElementById('exModalCategory');
    catSel.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      catSel.appendChild(opt);
    });
    catSel.value = category;
    document.getElementById('exModalColor').value = (exObj && exObj.color) || EX_COLOR_PALETTE[0];
    document.getElementById('exModalPattern').value = (exObj && exObj.pattern) || '';
    document.getElementById('exModalStraight').value = (exObj && exObj.straightArm !== undefined) ? (exObj.straightArm ? 'yes' : 'no') : '';
    const isoBtn = document.getElementById('exModalIsoBtn');
    const uniBtn = document.getElementById('exModalUniBtn');
    const levBtn = document.getElementById('exModalLevBtn');
    const iso = !!(exObj && exObj.isometric);
    const uni = !!(exObj && exObj.unilateral);
    const lev = !!(exObj && exObj.hasLeverage);
    isoBtn.classList.toggle('on', iso);
    isoBtn.textContent = iso ? 'ISO' : 'REPS';
    uniBtn.classList.toggle('on', uni);
    uniBtn.textContent = uni ? 'UNI' : 'BI';
    levBtn.classList.toggle('on', lev);
    levBtn.textContent = lev ? 'LEV ON' : 'LEV OFF';
    document.getElementById('exModalDeleteBtn').classList.toggle('hidden', !exObj);
    document.getElementById('exModalOverlay').classList.remove('hidden');
    document.getElementById('exModalName').focus();
  }
  function closeExerciseModal() {
    document.getElementById('exModalOverlay').classList.add('hidden');
    exModalEditing = null;
    exModalOnSaved = null;
  }
  document.getElementById('exModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'exModalOverlay') closeExerciseModal();
  });
  document.getElementById('exModalIsoBtn').onclick = () => {
    const b = document.getElementById('exModalIsoBtn');
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    b.textContent = on ? 'ISO' : 'REPS';
  };
  document.getElementById('exModalUniBtn').onclick = () => {
    const b = document.getElementById('exModalUniBtn');
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    b.textContent = on ? 'UNI' : 'BI';
  };
  document.getElementById('exModalLevBtn').onclick = () => {
    const b = document.getElementById('exModalLevBtn');
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    b.textContent = on ? 'LEV ON' : 'LEV OFF';
  };
  document.getElementById('exModalCancelBtn').onclick = closeExerciseModal;
  document.getElementById('exModalDeleteBtn').onclick = () => {
    if (!exModalEditing) return;
    if (!confirm(`Delete "${exModalEditing.name}"?`)) return;
    exerciseLists[exModalEditing.category] = (exerciseLists[exModalEditing.category] || []).filter(e => e.name !== exModalEditing.name);
    markExerciseRemoved(exModalEditing.name);
    if (selectedExercise === exModalEditing.name) selectedExercise = "";
    saveLists();
    updateExercisePicker();
    const cb = exModalOnSaved;
    closeExerciseModal();
    if (cb) cb(null);
  };
  document.getElementById('exModalSaveBtn').onclick = () => {
    const name = document.getElementById('exModalName').value.trim();
    if (!name) return;
    const newCat = document.getElementById('exModalCategory').value;
    const color = document.getElementById('exModalColor').value;
    const isometric = document.getElementById('exModalIsoBtn').classList.contains('on');
    const unilateral = document.getElementById('exModalUniBtn').classList.contains('on');
    const hasLeverage = document.getElementById('exModalLevBtn').classList.contains('on');
    const pattern = document.getElementById('exModalPattern').value;
    const sa = document.getElementById('exModalStraight').value;

    if (exModalEditing) {
      const oldCat = exModalEditing.category;
      const oldName = exModalEditing.name;
      const idx = (exerciseLists[oldCat] || []).findIndex(e => e.name === oldName);
      if (idx === -1) { closeExerciseModal(); return; }
      const nameChanged = oldCat !== newCat || oldName.toLowerCase() !== name.toLowerCase();
      if (nameChanged && (exerciseLists[newCat] || []).some(e => e.name.toLowerCase() === name.toLowerCase())) {
        alert('An exercise with that name already exists in that category.');
        return;
      }
      const exObj = exerciseLists[oldCat][idx];
      exObj.name = name; exObj.color = color; exObj.isometric = isometric; exObj.unilateral = unilateral; exObj.hasLeverage = hasLeverage;
      if (pattern) exObj.pattern = pattern; else delete exObj.pattern;
      if (sa) exObj.straightArm = sa === 'yes'; else delete exObj.straightArm;
      fillMissingPatterns();
      if (oldCat !== newCat) {
        exerciseLists[oldCat].splice(idx, 1);
        if (!exerciseLists[newCat]) exerciseLists[newCat] = [];
        exerciseLists[newCat].push(exObj);
      }
      // keep any block references pointing at this exercise in sync
      blocks.forEach(b => {
        (blockRefs[b] || []).forEach(r => {
          if (r.name === oldName && r.refCategory === oldCat) { r.name = name; r.refCategory = newCat; }
        });
      });
      if (selectedExercise === oldName) selectedExercise = name;
      // keep skill steps that track this exercise pointing at it
      let skillsTouched = false;
      skillLines.forEach(l => l.steps.forEach(st => { if (st.exercise === oldName) { st.exercise = name; skillsTouched = true; } }));
      if (skillsTouched) saveSkills();
      saveLists();
      saveBlocks();
      updateExercisePicker();
      const cb = exModalOnSaved;
      closeExerciseModal();
      if (cb) cb({ name, category: newCat });
    } else {
      if (!exerciseLists[newCat]) exerciseLists[newCat] = [];
      if (exerciseLists[newCat].some(e => e.name.toLowerCase() === name.toLowerCase())) {
        alert('That exercise is already in the list.');
        return;
      }
      exerciseLists[newCat].push({ name, color, isometric, unilateral, hasLeverage, pattern: pattern || undefined, straightArm: sa ? sa === 'yes' : undefined, createdAt: Date.now() });
      fillMissingPatterns();
      saveLists();
      updateExercisePicker();
      const cb = exModalOnSaved;
      closeExerciseModal();
      if (cb) cb({ name, category: newCat });
    }
  };

  // ---- select several to delete (blocks, categories, equipment, exercises) ----
  const bulk = { blocks: { on: false, sel: new Set(), ids: [] }, cats: { on: false, sel: new Set(), ids: [] }, equip: { on: false, sel: new Set(), ids: [] }, ex: { on: false, sel: new Set(), ids: [] } };
  const BULK_UI = {
    blocks: { list: 'blockEditList', btn: 'blocksSelectBtn', noun: 'block', render: () => renderBlockEditList() },
    cats: { list: 'catEditList', btn: 'categoriesSelectBtn', noun: 'category', render: () => renderCatEditList() },
    equip: { list: 'equipmentEditList', btn: 'equipmentSelectBtn', noun: 'equipment item', render: () => renderEquipmentEditList() },
    ex: { list: 'allExercisesList', btn: 'exSelectBtn', noun: 'exercise', render: () => renderAllExercisesList() }
  };
  function bulkBar(key) {
    let bar = document.getElementById('bulkBar-' + key);
    if (!bar) {
      const listEl = document.getElementById(BULK_UI[key].list);
      bar = document.createElement('div');
      bar.id = 'bulkBar-' + key; bar.className = 'bulk-bar hidden';
      bar.innerHTML = '<span class="bulk-count"></span><button type="button" class="text-btn" data-bulk="all">Select all</button><button type="button" class="text-btn text-btn-danger" data-bulk="delete">Delete</button><button type="button" class="text-btn" data-bulk="done">Done</button>';
      listEl.parentNode.insertBefore(bar, listEl);
      bar.onclick = (e) => { const b = e.target.closest('[data-bulk]'); if (b) bulkAction(key, b.dataset.bulk); };
    }
    return bar;
  }
  function refreshBulkBar(key) {
    const b = bulk[key], bar = bulkBar(key);
    bar.classList.toggle('hidden', !b.on);
    bar.querySelector('.bulk-count').textContent = b.sel.size + ' selected';
    bar.querySelector('[data-bulk="delete"]').disabled = !b.sel.size;
    bar.querySelector('[data-bulk="all"]').textContent = b.sel.size && b.sel.size === b.ids.length ? 'Select none' : 'Select all';
    const btn = document.getElementById(BULK_UI[key].btn);
    if (btn) btn.classList.toggle('on', b.on);
  }
  // called at the end of each list renderer: ids are the items in the order the rows were drawn
  function decorateBulk(listEl, key, ids) {
    const b = bulk[key];
    b.ids = ids;
    Array.from(b.sel).forEach(id => { if (!ids.includes(id)) b.sel.delete(id); });
    refreshBulkBar(key);
    if (!b.on) return;
    Array.from(listEl.children).filter(r => r.classList.contains('edit-row')).forEach((row, i) => {
      const id = ids[i];
      if (id === undefined) return;
      row.classList.add('selecting');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'bulk-cb'; cb.checked = b.sel.has(id); cb.setAttribute('aria-label', 'Select');
      const toggle = () => { if (cb.checked) b.sel.add(id); else b.sel.delete(id); refreshBulkBar(key); };
      cb.onchange = toggle;
      row.onclick = (e) => { if (e.target === cb || e.target.closest('input[type="color"]')) return; cb.checked = !cb.checked; toggle(); };
      row.insertBefore(cb, row.firstChild);
    });
  }
  function toggleBulk(key) { const b = bulk[key]; b.on = !b.on; b.sel.clear(); BULK_UI[key].render(); }
  function bulkAction(key, act) {
    const b = bulk[key];
    if (act === 'done') { b.on = false; b.sel.clear(); BULK_UI[key].render(); return; }
    if (act === 'all') { if (b.sel.size === b.ids.length) b.sel.clear(); else b.ids.forEach(id => b.sel.add(id)); BULK_UI[key].render(); return; }
    if (act !== 'delete' || !b.sel.size) return;
    const names = Array.from(b.sel), noun = BULK_UI[key].noun;
    let msg = `Delete ${names.length} ${noun}${names.length === 1 ? '' : 's'}?`;
    if (key === 'cats') {
      if (categories.length - names.length < 1) { alert('You need at least one category.'); return; }
      msg += ` Their exercises and logged entries move to "${UNCATEGORIZED_NAME}", nothing is deleted.`;
    } else if (key === 'blocks') msg += ' This only removes the blocks, not the exercises in them.';
    else if (key === 'equip') msg += ' Logged entries keep showing them, but they will not be selectable anymore.';
    else msg += ' Logged entries stay in your history.';
    if (!confirm(msg)) return;
    bulkQuiet = true;
    try {
      if (key === 'blocks') names.forEach(n => deleteBlock(n));
      else if (key === 'cats') names.filter(n => n !== UNCATEGORIZED_NAME).forEach(n => deleteCategory(n));
      else if (key === 'equip') names.forEach(n => deleteEquipment(n));
      else names.forEach(id => { const i = id.indexOf('||'); deleteExercise(id.slice(i + 2), id.slice(0, i)); });
    } finally { bulkQuiet = false; }
    b.on = false; b.sel.clear();
    renderCatEditList(); renderBlockEditList(); renderEquipmentEditList(); renderAllExercisesList(); renderBlockSelect();
    showToast('Deleted ' + names.length + ' ' + noun + (names.length === 1 ? '' : 's'));
  }
  Object.keys(BULK_UI).forEach(k => { const btn = document.getElementById(BULK_UI[k].btn); if (btn) btn.onclick = () => toggleBulk(k); });

  let assigningCategory = null; // name of the category currently showing its "move exercises in" checklist, or null
  let catListSort = 'added';
  function updateCatSortBtn() {
    const btn = document.getElementById('categoriesSortBtn');
    if (!btn) return;
    const alpha = catListSort === 'alphabetical';
    btn.innerHTML = `<i class="fa-solid ${alpha ? 'fa-arrow-down-a-z' : 'fa-arrow-down-wide-short'}" aria-hidden="true"></i>`;
    btn.title = `Sort: ${alpha ? 'A–Z' : 'order added'} — tap to change`;
    btn.setAttribute('aria-label', `Sort: ${alpha ? 'A–Z' : 'order added'} (tap to change)`);
  }
  function renderCatEditList() {
    updateCatSortBtn();
    catEditList.innerHTML = '';
    const catsInOrder = catListSort === 'alphabetical' ? categories.slice().sort((a, b) => a.localeCompare(b)) : categories;
    catsInOrder.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'cat-color-input';
      colorInput.value = getCategoryColor(cat);
      colorInput.title = 'Edit colour';
      colorInput.setAttribute('aria-label', 'Edit colour for ' + cat);
      colorInput.onclick = (ev) => ev.stopPropagation();
      colorInput.onchange = () => {
        categoryColors[cat] = colorInput.value;
        saveLists();
        renderCatEditList();
        renderAllExercisesList();
        renderBlockEditList();
        render();
      };
      nameSpan.appendChild(colorInput);
      nameSpan.appendChild(document.createTextNode(`${cat} (${(exerciseLists[cat] || []).length})`));
      const actions = document.createElement('div');
      actions.className = 'actions';

      const assignBtn = document.createElement('button');
      assignBtn.innerHTML = '<i class="fa-solid fa-list-check" aria-hidden="true"></i>';
      assignBtn.title = 'Move exercises in';
      assignBtn.setAttribute('aria-label', 'Move exercises into ' + cat);
      if (assigningCategory === cat) assignBtn.classList.add('on');
      assignBtn.onclick = () => {
        assigningCategory = (assigningCategory === cat) ? null : cat;
        catAssignSearchQuery = '';
        const searchInput = document.getElementById('catAssignSearchInput');
        if (searchInput) searchInput.value = '';
        renderCatEditList();
      };

      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
      renameBtn.onclick = () => renameCategory(cat);
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
      delBtn.onclick = () => deleteCategory(cat);
      actions.appendChild(assignBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
      row.appendChild(nameSpan);
      row.appendChild(actions);
      catEditList.appendChild(row);
    });
    decorateBulk(catEditList, 'cats', catsInOrder);
    renderCatAssignSection();
  }

  // Exercises belong to exactly one category, so "assigning" here moves an
  // exercise in from wherever it currently lives — it disappears from other
  // categories' groups the moment it lands in this one.
  let catAssignSearchQuery = "";
  function renderCatAssignSection() {
    const section = document.getElementById('catAssignSection');
    if (!assigningCategory || !categories.includes(assigningCategory)) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    document.getElementById('catAssignName').textContent = assigningCategory;
    const listEl = document.getElementById('catAssignChecklist');
    listEl.innerHTML = '';
    const q = catAssignSearchQuery.toLowerCase();
    let any = false;
    categories.forEach(cat => {
      if (cat === assigningCategory) return;
      const list = (exerciseLists[cat] || []).filter(e => !q || e.name.toLowerCase().includes(q));
      if (!list.length) return;
      any = true;
      const group = document.createElement('div');
      group.className = 'existing-ex-group';
      const groupLabel = document.createElement('div');
      groupLabel.className = 'existing-ex-group-label';
      groupLabel.textContent = cat;
      group.appendChild(groupLabel);
      list.forEach(e => {
        const row = document.createElement('label');
        row.className = 'existing-ex-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = false;
        cb.onchange = () => { if (cb.checked) moveExerciseToCategory(e.name, cat, assigningCategory); };
        row.appendChild(cb);
        row.appendChild(document.createTextNode(e.name));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
        editBtn.onclick = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          openExerciseModal({ exObj: e, category: cat, onSaved: () => { renderCatEditList(); renderAllExercisesList(); } });
        };
        row.appendChild(editBtn);
        group.appendChild(row);
      });
      listEl.appendChild(group);
    });
    if (!any) listEl.innerHTML = `<div class="empty" style="padding:4px 0;">${q ? 'No matching exercises.' : 'All exercises already live here, or there are none yet.'}</div>`;
    let addRow = document.getElementById('catAssignAddBtn');
    if (!addRow) {
      addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.id = 'catAssignAddBtn';
      addRow.className = 'text-btn';
      addRow.style.marginTop = '8px';
      addRow.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add new exercise';
      document.getElementById('catAssignSection').appendChild(addRow);
    }
    addRow.onclick = () => openExerciseModal({
      defaultCategory: assigningCategory,
      onSaved: () => { renderCatEditList(); renderAllExercisesList(); }
    });
  }
  document.getElementById('catAssignSearchInput').addEventListener('input', (e) => {
    catAssignSearchQuery = e.target.value.trim();
    renderCatAssignSection();
  });

  function moveExerciseToCategory(name, fromCat, toCat) {
    const exObj = (exerciseLists[fromCat] || []).find(e => e.name === name);
    if (!exObj) return;
    exerciseLists[fromCat] = exerciseLists[fromCat].filter(e => e.name !== name);
    if (!exerciseLists[toCat]) exerciseLists[toCat] = [];
    exerciseLists[toCat].push(exObj);
    // keep block references pointing at this exercise valid
    blocks.forEach(b => {
      (blockRefs[b] || []).forEach(r => { if (r.name === name && r.refCategory === fromCat) r.refCategory = toCat; });
    });
    if (active === fromCat && selectedExercise === name) selectedExercise = "";
    saveLists();
    saveBlocks();
    renderCatEditList();
    renderAllExercisesList();
    updateExercisePicker();
    showToast(`Moved "${name}" to ${toCat}`);
  }

  // ---- All-exercises list (config page): every exercise, any category, sortable ----
  const EX_SORT_MODES = ['alphabetical', 'category', 'newest'];
  const EX_SORT_META = {
    alphabetical: { icon: 'fa-arrow-down-a-z', label: 'A–Z' },
    category: { icon: 'fa-tags', label: 'Category' },
    newest: { icon: 'fa-clock-rotate-left', label: 'Newest' }
  };
  let exListSort = 'alphabetical';
  function updateExSortBtn() {
    const btn = document.getElementById('exSortToggleBtn');
    if (!btn) return;
    const meta = EX_SORT_META[exListSort];
    btn.innerHTML = `<i class="fa-solid ${meta.icon}" aria-hidden="true"></i>`;
    btn.title = `Sort: ${meta.label} — tap to change`;
    btn.setAttribute('aria-label', `Sort: ${meta.label} (tap to change)`);
  }
  function renderAllExercisesList() {
    const listEl = document.getElementById('allExercisesList');
    if (!listEl) return;
    updateExSortBtn();
    let all = [];
    categories.forEach(cat => {
      (exerciseLists[cat] || []).forEach(exObj => all.push({ exObj, cat }));
    });
    const countEl = document.getElementById('exercisesCount');
    if (countEl) countEl.textContent = ` (${all.length})`;
    if (allExSearchQuery) {
      const q = allExSearchQuery.toLowerCase();
      all = all.filter(p => p.exObj.name.toLowerCase().includes(q));
    }
    if (exListSort === 'newest') all.sort((a, b) => (b.exObj.createdAt || 0) - (a.exObj.createdAt || 0));
    else if (exListSort === 'category') {
      all.sort((a, b) => {
        const catDiff = categories.indexOf(a.cat) - categories.indexOf(b.cat);
        return catDiff !== 0 ? catDiff : a.exObj.name.localeCompare(b.exObj.name);
      });
    } else all.sort((a, b) => a.exObj.name.localeCompare(b.exObj.name));
    listEl.innerHTML = '';
    if (!all.length) {
      listEl.innerHTML = allExSearchQuery
        ? '<div class="empty" style="padding:4px 0;">No exercises match that search.</div>'
        : '<div class="empty" style="padding:4px 0;">No exercises yet.</div>';
      return;
    }
    all.forEach(({ exObj, cat }) => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = exObj.color || getCategoryColor(cat);
      nameSpan.appendChild(dot);
      nameSpan.appendChild(document.createTextNode(exObj.name));
      const catTag = document.createElement('span');
      catTag.className = 'iso-tag origin-tag';
      catTag.style.marginLeft = '6px';
      catTag.textContent = cat;
      nameSpan.appendChild(catTag);
      const actions = document.createElement('div');
      actions.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
      editBtn.onclick = () => openExerciseModal({ exObj, category: cat, onSaved: renderAllExercisesList });
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
      delBtn.onclick = () => { deleteExercise(exObj.name, cat); renderAllExercisesList(); };
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(nameSpan);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
    decorateBulk(listEl, 'ex', all.map(p => p.cat + '||' + p.exObj.name));
  }
  const exSortToggleBtn = document.getElementById('exSortToggleBtn');
  if (exSortToggleBtn) exSortToggleBtn.onclick = () => {
    const idx = EX_SORT_MODES.indexOf(exListSort);
    exListSort = EX_SORT_MODES[(idx + 1) % EX_SORT_MODES.length];
    renderAllExercisesList();
  };
  const addExerciseModalBtn = document.getElementById('addExerciseModalBtn');
  if (addExerciseModalBtn) addExerciseModalBtn.onclick = () => openExerciseModal({ defaultCategory: categories[0], onSaved: renderAllExercisesList });

  function renameCategory(oldName) {
    const newName = prompt('Rename category', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (categories.includes(trimmed)) { alert('A category with that name already exists.'); return; }
    categories = categories.map(c => c === oldName ? trimmed : c);
    exerciseLists[trimmed] = exerciseLists[oldName];
    delete exerciseLists[oldName];
    data[trimmed] = data[oldName];
    delete data[oldName];
    categoryColors[trimmed] = categoryColors[oldName];
    delete categoryColors[oldName];
    if (active === oldName) active = trimmed;
    if (assigningCategory === oldName) assigningCategory = trimmed;
    saveLists();
    saveData();
    updateExercisePicker();
    render();
    renderCatEditList();
    renderAllExercisesList();
  }

  function deleteCategory(name) {
    if (categories.length <= 1) { alert('You need at least one category.'); return; }
    const exCount = (exerciseLists[name] || []).length;
    const entryCount = (data[name] || []).length;
    const moveParts = [];
    if (exCount > 0) moveParts.push(`${exCount} exercise${exCount === 1 ? '' : 's'}`);
    if (entryCount > 0) moveParts.push(`${entryCount} logged entr${entryCount === 1 ? 'y' : 'ies'}`);
    let msg = `Delete "${name}"?`;
    if (moveParts.length) msg += ` Its ${moveParts.join(' and ')} will move to "${UNCATEGORIZED_NAME}" — nothing gets deleted.`;
    if (!bulkQuiet && !confirm(msg)) return;

    // Exercises (and their logged history) outlive the category they were filed
    // under — deleting a category only removes the category, never the exercises.
    if (exCount > 0 || entryCount > 0) {
      if (!categories.includes(UNCATEGORIZED_NAME)) {
        categories.push(UNCATEGORIZED_NAME);
        getCategoryColor(UNCATEGORIZED_NAME);
      }
      if (!exerciseLists[UNCATEGORIZED_NAME]) exerciseLists[UNCATEGORIZED_NAME] = [];
      if (!data[UNCATEGORIZED_NAME]) data[UNCATEGORIZED_NAME] = [];
      exerciseLists[UNCATEGORIZED_NAME] = exerciseLists[UNCATEGORIZED_NAME].concat(exerciseLists[name] || []);
      data[UNCATEGORIZED_NAME] = data[UNCATEGORIZED_NAME].concat(data[name] || []);
      // keep block references pointing at the moved exercises valid
      blocks.forEach(b => {
        (blockRefs[b] || []).forEach(r => { if (r.refCategory === name) r.refCategory = UNCATEGORIZED_NAME; });
      });
    }

    categories = categories.filter(c => c !== name);
    delete exerciseLists[name];
    delete data[name];
    delete categoryColors[name];
    if (active === name) active = categories[0];
    if (assigningCategory === name) assigningCategory = null;
    saveLists();
    saveData();
    saveBlocks();
    updateExercisePicker();
    render();
    renderCatEditList();
    renderAllExercisesList();
    renderBlockSelect();
  }

  document.getElementById('addCatBtn').onclick = () => {
    const name = newCatInput.value.trim();
    if (!name) return;
    if (categories.includes(name)) { alert('That category already exists.'); return; }
    categories.push(name);
    exerciseLists[name] = [];
    data[name] = [];
    getCategoryColor(name);
    newCatInput.value = '';
    saveLists();
    saveData();
    render();
    renderCatEditList();
  };
  newCatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('addCatBtn').click(); });
  document.getElementById('categoriesSortBtn').onclick = () => {
    catListSort = (catListSort === 'added') ? 'alphabetical' : 'added';
    renderCatEditList();
  };

  // ---- Equipment management (list editor + the picker used while logging) ----
  let equipmentListSort = 'added';
  function updateEquipmentSortBtn() {
    const btn = document.getElementById('equipmentSortBtn');
    if (!btn) return;
    const alpha = equipmentListSort === 'alphabetical';
    btn.innerHTML = `<i class="fa-solid ${alpha ? 'fa-arrow-down-a-z' : 'fa-arrow-down-wide-short'}" aria-hidden="true"></i>`;
    btn.title = `Sort: ${alpha ? 'A–Z' : 'order added'} — tap to change`;
    btn.setAttribute('aria-label', `Sort: ${alpha ? 'A–Z' : 'order added'} (tap to change)`);
  }
  function renderEquipmentEditList() {
    updateEquipmentSortBtn();
    const listEl = document.getElementById('equipmentEditList');
    listEl.innerHTML = '';
    if (!equipmentList.length) {
      listEl.innerHTML = '<div class="empty" style="padding:4px 0;">No equipment yet — add one below.</div>';
    }
    const inOrder = equipmentListSort === 'alphabetical' ? equipmentList.slice().sort((a, b) => a.localeCompare(b)) : equipmentList;
    inOrder.forEach(name => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'cat-color-input';
      colorInput.value = getEquipmentColor(name);
      colorInput.title = 'Edit colour';
      colorInput.setAttribute('aria-label', 'Edit colour for ' + name);
      colorInput.onclick = (ev) => ev.stopPropagation();
      colorInput.onchange = () => {
        equipmentColors[name] = colorInput.value;
        saveEquipment();
      };
      nameSpan.appendChild(colorInput);
      nameSpan.appendChild(document.createTextNode(name));
      const actions = document.createElement('div');
      actions.className = 'actions';
      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
      renameBtn.onclick = () => renameEquipment(name);
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
      delBtn.onclick = () => deleteEquipment(name);
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
      row.appendChild(nameSpan);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
    decorateBulk(listEl, 'equip', inOrder);
  }
  // Per-set equipment dropdowns: fill one, or refresh all after the equipment list changes.
  function fillEquipSelect(sel, current) {
    if (!sel) return;
    const keep = current !== undefined ? current : sel.value;
    sel.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Equipment';
    sel.appendChild(noneOpt);
    equipmentList.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = equipmentList.includes(keep) ? keep : '';
  }
  function renderEquipmentSelect() {
    document.querySelectorAll('#setsGrid select[id^="equip"]').forEach(sel => fillEquipSelect(sel)); // only the equipment selects (RPE, flag, variation and chain share the class)
  }
  function renameEquipment(oldName) {
    const newName = prompt('Rename equipment', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (equipmentList.includes(trimmed)) { alert('That equipment already exists.'); return; }
    equipmentList = equipmentList.map(n => n === oldName ? trimmed : n);
    if (equipmentColors[oldName]) { equipmentColors[trimmed] = equipmentColors[oldName]; delete equipmentColors[oldName]; }
    // keep already-logged entries pointing at the renamed tag
    categories.forEach(cat => { (data[cat] || []).forEach(e => {
      if (e.equipment === oldName) e.equipment = trimmed;
      (e.sets || []).forEach(s => { if (s && typeof s === 'object' && s.equipment === oldName) s.equipment = trimmed; });
    }); });
    saveEquipment();
    saveData();
    renderEquipmentEditList();
    renderEquipmentSelect();
  }
  function deleteEquipment(name) {
    const usedCount = categories.reduce((n, cat) => n + (data[cat] || []).filter(e => e.equipment === name || (e.sets || []).some(s => s && typeof s === 'object' && s.equipment === name)).length, 0);
    let msg = `Delete "${name}"?`;
    if (usedCount > 0) msg += ` ${usedCount} already-logged entr${usedCount === 1 ? 'y' : 'ies'} will keep showing it, but it won't be selectable anymore.`;
    if (!bulkQuiet && !confirm(msg)) return;
    equipmentList = equipmentList.filter(n => n !== name);
    delete equipmentColors[name];
    saveEquipment();
    renderEquipmentEditList();
    renderEquipmentSelect();
  }
  document.getElementById('addEquipmentBtn').onclick = () => {
    const input = document.getElementById('newEquipmentInput');
    const name = input.value.trim();
    if (!name) return;
    if (equipmentList.includes(name)) { alert('That equipment already exists.'); return; }
    equipmentList.push(name);
    getEquipmentColor(name);
    saveEquipment();
    input.value = '';
    renderEquipmentEditList();
    renderEquipmentSelect();
  };
  document.getElementById('newEquipmentInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('addEquipmentBtn').click(); });
  document.getElementById('equipmentSortBtn').onclick = () => {
    equipmentListSort = (equipmentListSort === 'added') ? 'alphabetical' : 'added';
    renderEquipmentEditList();
  };

  // ---- Bodyweight management (weigh-in list; one entry per date) ----
  function renderBodyweightList() {
    const listEl = document.getElementById('bodyweightList');
    const summaryEl = document.getElementById('bodyweightSummary');
    document.getElementById('bwValueInput').placeholder = weightUnitLabel();
    listEl.innerHTML = '';
    const sorted = bodyweightLog.slice().sort((a, b) => b.date.localeCompare(a.date)); // newest first
    listEl.classList.toggle('hidden', !sorted.length);
    summaryEl.classList.toggle('hidden', !sorted.length);
    if (!sorted.length) return;
    const latest = sorted[0];
    const first = sorted[sorted.length - 1];
    let summary = `Latest: <b>${round2(kgToDisplay(latest.kg))} ${weightUnitLabel()}</b> (${latest.date})`;
    if (sorted.length > 1) {
      const diff = round2(kgToDisplay(latest.kg) - kgToDisplay(first.kg));
      summary += ` · ${diff > 0 ? '+' : ''}${diff} ${weightUnitLabel()} since ${first.date}`;
    }
    summaryEl.innerHTML = summary;
    sorted.forEach(e => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = `${e.date} — ${round2(kgToDisplay(e.kg))} ${weightUnitLabel()}`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
      editBtn.title = 'Edit';
      editBtn.onclick = () => editBodyweight(e.id);
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
      delBtn.title = 'Delete';
      delBtn.onclick = () => deleteBodyweight(e.id);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(nameSpan);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }
  function editBodyweight(id) {
    const entry = bodyweightLog.find(e => e.id === id);
    if (!entry) return;
    const newDate = prompt('Date (YYYY-MM-DD):', entry.date);
    if (newDate === null) return;
    const trimmedDate = newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) { alert('Please use the format YYYY-MM-DD.'); return; }
    if (trimmedDate !== entry.date && bodyweightLog.some(e => e.date === trimmedDate)) { alert('There is already a weigh-in on that date.'); return; }
    const newWeight = prompt(`Bodyweight (${weightUnitLabel()}):`, String(round2(kgToDisplay(entry.kg))));
    if (newWeight === null) return;
    const v = Number(newWeight.trim());
    if (!(v > 0)) { alert('Enter a weight greater than 0.'); return; }
    entry.date = trimmedDate;
    entry.kg = Math.round(displayToKg(v) * 100) / 100;
    saveBodyweight();
    renderBodyweightList();
  }
  function deleteBodyweight(id) {
    const entry = bodyweightLog.find(e => e.id === id);
    if (!entry) return;
    if (!confirm(`Delete the ${entry.date} weigh-in?`)) return;
    bodyweightLog = bodyweightLog.filter(e => e.id !== id);
    saveBodyweight();
    renderBodyweightList();
  }
  document.getElementById('bwDateInput').valueAsDate = new Date();
  document.getElementById('addBodyweightBtn').onclick = () => {
    const date = document.getElementById('bwDateInput').value;
    const valStr = document.getElementById('bwValueInput').value;
    const v = Number(valStr);
    if (!date || valStr === '' || !(v > 0)) { alert('Enter a date and a weight greater than 0.'); return; }
    const kg = Math.round(displayToKg(v) * 100) / 100;
    const existing = bodyweightLog.find(e => e.date === date);
    if (existing) { existing.kg = kg; showToast('Updated the ' + date + ' weigh-in'); }
    else bodyweightLog.push({ id: Date.now().toString(), date, kg });
    saveBodyweight();
    document.getElementById('bwValueInput').value = '';
    renderBodyweightList();
  };
  document.getElementById('bwValueInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('addBodyweightBtn').click(); });

  // ---- Skill progressions: criteria checking, "train next" suggestions, and the Skills page ----
  // Built-in skill progressions (Planche, Front lever, ...) live in workout-library.json; see workout-library.js.
  let collapsedSkillLines = new Set(Shared.ui.get('skillsCollapsed', [])); // which lines are folded up on the Skills page (remembered)
  function saveCollapsedSkills() { Shared.ui.set('skillsCollapsed', Array.from(collapsedSkillLines)); }
  let skillStepEditing = null;         // { lineId, stepId|null } while the step editor is open

  function allExerciseNames() {
    const seen = new Set();
    categories.forEach(c => (exerciseLists[c] || []).forEach(e => seen.add(e.name)));
    return Array.from(seen);
  }
  // Pre-link example steps to an exercise of the same name if you already have one.
  function guessExerciseForStep(lineName, stepName) {
    const names = allExerciseNames();
    const cands = [stepName, stepName + ' ' + lineName, lineName + ' ' + stepName].map(x => x.toLowerCase());
    for (const c of cands) { const hit = names.find(n => n.toLowerCase() === c); if (hit) return hit; }
    return null;
  }
  function goalText(step) { return step.metric === 'hold' ? `${step.target}s × ${step.sets}` : `${step.target} reps × ${step.sets}`; }
  // Checks a step against the log: any single day with enough sets at/above the target meets it.
  function evaluateStep(step) {
    if (!step.exercise) return { linked: false, hasData: false, met: false, metDate: null, bestCount: 0, bestValue: 0 };
    const byDate = {};
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.exercise !== step.exercise) return;
      const vals = (e.sets || []).filter(x => !step.variation || (step.variation === '__none__' ? !setVar(x) : setVar(x) === step.variation)).map(Shared.cleanReps);
      if (step.metric === 'hold' && !step.variation) (e.attempts || []).forEach(a => vals.push(Number(a) || 0));
      if (!vals.length) return;
      (byDate[e.date] = byDate[e.date] || []).push(...vals);
    }));
    const dates = Object.keys(byDate).sort();
    let bestCount = 0, bestValue = 0, metDate = null;
    dates.forEach(d => {
      const vals = byDate[d];
      const count = vals.filter(v => v >= step.target).length;
      if (count > bestCount) bestCount = count;
      vals.forEach(v => { if (v > bestValue) bestValue = v; });
      if (!metDate && count >= step.sets) metDate = d;
    });
    return { linked: true, hasData: dates.length > 0, met: !!metDate, metDate, bestCount: Math.min(bestCount, step.sets), bestValue };
  }
  function skillCurrentIdx(line) { return line.steps.findIndex(st => !st.doneDate); }
  function metStepIds() {
    const ids = new Set();
    skillLines.forEach(l => l.steps.forEach(st => { if (!st.doneDate && evaluateStep(st).met) ids.add(st.id); }));
    return ids;
  }
  function stepStatus(step, ev) {
    if (!step.exercise) return { text: 'Not linked to an exercise — tick it off yourself, or edit the step to link one.', met: false };
    if (ev.met) return { text: `✓ Criteria met (first on ${ev.metDate})`, met: true };
    if (!ev.hasData) return { text: 'Not logged yet', met: false };
    const u = step.metric === 'hold' ? 's' : '';
    return { text: `Best ${ev.bestValue}${u} · ${ev.bestCount}/${step.sets} sets at ${step.target}${u}+ in a day`, met: false };
  }
  function skillToday() { return Shared.todayISO(); }

  // Small hint shown while logging an exercise that is part of a skill line.
  function skillHintFor(name) {
    if (!name) return null;
    let found = null;
    skillLines.forEach(line => {
      const cur = skillCurrentIdx(line);
      line.steps.forEach((st, i) => {
        if (st.doneDate || st.exercise !== name) return;
        const isCurrent = i === cur;
        if (!found || (isCurrent && !found.isCurrent)) found = { line, step: st, isCurrent };
      });
    });
    if (!found) return null;
    const ev = evaluateStep(found.step);
    return `${found.step.name} goal: ${goalText(found.step)}` + (ev.met ? ' — met, mark it done in Skills' : '');
  }
  function updateSkillsBadge() {
    const btn = document.getElementById('skillsBtn');
    if (!btn) return;
    const n = metStepIds().size;
    btn.innerHTML = '<i class="fa-solid fa-medal" aria-hidden="true"></i>' + (n ? `<span class="ready-dot">${n}</span>` : '');
    const label = n ? `Skill progressions — ${n} ready to move up` : 'Skill progressions';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  // Called right after an entry is logged: tells you if that session just met a step's criteria.
  function announceNewlyMetSkills(before, prToastShown) {
    const names = [];
    skillLines.forEach(l => l.steps.forEach(st => { if (!st.doneDate && !before.has(st.id) && evaluateStep(st).met) names.push(st.name); }));
    updateSkillsBadge();
    if (!names.length) return;
    const msg = `🎯 Criteria met: ${names.join(', ')} — mark it done in Skills`;
    if (prToastShown) setTimeout(() => showToast(msg), lastToastMs + 200); else showToast(msg);
  }

  function setStepDone(line, step, done) {
    step.doneDate = done ? skillToday() : null;
    saveSkills();
    renderSkillsPage();
    if (done) {
      const next = line.steps.find(st => !st.doneDate);
      showToast(next ? `✓ ${step.name} done — next up: ${next.name}` : `🏆 ${line.name} complete!`);
    }
  }
  function moveSkillStep(line, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= line.steps.length) return;
    const tmp = line.steps[i]; line.steps[i] = line.steps[j]; line.steps[j] = tmp;
    saveSkills();
    renderSkillsPage();
  }
  // Jump to the home page with this exercise selected, ready to log.
  function goLogExercise(name, variation) {
    if (!categories.some(c => (exerciseLists[c] || []).some(e => e.name === name))) { showToast("That exercise isn't in your library any more"); return; }
    active = exerciseCategoryFor(name);
    activeBlock = null;
    const prev = selectedExercise;
    selectedExercise = name;
    if (selectedExercise !== prev) switchExerciseInputs(prev, selectedExercise);
    renderTabs();
    renderBlockSelect();
    updateExercisePicker();
    if (variation) { for (let i = 1; i <= numSets; i++) { const sel = document.getElementById('var' + i); if (sel && Array.from(sel.options).some(o => o.value === variation)) sel.value = variation; } }
    renderModifiers();
    navigateTo('home');
  }

  function skillMiniBtn(iconHtml, title, onClick, extraClass, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skill-mini-btn' + (extraClass ? ' ' + extraClass : '');
    b.innerHTML = iconHtml;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.disabled = !!disabled;
    b.onclick = onClick;
    return b;
  }
  function skillTextBtn(label, onClick, primary) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-btn' + (primary ? ' text-btn-primary' : '');
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  function renderSkillsNext() {
    const el = document.getElementById('skillsNextList');
    el.innerHTML = '';
    if (!skillLines.length) {
      el.innerHTML = '<div class="empty" style="padding:4px 0;">No skill lines yet — add one below and this becomes your "what to train next" list.</div>';
      return;
    }
    const rows = [];
    skillLines.forEach(line => { const idx = skillCurrentIdx(line); if (idx !== -1) rows.push({ line, step: line.steps[idx], idx }); });
    if (!rows.length) {
      el.innerHTML = '<div class="empty" style="padding:4px 0;">Every line is complete 🏆 — add a harder step or a new line to keep progressing.</div>';
      return;
    }
    rows.forEach(({ line, step, idx }) => {
      const ev = evaluateStep(step);
      const st = stepStatus(step, ev);
      const row = document.createElement('div');
      row.className = 'skill-next-row' + (ev.met ? ' ready' : '');
      const main = document.createElement('div');
      main.className = 'skill-next-main';
      const lineEl = document.createElement('div');
      lineEl.className = 'skill-next-line';
      lineEl.textContent = `${line.name} · step ${idx + 1} of ${line.steps.length}`;
      const titleEl = document.createElement('div');
      titleEl.className = 'skill-step-name';
      titleEl.textContent = step.name;
      const goalEl = document.createElement('div');
      goalEl.className = 'skill-step-goal';
      goalEl.textContent = `Goal: ${goalText(step)}` + (step.exercise ? ` · ${step.exercise}${step.variation ? ' · ' + (step.variation === '__none__' ? 'Standard' : step.variation) : ''}` : '');
      const statusEl = document.createElement('div');
      statusEl.className = 'skill-step-status' + (st.met ? ' met' : '');
      statusEl.textContent = st.text;
      main.appendChild(lineEl); main.appendChild(titleEl); main.appendChild(goalEl); main.appendChild(statusEl);
      const actions = document.createElement('div');
      actions.className = 'skill-step-actions';
      if (ev.met) actions.appendChild(skillTextBtn('Mark done & move up', () => setStepDone(line, step, true), true));
      if (step.exercise) actions.appendChild(skillTextBtn('Log it', () => goLogExercise(step.exercise, step.variation), !ev.met));
      if (!ev.met) actions.appendChild(skillTextBtn('Mark done', () => setStepDone(line, step, true)));
      main.appendChild(actions);
      row.appendChild(main);
      el.appendChild(row);
    });
  }

  function buildSkillStepRow(line, step, i, curIdx) {
    const ev = step.doneDate ? null : evaluateStep(step);
    const row = document.createElement('div');
    row.className = 'skill-step' + (step.doneDate ? ' done' : (ev.met ? ' ready' : (i === curIdx ? ' current' : '')));
    const dot = document.createElement('div');
    dot.className = 'skill-dot';
    dot.textContent = step.doneDate ? '✓' : (ev.met ? '!' : String(i + 1));
    const body = document.createElement('div');
    body.className = 'skill-step-body';
    const nameEl = document.createElement('div');
    nameEl.className = 'skill-step-name';
    nameEl.textContent = step.name;
    const goalEl = document.createElement('div');
    goalEl.className = 'skill-step-goal';
    goalEl.textContent = `Goal: ${goalText(step)}` + (step.exercise ? ` · ${step.exercise}${step.variation ? ' · ' + (step.variation === '__none__' ? 'Standard' : step.variation) : ''}` : '');
    const statusEl = document.createElement('div');
    if (step.doneDate) {
      statusEl.className = 'skill-step-status';
      statusEl.textContent = `Done ${step.doneDate}`;
    } else {
      const st = stepStatus(step, ev);
      statusEl.className = 'skill-step-status' + (st.met ? ' met' : '');
      statusEl.textContent = st.text;
    }
    const actions = document.createElement('div');
    actions.className = 'skill-step-actions';
    if (step.doneDate) actions.appendChild(skillTextBtn('Undo', () => setStepDone(line, step, false)));
    else actions.appendChild(skillTextBtn(ev.met ? 'Mark done & move up' : 'Mark done', () => setStepDone(line, step, true), ev.met));
    if (step.exercise && !step.doneDate) actions.appendChild(skillTextBtn('Log it', () => goLogExercise(step.exercise, step.variation)));
    const miniGroup = document.createElement('div');
    miniGroup.className = 'skill-mini-group';
    miniGroup.appendChild(skillMiniBtn('<i class="fa-solid fa-pencil" aria-hidden="true"></i>', 'Edit step', () => openSkillStepModal(line.id, step.id)));
    miniGroup.appendChild(skillMiniBtn('<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>', 'Move up', () => moveSkillStep(line, i, -1), '', i === 0));
    miniGroup.appendChild(skillMiniBtn('<i class="fa-solid fa-arrow-down" aria-hidden="true"></i>', 'Move down', () => moveSkillStep(line, i, 1), '', i === line.steps.length - 1));
    miniGroup.appendChild(skillMiniBtn('<i class="fa-regular fa-trash-can" aria-hidden="true"></i>', 'Delete step', () => {
      if (!confirm(`Delete the step "${step.name}"?`)) return;
      line.steps = line.steps.filter(x => x.id !== step.id);
      saveSkills();
      renderSkillsPage();
    }, 'danger'));
    actions.appendChild(miniGroup);
    body.appendChild(nameEl); body.appendChild(goalEl); body.appendChild(statusEl); body.appendChild(actions);
    row.appendChild(dot);
    row.appendChild(body);
    return row;
  }

  function renderSkillLines() {
    const listEl = document.getElementById('skillLinesList');
    listEl.innerHTML = '';
    skillLines.forEach(line => {
      const total = line.steps.length;
      const doneCount = line.steps.filter(st => st.doneDate).length;
      const curIdx = skillCurrentIdx(line);
      const collapsed = collapsedSkillLines.has(line.id);
      const card = document.createElement('div');
      card.className = 'skill-line';
      const head = document.createElement('div');
      head.className = 'skill-line-header';
      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'skill-line-title';
      titleBtn.innerHTML = `<i class="fa-solid ${collapsed ? 'fa-chevron-right' : 'fa-chevron-down'}" aria-hidden="true"></i>`;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = line.name;
      const prog = document.createElement('span');
      prog.className = 'skill-progress';
      prog.textContent = `${doneCount}/${total}`;
      titleBtn.appendChild(nameSpan);
      titleBtn.appendChild(prog);
      titleBtn.onclick = () => {
        if (collapsedSkillLines.has(line.id)) collapsedSkillLines.delete(line.id); else collapsedSkillLines.add(line.id);
        saveCollapsedSkills();
        renderSkillLines();
      };
      const lineActions = document.createElement('div');
      lineActions.className = 'skill-line-actions';
      lineActions.appendChild(skillMiniBtn('<i class="fa-solid fa-plus" aria-hidden="true"></i>', 'Add a step', () => openSkillStepModal(line.id, null)));
      lineActions.appendChild(skillMiniBtn('<i class="fa-solid fa-pencil" aria-hidden="true"></i>', 'Rename line', () => {
        const nn = prompt('Rename skill line', line.name);
        if (!nn || !nn.trim() || nn.trim() === line.name) return;
        if (skillLines.some(l => l.id !== line.id && l.name.toLowerCase() === nn.trim().toLowerCase())) { alert('A skill line with that name already exists.'); return; }
        line.name = nn.trim();
        saveSkills();
        renderSkillsPage();
      }));
      lineActions.appendChild(skillMiniBtn('<i class="fa-regular fa-trash-can" aria-hidden="true"></i>', 'Delete line', () => {
        if (!confirm(`Delete "${line.name}"${total ? ` and its ${total} step${total === 1 ? '' : 's'}` : ''}?`)) return;
        skillLines = skillLines.filter(l => l.id !== line.id);
        collapsedSkillLines.delete(line.id); saveCollapsedSkills();
        saveSkills();
        renderSkillsPage();
      }, 'danger'));
      head.appendChild(titleBtn);
      head.appendChild(lineActions);
      card.appendChild(head);
      if (total) {
        const bar = document.createElement('div');
        bar.className = 'skill-progress-bar';
        const fill = document.createElement('div');
        fill.style.width = Math.round(doneCount / total * 100) + '%';
        bar.appendChild(fill);
        card.appendChild(bar);
      }
      if (!collapsed) {
        if (!total) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.style.padding = '4px 0';
          empty.textContent = 'No steps yet — add the first one with +.';
          card.appendChild(empty);
        }
        line.steps.forEach((step, i) => card.appendChild(buildSkillStepRow(line, step, i, curIdx)));
      }
      listEl.appendChild(card);
    });
  }
  function renderSkillsPage() {
    renderSkillsNext();
    renderSkillLines();
    updateSkillsBadge();
    if (window.WorkoutApp && window.WorkoutApp.onSkillsRender) window.WorkoutApp.onSkillsRender();
  }

  // ---- step editor ----
  function fillSkillExerciseSelect(sel, current) {
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Not linked (I\'ll tick it off myself)';
    sel.appendChild(none);
    const seen = new Set();
    categories.forEach(cat => {
      const list = (exerciseLists[cat] || []).filter(e => !seen.has(e.name));
      if (!list.length) return;
      const og = document.createElement('optgroup');
      og.label = cat;
      list.forEach(e => {
        seen.add(e.name);
        const o = document.createElement('option');
        o.value = e.name;
        o.textContent = e.name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    if (current && !seen.has(current)) {
      const o = document.createElement('option');
      o.value = current;
      o.textContent = current + ' (not in library)';
      sel.insertBefore(o, sel.children[1] || null);
    }
    sel.value = current || '';
  }
  function fillSkillVariationSelect(exName, current) {
    const sel = document.getElementById('skillStepVariation');
    const list = exName ? exerciseVariations(exName) : [];
    const all = current && current !== '__none__' && !list.includes(current) ? list.concat(current) : list;
    sel.innerHTML = '';
    const any = document.createElement('option');
    any.value = ''; any.textContent = all.length ? 'Any variation' : 'No variations for this exercise';
    sel.appendChild(any);
    if (list.length) { const std = document.createElement('option'); std.value = '__none__'; std.textContent = 'Standard (no variation)'; sel.appendChild(std); }
    all.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    sel.value = current || '';
    sel.disabled = !all.length;
  }
  document.getElementById('skillStepExercise').onchange = () => fillSkillVariationSelect(document.getElementById('skillStepExercise').value || null, null);
  function updateSkillStepMetricUI() {
    document.getElementById('skillStepTargetLabel').textContent = document.getElementById('skillStepMetric').value === 'hold' ? 'Seconds per set' : 'Reps per set';
  }
  function openSkillStepModal(lineId, stepId) {
    const line = skillLines.find(l => l.id === lineId);
    if (!line) return;
    const step = stepId ? line.steps.find(st => st.id === stepId) : null;
    skillStepEditing = { lineId, stepId: step ? step.id : null };
    document.getElementById('skillStepModalTitle').textContent = (step ? 'Edit step' : 'Add step') + ' — ' + line.name;
    document.getElementById('skillStepName').value = step ? step.name : '';
    fillSkillExerciseSelect(document.getElementById('skillStepExercise'), step ? step.exercise : null);
    fillSkillVariationSelect(step ? step.exercise : null, step ? step.variation : null);
    document.getElementById('skillStepMetric').value = step ? step.metric : 'hold';
    document.getElementById('skillStepTarget').value = step ? step.target : 20;
    document.getElementById('skillStepSets').value = step ? step.sets : 3;
    updateSkillStepMetricUI();
    document.getElementById('skillStepModalOverlay').classList.remove('hidden');
    document.getElementById('skillStepName').focus();
  }
  function closeSkillStepModal() {
    document.getElementById('skillStepModalOverlay').classList.add('hidden');
    skillStepEditing = null;
  }
  document.getElementById('skillStepModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'skillStepModalOverlay') closeSkillStepModal(); });
  document.getElementById('skillStepCancelBtn').onclick = closeSkillStepModal;
  document.getElementById('skillStepMetric').onchange = () => {
    updateSkillStepMetricUI();
    // nudge the default target when the criterion type flips on a fresh step
    const t = document.getElementById('skillStepTarget');
    if (skillStepEditing && !skillStepEditing.stepId) t.value = document.getElementById('skillStepMetric').value === 'hold' ? 20 : 5;
  };
  document.getElementById('skillStepSaveBtn').onclick = () => {
    if (!skillStepEditing) return;
    const name = document.getElementById('skillStepName').value.trim();
    const target = Number(document.getElementById('skillStepTarget').value);
    const sets = Math.round(Number(document.getElementById('skillStepSets').value));
    if (!name) { alert('Give the step a name.'); return; }
    if (!(target > 0)) { alert('Enter a target greater than 0.'); return; }
    if (!(sets >= 1 && sets <= 20)) { alert('Sets must be between 1 and 20.'); return; }
    const line = skillLines.find(l => l.id === skillStepEditing.lineId);
    if (!line) { closeSkillStepModal(); return; }
    const fields = {
      name,
      exercise: document.getElementById('skillStepExercise').value || null,
      variation: document.getElementById('skillStepVariation').value || null,
      metric: document.getElementById('skillStepMetric').value === 'reps' ? 'reps' : 'hold',
      target, sets
    };
    if (skillStepEditing.stepId) {
      const step = line.steps.find(st => st.id === skillStepEditing.stepId);
      if (step) Object.assign(step, fields);
    } else {
      line.steps.push(Object.assign({ id: newSkillId(), doneDate: null }, fields));
    }
    saveSkills();
    closeSkillStepModal();
    renderSkillsPage();
  };
  ['skillStepName', 'skillStepTarget', 'skillStepSets'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('skillStepSaveBtn').click(); });
  });

  // ---- add lines ----
  document.getElementById('addSkillLineBtn').onclick = () => {
    const input = document.getElementById('newSkillLineInput');
    const name = input.value.trim();
    if (!name) return;
    if (skillLines.some(l => l.name.toLowerCase() === name.toLowerCase())) { alert('A skill line with that name already exists.'); return; }
    skillLines.push({ id: newSkillId(), name, steps: [] });
    saveSkills();
    input.value = '';
    renderSkillsPage();
  };
  document.getElementById('newSkillLineInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('addSkillLineBtn').click(); });
  // A library step can name its exercise (and variation): make sure you have that exercise, and use your copy of it.
  function templateExercise(st) {
    if (!st.exercise) return null;
    const lib = window.WorkoutLibrary && window.WorkoutLibrary.get();
    const c = lib && (lib.exercises || []).find(x => exKey(x.name) === exKey(st.exercise));
    const res = ensureExercises([c ? { name: c.name, category: c.category, isometric: c.isometric, unilateral: c.unilateral } : { name: st.exercise, category: 'Skill', isometric: st.metric === 'hold' }]);
    return res.refs.length ? res.refs[0].name : null;
  }
  // Adds skill lines from library templates: { name, steps: [{ name, metric, target, sets }] }
  function addSkillTemplates(templates) {
    let added = 0;
    (templates || []).forEach(ex => {
      if (!ex || !ex.name || skillLines.some(l => l.name.toLowerCase() === String(ex.name).toLowerCase())) return;
      const line = cleanSkillLine({
        name: ex.name,
        steps: (ex.steps || []).map(st => ({ name: st.name, metric: st.metric, target: st.target, sets: st.sets, exercise: templateExercise(st) || guessExerciseForStep(ex.name, st.name), variation: st.variation || null }))
      });
      if (line) { skillLines.push(line); added++; }
    });
    if (!added) return;
    saveSkills();
    renderSkillsPage();
    showToast('Progression added — edit a step to link it to one of your exercises');
  }

  // ---- Blocks: named groupings of exercises pulled from any category ----
  let assigningBlock = null; // name of the block currently showing its assignment checklist, or null

  function renderBlockSelect() {
    const sel = document.getElementById('blockSelect');
    if (!sel) return;
    if (activeBlock && (!blocks.includes(activeBlock) || hiddenBlocks.includes(activeBlock))) activeBlock = null;
    sel.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'No block';
    sel.appendChild(noneOpt);
    const visible = blocks.filter(name => !hiddenBlocks.includes(name));
    const addGroup = (label, names) => {
      if (!names.length) return;
      const parent = planBlocks.length ? Object.assign(document.createElement('optgroup'), { label }) : sel;
      names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        parent.appendChild(opt);
      });
      if (parent !== sel) sel.appendChild(parent);
    };
    addGroup('Blocks', visible.filter(n => !planBlocks.includes(n)));
    addGroup('Plans', visible.filter(n => planBlocks.includes(n)));
    sel.value = activeBlock || '';
    sel.onchange = () => { activeBlock = sel.value || null; updateExercisePicker(); render(); };
  }

  let blockListSort = 'added';
  function updateBlockSortBtn() {
    const btn = document.getElementById('blocksSortBtn');
    if (!btn) return;
    const alpha = blockListSort === 'alphabetical';
    btn.innerHTML = `<i class="fa-solid ${alpha ? 'fa-arrow-down-a-z' : 'fa-arrow-down-wide-short'}" aria-hidden="true"></i>`;
    btn.title = `Sort: ${alpha ? 'A–Z' : 'order added'} — tap to change`;
    btn.setAttribute('aria-label', `Sort: ${alpha ? 'A–Z' : 'order added'} (tap to change)`);
  }
  function renderBlockEditList() {
    updateBlockSortBtn();
    const listEl = document.getElementById('blockEditList');
    listEl.innerHTML = '';
    if (!blocks.length) {
      listEl.innerHTML = '<div class="empty" style="padding:4px 0;">No blocks yet — add one below.</div>';
    }
    const blocksInOrder = blockListSort === 'alphabetical' ? blocks.slice().sort((a, b) => a.localeCompare(b)) : blocks;
    blocksInOrder.forEach(name => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = `${name} (${(blockRefs[name] || []).length})`;

      const actions = document.createElement('div');
      actions.className = 'actions';

      const assignBtn = document.createElement('button');
      assignBtn.innerHTML = '<i class="fa-solid fa-list-check" aria-hidden="true"></i>';
      assignBtn.title = 'Assign exercises';
      assignBtn.setAttribute('aria-label', 'Assign exercises to ' + name);
      if (assigningBlock === name) assignBtn.classList.add('on');
      assignBtn.onclick = () => {
        assigningBlock = (assigningBlock === name) ? null : name;
        blockAssignSearchQuery = '';
        const searchInput = document.getElementById('blockAssignSearchInput');
        if (searchInput) searchInput.value = '';
        renderBlockEditList();
      };

      const isHidden = hiddenBlocks.includes(name);
      const eyeBtn = document.createElement('button');
      eyeBtn.className = isHidden ? '' : 'eye-on';
      eyeBtn.title = isHidden ? 'Hidden from home page — tap to show' : 'Visible on home page — tap to hide';
      eyeBtn.setAttribute('aria-label', (isHidden ? 'Show' : 'Hide') + ' ' + name + ' on home page');
      eyeBtn.innerHTML = `<i class="fa-solid fa-${isHidden ? 'eye-slash' : 'eye'}" aria-hidden="true"></i>`;
      eyeBtn.onclick = () => {
        hiddenBlocks = isHidden ? hiddenBlocks.filter(n => n !== name) : hiddenBlocks.concat(name);
        saveBlocks();
        renderBlockSelect();
        renderBlockEditList();
      };

      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
      renameBtn.onclick = () => renameBlock(name);

      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
      delBtn.onclick = () => deleteBlock(name);

      actions.appendChild(assignBtn);
      actions.appendChild(eyeBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
      row.appendChild(nameSpan);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
    decorateBulk(listEl, 'blocks', blocksInOrder);
    renderBlockAssignSection();
  }

  // Clicking a category name here only filters this checklist — it never navigates anywhere.
  let blockAssignSearchQuery = "";
  function renderBlockAssignSection() {
    const section = document.getElementById('blockAssignSection');
    if (!assigningBlock || !blocks.includes(assigningBlock)) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    document.getElementById('blockAssignName').textContent = assigningBlock;
    const listEl = document.getElementById('blockAssignChecklist');
    listEl.innerHTML = '';
    const included = new Set((blockRefs[assigningBlock] || []).map(r => r.name));
    const q = blockAssignSearchQuery.toLowerCase();
    let any = false;
    categories.forEach(cat => {
      const list = (exerciseLists[cat] || []).filter(e => !q || e.name.toLowerCase().includes(q));
      if (!list.length) return;
      any = true;
      const group = document.createElement('div');
      group.className = 'existing-ex-group';
      const groupLabel = document.createElement('div');
      groupLabel.className = 'existing-ex-group-label';
      groupLabel.textContent = cat;
      group.appendChild(groupLabel);
      list.forEach(e => {
        const row = document.createElement('label');
        row.className = 'existing-ex-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = included.has(e.name);
        cb.onchange = () => toggleBlockExercise(assigningBlock, e.name, cat, cb.checked);
        row.appendChild(cb);
        row.appendChild(document.createTextNode(e.name));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
        editBtn.onclick = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          openExerciseModal({ exObj: e, category: cat, onSaved: () => { renderBlockEditList(); renderAllExercisesList(); renderCatEditList(); } });
        };
        row.appendChild(editBtn);
        group.appendChild(row);
      });
      listEl.appendChild(group);
    });
    if (!any) listEl.innerHTML = `<div class="empty" style="padding:4px 0;">${q ? 'No matching exercises.' : 'Add some exercises to a category first.'}</div>`;
    let addRow = document.getElementById('blockAssignAddBtn');
    if (!addRow) {
      addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.id = 'blockAssignAddBtn';
      addRow.className = 'text-btn';
      addRow.style.marginTop = '8px';
      addRow.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add new exercise';
      document.getElementById('blockAssignSection').appendChild(addRow);
    }
    addRow.onclick = () => openExerciseModal({
      defaultCategory: categories[0],
      onSaved: (result) => {
        if (result) toggleBlockExercise(assigningBlock, result.name, result.category, true);
        renderBlockEditList();
      }
    });
  }
  document.getElementById('blockAssignSearchInput').addEventListener('input', (e) => {
    blockAssignSearchQuery = e.target.value.trim();
    renderBlockAssignSection();
  });

  function toggleBlockExercise(blockName, name, cat, isChecked) {
    if (!blockRefs[blockName]) blockRefs[blockName] = [];
    if (isChecked) {
      if (!blockRefs[blockName].some(r => r.name === name)) blockRefs[blockName].push({ name, refCategory: cat });
    } else {
      blockRefs[blockName] = blockRefs[blockName].filter(r => r.name !== name);
    }
    saveBlocks();
    renderBlockEditList();
    if (activeBlock === blockName) updateExercisePicker();
  }

  function renameBlock(oldName) {
    const newName = prompt('Rename block', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (blocks.includes(trimmed)) { alert('A block with that name already exists.'); return; }
    blocks = blocks.map(b => b === oldName ? trimmed : b);
    planBlocks = planBlocks.map(b => b === oldName ? trimmed : b);
    blockRefs[trimmed] = blockRefs[oldName];
    delete blockRefs[oldName];
    if (planMeta[oldName]) { planMeta[trimmed] = planMeta[oldName]; delete planMeta[oldName]; savePlanMeta(); }
    if (hiddenBlocks.includes(oldName)) hiddenBlocks = hiddenBlocks.filter(n => n !== oldName).concat(trimmed);
    if (activeBlock === oldName) activeBlock = trimmed;
    if (assigningBlock === oldName) assigningBlock = trimmed;
    saveBlocks();
    renderBlockSelect();
    renderBlockEditList();
    updateExercisePicker();
  }

  function deleteBlock(name) {
    if (!bulkQuiet && !confirm(`Delete block "${name}"? This only removes the block, not the exercises in it.`)) return;
    blocks = blocks.filter(b => b !== name);
    planBlocks = planBlocks.filter(b => b !== name);
    delete blockRefs[name];
    delete planMeta[name]; savePlanMeta();
    hiddenBlocks = hiddenBlocks.filter(n => n !== name);
    if (activeBlock === name) activeBlock = null;
    if (assigningBlock === name) assigningBlock = null;
    saveBlocks();
    renderBlockSelect();
    renderBlockEditList();
    updateExercisePicker();
  }

  // ---- Plans: starting a plan day builds a block from its exercises, so the picker shows only those ----
  const sameExName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const exKey = n => Shared.exKey(n);
  // items: [{ name, category, isometric, unilateral }]. Reuses an exercise you already have (matched by name),
  // otherwise adds it to the matching category. Returns the block refs and how many were new.
  function ensureExercises(items) {
    const refs = [], seen = new Set();
    let added = 0;
    const real = categories.slice();
    (items || []).forEach(it => {
      const key = exKey(it.name);
      if (!key || !real.length) return;
      if (seen.has(key)) {
        const dup = refs.find(r => exKey(r.name) === key);
        if (dup && it.part === 'plan' && dup.part !== 'plan') { dup.sets = it.sets; dup.target = it.target; dup.part = it.part; if (it.variation) dup.variation = it.variation; }
        return;
      }
      seen.add(key);
      let found = null;
      for (const cat of real) {
        const ex = (exerciseLists[cat] || []).find(e => exKey(e.name) === key);
        if (ex) { found = { name: ex.name, refCategory: cat }; break; }
      }
      if (!found) {
        const want = String(it.category || '').toLowerCase();
        const cat = categoryFor(want, real);
        if (!exerciseLists[cat]) exerciseLists[cat] = [];
        exerciseLists[cat].push({
          name: it.name, color: EX_COLOR_PALETTE[exerciseLists[cat].filter(e => e.color).length % EX_COLOR_PALETTE.length],
          isometric: !!it.isometric, unilateral: !!it.unilateral, pattern: it.pattern || undefined, createdAt: Date.now()
        });
        found = { name: it.name, refCategory: cat };
        added++;
      }
      if (it.variation) found.variation = it.variation;
      if (it.target) { found.target = it.target; found.sets = it.sets; found.part = it.part; }
      refs.push(found);
    });
    if (added) { saveLists(); updateExercisePicker(); }
    return { refs, added };
  }
  // Creates (or refreshes) the plan block and switches to it. Returns the block's final name.
  function startPlanBlock(name, refs) {
    let n = name;
    if (blocks.includes(n) && !planBlocks.includes(n)) n = n + ' (plan)'; // never overwrite one of your own blocks
    if (!blocks.includes(n)) blocks.push(n);
    blockRefs[n] = refs;
    if (!planBlocks.includes(n)) planBlocks.push(n);
    hiddenBlocks = hiddenBlocks.filter(h => h !== n);
    saveBlocks();
    const prev = selectedExercise;
    activeBlock = n;
    selectedExercise = '';
    if (prev) switchExerciseInputs(prev, '');
    if (activeSuperset) supersetMembers.clear();
    renderBlockSelect();
    updateExercisePicker();
    renderModifiers();
    render();
    navigateTo('home');
    showToast(`Started "${n}" — only its exercises are shown. Choose "No block" to leave.`);
    return n;
  }

  // ---- Variations: edit lists, and merge look-alike exercises (Wide, Archer, Pull up...) into one exercise + a variation ----
  function addCategoryIfMissing(name) {
    if (categories.includes(name)) return;
    categories.push(name); exerciseLists[name] = []; data[name] = [];
    getCategoryColor(name); saveLists(); saveData(); renderTabs();
  }
  // the library files core work under Core and stretches under Mobility; those categories are created when first needed
  function categoryFor(want, real) {
    const hit = real.find(c => c.toLowerCase() === want);
    if (hit) return hit;
    if (want === 'core' || want === 'mobility' || want === 'run') { const nm = want === 'core' ? 'Core' : want === 'run' ? 'Run' : 'Mobility'; addCategoryIfMissing(nm); return nm; }
    return real.find(c => c === 'Skill') || real[0];
  }
  // Moves an exercise and all its logged entries to another category.
  function refileExercise(name, from, to) {
    const obj = (exerciseLists[from] || []).find(e => e.name === name);
    if (!obj || from === to) return false;
    addCategoryIfMissing(to);
    if ((exerciseLists[to] || []).some(e => e.name.toLowerCase() === name.toLowerCase())) return false;
    exerciseLists[from] = exerciseLists[from].filter(e => e !== obj);
    exerciseLists[to].push(obj);
    const moving = (data[from] || []).filter(e => sameExName(e.exercise, name));
    moving.forEach(e => { e.updatedAt = Date.now(); }); // so other devices pick up the move
    data[from] = (data[from] || []).filter(e => !sameExName(e.exercise, name));
    data[to] = (data[to] || []).concat(moving);
    blocks.forEach(b => (blockRefs[b] || []).forEach(r => { if (r.name === name && r.refCategory === from) r.refCategory = to; }));
    if (selectedExercise === name) selectedExercise = '';
    saveLists(); saveData(); saveBlocks();
    return true;
  }
  // movement pattern of an exercise: your own choice, else the library's, else a guess from the name
  function libPattern(name) {
    const lib = window.WorkoutLibrary && window.WorkoutLibrary.get();
    if (!lib || !Array.isArray(lib.exercises)) return '';
    const k = exKey(name);
    const hit = lib.exercises.find(c => exKey(c.name) === k || (c.aliases || []).some(a => exKey(a) === k));
    return hit && hit.pattern ? hit.pattern : '';
  }
  function fillMissingPatterns() {
    let n = 0;
    categories.forEach(cat => (exerciseLists[cat] || []).forEach(e => {
      if (e.pattern) return;
      const p = libPattern(e.name) || Shared.guessPattern(e.name);
      if (p) { e.pattern = p; n++; }
    }));
    if (n) saveLists();
    return n;
  }
  function logRoutineEntry(name, seconds, notes) {
    const res = ensureExercises([{ name, category: 'Mobility', isometric: true, unilateral: false, pattern: 'mobility' }]);
    const ref = res.refs[0];
    if (!ref) return false;
    const cat = ref.refCategory;
    if (!data[cat]) data[cat] = [];
    data[cat].push({
      id: Date.now().toString(), updatedAt: Date.now(), date: dateInput.value || skillToday(), exercise: ref.name,
      isometric: true, unilateral: false, notes: notes || '', supersetId: null,
      sets: [{ reps: Math.max(1, Math.round(seconds)), eccentric: null, kg: null, angle: null, equipment: null, variation: null }],
      attempts: [], distance: null, isPR: false
    });
    saveData();
    renderEntries(); renderCalendar(); updateExercisePicker();
    showToast('Routine logged as one entry');
    return true;
  }
  const MERGE_UNDO_KEY = 'workout-log-premerge-v1';
  // Entries can carry a name that has no exercise in your lists (deleted or renamed exercise). The merge tool treats those as exercises too.
  function orphanSource(cat, name) {
    const es = (data[cat] || []).filter(e => sameExName(e.exercise, name));
    if (!es.length) return null;
    return { name, color: null, isometric: !!es[0].isometric, unilateral: !!es[0].unilateral, orphan: true };
  }
  function listExercisesForVariations() {
    const out = [];
    categories.forEach(cat => (exerciseLists[cat] || []).forEach(e => {
      out.push({
        category: cat, name: e.name, color: e.color || getCategoryColor(cat), isometric: !!e.isometric, unilateral: !!e.unilateral,
        custom: Array.isArray(e.variations) && e.variations.length ? e.variations.slice() : null,
        effective: exerciseVariations(e.name),
        entries: (data[cat] || []).filter(x => sameExName(x.exercise, e.name)).length
      });
    }));
    const known = new Set();
    categories.forEach(c => (exerciseLists[c] || []).forEach(e => known.add(String(e.name).trim().toLowerCase())));
    categories.forEach(cat => {
      const seen = new Set();
      (data[cat] || []).forEach(e => {
        const k = String(e.exercise || '').trim().toLowerCase();
        if (!k || known.has(k) || seen.has(k)) return;
        seen.add(k);
        const o = orphanSource(cat, e.exercise);
        out.push({ category: cat, name: e.exercise, color: getCategoryColor(cat), isometric: o.isometric, unilateral: o.unilateral, custom: null, effective: [], orphan: true, entries: (data[cat] || []).filter(x => sameExName(x.exercise, e.exercise)).length });
      });
    });
    return out;
  }
  function setCustomVariations(cat, name, list) {
    const ex = (exerciseLists[cat] || []).find(e => e.name === name);
    if (!ex) return false;
    const clean = Array.from(new Set((list || []).map(v => String(v).trim()).filter(Boolean)));
    if (clean.length) ex.variations = clean; else delete ex.variations;
    saveLists();
    updateMetricsSection(currentExerciseName());
    return true;
  }
  function snapshotForUndo() {
    const snap = { at: Date.now(), keys: {} };
    [DATA_KEY, LISTS_KEY, BLOCKS_KEY, SKILLS_KEY].forEach(k => { snap.keys[k] = localStorage.getItem(k); });
    try { localStorage.setItem(MERGE_UNDO_KEY, JSON.stringify(snap)); } catch (e) { return false; }
    return true;
  }
  function hasMergeUndo() { try { return !!JSON.parse(localStorage.getItem(MERGE_UNDO_KEY)); } catch (e) { return false; } }
  function undoLastMerge() {
    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(MERGE_UNDO_KEY)); } catch (e) { return false; }
    if (!snap || !snap.keys) return false;
    Object.keys(snap.keys).forEach(k => { if (snap.keys[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, snap.keys[k]); });
    localStorage.removeItem(MERGE_UNDO_KEY);
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    window.removeEventListener('pagehide', saveSession); // don't re-save the pre-undo state on the way out
    location.reload();
    return true;
  }
  // tgt: { name, category (preferred / for a new one), isometric, unilateral (only used when it has to be created) }
  function planMerge(srcCat, srcName, tgt, variation) {
    const src = (exerciseLists[srcCat] || []).find(e => e.name === srcName) || orphanSource(srcCat, srcName);
    if (!src) return { ok: false, reason: 'That exercise no longer exists.' };
    const real = categories.slice();
    let tgtCat = null, tgtObj = null;
    for (const c of [tgt.category].concat(real)) {
      if (!c || !real.includes(c)) continue;
      const f = (exerciseLists[c] || []).find(e => e !== src && exKey(e.name) === exKey(tgt.name));
      if (f) { tgtCat = c; tgtObj = f; break; }
    }
    const creating = !tgtObj;
    if (creating && exKey(tgt.name) === exKey(srcName) && !variation) return { ok: false, reason: 'That is the same exercise.' };
    if (creating) tgtCat = real.includes(tgt.category) ? tgt.category : srcCat;
    const tgtIso = creating ? (tgt.isometric !== undefined ? !!tgt.isometric : !!src.isometric) : !!tgtObj.isometric;
    const tgtUni = creating ? (tgt.unilateral !== undefined ? !!tgt.unilateral : !!src.unilateral) : !!tgtObj.unilateral;
    const tgtName = creating ? tgt.name : tgtObj.name;
    if (!!src.isometric !== tgtIso && !(isDistanceExercise(srcName) && isDistanceExercise(tgtName))) {
      return { ok: false, reason: `${srcName} counts ${src.isometric ? 'seconds' : 'reps'} but ${tgtName} counts ${tgtIso ? 'seconds' : 'reps'}, so they can't share one exercise.` };
    }
    const entries = (data[srcCat] || []).filter(e => sameExName(e.exercise, srcName));
    const setCount = entries.reduce((n, e) => n + (e.sets || []).length, 0);
    return {
      ok: true, creating, srcCat, srcName, tgtCat, tgtName, tgtIso, tgtUni, variation: variation || null,
      entries: entries.length, sets: setCount,
      sides: (!!src.unilateral !== tgtUni && !(variation && isOneSidedVariation(tgtName, variation))) ? (src.unilateral ? 'weaker side' : 'both sides') : null
    };
  }
  function applyMerge(srcCat, srcName, tgt, variation) {
    const p = planMerge(srcCat, srcName, tgt, variation);
    if (!p.ok) return p;
    const src = (exerciseLists[srcCat] || []).find(e => e.name === srcName) || orphanSource(srcCat, srcName);
    let tgtObj = (exerciseLists[p.tgtCat] || []).find(e => e.name === p.tgtName);
    if (!tgtObj) {
      tgtObj = { name: p.tgtName, color: src.color || null, isometric: p.tgtIso, unilateral: p.tgtUni, createdAt: Date.now() };
      (exerciseLists[p.tgtCat] = exerciseLists[p.tgtCat] || []).push(tgtObj);
    }
    const moved = (data[srcCat] || []).filter(e => sameExName(e.exercise, srcName));
    data[srcCat] = (data[srcCat] || []).filter(e => !sameExName(e.exercise, srcName));
    if (!data[p.tgtCat]) data[p.tgtCat] = [];
    moved.forEach(e => {
      e.exercise = tgtObj.name; e.isometric = !!tgtObj.isometric; e.unilateral = !!tgtObj.unilateral;
      e.updatedAt = Date.now(); // so other devices pick up the merge
      if (variation && e.distance != null && !(e.sets && e.sets.length) && !e.variation) e.variation = variation; // runs have no sets, so the variation sits on the entry
      (e.sets || []).forEach(s => {
        if (!s || typeof s !== 'object') return;
        if (variation && !s.variation) s.variation = variation;
        if (p.sides === 'weaker side' && s.left !== undefined) { s.reps = Math.min(Number(s.left) || 0, Number(s.right) || 0); delete s.left; delete s.right; }
        else if (p.sides === 'both sides' && s.reps !== undefined) { s.left = s.reps; s.right = s.reps; delete s.reps; }
      });
      data[p.tgtCat].push(e);
    });
    // blocks, plan blocks and skill steps that pointed at the old exercise now point at the new one
    Object.keys(blockRefs).forEach(b => {
      const seen = new Set();
      blockRefs[b] = (blockRefs[b] || []).map(r => (r && r.name === srcName && r.refCategory === srcCat)
        ? Object.assign({}, r, { name: tgtObj.name, refCategory: p.tgtCat }, (variation && !r.variation) ? { variation } : {}) : r)
        .filter(r => { const k = r.refCategory + '|' + r.name; if (seen.has(k)) return false; seen.add(k); return true; });
    });
    skillLines.forEach(l => (l.steps || []).forEach(st => { if (st.exercise === srcName) st.exercise = tgtObj.name; }));
    exerciseLists[srcCat] = (exerciseLists[srcCat] || []).filter(e => e !== src);
    if (srcName.toLowerCase() !== tgtObj.name.toLowerCase()) markExerciseRemoved(srcName);
    delete exerciseDrafts[srcName];
    if (selectedExercise === srcName) { selectedExercise = ''; switchExerciseInputs('', ''); }
    if (variation && !exerciseVariations(tgtObj.name).includes(variation)) tgtObj.variations = exerciseVariations(tgtObj.name).concat(variation);
    recalcPRs(tgtObj.name);
    saveData(); saveLists(); saveBlocks(); saveSkills();
    renderBlockSelect(); updateExercisePicker(); renderModifiers(); render();
    return Object.assign({}, p, { moved: moved.length });
  }
  function deletePlanBlocks(names) {
    const gone = (names || []).filter(n => planBlocks.includes(n));
    if (!gone.length) return;
    blocks = blocks.filter(b => !gone.includes(b));
    planBlocks = planBlocks.filter(b => !gone.includes(b));
    gone.forEach(n => { delete blockRefs[n]; delete planMeta[n]; });
    savePlanMeta();
    hiddenBlocks = hiddenBlocks.filter(h => !gone.includes(h));
    if (gone.includes(activeBlock)) activeBlock = null;
    saveBlocks();
    renderBlockSelect();
    updateExercisePicker();
  }

  const newBlockInput = document.getElementById('newBlockInput');
  document.getElementById('addBlockBtn').onclick = () => {
    const name = newBlockInput.value.trim();
    if (!name) return;
    if (blocks.includes(name)) { alert('That block already exists.'); return; }
    blocks.push(name);
    blockRefs[name] = [];
    newBlockInput.value = '';
    saveBlocks();
    renderBlockSelect();
    renderBlockEditList();
  };
  newBlockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('addBlockBtn').click(); });
  document.getElementById('blocksSortBtn').onclick = () => {
    blockListSort = (blockListSort === 'added') ? 'alphabetical' : 'added';
    renderBlockEditList();
  };

  // ---- Exercise picker + sorting + edit (add / delete / recolor / reps-vs-isometric) ----
  function activeHasExerciseList() {
    return getDisplayExerciseList().length > 0;
  }
  function currentExerciseName() {
    return activeHasExerciseList() ? selectedExercise : exerciseText.value.trim();
  }

  function sortedExerciseList() {
    let list = getDisplayExerciseList();
    if (sortMode === 'alphabetical') list.sort((a, b) => a.exObj.name.localeCompare(b.exObj.name));
    return list;
  }

  // ---- Last time: what you did last on this exercise (and variation), shown as placeholder text and a line above the sets ----
  function shortDate(iso) { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function lastSessionFor(name, variation) {
    let best = null;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.exercise !== name || !Array.isArray(e.sets)) return;
      const key = entryKey(e);
      if (best && key <= best.key) return;
      const sets = e.sets.filter(st => st && typeof st === 'object' && (variation === undefined || setVar(st) === variation));
      if (sets.length) best = { key, e, sets };
    }));
    return best;
  }
  function lastAttemptsFor(name) {
    let best = null;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.exercise !== name || !Array.isArray(e.attempts) || !e.attempts.length) return;
      const key = entryKey(e);
      if (!best || key > best.key) best = { key, e };
    }));
    return best ? best.e.attempts : null;
  }
  function lastDistanceFor(name, variation) {
    let best = null;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.exercise !== name || e.distance == null || (variation !== undefined && (e.variation || '') !== variation)) return;
      const key = entryKey(e);
      if (!best || key > best.key) best = { key, e };
    }));
    return best ? best.e : null;
  }
  function setBrief(st, iso) {
    const u = iso ? 's' : '';
    const val = st.left !== undefined ? `${st.left}/${st.right}${u}` : `${st.reps}${u}`;
    const kg = st.kg != null && st.kg !== '' && Number(st.kg) !== 0 ? ' ' + formatLoadKg(st.kg) : '';
    return val + kg;
  }
  function lastTimeText(name) {
    if (!name || !showLast) return '';
    if (isDistanceExercise(name)) {
      const dv = (document.getElementById('distVarSelect') || {}).value;
      const d = lastDistanceFor(name, dv || undefined);
      if (!d) return '';
      return `Last time (${shortDate(d.date)}): ${round2(kmToDisplay(d.distance))}${distanceUnitLabel()}` + (d.timeMinutes != null ? ' · ' + formatDuration(d.timeMinutes) : '');
    }
    if (isIsometricExercise(name) && holdMode === 'attempts') {
      const a = lastAttemptsFor(name);
      return a ? `Last attempts: ${a.join('s, ')}s` : '';
    }
    const hasVars = exerciseVariations(name).length > 0;
    const v = hasVars ? ((document.getElementById('var1') || {}).value || '') : undefined;
    const ses = lastSessionFor(name, v);
    if (!ses) return '';
    return `Last time (${shortDate(ses.e.date)})${v ? ' · ' + v : ''}: ` + ses.sets.map(st => setBrief(st, !!ses.e.isometric)).join(' · ');
  }
  function applyLastTimePlaceholders(name) {
    if (!name) return;
    if (!showLast) { resetEccPlaceholders(); return; }
    const hasVars = exerciseVariations(name).length > 0;
    const cache = {}, used = {};
    for (let i = 1; i <= numSets; i++) {
      const v = hasVars ? ((document.getElementById('var' + i) || {}).value || '') : undefined;
      const k = v === undefined ? '*' : v;
      if (!(k in cache)) cache[k] = lastSessionFor(name, v);
      const ses = cache[k];
      const ord = used[k] || 0; used[k] = ord + 1;
      if (!ses || !ses.sets.length) continue;
      const st = ses.sets[ord] || ses.sets[ses.sets.length - 1];
      const el = id => document.getElementById(id + i);
      const lr = el('lr');
      if (lr && !lr.classList.contains('hidden')) {
        el('left').placeholder = String(st.left !== undefined ? st.left : st.reps);
        el('right').placeholder = String(st.right !== undefined ? st.right : st.reps);
      } else if (el('set')) {
        el('set').placeholder = String(st.left !== undefined ? Math.min(Number(st.left) || 0, Number(st.right) || 0) : st.reps);
      }
      if (st.eccentric != null && el('ecc')) el('ecc').placeholder = String(st.eccentric);
      if (st.kg != null && st.kg !== '' && el('kg')) el('kg').placeholder = String(round2(kgToDisplay(Number(st.kg))));
    }
  }
  function fillDistVarSelect(name) {
    const sel = document.getElementById('distVarSelect'), row = document.getElementById('distVarRow');
    if (!sel || !row) return;
    const list = name ? exerciseVariations(name) : [];
    row.classList.toggle('hidden', !list.length);
    const keep = sel.value;
    sel.innerHTML = '<option value="">Variation</option>';
    list.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    sel.value = list.includes(keep) ? keep : '';
  }
  (function () { const sel = document.getElementById('distVarSelect'); if (sel) sel.addEventListener('change', () => renderModifiers()); })();
  function isSAName(name) { const o = findExerciseOwner(name); return Shared.isStraightArm(o && o.exObj, name); }
  function allEntriesFlat() { const out = []; categories.forEach(c => (data[c] || []).forEach(e => out.push(e))); return out; }
  function renderModifiers() {
    const name = currentExerciseName();
    modifiersRow.innerHTML = '';

    if (isUnilateralExercise(name)) {
      const tag = document.createElement('span');
      tag.className = 'modifier';
      tag.innerHTML = `<i class="fa-solid fa-arrows-up-down" aria-hidden="true"></i> Left/right values per set`;
      modifiersRow.appendChild(tag);
    }

    if (name && isDistanceExercise(name)) {
      const b = computeExerciseBests(name, exerciseVariations(name).length ? ((document.getElementById('distVarSelect') || {}).value || '') : undefined);
      const addTag = html => { const tag = document.createElement('span'); tag.className = 'modifier'; tag.innerHTML = html; modifiersRow.appendChild(tag); };
      if (b.bestDistance !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Longest: ${round2(kmToDisplay(b.bestDistance))}${distanceUnitLabel()}`);
      if (b.bestTime !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Longest time: ${formatDuration(b.bestTime)}`);
      if (b.bestElevation !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Max elevation: ${round2(mToDisplay(b.bestElevation))}${elevationUnitLabel()}`);
      if (b.bestPaceMinPerKm !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Best pace: ${formatPace(b.bestPaceMinPerKm)}/km`);
    } else if (name && isIsometricExercise(name)) {
      const vk = bestVarKey(name);
      const b = computeExerciseBests(name, vk);
      if (b.bestHold !== null) {
        const tag = document.createElement('span');
        tag.className = 'modifier';
        tag.innerHTML = `<i class="fa-solid fa-trophy" aria-hidden="true"></i> Best hold${bestVarLabel(name, vk)}: ${b.bestHold}s`;
        modifiersRow.appendChild(tag);
      }
    } else if (name) {
      const vk = bestVarKey(name);
      const b = computeExerciseBests(name, vk);
      const vl = bestVarLabel(name, vk);
      const addTag = html => { const tag = document.createElement('span'); tag.className = 'modifier'; tag.innerHTML = html; modifiersRow.appendChild(tag); };
      if (b.bestReps !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Best reps${vl}: ${b.bestReps}`);
      if (b.bestWeight !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Best weight${vl}: ${formatLoadKg(b.bestWeight)}`);
      if (b.bestE1RM !== null) addTag(`<i class="fa-solid fa-trophy" aria-hidden="true"></i> Est. 1RM${vl}: ${round2(kgToDisplay(b.bestE1RM))}${weightUnitLabel()}`);
    }

    const lastText = lastTimeText(name);
    if (lastText) {
      const tag = document.createElement('span');
      tag.className = 'modifier';
      tag.innerHTML = '<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ';
      tag.appendChild(document.createTextNode(lastText));
      modifiersRow.appendChild(tag);
    }

    if (name && isSAName(name)) {
      const rep = Shared.straightArmReport(allEntriesFlat(), isSAName, weekStart, skillToday());
      const warn = rep.flags.find(f => f[0] === 'warn');
      if (warn) {
        const tag = document.createElement('span');
        tag.className = 'modifier';
        tag.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ';
        tag.appendChild(document.createTextNode(warn[1].split('. ')[0] + '.'));
        modifiersRow.appendChild(tag);
      }
    }

    const skillHint = skillHintFor(name);
    if (skillHint) {
      const tag = document.createElement('span');
      tag.className = 'modifier';
      tag.innerHTML = '<i class="fa-solid fa-medal" aria-hidden="true"></i> ';
      tag.appendChild(document.createTextNode(skillHint));
      modifiersRow.appendChild(tag);
    }

    updateMetricsSection(name);
  }

  function updateMetricsSection(name) {
    syncChainPills();
    const holdModeToggleBtn = document.getElementById('holdModeToggleBtn');
    if (window.WorkoutApp && window.WorkoutApp.onMetricsUpdate) window.WorkoutApp.onMetricsUpdate({ isometric: !!name && isIsometricExercise(name) && !isDistanceExercise(name), distance: isDistanceExercise(name) });
    if (isDistanceExercise(name)) {
      metricsLabel.textContent = 'Distance, elevation & time';
      document.getElementById('setsWrap').classList.add('hidden');
      document.getElementById('attemptsWrap').classList.add('hidden');
      holdModeToggleBtn.classList.add('hidden');
      distanceRow.classList.remove('hidden');
      document.getElementById('distanceInputLabel').textContent = 'Distance (' + distanceUnitLabel().toUpperCase() + ')';
      document.getElementById('ruckKgInputLabel').textContent = 'Rucking (' + weightUnitLabel() + ')';
      document.getElementById('elevationInputLabel').textContent = 'Elevation (' + elevationUnitLabel() + ')';
      fillDistVarSelect(name);
      const dvSel = (document.getElementById('distVarSelect') || {}).value;
      const ld = name && showLast ? lastDistanceFor(name, dvSel || undefined) : null;
      if (name && !dvSel && ld && ld.variation && exerciseVariations(name).includes(ld.variation)) document.getElementById('distVarSelect').value = ld.variation;
      distanceInput.placeholder = ld && ld.distance != null ? String(round2(kmToDisplay(ld.distance))) : '0.0';
      document.getElementById('timeInput').placeholder = ld && ld.timeMinutes != null ? timeMinutesToInputString(ld.timeMinutes) : '0:00';
      document.getElementById('ruckKgInput').placeholder = ld && ld.ruckKg != null ? String(round2(kgToDisplay(ld.ruckKg))) : '0';
      document.getElementById('elevationInput').placeholder = ld && ld.elevation != null ? String(round2(mToDisplay(ld.elevation))) : '0';
      return;
    }
    distanceRow.classList.add('hidden');
    const isometric = isIsometricExercise(name);
    const unilateral = isUnilateralExercise(name);
    if (!isometric) holdMode = 'sets'; // attempts mode only makes sense for isometric holds
    holdModeToggleBtn.classList.toggle('hidden', !isometric);
    holdModeToggleBtn.classList.toggle('on', holdMode === 'attempts');
    holdModeToggleBtn.setAttribute('aria-pressed', String(holdMode === 'attempts'));

    const showAttempts = isometric && holdMode === 'attempts';
    document.getElementById('setsWrap').classList.toggle('hidden', showAttempts);
    document.getElementById('attemptsWrap').classList.toggle('hidden', !showAttempts);

    if (showAttempts) {
      metricsLabel.textContent = 'Attempts (sec)';
      const la = name && showLast ? lastAttemptsFor(name) : null;
      for (let i = 1; i <= numAttempts; i++) { const el = document.getElementById('attempt' + i); if (el) el.placeholder = la && la[i - 1] != null ? String(la[i - 1]) : 'sec'; }
      return;
    }

    const unit = isometric ? 'hold s' : 'reps';
    const leverage = hasLeverageTag(name);
    const labelParts = [(isometric ? 'Hold (sec)' : 'Reps') + (unilateral ? ' (L/R)' : '')];
    if (!isometric) labelParts.push('eccentric (sec)');
    labelParts.push('kg per set');
    if (leverage) labelParts.push('angle/leverage');
    metricsLabel.textContent = labelParts.join(' & ');
    setsGrid.querySelectorAll('.ecc-field').forEach(f => f.classList.toggle('hidden', isometric));
    setsGrid.querySelectorAll('.angle-field').forEach(f => f.classList.toggle('hidden', !leverage));
    const varList = exerciseVariations(name);
    setsGrid.querySelectorAll('.variation-field').forEach(f => f.classList.toggle('hidden', !varList.length));
    setsGrid.querySelectorAll('.var-select').forEach(sel => fillVarSelect(sel));
    for (let i = 1; i <= numSets; i++) {
      const primary = document.getElementById('set' + i);
      const lr = document.getElementById('lr' + i);
      const left = document.getElementById('left' + i);
      const right = document.getElementById('right' + i);
      const kgInput = document.getElementById('kg' + i);
      if (kgInput) kgInput.placeholder = '±' + weightUnitLabel();
      const primaryLabel = document.querySelector('label[for="set' + i + '"]');
      if (primaryLabel) primaryLabel.textContent = isometric ? 'Isometric' : 'Reps';
      if (!primary || !lr) continue;
      if (unilateral || setIsUni(name, i)) {
        primary.classList.add('hidden');
        lr.classList.remove('hidden');
        left.placeholder = 'L ' + unit;
        right.placeholder = 'R ' + unit;
      } else {
        primary.classList.remove('hidden');
        lr.classList.add('hidden');
        primary.placeholder = unit;
      }
    }
  applyLastTimePlaceholders(name);
  }

  let draggedExerciseName = null;
  function reorderExercise(draggedName, targetName) {
    // A block reorders its own reference list; every other tab reorders its real list.
    const arr = activeBlock ? blockRefs[activeBlock] : exerciseLists[active];
    if (!arr) return;
    const fromIdx = arr.findIndex(e => e.name === draggedName);
    const toIdx = arr.findIndex(e => e.name === targetName);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    if (sortMode !== 'ascending') {
      sortMode = 'ascending';
      renderSortToggle();
    }
    if (activeBlock) saveBlocks(); else saveLists();
    updateExercisePicker();
    showToast('Exercise order updated');
  }

  function targetText(ref) {
    if (!ref || !ref.target) return '';
    const t = String(ref.target).replace(/\s*reps?\b/i, '').trim();
    return ref.sets > 1 ? ref.sets + ' × ' + t : t;
  }
  function namesLoggedOn(date) {
    const set = new Set();
    categories.forEach(cat => (data[cat] || []).forEach(e => { if (e.date === date) set.add(e.exercise); }));
    return set;
  }
  function recordPlanSession(pm, date) {
    if (!pm.uid || !pm.weeks) return;
    const p = planProgress[pm.uid] || (planProgress[pm.uid] = { started: date, sessions: [] });
    const day = pm.dayIdx == null ? 0 : pm.dayIdx;
    if (p.sessions.some(x => x.date === date && x.day === day)) return;
    p.sessions.push({ date, day });
    p.sessions.sort((a, b) => a.date.localeCompare(b.date));
    p.started = p.sessions[0].date;
    savePlanProgress();
  }
  function renderPlanStrip() {
    const el = document.getElementById('planStrip');
    if (!el) return;
    const pm = activeBlock ? planMeta[activeBlock] : null;
    if (!pm || !planBlocks.includes(activeBlock)) { el.classList.add('hidden'); return; }
    const refs = blockRefs[activeBlock] || [];
    const date = dateInput.value;
    const done = namesLoggedOn(date);
    const doneCount = refs.filter(r => done.has(r.name)).length;
    const names = pm.dayNames || [];
    const dayName = pm.dayIdx != null && names[pm.dayIdx] ? names[pm.dayIdx] : '';
    let html = `<div class="plan-title">${escapeHtml(pm.name)}${dayName ? ' · ' + escapeHtml(dayName) : ''}</div>`;
    if (pm.weeks) {
      const p = planProgress[pm.uid] || { sessions: [] };
      const dpw = pm.dpw || names.length || 1, total = pm.weeks * dpw;
      const dayIdx = pm.dayIdx == null ? 0 : pm.dayIdx;
      const at = p.sessions.findIndex(x => x.date === date && x.day === dayIdx);
      const idx = at >= 0 ? at : p.sessions.length;
      if (idx >= total) {
        html += `<div class="plan-line">Programme complete (${p.sessions.length} sessions). Next: take a deload week, then move up a level.</div>`;
      } else {
        const week = Math.floor(idx / dpw) + 1;
        html += `<div class="plan-line">Week ${week} of ${pm.weeks} · session ${idx + 1} of ${total}</div>`;
        if (idx + 1 >= total) html += '<div class="plan-line">Next: this is the last session of the programme.</div>';
        else {
          const nextDay = names.length ? names[(dayIdx + 1) % names.length] : 'next session';
          const nextWeek = Math.floor((idx + 1) / dpw) + 1;
          html += `<div class="plan-line">Next: ${escapeHtml(nextDay)}${nextWeek > week ? ` · starts week ${nextWeek}, so apply the progression` : ''}</div>`;
        }
      }
    }
    if (refs.length) html += `<div class="plan-line">${doneCount} of ${refs.length} exercises done${doneCount === refs.length ? ' · session complete 🎉' : ''}</div>`;
    if (pm.progression) html += `<details class="plan-note"><summary>Progression</summary><p>${escapeHtml(pm.progression)}</p></details>`;
    el.innerHTML = html;
    el.classList.remove('hidden');
  }
  function updateExercisePicker() {
    const inBlock = !!activeBlock;
    const list = sortedExerciseList();
    if (!list.some(pair => pair.exObj.name === selectedExercise)) selectedExercise = "";
    exerciseGrid.innerHTML = '';
    if (list.length) {
      exerciseGrid.classList.remove('hidden');
      exerciseText.classList.add('hidden');
      let colorsAssigned = false;
      const pending = [];
      const doneNames = activeBlock ? namesLoggedOn(dateInput.value) : new Set();
      const planRefs = activeBlock ? (blockRefs[activeBlock] || []) : [];
      list.forEach(({ exObj, originCategory }) => {
        if (!exObj.color) colorsAssigned = true;
        ensureExerciseColor(originCategory, exObj);
        const ref = planRefs.find(r => r.name === exObj.name);
        const tgt = targetText(ref);
        const done = !!activeBlock && doneNames.has(exObj.name);
        const wrap = document.createElement('div');
        wrap.className = 'ex-btn-wrap';
        const b = document.createElement('button');
        b.className = 'ex-btn' + (exObj.name === selectedExercise ? ' selected' : '') + (activeSuperset && supersetMembers.has(exObj.name) ? ' ss-member' : '') + (done ? ' ex-done' : '');
        b.type = 'button';
        b.innerHTML = `${done ? '<i class="fa-solid fa-circle-check ex-done-ic" aria-hidden="true"></i>' : `<span class="dot" style="background:${exObj.color}"></span>`}<span>${escapeHtml(exObj.name)}</span>${tgt ? `<span class="iso-tag target-tag">${escapeHtml(tgt)}</span>` : ''}` +
          (isDistanceExercise(exObj.name)
            ? '<span class="iso-tag attr-tag">KM</span>'
            : (exObj.isometric ? '<span class="iso-tag attr-tag">ISO</span>' : '') +
              `<span class="iso-tag attr-tag${exObj.unilateral ? '' : ' attr-tag-muted'}">${exObj.unilateral ? 'UNI' : 'BI'}</span>` +
              (exObj.hasLeverage ? '<span class="iso-tag attr-tag">LEV</span>' : '')) +
          ((inBlock) ? `<span class="iso-tag origin-tag" style="background:${getCategoryColor(originCategory)}">${escapeHtml(originCategory)}</span>` : '');
        b.onclick = () => {
          if (exEditMode) return; // dragging takes over the click while editing
          const prevExercise = selectedExercise;
          if (activeSuperset) {
            // superset: tap to add an exercise (and edit it); tap the one you're on to drop it
            if (supersetMembers.has(exObj.name) && selectedExercise === exObj.name) { supersetMembers.delete(exObj.name); selectedExercise = ""; }
            else { supersetMembers.add(exObj.name); selectedExercise = exObj.name; }
          } else {
            selectedExercise = (selectedExercise === exObj.name) ? "" : exObj.name;
          }
          if (selectedExercise !== prevExercise) switchExerciseInputs(prevExercise, selectedExercise);
          updateExercisePicker();
          renderModifiers();
          if (activeSuperset) updateSupersetUI();
        };
        wrap.appendChild(b);
        if (exEditMode) {
          wrap.draggable = true;
          wrap.classList.add('draggable');
          wrap.ondragstart = (e) => {
            draggedExerciseName = exObj.name;
            wrap.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
          };
          wrap.ondragend = () => {
            wrap.classList.remove('dragging');
            draggedExerciseName = null;
          };
          wrap.ondragover = (e) => {
            e.preventDefault();
            wrap.classList.add('drag-over');
          };
          wrap.ondragleave = () => wrap.classList.remove('drag-over');
          wrap.ondrop = (e) => {
            e.preventDefault();
            wrap.classList.remove('drag-over');
            if (draggedExerciseName && draggedExerciseName !== exObj.name) {
              reorderExercise(draggedExerciseName, exObj.name);
            }
          };
          const del = document.createElement('button');
          del.className = 'ex-del';
          del.innerHTML = '&times;';
          del.setAttribute('aria-label', activeBlock ? 'Remove from block' : 'Delete exercise');
          del.onclick = (e) => {
            e.stopPropagation();
            if (activeBlock) removeFromBlock(activeBlock, exObj.name);
            else deleteExercise(exObj.name, originCategory);
          };
          wrap.appendChild(del);
        }
        pending.push({ wrap, w: exObj.name.length * 8.5 + 70 + (inBlock ? originCategory.length * 6.5 + 16 : 0) + (tgt ? tgt.length * 6.5 + 14 : 0) });
      });
      // side by side, in 3 rows: each button goes to the row that is shortest so far; the block scrolls sideways
      const rows = [0, 1, 2].map(() => { const r = document.createElement('div'); r.className = 'ex-row'; r._w = 0; return r; });
      pending.forEach(p => { const r = rows.reduce((a, b) => (b._w < a._w ? b : a)); r.appendChild(p.wrap); r._w += p.w + 8; });
      rows.forEach(r => { if (r.children.length) exerciseGrid.appendChild(r); });
      if (colorsAssigned) saveLists();
    } else {
      exerciseGrid.classList.add('hidden');
      exerciseText.classList.remove('hidden');
    }
    if (exEditMode) renderExEditList();
    renderPlanStrip();
    renderModifiers();
  }

  function renderExEditList() {
    exEditList.innerHTML = '';
    const inBlock = !!activeBlock;
    document.getElementById('addExInline').classList.toggle('hidden', inBlock);
    const list = getDisplayExerciseList();
    if (inBlock) {
      const note = document.createElement('div');
      note.className = 'empty';
      note.style.padding = '0 0 8px';
      note.textContent = list.length
        ? 'Drag to reorder. Removing one only unlists it from this block — it stays in its real category.'
        : `Nothing assigned to "${activeBlock}" yet — use the Block panel above (pencil icon) to assign exercises.`;
      exEditList.appendChild(note);
    }
    if (list.length === 0) {
      if (!inBlock) exEditList.innerHTML = '<div class="empty" style="padding:4px 0;">No exercises in this category yet.</div>';
    } else {
      list.forEach(({ exObj, originCategory }) => {
        ensureExerciseColor(originCategory, exObj);
        const row = document.createElement('div');
        row.className = 'edit-row';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = exObj.color;
        colorInput.oninput = () => { exObj.color = colorInput.value; saveLists(); updateExercisePicker(); };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = exObj.name + (inBlock ? ` (${originCategory})` : '');

        const isoBtn = document.createElement('button');
        isoBtn.className = 'iso-toggle' + (exObj.isometric ? ' on' : '');
        isoBtn.type = 'button';
        isoBtn.textContent = exObj.isometric ? 'ISO' : 'REPS';
        isoBtn.title = exObj.isometric ? 'Isometric (timed in seconds)' : 'Rep-based';
        isoBtn.onclick = () => {
          exObj.isometric = !exObj.isometric;
          saveLists();
          renderExEditList();
          updateExercisePicker();
        };

        const uniBtn = document.createElement('button');
        uniBtn.className = 'iso-toggle' + (exObj.unilateral ? ' on' : '');
        uniBtn.type = 'button';
        uniBtn.textContent = exObj.unilateral ? 'UNI' : 'BI';
        uniBtn.title = exObj.unilateral ? 'Unilateral (logged per side, L/R)' : 'Bilateral';
        uniBtn.onclick = () => {
          exObj.unilateral = !exObj.unilateral;
          saveLists();
          renderExEditList();
          updateExercisePicker();
        };

        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.appendChild(isoBtn);
        actions.appendChild(uniBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (activeBlock) removeFromBlock(activeBlock, exObj.name);
          else deleteExercise(exObj.name, originCategory);
        };
        actions.appendChild(delBtn);

        row.appendChild(colorInput);
        row.appendChild(nameSpan);
        row.appendChild(actions);
        exEditList.appendChild(row);
      });
    }
  }

  function deleteExercise(name, category) {
    const cat = category || active;
    if (!bulkQuiet && !confirm(`Remove "${name}" from ${cat}?`)) return;
    exerciseLists[cat] = (exerciseLists[cat] || []).filter(e => e.name !== name);
    markExerciseRemoved(name);
    if (selectedExercise === name) selectedExercise = "";
    saveLists();
    updateExercisePicker();
  }

  // Unlists an exercise from a block's curated view only — the exercise
  // itself keeps existing in its real category.
  function removeFromBlock(blockName, name) {
    if (!confirm(`Remove "${name}" from "${blockName}"?`)) return;
    blockRefs[blockName] = (blockRefs[blockName] || []).filter(r => r.name !== name);
    if (selectedExercise === name) selectedExercise = "";
    saveBlocks();
    renderBlockEditList();
    updateExercisePicker();
  }

  exerciseText.addEventListener('input', renderModifiers);

  function renderSortToggle() {
    if (sortMode === 'alphabetical') {
      sortToggleBtn.innerHTML = '<i class="fa-solid fa-arrow-down-a-z" aria-hidden="true"></i>';
      sortToggleBtn.title = 'Sort: alphabetical — tap to change';
      sortToggleBtn.setAttribute('aria-label', 'Sort: alphabetical (tap to change)');
    } else {
      sortToggleBtn.innerHTML = '<i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i>';
      sortToggleBtn.title = 'Sort: order added — tap to change';
      sortToggleBtn.setAttribute('aria-label', 'Sort: order added (tap to change)');
    }
  }
  sortToggleBtn.onclick = () => {
    sortMode = (sortMode === 'ascending') ? 'alphabetical' : 'ascending';
    renderSortToggle();
    updateExercisePicker();
  };
  renderSortToggle();

  // ---- Exercise search (home page) — a popup like the add/edit exercise modal,
  // searching across every category rather than filtering the visible grid ----
  function allExercisesFlat() {
    const flat = [];
    categories.forEach(cat => (exerciseLists[cat] || []).forEach(exObj => flat.push({ exObj, originCategory: cat })));
    return flat;
  }
  const exerciseSearchBtn = document.getElementById('exerciseSearchBtn');
  const exSearchOverlay = document.getElementById('exSearchOverlay');
  const exerciseSearchInput = document.getElementById('exerciseSearchInput');
  const exerciseSearchResults = document.getElementById('exerciseSearchResults');
  function renderExerciseSearchResults() {
    const q = exerciseSearchInput.value.trim().toLowerCase();
    exerciseSearchResults.innerHTML = '';
    if (!q) { exerciseSearchResults.innerHTML = '<div class="empty" style="padding:6px 0;">Start typing to search every exercise.</div>'; return; }
    const matches = allExercisesFlat().filter(p => p.exObj.name.toLowerCase().includes(q));
    if (!matches.length) { exerciseSearchResults.innerHTML = '<div class="empty" style="padding:6px 0;">No matches.</div>'; return; }
    matches.forEach(({ exObj, originCategory }) => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      row.style.cursor = 'pointer';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = exObj.color;
      nameSpan.appendChild(dot);
      nameSpan.appendChild(document.createTextNode(exObj.name));
      const catTag = document.createElement('span');
      catTag.className = 'iso-tag origin-tag';
      catTag.style.marginLeft = '8px';
      catTag.style.background = getCategoryColor(originCategory);
      catTag.style.color = '#fff';
      catTag.textContent = originCategory;
      nameSpan.appendChild(catTag);
      row.appendChild(nameSpan);
      row.onclick = () => {
        active = originCategory;
        activeBlock = null;
        const prevExercise = selectedExercise;
        selectedExercise = exObj.name;
        if (selectedExercise !== prevExercise) switchExerciseInputs(prevExercise, selectedExercise);
        renderTabs();
        renderBlockSelect();
        updateExercisePicker();
        renderModifiers();
        closeExerciseSearch();
      };
      exerciseSearchResults.appendChild(row);
    });
  }
  function openExerciseSearch() {
    exSearchOverlay.classList.remove('hidden');
    exerciseSearchInput.value = '';
    renderExerciseSearchResults();
    exerciseSearchInput.focus();
  }
  function closeExerciseSearch() { exSearchOverlay.classList.add('hidden'); }
  exerciseSearchBtn.onclick = openExerciseSearch;
  exerciseSearchInput.addEventListener('input', renderExerciseSearchResults);
  document.getElementById('exSearchCloseBtn').onclick = closeExerciseSearch;
  exSearchOverlay.addEventListener('click', (e) => { if (e.target === exSearchOverlay) closeExerciseSearch(); });

  // Blocks/Categories section headers get a shortcut into the same global
  // search modal, so you don't have to leave the config page to look something up.

  // ---- Collapsible Blocks / Categories sections ----
  function wireCollapse(btnId, bodyId) { Shared.ui.collapse(document.getElementById(btnId), document.getElementById(bodyId), 'collapsed:' + bodyId); }
  wireCollapse('blocksCollapseBtn', 'blocksSectionBody');
  wireCollapse('categoriesCollapseBtn', 'categoriesSectionBody');
  wireCollapse('equipmentCollapseBtn', 'equipmentSectionBody');

  // ---- Search within the Exercises list itself (config page) ----
  let allExSearchQuery = "";
  const exListSearchBtn = document.getElementById('exListSearchBtn');
  const allExSearchRow = document.getElementById('allExSearchRow');
  const allExSearchInput = document.getElementById('allExSearchInput');
  exListSearchBtn.onclick = () => {
    const opening = allExSearchRow.classList.contains('hidden');
    allExSearchRow.classList.toggle('hidden', !opening);
    exListSearchBtn.classList.toggle('on', opening);
    if (opening) allExSearchInput.focus();
    else { allExSearchInput.value = ''; allExSearchQuery = ''; renderAllExercisesList(); }
  };
  allExSearchInput.addEventListener('input', () => {
    allExSearchQuery = allExSearchInput.value.trim();
    renderAllExercisesList();
  });

  exEditBtn.onclick = () => {
    exEditMode = !exEditMode;
    exEditBtn.classList.toggle('on', exEditMode);
    exEditPanel.classList.toggle('hidden', !exEditMode);
    updateExercisePicker();
  };
  newExIsoBtn.onclick = () => {
    newExIsometric = !newExIsometric;
    newExIsoBtn.textContent = newExIsometric ? 'ISO' : 'REPS';
    newExIsoBtn.classList.toggle('on', newExIsometric);
  };
  newExUniBtn.onclick = () => {
    newExUnilateral = !newExUnilateral;
    newExUniBtn.textContent = newExUnilateral ? 'UNI' : 'BI';
    newExUniBtn.classList.toggle('on', newExUnilateral);
  };
  document.getElementById('addExBtn').onclick = () => {
    if (activeBlock) return; // exercises are added to a category, not to a block
    const name = newExInput.value.trim();
    if (!name) return;
    if (!exerciseLists[active]) exerciseLists[active] = [];
    if (exerciseLists[active].some(e => e.name.toLowerCase() === name.toLowerCase())) {
      alert('That exercise is already in the list.');
      return;
    }
    exerciseLists[active].push({ name, color: newExColor.value, isometric: newExIsometric, unilateral: newExUnilateral, createdAt: Date.now() });
    newExInput.value = '';
    newExIsometric = false;
    newExIsoBtn.textContent = 'REPS';
    newExIsoBtn.classList.remove('on');
    newExUnilateral = false;
    newExUniBtn.textContent = 'BI';
    newExUniBtn.classList.remove('on');
    newExColor.value = EX_COLOR_PALETTE[(exerciseLists[active].filter(e => e.color).length) % EX_COLOR_PALETTE.length];
    saveLists();
    updateExercisePicker();
    renderAllExercisesList();
    showToast('Exercise added');
  };
  newExInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('addExBtn').click(); });

  function clearSetInputs() {
    for (let i = 1; i <= numSets; i++) {
      document.getElementById('set' + i).value = '';
      document.getElementById('left' + i).value = '';
      document.getElementById('right' + i).value = '';
      document.getElementById('ecc' + i).value = '';
      document.getElementById('kg' + i).value = '';
      const angleEl = document.getElementById('angle' + i);
      if (angleEl) angleEl.value = '';
      const equipEl = document.getElementById('equip' + i);
      if (equipEl) equipEl.value = '';
      const varEl = document.getElementById('var' + i);
      if (varEl) varEl.value = '';
      ['rpe', 'flag', 'chain'].forEach(p => { const x = document.getElementById(p + i); if (x) x.value = ''; });
    }
    resetEccCascade();
    resetKgCascade();
    resetEquipCascade();
    resetVarCascade();
    syncChainPills();
  }
  // optional per-set effort (RPE), pain and form flags
  function flagProps(i) {
    const r = document.getElementById('rpe' + i), f = document.getElementById('flag' + i), o = {};
    if (r && r.value) o.rpe = Number(r.value);
    if (f && (f.value === 'pain' || f.value === 'both')) o.pain = true;
    if (f && (f.value === 'broke' || f.value === 'both')) o.formBroke = true;
    const c = document.getElementById('chain' + i);
    if (c && c.value === '1') o.chain = true; // continuous with the previous set
    return o;
  }
  function readSets(name) {
    const unilateral = isUnilateralExercise(name);
    const leverage = hasLeverageTag(name);
    const sets = [];
    for (let i = 1; i <= numSets; i++) {
      const ecc = document.getElementById('ecc' + i).value;
      const kg = (() => { const raw = document.getElementById('kg' + i).value; return raw !== '' && !isNaN(Number(raw)) ? String(kgFromInput(raw)) : raw; })();
      const angleEl = document.getElementById('angle' + i);
      const angle = leverage && angleEl && angleEl.value.trim() !== '' ? angleEl.value.trim() : null;
      const equipEl = document.getElementById('equip' + i);
      const equipment = equipEl && equipEl.value ? equipEl.value : null;
      const varEl = document.getElementById('var' + i);
      const variation = varEl && varEl.value ? varEl.value : null;
      if (setIsUni(name, i)) {
        const l = document.getElementById('left' + i).value;
        const r = document.getElementById('right' + i).value;
        if (l !== '' || r !== '') {
          sets.push({
            left: l !== '' ? Number(l) : 0,
            right: r !== '' ? Number(r) : 0,
            eccentric: ecc !== '' ? Number(ecc) : null,
            kg: kg !== '' ? Number(kg) : null,
            angle,
            equipment,
            variation,
            ...flagProps(i)
          });
        }
      } else {
        const val = document.getElementById('set' + i).value;
        if (val !== '') sets.push({ reps: Number(val), eccentric: ecc !== '' ? Number(ecc) : null, kg: kg !== '' ? Number(kg) : null, angle, equipment, variation, ...flagProps(i) });
      }
    }
    return sets;
  }

  // ---- Data helpers ----
  function escapeHtml(s) { return Shared.escapeHtml(s); }
  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }
  // entry.id is a Date.now() timestamp captured when the entry was logged —
  // use it to show what time of day it was added.
  function formatEntryTime(id) {
    const ms = Number(id);
    if (!ms || isNaN(ms)) return '';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function timestampForFilename() {
    const d = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
  }
  // dates on which at least one logged entry set a PR (drives the trophy on the calendar)
  function prDates() {
    const set = new Set();
    categories.forEach(cat => (data[cat] || []).forEach(e => { if (e.isPR) set.add(e.date); }));
    return set;
  }
  function categoriesByDate() {
    const map = {};
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (!map[e.date]) map[e.date] = new Set();
      map[e.date].add(cat);
    }));
    return map;
  }


  // ---- Rendering: entries grouped by day ----
  function getWeekStart(dateStr) {
    return Shared.weekStartISO(dateStr, weekStart);
  }
  function formatWeekLabel(weekStartISO) {
    const start = new Date(weekStartISO + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }

  function buildEntryCard(entry, category) {
    const div = document.createElement('div');
    div.className = 'entry';
    div.style.borderLeftColor = getCategoryColor(category);

    const exObj = (exerciseLists[category] || []).find(e => e.name === entry.exercise) || null;
    const exColor = exObj ? ensureExerciseColor(category, exObj) : getCategoryColor(category);

    const eHeader = document.createElement('div');
    eHeader.className = 'entry-header';
    const ex = document.createElement('span');
    ex.className = 'entry-exercise';
    const loggedTime = formatEntryTime(entry.id);
    ex.innerHTML = `<span class="dot" style="background:${exColor}"></span>${escapeHtml(entry.exercise || '')}` +
      (loggedTime ? `<span class="entry-time">${loggedTime}</span>` : '');
    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '2px';
    const editBtn = document.createElement('button');
    editBtn.className = 'del-btn';
    editBtn.setAttribute('aria-label', 'Edit entry');
    editBtn.innerHTML = '<i class="fa-solid fa-pencil" aria-hidden="true"></i>';
    editBtn.onclick = () => editEntry(entry.id);
    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.setAttribute('aria-label', 'Delete entry');
    delBtn.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
    delBtn.onclick = () => deleteEntry(entry.id);
    btnGroup.appendChild(editBtn);
    btnGroup.appendChild(delBtn);
    eHeader.appendChild(ex);
    eHeader.appendChild(btnGroup);
    div.appendChild(eHeader);

    const badgeRow = document.createElement('div');
    badgeRow.className = 'entry-badges';
    const catBadge = document.createElement('span');
    catBadge.className = 'badge';
    catBadge.style.background = getCategoryColor(category);
    catBadge.style.color = '#fff';
    catBadge.textContent = category;
    badgeRow.appendChild(catBadge);
    const addBadge = text => { const b = document.createElement('span'); b.className = 'badge'; b.textContent = text; badgeRow.appendChild(b); };
    if (entry.weightKg) addBadge(formatLoadKg(entry.weightKg));
    if (entry.unilateral) addBadge('L/R');
    if (entry.isometric) addBadge('Isometric');
    if (entry.equipment) addBadge(entry.equipment);
    if (entry.attempts && entry.attempts.length) addBadge('Attempts');
    if (entry.isPR) {
      const pr = document.createElement('span');
      pr.className = 'badge badge-pr';
      pr.innerHTML = '<i class="fa-solid fa-trophy" aria-hidden="true"></i> PR';
      if (entry.prTypes && entry.prTypes.length) pr.title = 'New PR: ' + entry.prTypes.join(', ');
      badgeRow.appendChild(pr);
    }
    div.appendChild(badgeRow);

    if (entry.distance !== undefined && entry.distance !== null && entry.distance !== '') {
      const distRow = document.createElement('div');
      distRow.className = 'entry-sets';
      const addPill = text => { const p = document.createElement('span'); p.className = 'set-pill'; p.textContent = text; distRow.appendChild(p); };
      if (entry.variation) addPill(entry.variation);
      addPill(`${round2(kmToDisplay(entry.distance))} ${distanceUnitLabel()}`);
      const pace = paceForEntry(entry);
      if (pace) addPill(`${pace} /${distanceUnitLabel()}`);
      if (entry.ruckKg != null) addPill(`Rucking ${round2(kgToDisplay(entry.ruckKg))}${weightUnitLabel()}`);
      if (entry.elevation != null) addPill(`↑ ${round2(mToDisplay(entry.elevation))}${elevationUnitLabel()}`);
      if (entry.timeMinutes != null) addPill(formatDuration(entry.timeMinutes));
      div.appendChild(distRow);
    } else if (entry.sets && entry.sets.length) {
      const setsRow = document.createElement('div');
      setsRow.className = 'entry-sets';
      const unit = entry.isometric ? 's' : '';
      if (entry.isometric && entry.sets.length > 3 && !entry.sets.some(s => s && s.chain)) {
        // several quick hold attempts — summarize on one line instead of a pill per attempt
        const holds = entry.sets.map(Shared.setReps);
        const best = Math.max(...holds);
        const summary = document.createElement('span');
        summary.className = 'set-pill attempts-summary';
        summary.textContent = `${holds.length} attempts: ${holds.join('s, ')}s · best ${best}s`;
        setsRow.appendChild(summary);
      } else {
        entry.sets.forEach((s, i) => {
          if (s && typeof s === 'object' && s.chain && i > 0) return; // shown inside its chain
          let end = i;
          while (entry.sets[end + 1] && typeof entry.sets[end + 1] === 'object' && entry.sets[end + 1].chain) end++;
          if (end > i) {
            const seg = entry.sets.slice(i, end + 1);
            const cp = document.createElement('span');
            cp.className = 'set-pill';
            const parts = seg.map(x => (setVar(x) || 'standard') + ' ' + (x.left !== undefined ? x.left + '/' + x.right : x.reps) + unit);
            const total = entry.isometric ? ' · total ' + seg.reduce((a, x) => a + Shared.setReps(x), 0) + 's' : '';
            cp.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i> ';
            cp.appendChild(document.createTextNode(`Chain, sets ${i + 1}–${end + 1}: ${parts.join(' → ')}${total}`));
            setsRow.appendChild(cp);
            return;
          }
          const pill = document.createElement('span');
          pill.className = 'set-pill';
          const ecc = (s && typeof s === 'object') ? s.eccentric : null;
          const kg = (s && typeof s === 'object') ? s.kg : null;
          const angle = (s && typeof s === 'object') ? s.angle : null;
          const equip = (s && typeof s === 'object') ? s.equipment : null;
          const variation = setVar(s);
          const flagTxt = (s && typeof s === 'object') ? (s.rpe ? ` · RPE ${s.rpe}` : '') + (s.pain ? ' · pain' : '') + (s.formBroke ? ' · form broke' : '') : '';
          const extras = `${ecc ? ` (ecc ${ecc}s)` : ''}${kg ? ` @ ${formatLoadKg(kg)}` : ''}${angle ? ` [${angle}]` : ''}${variation ? ` · ${variation}` : ''}${equip ? ` · ${equip}` : ''}${flagTxt}`;
          if (s && typeof s === 'object' && s.left !== undefined) {
            pill.textContent = `Set ${i + 1}: L ${s.left}${unit} / R ${s.right}${unit}${s.left !== s.right ? ` (Δ${Math.abs((Number(s.left) || 0) - (Number(s.right) || 0))})` : ''}${extras}`;
          } else {
            const val = (typeof s === 'object') ? s.reps : s;
            const label = entry.isometric ? 's hold' : ' reps';
            pill.textContent = `Set ${i + 1}: ${val}${label}${extras}`;
          }
          setsRow.appendChild(pill);
        });
      }
      div.appendChild(setsRow);
    } else if (entry.attempts && entry.attempts.length) {
      const setsRow = document.createElement('div');
      setsRow.className = 'entry-sets';
      const best = Math.max(...entry.attempts);
      const summary = document.createElement('span');
      summary.className = 'set-pill attempts-summary';
      summary.textContent = `${entry.attempts.length} attempts: ${entry.attempts.join('s, ')}s · best ${best}s`;
      setsRow.appendChild(summary);
      div.appendChild(setsRow);
    }

    if (entry.notes) {
      const notes = document.createElement('div');
      notes.className = 'entry-notes';
      notes.textContent = entry.notes;
      div.appendChild(notes);
    }
    return div;
  }

  function buildSupersetCard(items) {
    const wrap = document.createElement('div');
    wrap.className = 'superset-card';
    const header = document.createElement('div');
    header.className = 'superset-card-header';
    header.innerHTML = `<i class="fa-solid fa-link" aria-hidden="true"></i> Superset · ${items.length} exercises`;
    wrap.appendChild(header);
    items.forEach(item => wrap.appendChild(buildEntryCard(item.entry, item.category)));
    return wrap;
  }

  function renderEntries() {
    const year = calViewDate.getFullYear();
    const month = calViewDate.getMonth();
    const monthKey = `${year}-${month}`;

    if (monthKey !== lastEntriesMonthKey) {
      lastEntriesMonthKey = monthKey;
      expandedWeeks = new Set();
      weeksNeedDefaultExpand = true; // re-expand the newest week once for this month
    }

    // gather every entry, from every category, for the viewed month
    const allEntries = [];
    categories.forEach(cat => {
      (data[cat] || []).forEach(e => {
        const d = new Date(e.date + 'T00:00:00');
        if (d.getFullYear() === year && d.getMonth() === month) {
          allEntries.push({ entry: e, category: cat });
        }
      });
    });

    entriesEl.innerHTML = '';
    if (allEntries.length === 0) {
      entriesEl.innerHTML = '<div class="empty">No entries logged in ' +
        calViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) +
        '. Use the calendar arrows to browse other months.</div>';
      return;
    }

    const weekMap = {};
    allEntries.forEach(item => {
      const wk = getWeekStart(item.entry.date);
      (weekMap[wk] = weekMap[wk] || []).push(item);
    });
    const weekKeys = Object.keys(weekMap).sort((a, b) => b.localeCompare(a)); // newest week first
    if (weeksNeedDefaultExpand && weekKeys.length) {
      expandedWeeks.add(weekKeys[0]);
      weeksNeedDefaultExpand = false;
    }

    weekKeys.forEach(wk => {
      const weekItems = weekMap[wk];
      const isExpanded = expandedWeeks.has(wk);

      const weekSection = document.createElement('div');
      weekSection.className = 'week-group';

      const weekHeader = document.createElement('button');
      weekHeader.type = 'button';
      weekHeader.className = 'week-header';
      weekHeader.innerHTML = `<i class="fa-solid fa-angle-${isExpanded ? 'down' : 'right'}" aria-hidden="true"></i> ${formatWeekLabel(wk)} <span class="week-count">${weekItems.length}</span>`;
      weekHeader.onclick = () => {
        if (expandedWeeks.has(wk)) expandedWeeks.delete(wk); else expandedWeeks.add(wk);
        renderEntries();
      };
      weekSection.appendChild(weekHeader);

      if (isExpanded) {
        const weekBody = document.createElement('div');
        weekBody.className = 'week-body';

        const byDate = {};
        weekItems.forEach(item => { (byDate[item.entry.date] = byDate[item.entry.date] || []).push(item); });
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

        dates.forEach(date => {
          const dayGroup = document.createElement('div');
          dayGroup.className = 'day-group';
          const header = document.createElement('div');
          header.className = 'day-group-header';
          header.textContent = formatDate(date);
          dayGroup.appendChild(header);
          const dayItems = byDate[date].slice().sort((a, b) => Number(b.entry.id) - Number(a.entry.id)); // last logged first
          const seen = new Set();
          dayItems.forEach(item => {
            if (seen.has(item.entry.id)) return;
            const sid = item.entry.supersetId;
            const groupItems = sid ? dayItems.filter(x => x.entry.supersetId === sid) : [item];
            groupItems.forEach(x => seen.add(x.entry.id));
            if (groupItems.length > 1) {
              groupItems.sort((a, b) => Number(a.entry.id) - Number(b.entry.id)); // original logging order within the group
              dayGroup.appendChild(buildSupersetCard(groupItems));
            } else {
              dayGroup.appendChild(buildEntryCard(item.entry, item.category));
            }
          });
          weekBody.appendChild(dayGroup);
        });
        weekSection.appendChild(weekBody);
      }

      entriesEl.appendChild(weekSection);
    });
    updateSkillsBadge(); // logging, editing or deleting can change which skill steps are met
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISODate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

  function renderCalendar() {
    const year = calViewDate.getFullYear();
    const month = calViewDate.getMonth();
    calTitle.textContent = calViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const catMap = categoriesByDate();
    const prSet = prDates();
    const todayISO = toISODate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    calGrid.innerHTML = '';
    (weekStart === 1 ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      calGrid.appendChild(el);
    });

    const firstDay = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      calGrid.appendChild(el);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISODate(year, month, d);
      const el = document.createElement('div');
      el.className = 'cal-day';
      if (iso === todayISO) el.classList.add('today');
      if (iso === selectedCalDate) el.classList.add('selected');

      const num = document.createElement('span');
      num.textContent = d;
      el.appendChild(num);

      if (prSet.has(iso)) {
        const trophy = document.createElement('i');
        trophy.className = 'fa-solid fa-trophy cal-pr';
        trophy.setAttribute('aria-label', 'Personal record');
        trophy.title = 'Personal record';
        el.appendChild(trophy);
      }

      const catsThatDay = catMap[iso];
      if (catsThatDay && catsThatDay.size) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'cal-dots';
        Array.from(catsThatDay).slice(0, 6).forEach(cat => {
          const dot = document.createElement('span');
          dot.className = 'cal-dot';
          dot.style.background = getCategoryColor(cat);
          dotsWrap.appendChild(dot);
        });
        el.appendChild(dotsWrap);
      }

      el.onclick = () => {
        selectedCalDate = (selectedCalDate === iso) ? null : iso;
        dateInput.value = iso;
        updateHeaderDateDisplay();
        renderCalendar();
      };
      calGrid.appendChild(el);
    }
  }

  document.getElementById('calPrev').onclick = () => {
    calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() - 1, 1);
    renderCalendar();
    renderEntries();
  };
  document.getElementById('calNext').onclick = () => {
    calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 1);
    renderCalendar();
    renderEntries();
  };
  document.getElementById('calToday').onclick = () => {
    calViewDate = new Date();
    renderCalendar();
    renderEntries();
  };

  function render() {
    renderTabs();
    renderEntries();
    renderCalendar();
  }

  // ---- Persistence: entries ----
  function loadData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        categories.forEach(c => { data[c] = parsed[c] || []; });
      }
    } catch (e) { /* ignore */ }
  }
  // Empty fields (null, '') are left out of stored entries and sets: backups are about a third smaller, and every reader treats a missing field as empty.
  function compactEntry(e) {
    if (!e || typeof e !== 'object') return e;
    Object.keys(e).forEach(k => { if (e[k] === null || e[k] === undefined || e[k] === '' || (k === 'isPR' && e[k] === false)) delete e[k]; });
    if (Array.isArray(e.sets)) e.sets.forEach(s => {
      if (s && typeof s === 'object') Object.keys(s).forEach(k => { if (s[k] === null || s[k] === undefined || s[k] === '') delete s[k]; });
    });
    return e;
  }
  function saveData() {
    categories.forEach(c => (data[c] || []).forEach(compactEntry));
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
    } catch (e) {
      errEl.textContent = 'Could not save to this browser. Storage may be full or disabled.';
      errEl.classList.remove('hidden');
    }
  }
  function findEntryLocation(id) {
    for (const cat of categories) {
      const idx = (data[cat] || []).findIndex(e => e.id === id);
      if (idx !== -1) return { category: cat, index: idx };
    }
    return null;
  }
  // ids of entries deleted on this device, so sync can remove them elsewhere instead of bringing them back
  const DELETED_KEY = 'workout-log-deleted-v1';
  let deletedEntries = {};
  try { const dd = JSON.parse(localStorage.getItem(DELETED_KEY)); if (dd && typeof dd === 'object' && !Array.isArray(dd)) deletedEntries = dd; } catch (e) { /* none yet */ }
  function saveDeleted() { lsSet(DELETED_KEY, JSON.stringify(deletedEntries)); }
  function deleteEntry(id) {
    if (!confirm('Delete this entry?')) return;
    const loc = findEntryLocation(id);
    if (!loc) return;
    const gone = data[loc.category].splice(loc.index, 1)[0];
    deletedEntries[id] = Date.now(); saveDeleted();
    saveData();
    if (gone) recalcPRs(gone.exercise);
    renderEntries();
    renderCalendar();
  }

  let entryEditOverlay = null;
  function ensureEntryEditOverlay() {
    if (entryEditOverlay) return entryEditOverlay;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay hidden';
    ov.innerHTML = '<div class="modal-box edit-box"><div class="section-label" id="eeTitle">Edit entry</div><div id="eeBody"></div><div class="modal-actions"><button type="button" id="eeCancel">Cancel</button><button type="button" id="eeSave">Save</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.add('hidden'); });
    ov.querySelector('#eeCancel').onclick = () => ov.classList.add('hidden');
    entryEditOverlay = ov;
    return ov;
  }
  function editEntry(id) {
    const loc = findEntryLocation(id);
    if (!loc) return;
    const entry = data[loc.category][loc.index];
    if (!entry) return;
    const ov = ensureEntryEditOverlay();
    const body = ov.querySelector('#eeBody');
    const isDist = entry.distance !== undefined && entry.distance !== null;
    const hasSets = !isDist && Array.isArray(entry.sets) && entry.sets.length > 0;
    const hasAttempts = !isDist && !hasSets && Array.isArray(entry.attempts) && entry.attempts.length > 0;
    const vars = exerciseVariations(entry.exercise);
    const esc = escapeHtml;
    const num = v => (v == null || v === '' ? '' : v);
    const optHtml = (list, cur, blank) => {
      const all = cur && !list.includes(cur) ? list.concat(cur) : list;
      return `<option value="">${blank}</option>` + all.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    };
    const rpeOpts = cur => '<option value="">RPE</option>' + [5, 6, 7, 8, 9, 10].map(n => `<option value="${n}"${Number(cur) === n ? ' selected' : ''}>${n}</option>`).join('');
    const flagOpts = st => { const v = st.pain && st.formBroke ? 'both' : st.pain ? 'pain' : st.formBroke ? 'broke' : ''; return [['', 'Flag'], ['broke', 'Form broke'], ['pain', 'Pain'], ['both', 'Pain + form broke']].map(o => `<option value="${o[0]}"${o[0] === v ? ' selected' : ''}>${o[1]}</option>`).join(''); };
    const setRow = (s, i) => {
      s = (s && typeof s === 'object') ? s : { reps: s };
      const uni = s.left !== undefined;
      const main = uni
        ? `<input type="number" min="0" data-f="left" value="${num(s.left)}" placeholder="L" aria-label="Left" /><input type="number" min="0" data-f="right" value="${num(s.right)}" placeholder="R" aria-label="Right" />`
        : `<input type="number" min="0" data-f="reps" value="${num(s.reps)}" placeholder="${entry.isometric ? 'sec' : 'reps'}" aria-label="${entry.isometric ? 'Seconds' : 'Reps'}" />`;
      return `<div class="ee-set" data-uni="${uni ? 1 : 0}"><div class="ee-nums">${main}` +
        `<input type="number" min="0" data-f="ecc" value="${num(s.eccentric)}" placeholder="ecc s" aria-label="Eccentric seconds" />` +
        `<input type="number" step="0.5" data-f="kg" value="${s.kg == null || s.kg === '' ? '' : round2(kgToDisplay(Number(s.kg)))}" placeholder="±${weightUnitLabel()}" aria-label="Weight" /></div><div class="ee-sels${vars.length || s.variation ? ' four' : ''}">` +
        (vars.length || s.variation ? `<select data-f="var" aria-label="Variation">${optHtml(vars, s.variation || '', 'Variation')}</select>` : '') +
        `<select data-f="equip" aria-label="Equipment">${optHtml(equipmentList, s.equipment || '', 'Equipment')}</select><select data-f="rpe" aria-label="RPE">${rpeOpts(s.rpe)}</select><select data-f="flag" aria-label="Flag">${flagOpts(s)}</select></div><div class="ee-foot"><span class="set-num" aria-label="Set ${i + 1}">${i + 1}</span>${i > 0 ? `<button type="button" class="chain-pill ee-chain${s.chain ? ' on' : ''}" aria-pressed="${s.chain ? 'true' : 'false'}" data-act="chain"><i class="fa-solid fa-link" aria-hidden="true"></i> Chained to previous</button>` : ''}<button type="button" class="text-btn ee-uni" data-act="uni" title="Switch between one value and left/right">${uni ? '1 value' : 'L/R'}</button></div></div>`;
    };
    let h = `<div class="ee-field"><label for="eeDate">Date</label><input type="date" id="eeDate" value="${esc(entry.date)}" /></div>`;
    if (isDist) {
      h += `<div class="ee-field"><label for="eeDist">Distance (${distanceUnitLabel()})</label><input type="number" step="0.01" min="0" id="eeDist" value="${round2(kmToDisplay(entry.distance))}" /></div>` +
        `<div class="ee-field"><label for="eeTime">Time (e.g. 2:50)</label><input type="text" id="eeTime" value="${entry.timeMinutes != null ? esc(timeMinutesToInputString(entry.timeMinutes)) : ''}" /></div>` +
        `<div class="ee-field"><label for="eeRuck">Rucking (${weightUnitLabel()})</label><input type="number" step="0.5" min="0" id="eeRuck" value="${entry.ruckKg != null ? round2(kgToDisplay(entry.ruckKg)) : ''}" /></div>` +
        `<div class="ee-field"><label for="eeElev">Elevation (${elevationUnitLabel()})</label><input type="number" step="1" min="0" id="eeElev" value="${entry.elevation != null ? round2(mToDisplay(entry.elevation)) : ''}" /></div>` + (vars.length || entry.variation ? `<div class="ee-field"><label for="eeDistVar">Variation</label><select id="eeDistVar">${optHtml(vars, entry.variation || '', 'None')}</select></div>` : '');
    } else if (hasSets) {
      h += '<div class="ee-field"><label>Sets</label><div id="eeSets">' + entry.sets.map(setRow).join('') + '</div><div class="ee-btns"><button type="button" class="text-btn" id="eeAddSet">+ Add set</button><button type="button" class="text-btn text-btn-danger" id="eeDelSet">− Remove last</button></div></div>';
    } else if (hasAttempts) {
      h += `<div class="ee-field"><label for="eeAttempts">Attempts (seconds, comma separated)</label><input type="text" id="eeAttempts" value="${esc(entry.attempts.join(', '))}" /></div>`;
    }
    h += `<div class="ee-field"><label for="eeNotes">Notes</label><textarea id="eeNotes" rows="2">${esc(entry.notes || '')}</textarea></div>`;
    body.innerHTML = h;
    ov.querySelector('#eeTitle').textContent = 'Edit · ' + (entry.exercise || '');
    const setsBox = body.querySelector('#eeSets');
    if (setsBox) {
      setsBox.onclick = (e) => {
        const cp = e.target.closest('.ee-chain');
        if (cp) { cp.classList.toggle('on'); cp.setAttribute('aria-pressed', String(cp.classList.contains('on'))); return; }
        const b = e.target.closest('[data-act="uni"]');
        if (!b) return;
        const row = b.closest('.ee-set');
        const f = k => { const el = row.querySelector(`[data-f="${k}"]`); return el ? el.value : ''; };
        let st;
        if (row.dataset.uni === '1') { const l = f('left'), r = f('right'); st = { reps: (l === '' || r === '') ? (l || r) : Math.min(Number(l), Number(r)) }; }
        else { const v = f('reps'); st = { left: v, right: v }; }
        st.eccentric = f('ecc');
        st.kg = f('kg') === '' ? null : kgFromInput(f('kg'));
        st.variation = row.querySelector('[data-f="var"]') ? f('var') : '';
        st.equipment = f('equip');
        st.rpe = f('rpe') ? Number(f('rpe')) : undefined;
        { const cb = row.querySelector('.ee-chain'); if (cb && cb.classList.contains('on')) st.chain = true; }
        const fv2 = f('flag'); st.pain = fv2 === 'pain' || fv2 === 'both'; st.formBroke = fv2 === 'broke' || fv2 === 'both';
        const tmp = document.createElement('div');
        tmp.innerHTML = setRow(st, Array.prototype.indexOf.call(setsBox.children, row));
        setsBox.replaceChild(tmp.firstElementChild, row);
      };
      body.querySelector('#eeAddSet').onclick = () => {
        const last = setsBox.lastElementChild;
        const proto = last && last.dataset.uni === '1' ? { left: '', right: '' } : { reps: '' };
        const tmp = document.createElement('div');
        tmp.innerHTML = setRow(proto, setsBox.children.length);
        setsBox.appendChild(tmp.firstElementChild);
      };
      body.querySelector('#eeDelSet').onclick = () => { if (setsBox.children.length > 1) setsBox.lastElementChild.remove(); };
    }
    ov.querySelector('#eeSave').onclick = () => {
      const date = body.querySelector('#eeDate').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('Pick a valid date.'); return; }
      const val = sel => body.querySelector(sel).value.trim();
      if (isDist) {
        const d = val('#eeDist'); if (d !== '' && !isNaN(Number(d))) entry.distance = displayToKm(Number(d));
        const ru = val('#eeRuck'); entry.ruckKg = ru === '' ? null : displayToKg(Number(ru));
        const el = val('#eeElev'); entry.elevation = el === '' ? null : displayToM(Number(el));
        const t = val('#eeTime'); entry.timeMinutes = t === '' ? null : parseTimeInput(t);
        const dvEl = body.querySelector('#eeDistVar'); if (dvEl) entry.variation = dvEl.value || null;
      } else if (hasSets) {
        const sets = [];
        Array.from(body.querySelectorAll('.ee-set')).forEach((row, i) => {
          const f = k => { const el = row.querySelector(`[data-f="${k}"]`); return el ? el.value.trim() : ''; };
          const old = (entry.sets[i] && typeof entry.sets[i] === 'object') ? entry.sets[i] : {};
          const st = {};
          if (row.dataset.uni === '1') {
            if (f('left') === '' && f('right') === '') return;
            st.left = Number(f('left')) || 0; st.right = Number(f('right')) || 0;
          } else {
            if (f('reps') === '') return;
            st.reps = Number(f('reps'));
          }
          st.eccentric = f('ecc') === '' ? null : Number(f('ecc'));
          st.kg = f('kg') === '' ? null : kgFromInput(f('kg'));
          st.angle = old.angle || null;
          if (f('rpe')) st.rpe = Number(f('rpe'));
          const fv = f('flag'); if (fv === 'pain' || fv === 'both') st.pain = true; if (fv === 'broke' || fv === 'both') st.formBroke = true;
          { const cb = row.querySelector('.ee-chain'); if (i > 0 && cb && cb.classList.contains('on')) st.chain = true; }
          st.equipment = f('equip') || null;
          st.variation = row.querySelector('[data-f="var"]') ? (f('var') || null) : (old.variation || null);
          sets.push(st);
        });
        if (!sets.length) { alert('Keep at least one set with a value.'); return; }
        entry.sets = sets;
      } else if (hasAttempts) {
        const nums = val('#eeAttempts').split(',').map(x => x.trim()).filter(x => x !== '').map(Number).filter(n => !isNaN(n));
        if (nums.length) entry.attempts = nums;
      }
      if (date !== entry.date) { entry.date = date; entry.supersetId = null; } // a superset is a same-day grouping
      entry.notes = val('#eeNotes');
      entry.updatedAt = Date.now();
      saveData();
      recalcPRs(entry.exercise);
      ov.classList.add('hidden');
      renderEntries(); renderCalendar(); renderModifiers();
      showToast('Entry updated');
    };
    ov.classList.remove('hidden');
  }

  // ---- Add entry ----
  // Where an entry for this exercise is filed (Main workout / blocks own nothing themselves).
  function categoryForExercise(exercise) {
    return activeBlock
      ? ((findExerciseOwner(exercise) || {}).category || active)
      : active;
  }
  function entryHasData(e) {
    return !!((e.sets && e.sets.length) || (e.attempts && e.attempts.length) || e.distance != null || e.timeMinutes != null || e.elevation != null);
  }
  // Personal records are judged per variation: a 5 s straddle is compared with earlier straddles, not with a 20 s tuck.
  function isoPRHits(sets, attempts, priorBests) {
    const prHits = [];
    const holdCandidates = sets.map(Shared.cleanReps).concat(attempts.map(Number)).filter(v => v > 0);
    if (holdCandidates.length) {
      const sessionBest = Math.max(...holdCandidates);
      if (priorBests.bestHold === null || sessionBest > priorBests.bestHold) {
        prHits.push(`hold ${sessionBest}s` + (priorBests.bestHold !== null ? ` (prev ${priorBests.bestHold}s)` : ''));
      }
    }
    const kgCandidates = sets.map(s => (s && typeof s === 'object' && s.kg != null && s.kg !== '') ? Number(s.kg) : null).filter(v => v !== null && !isNaN(v) && v > 0);
    if (kgCandidates.length) {
      const sessionBestKg = Math.max(...kgCandidates);
      if (priorBests.bestWeight === null || sessionBestKg > priorBests.bestWeight) {
        prHits.push(`weight ${formatLoadKg(sessionBestKg)}` + (priorBests.bestWeight !== null ? ` (prev ${formatLoadKg(priorBests.bestWeight)})` : ''));
      }
    }
    return prHits;
  }
  function repPRHits(sets, priorBests, date) {
    const prHits = [];
    const repsCandidates = sets.map(Shared.cleanReps).filter(v => v > 0);
    if (repsCandidates.length) {
      const sessionBestReps = Math.max(...repsCandidates);
      if (priorBests.bestReps === null || sessionBestReps > priorBests.bestReps) {
        prHits.push(`reps ${sessionBestReps}` + (priorBests.bestReps !== null ? ` (prev ${priorBests.bestReps})` : ''));
      }
    }
    const kgCandidates = sets.map(s => (s && typeof s === 'object' && s.kg != null && s.kg !== '') ? Number(s.kg) : null).filter(v => v !== null && !isNaN(v) && v > 0);
    if (kgCandidates.length) {
      const sessionBestKg = Math.max(...kgCandidates);
      if (priorBests.bestWeight === null || sessionBestKg > priorBests.bestWeight) {
        prHits.push(`weight ${formatLoadKg(sessionBestKg)}` + (priorBests.bestWeight !== null ? ` (prev ${formatLoadKg(priorBests.bestWeight)})` : ''));
      }
    }
    // Beating the best set by estimated 1RM or by weight x reps counts too (e.g. more reps at a lighter load).
    // Only compared against an earlier best, so a first weighted set isn't announced three times.
    const bwSortedNow = sortedBodyweightLog();
    const loads = sets.map(s => setLoadMetrics(s, bodyweightKgOnDate(bwSortedNow, date))).filter(Boolean);
    const fmtLoad = v => `${round2(kgToDisplay(v))}${weightUnitLabel()}`;
    const sessionE1RM = Math.max(0, ...loads.map(l => l.e1rm || 0));
    if (priorBests.bestE1RM !== null && sessionE1RM > priorBests.bestE1RM + 1e-9) {
      prHits.push(`est. 1RM ${fmtLoad(sessionE1RM)} (prev ${fmtLoad(priorBests.bestE1RM)})`);
    }
    const sessionVolume = Math.max(0, ...loads.map(l => l.volume));
    if (priorBests.bestSetVolume !== null && sessionVolume > priorBests.bestSetVolume + 1e-9) {
      prHits.push(`set volume ${fmtLoad(sessionVolume)} (prev ${fmtLoad(priorBests.bestSetVolume)})`);
    }
    return prHits;
  }
  function distancePRHits(entry, priorBests) {
    const prHits = [];
    if (entry.distance != null && entry.distance > 0 && (priorBests.bestDistance === null || entry.distance > priorBests.bestDistance)) {
      prHits.push(`distance ${round2(kmToDisplay(entry.distance))}${distanceUnitLabel()}` + (priorBests.bestDistance !== null ? ` (prev ${round2(kmToDisplay(priorBests.bestDistance))}${distanceUnitLabel()})` : ''));
    }
    if (entry.timeMinutes != null && entry.timeMinutes > 0 && (priorBests.bestTime === null || entry.timeMinutes > priorBests.bestTime)) {
      prHits.push(`time ${formatDuration(entry.timeMinutes)}` + (priorBests.bestTime !== null ? ` (prev ${formatDuration(priorBests.bestTime)})` : ''));
    }
    if (entry.elevation != null && entry.elevation > 0 && (priorBests.bestElevation === null || entry.elevation > priorBests.bestElevation)) {
      prHits.push(`elevation ${round2(mToDisplay(entry.elevation))}${elevationUnitLabel()}` + (priorBests.bestElevation !== null ? ` (prev ${round2(mToDisplay(priorBests.bestElevation))}${elevationUnitLabel()})` : ''));
    }
    if (entry.distance != null && entry.distance > 0 && entry.timeMinutes != null && entry.timeMinutes > 0) {
      const pace = entry.timeMinutes / entry.distance;
      if (priorBests.bestPaceMinPerKm === null || pace < priorBests.bestPaceMinPerKm) {
        prHits.push(`pace ${formatPace(pace)}/km` + (priorBests.bestPaceMinPerKm !== null ? ` (prev ${formatPace(priorBests.bestPaceMinPerKm)}/km)` : ''));
      }
    }
    return prHits;
  }
  // Re-judges the PR badge of every entry (or of one exercise) against only what was logged before it.
  function recalcPRs(onlyName) {
    let changed = 0;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (onlyName && e.exercise !== onlyName) return;
      const key = entryKey(e);
      let hits = [];
      if (e.distance != null && e.distance !== '') hits = distancePRHits(e, computeExerciseBests(e.exercise, exerciseVariations(e.exercise).length ? (e.variation || '') : undefined, key));
      else if ((e.sets && e.sets.length) || (e.attempts && e.attempts.length)) {
        e.sets = e.sets || []; e.attempts = e.attempts || [];
        hits = prHitsByVariation(e.exercise, e, !!e.isometric, key);
      }
      const was = !!e.isPR;
      e.isPR = hits.length > 0;
      if (e.isPR) e.prTypes = hits; else delete e.prTypes;
      if (was !== e.isPR) changed++;
    }));
    saveData();
    return changed;
  }
  function prHitsByVariation(exercise, entry, isometric, cutoffKey) {
    const keys = Array.from(new Set(entry.sets.map(setVar)));
    if (isometric && entry.attempts.length && !keys.includes('')) keys.push('');
    const out = [];
    keys.forEach(k => {
      const sets = entry.sets.filter(s => setVar(s) === k);
      const prior = computeExerciseBests(exercise, k, cutoffKey);
      const hits = isometric ? isoPRHits(sets, k === '' ? entry.attempts : [], prior) : repPRHits(sets, prior, entry.date);
      hits.forEach(t => out.push(k ? `${k}: ${t}` : t));
    });
    return out;
  }
  // Builds (does not store) an entry from whatever is currently typed into the log inputs for `exercise`.
  function buildEntryFromInputs(date, exercise) {
    const exObj = findActiveExerciseObj(exercise);
    const entry = {
      id: Date.now().toString(),
      updatedAt: Date.now(),
      date, exercise,
      isometric: exObj ? !!exObj.isometric : false,
      unilateral: isUnilateralExercise(exercise),
      notes: notesInput.value.trim(),
      supersetId: activeSuperset ? activeSuperset.id : null
    };

    if (isDistanceExercise(exercise)) {
      const ruckKgInput = document.getElementById('ruckKgInput');
      const elevationInput = document.getElementById('elevationInput');
      const timeInput = document.getElementById('timeInput');
      entry.distance = distanceInput.value !== '' ? displayToKm(Number(distanceInput.value)) : null;
      entry.ruckKg = ruckKgInput.value !== '' ? displayToKg(Number(ruckKgInput.value)) : null;
      entry.elevation = elevationInput.value !== '' ? displayToM(Number(elevationInput.value)) : null;
      entry.timeMinutes = timeInput.value !== '' ? parseTimeInput(timeInput.value) : null;
      entry.variation = (document.getElementById('distVarSelect') || {}).value || null;
      entry.sets = [];
      entry.attempts = [];
    } else if (entry.isometric && holdMode === 'attempts') {
      entry.attempts = readAttempts();
      entry.sets = [];
      entry.distance = null;
    } else {
      entry.sets = readSets(exercise);
      entry.attempts = [];
      entry.distance = null;
    }

    if (entry.isometric && (entry.sets.length || entry.attempts.length)) {
      const prHits = prHitsByVariation(exercise, entry, true);
      entry.isPR = prHits.length > 0;
      if (entry.isPR) {
        entry.prTypes = prHits;
        showToast(`🎉 New PR: ${prHits.join(', ')}`);
      }
    } else if (isDistanceExercise(exercise)) {
      const priorBests = computeExerciseBests(exercise, exerciseVariations(exercise).length ? (entry.variation || '') : undefined);
      const prHits = distancePRHits(entry, priorBests);
      entry.isPR = prHits.length > 0;
      if (entry.isPR) {
        entry.prTypes = prHits;
        showToast(`🎉 New PR: ${prHits.join(', ')}`);
      }
    } else if (entry.sets.length) {
      const prHits = prHitsByVariation(exercise, entry, false);
      entry.isPR = prHits.length > 0;
      if (entry.isPR) {
        entry.prTypes = prHits;
        showToast(`🎉 New PR: ${prHits.join(', ')}`);
      }
    }

    return entry;
  }

  document.getElementById('addBtn').onclick = () => {
    errEl.classList.add('hidden');
    const date = dateInput.value;
    const hasList = activeHasExerciseList();
    const exercise = currentExerciseName();
    const fail = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); };

    if (!date) { fail('Pick a date first.'); return; }

    const skillsMetBefore = metStepIds();
    const added = []; // { name, entry, cat }
    const members = hasList ? supersetMemberNames() : [];
    if (members.length > 1) {
      // Superset with several exercises picked: log every one that has values typed in.
      const before = selectedExercise;
      snapshotDraft(before);
      members.forEach(name => {
        selectedExercise = name;
        restoreDraft(name);
        const entry = buildEntryFromInputs(date, name);
        if (entryHasData(entry)) added.push({ name, entry, cat: categoryForExercise(name) });
      });
      if (!added.length) {
        selectedExercise = before;
        restoreDraft(before);
        fail('Enter values for at least one of the selected exercises.');
        return;
      }
      added.forEach((a, i) => { if (i > 0) a.entry.id = a.entry.id + '_' + i; }); // unique ids within the same millisecond
    } else {
      if (!exercise) { fail(hasList ? 'Select an exercise.' : 'Enter an exercise name.'); return; }
      added.push({ name: exercise, entry: buildEntryFromInputs(date, exercise), cat: categoryForExercise(exercise) });
    }

    added.forEach(a => {
      if (!data[a.cat]) data[a.cat] = [];
      data[a.cat].push(a.entry);
    });
    saveData();
    { const pm = activeBlock ? planMeta[activeBlock] : null; if (pm && pm.uid) recordPlanSession(pm, date); }
    if (activeSuperset) { activeSuperset.count += added.length; }
    const anyPR = added.some(a => a.entry.isPR);
    if (added.length > 1 && !anyPR) showToast(`Logged ${added.length} exercises`);
    announceNewlyMetSkills(skillsMetBefore, anyPR);

    // jump the calendar to the month of the entry you just added, so it's visible immediately
    const addedDate = new Date(date + 'T00:00:00');
    calViewDate = new Date(addedDate.getFullYear(), addedDate.getMonth(), 1);
    expandedWeeks.add(getWeekStart(date)); // open the week group the new entry is in

    if (hasList) {
      selectedExercise = "";
      updateExercisePicker();
    } else {
      exerciseText.value = '';
    }
    added.forEach(a => { delete exerciseDrafts[a.name]; }); // just submitted — no longer in-progress drafts
    resetLogInputs({ clearEquipment: true });
    renderModifiers();
    if (activeSuperset) updateSupersetUI();

    renderEntries();
    renderCalendar();
  };

  // ---- Export / Import ----
  // the Excel library is large, so it is only fetched the first time you export (the service worker keeps a copy for offline use)
  let xlsxPromise = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxPromise) xlsxPromise = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = res;
      sc.onerror = () => { xlsxPromise = null; rej(new Error('xlsx')); };
      document.head.appendChild(sc);
    });
    return xlsxPromise;
  }
  document.getElementById('exportXlsxBtn').onclick = () => {
    showToast('Preparing the Excel file…');
    loadXlsx().then(exportXlsx, () => showToast('Could not load the Excel library. Check your connection and try again.'));
  };
  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    // use whichever is larger: the current set count, or the most sets any logged entry actually has
    let maxSetsInData = numSets;
    categories.forEach(cat => (data[cat] || []).forEach(e => {
      if (e.sets && e.sets.length > maxSetsInData) maxSetsInData = e.sets.length;
    }));
    categories.forEach(cat => {
      const rows = (data[cat] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const header = ['Date', 'Exercise', 'Type', 'Left/Right', 'Weight (kg)', 'Distance (km)', 'Superset', 'Attempts (s)', 'Equipment', 'Time (min)', 'Elevation (m)', 'Rucking (kg)', 'Run variation'];
      for (let i = 1; i <= maxSetsInData; i++) { header.push(`Set ${i} value`); header.push(`Set ${i} ecc (s)`); header.push(`Set ${i} kg`); header.push(`Set ${i} angle`); header.push(`Set ${i} equipment`); header.push(`Set ${i} variation`); header.push(`Set ${i} RPE`); header.push(`Set ${i} pain / form`); header.push(`Set ${i} chained`); }
      header.push('Notes');
      const sheetData = [header];
      rows.forEach(e => {
        const sets = e.sets || [];
        const row = [e.date, e.exercise || '', e.isometric ? 'Isometric (sec)' : 'Reps', e.unilateral ? 'Yes' : '', e.weightKg || '', e.distance || '', e.supersetId || '', (e.attempts && e.attempts.length) ? e.attempts.join(', ') : '', e.equipment || '', e.timeMinutes != null ? e.timeMinutes : '', e.elevation != null ? e.elevation : '', e.ruckKg != null ? e.ruckKg : '', e.variation || ''];
        for (let i = 0; i < maxSetsInData; i++) {
          const s = sets[i];
          if (s && typeof s === 'object') {
            row.push(s.left !== undefined ? `L${s.left}/R${s.right}` : (s.reps !== undefined ? s.reps : ''));
            row.push(s.eccentric !== undefined && s.eccentric !== null ? s.eccentric : '');
            row.push(s.kg !== undefined && s.kg !== null ? s.kg : '');
            row.push(s.angle || '');
            row.push(s.equipment || '');
            row.push(s.variation || '');
            row.push(s.rpe || '');
            row.push([s.pain ? 'pain' : '', s.formBroke ? 'form broke' : ''].filter(Boolean).join(' + '));
            row.push(s.chain ? 'yes' : '');
          } else {
            row.push(s !== undefined ? s : '');
            for (let k = 0; k < 8; k++) row.push('');
          }
        }
        row.push(e.notes || '');
        sheetData.push(row);
      });
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const cols = [{wch:12},{wch:20},{wch:14},{wch:10},{wch:8},{wch:11},{wch:14},{wch:20},{wch:12},{wch:11},{wch:11},{wch:11},{wch:14}];
      for (let i = 0; i < maxSetsInData; i++) { cols.push({wch:6}); cols.push({wch:6}); cols.push({wch:6}); cols.push({wch:10}); cols.push({wch:12}); cols.push({wch:14}); cols.push({wch:6}); cols.push({wch:14}); cols.push({wch:8}); }
      cols.push({wch:30});
      ws['!cols'] = cols;
      XLSX.utils.book_append_sheet(wb, ws, cat.substring(0, 31));
    });
    if (bodyweightLog.length) {
      const bwRows = [['Date', 'Bodyweight (kg)']].concat(bodyweightLog.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, e.kg]));
      const bwSheet = XLSX.utils.aoa_to_sheet(bwRows);
      bwSheet['!cols'] = [{wch:12},{wch:16}];
      const taken = new Set(categories.map(c => c.substring(0, 31).toLowerCase()));
      XLSX.utils.book_append_sheet(wb, bwSheet, taken.has('bodyweight') ? 'Bodyweight log' : 'Bodyweight');
    }
    const stamp = timestampForFilename();
    XLSX.writeFile(wb, `workout-log-${stamp}.xlsx`);
    menuPanel.classList.add('hidden');
  }


  function buildBackupPayload() {
    return {
      weightsInKg: true, deleted: deletedEntries, removedExercises,
      data, lists: { categories, exercises: exerciseLists, colors: categoryColors }, layout, blocks: { names: blocks, refs: blockRefs, plans: planBlocks },
      equipment: { list: equipmentList, colors: equipmentColors },
      bodyweight: bodyweightLog,
      skills: skillLines,
      parts: Object.keys(backupParts).reduce((o, k) => { o[k] = backupParts[k].get(); return o; }, {})
    };
  }
  const backupParts = {};
  const PREFS_TS = 'workout-log-prefs-ts-v1';
  backupParts.prefs = {
    get: () => ({ units: unitSystem, weekStart, at: Number(localStorage.getItem(PREFS_TS)) || 0 }),
    merge: (p) => {
      if (!p || !(p.at > (Number(localStorage.getItem(PREFS_TS)) || 0))) return; // only a more recent change from another device is applied
      if (p.units === 'metric' || p.units === 'imperial') { unitSystem = p.units; saveUnits(unitSystem); renderUnitsToggle(); renderModifiers(); renderBodyweightList(); }
      if (p.weekStart === 0 || p.weekStart === 1) { weekStart = p.weekStart; lsSet(Shared.WEEK_KEY, weekStart); renderWeekToggle(); renderCalendar(); renderEntries(); }
      lsSet(PREFS_TS, p.at);
    }
  };
  backupParts.planProgress = {
    get: () => ({ meta: planMeta, progress: planProgress }),
    merge: (inc) => {
      if (!inc || typeof inc !== 'object') return;
      Object.keys(inc.meta || {}).forEach(k => { if (!planMeta[k]) planMeta[k] = inc.meta[k]; });
      Object.keys(inc.progress || {}).forEach(uid => {
        const src = inc.progress[uid] || {};
        const a = planProgress[uid] || (planProgress[uid] = { started: src.started, sessions: [] });
        const seen = new Set(a.sessions.map(x => x.date + '|' + x.day));
        (src.sessions || []).forEach(x => { if (x && x.date && !seen.has(x.date + '|' + x.day)) { a.sessions.push(x); seen.add(x.date + '|' + x.day); } });
        a.sessions.sort((x, y) => x.date.localeCompare(y.date));
        if (a.sessions.length) a.started = a.sessions[0].date;
      });
      savePlanMeta(); savePlanProgress(); renderPlanStrip();
    }
  }; // extra data owned by the external scripts: { key: { get(), merge(incoming) } }

  // Hooks used by workout-profile.js (avatar, progress photos, Drive sync).
  window.WorkoutApp = {
    buildBackupPayload: () => buildBackupPayload(),
    categoryColor: (c) => getCategoryColor(c),
    recalcPRs: (n) => recalcPRs(n),
    logRoutineEntry: (n, sec, notes) => logRoutineEntry(n, sec, notes),
    fillPatterns: () => fillMissingPatterns(),
    registerPlanBlock: (n, m) => { planMeta[n] = m; savePlanMeta(); renderPlanStrip(); },
    planSessions: (uid) => ((planProgress[uid] || {}).sessions || []).length,
    metricsInfo: () => { const n = currentExerciseName(); return { isometric: !!n && isIsometricExercise(n) && !isDistanceExercise(n), distance: !!n && isDistanceExercise(n) }; },
    refileExercise: (n, f, t) => refileExercise(n, f, t),
    refreshAfterRefile: () => { renderBlockSelect(); updateExercisePicker(); render(); },
    importBackupText: (text, opts) => importBackupText(text, opts),
    showToast: (msg) => showToast(msg),
    registerBackupPart: (key, part) => { backupParts[key] = part; },
    addSkillTemplates: (t) => addSkillTemplates(t),
    ensureExercises: (items) => ensureExercises(items),
    exerciseVariations: (name) => exerciseVariations(name),
    // best so far for a measurable goal: link = { exercise, variation ('' = any, '__none__' = standard), metric: hold | reps | weight, target }
    goalProgress: (link) => {
      const v = link.variation || '', rows = [];
      categories.forEach(cat => (data[cat] || []).forEach(e => {
        if (!sameExName(e.exercise, link.exercise)) return;
        (e.sets || []).forEach(s => {
          if (!s || typeof s !== 'object') return;
          if (!(v === '' || (v === '__none__' ? !setVar(s) : setVar(s) === v))) return;
          if (link.metric === 'weight') { const kg = Number(s.kg); if (kg > 0 && !s.formBroke) rows.push({ date: e.date, value: kg }); }
          else if (link.metric === 'hold') { if (e.isometric) rows.push({ date: e.date, value: Shared.cleanReps(s) }); }
          else if (!e.isometric) rows.push({ date: e.date, value: Shared.cleanReps(s) });
        });
        if (link.metric === 'hold' && e.isometric && (v === '' || v === '__none__')) (e.attempts || []).forEach(a => { const n = Number(a); if (n > 0) rows.push({ date: e.date, value: n }); });
      }));
      rows.sort((a, b) => a.date.localeCompare(b.date));
      let best = null, bestDate = null, reachedDate = null;
      rows.forEach(r => {
        if (r.value > 0 && (best === null || r.value > best)) { best = r.value; bestDate = r.date; }
        if (reachedDate === null && r.value >= link.target) reachedDate = r.date;
      });
      return { best, bestDate, reachedDate };
    },
    refreshVariations: () => { updateMetricsSection(currentExerciseName()); renderModifiers(); },
    listExercisesForVariations: () => listExercisesForVariations(),
    setCustomVariations: (cat, name, list) => setCustomVariations(cat, name, list),
    planMerge: (c, n, t, v) => planMerge(c, n, t, v),
    applyMerge: (c, n, t, v) => applyMerge(c, n, t, v),
    snapshotForUndo: () => snapshotForUndo(),
    hasMergeUndo: () => hasMergeUndo(),
    undoLastMerge: () => undoLastMerge(),
    startPlanBlock: (name, refs) => startPlanBlock(name, refs),
    deletePlanBlocks: (names) => deletePlanBlocks(names),
    skillLineNames: () => skillLines.map(l => l.name),
    weightUnit: () => weightUnitLabel(),
    // numbers behind the achievements (see workout-library.json)
    stats: () => {
      const dates = new Set(); let entries = 0, prs = 0;
      categories.forEach(cat => (data[cat] || []).forEach(e => { entries++; if (e.date) dates.add(e.date); if (e.isPR) prs++; }));
      const weeks = Array.from(new Set(Array.from(dates).map(getWeekStart))).sort();
      let streakWeeks = 0, run = 0, prev = null;
      weeks.forEach(w => {
        const gap = prev ? Math.round((new Date(w + 'T00:00:00') - new Date(prev + 'T00:00:00')) / 86400000) : 0;
        run = (prev && gap === 7) ? run + 1 : 1;
        if (run > streakWeeks) streakWeeks = run;
        prev = w;
      });
      const skillSteps = skillLines.reduce((n, l) => n + l.steps.filter(s => s.doneDate).length, 0);
      return { entries, workoutDays: dates.size, prs, streakWeeks, skillSteps, bodyweightLogs: bodyweightLog.length };
    },
    renderBodyweight: () => renderBodyweightList(),
    // latest weigh-in on or before a date, formatted in the user's unit ('' if none yet)
    bodyweightOn: (iso) => {
      const past = bodyweightLog.filter(e => e.date <= iso).sort((a, b) => b.date.localeCompare(a.date))[0];
      return past ? `${round2(kgToDisplay(past.kg))} ${weightUnitLabel()}` : '';
    }
  };

  document.getElementById('exportJsonBtn').onclick = () => {
    const payload = buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = timestampForFilename();
    a.href = url;
    a.download = `workout-log-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    menuPanel.classList.add('hidden');
  };

  // Auto-carries the current data to the graph page over postMessage instead of
  // requiring a manual export + "Load backup" import there. Two paths, both harmless
  // to run together: (1) a fresh graph window announces itself as ready once its own
  // message listener is live, and we reply with the data then; (2) if the graph
  // window was already open (window.open just refocuses it, no reload/no fresh
  // "ready" signal), a short delayed push after opening covers that case too.
  let graphWindowRef = null;
  function sendDataToGraphWindow(win) {
    if (!win) return;
    try { win.postMessage({ type: 'workout-data', backup: buildBackupPayload() }, '*'); } catch (e) { /* ignore */ }
  }
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'graph-ready' && graphWindowRef && ev.source === graphWindowRef) {
      sendDataToGraphWindow(graphWindowRef);
    }
  });
  const graphLink = document.getElementById('graphLink');
  // Hosted on a web address (https / localhost) both pages share the same saved data, so the graph simply opens
  // in this window like any other link. Only a copy opened straight from disk needs the separate-window hand-off.
  graphLink.addEventListener('click', () => {
    if (location.protocol !== 'file:') return;
    // opened from disk: leave the current data where the graph page looks for it, then navigate normally (same window)
    try { localStorage.setItem('workout-graph-cache-v1', JSON.stringify({ backup: buildBackupPayload(), savedAt: Date.now() })); } catch (err) { /* ignore */ }
  });

  const importFileInput = document.getElementById('importFile');
  document.getElementById('importJsonBtn').onclick = () => {
    importFileInput.click();
    menuPanel.classList.add('hidden');
  };
  importFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      importBackupText(evt.target.result);
      importFileInput.value = '';
    };
    reader.readAsText(file);
  };
  // Merges a backup (JSON text) into the app. Returns true on success. Also used by Google Drive sync.
  function importBackupText(text, opts) {
      try {
        const parsed = JSON.parse(text);
        const incomingData = parsed.data || parsed;
        // exercises removed on the other device: remember them, so they are not added back below
        if (parsed.removedExercises && typeof parsed.removedExercises === 'object') {
          Object.keys(parsed.removedExercises).forEach(k => { const t = Number(parsed.removedExercises[k]) || 0; if (t > (removedExercises[k] || 0)) removedExercises[k] = t; });
          saveRemovedEx();
        }
        // an older backup has set weights as typed: treat them as the unit currently selected
        if (!parsed.weightsInKg && unitSystem === 'imperial') {
          Object.keys(incomingData).forEach(c => (Array.isArray(incomingData[c]) ? incomingData[c] : []).forEach(en => (en && en.sets || []).forEach(st => {
            if (st && typeof st === 'object' && st.kg != null && st.kg !== '' && !isNaN(Number(st.kg))) st.kg = Math.round(Number(st.kg) / KG_TO_LB * 1000) / 1000;
          })));
        }
        if (parsed.lists && parsed.lists.categories && parsed.lists.exercises) {
          parsed.lists.categories.forEach(c => {
            if (c === LEGACY_MAIN_CATEGORY) return;
            if (!categories.includes(c)) categories.push(c);
            if (!exerciseLists[c]) exerciseLists[c] = [];
            if (!data[c]) data[c] = [];
          });
          Object.keys(parsed.lists.exercises).forEach(c => {
            if (c === LEGACY_MAIN_CATEGORY || !categories.includes(c)) return;
            const incomingEx = migrateList(parsed.lists.exercises[c] || []);
            const merged = (exerciseLists[c] || []).slice();
            incomingEx.forEach(ex => {
              const hit = merged.find(e => e.name.toLowerCase() === ex.name.toLowerCase());
              if (hit) { if (Array.isArray(ex.variations) && ex.variations.length) hit.variations = Array.from(new Set((hit.variations || []).concat(ex.variations))); } // variation lists add up
              else if (!exRemovedAfter(ex)) merged.push(ex);
            });
            exerciseLists[c] = merged;
          });
          if (parsed.lists.colors) categoryColors = Object.assign({}, parsed.lists.colors, categoryColors);
          saveLists();
        }
        if (parsed.layout && Array.isArray(parsed.layout)) {
          layout = parsed.layout.filter(p => MODULE_LABELS[p.id]);
          saveLayout();
        }
        if (parsed.blocks && Array.isArray(parsed.blocks.names) && parsed.blocks.refs) {
          parsed.blocks.names.forEach(name => {
            if (!blocks.includes(name)) blocks.push(name);
            if (!blockRefs[name]) blockRefs[name] = [];
          });
          Object.keys(parsed.blocks.refs).forEach(name => {
            const incomingRefs = parsed.blocks.refs[name] || [];
            const existingNames = new Set((blockRefs[name] || []).map(r => r.name));
            const merged = (blockRefs[name] || []).slice();
            incomingRefs.forEach(r => { if (r && r.name && !existingNames.has(r.name)) merged.push(r); });
            blockRefs[name] = merged;
          });
          (Array.isArray(parsed.blocks.plans) ? parsed.blocks.plans : []).forEach(n => { if (blocks.includes(n) && !planBlocks.includes(n)) planBlocks.push(n); });
          saveBlocks();
          renderBlockSelect();
        }
        if (parsed.equipment && Array.isArray(parsed.equipment.list)) {
          parsed.equipment.list.forEach(name => {
            if (typeof name === 'string' && name.trim() && !equipmentList.includes(name)) {
              equipmentList.push(name);
              const c = parsed.equipment.colors && parsed.equipment.colors[name];
              if (c && !equipmentColors[name]) equipmentColors[name] = c;
            }
          });
          saveEquipment();
          renderEquipmentSelect();
        }
        if (Array.isArray(parsed.bodyweight)) {
          const haveDates = new Set(bodyweightLog.map(e => e.date));
          parsed.bodyweight.forEach(e => {
            if (e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number(e.kg) > 0 && !haveDates.has(e.date)) {
              bodyweightLog.push({ id: e.id || (Date.now().toString() + Math.random().toString(36).slice(2, 6)), date: e.date, kg: Number(e.kg) });
              haveDates.add(e.date);
            }
          });
          saveBodyweight();
        }
        if (Array.isArray(parsed.skills)) {
          parsed.skills.map(cleanSkillLine).filter(Boolean).forEach(l => {
            if (!skillLines.some(x => x.name.toLowerCase() === l.name.toLowerCase())) skillLines.push(l);
          });
          saveSkills();
        }
        // deletions travel with the backup: an entry deleted on another device is removed here too
        if (parsed.deleted && typeof parsed.deleted === 'object') Object.keys(parsed.deleted).forEach(id => { if (!deletedEntries[id]) deletedEntries[id] = parsed.deleted[id]; });
        const where = {};
        categories.forEach(c => (data[c] || []).forEach(en => { where[en.id] = c; }));
        // an entry moved to another category on the other device (merge, tidy categories) moves here too, if that copy is newer
        categories.forEach(c => {
          if (!Array.isArray(incomingData[c])) return;
          incomingData[c].forEach(en => {
            if (!en || deletedEntries[en.id]) return;
            const from = where[en.id];
            if (from === undefined || from === c) return;
            const cur = (data[from] || []).find(x => x.id === en.id);
            if ((en.updatedAt || 0) > ((cur || {}).updatedAt || 0)) {
              data[from] = data[from].filter(x => x.id !== en.id);
              (data[c] = data[c] || []).push(en);
              where[en.id] = c;
            }
          });
        });
        categories.forEach(c => {
          const merged = (data[c] || []).filter(en => !deletedEntries[en.id]);
          if (Array.isArray(incomingData[c])) {
            incomingData[c].forEach(en => {
              if (!en || deletedEntries[en.id]) return;
              if (where[en.id] === undefined) { merged.push(en); where[en.id] = c; }
              else if (where[en.id] === c && (en.updatedAt || 0) > ((merged.find(x => x.id === en.id) || {}).updatedAt || 0)) {
                const i = merged.findIndex(x => x.id === en.id);
                if (i >= 0) merged[i] = en; // the copy edited more recently wins
              }
            });
          }
          data[c] = merged;
        });
        // exercises removed elsewhere that no longer have any entries here disappear too
        categories.forEach(c => { exerciseLists[c] = (exerciseLists[c] || []).filter(ex => !exRemovedAfter(ex) || categories.some(cc => (data[cc] || []).some(en => en.exercise === ex.name))); });
        saveLists();
        saveDeleted();
        saveData();
        updateExercisePicker();
        applyLayout();
        render();
        renderCatEditList();
        if (parsed.parts && typeof parsed.parts === 'object') {
          Object.keys(parsed.parts).forEach(k => { if (backupParts[k]) { try { backupParts[k].merge(parsed.parts[k]); } catch (e) { /* skip a bad part */ } } });
        }
        if (!(opts && opts.quiet)) showToast('Backup imported');
        return true;
      } catch (err) {
        errEl.textContent = 'That file could not be read as a valid backup.';
        errEl.classList.remove('hidden');
        return false;
      }
  }

  function renderThemeSwatches() {
    const wrap = document.getElementById('themeSwatches');
    wrap.innerHTML = '';
    THEMES.forEach((t, idx) => {
      const b = document.createElement('button');
      b.className = 'theme-swatch' + (idx === themeIndex ? ' active' : '');
      b.style.background = t.accent;
      b.title = t.name;
      b.setAttribute('aria-label', 'Theme: ' + t.name);
      b.onclick = () => {
        themeIndex = idx;
        applyTheme(themeIndex);
        saveTheme(themeIndex);
        renderThemeSwatches();
      };
      wrap.appendChild(b);
    });
  }

  // Leaving this page (for example to look at the graphs) and coming back reloads it, so the work in progress that isn't
  // logged yet is parked in sessionStorage (this tab only, cleared when the tab or app is closed) and put back on return.
  const SESSION_KEY = 'workout-log-session-v1';
  function hasTypedValues() {
    return Array.from(document.querySelectorAll('#setsGrid input, #attemptsGrid input[type="number"]')).some(i => i.value !== '') || notesInput.value.trim() !== '';
  }
  function saveSession() {
    if (location.hash === '#recalc') return; // the hidden copy opened by the graph page must not touch the saved session
    try {
      if (selectedExercise && hasTypedValues()) snapshotDraft(selectedExercise);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        at: Date.now(), date: dateInput.value, category: active, block: activeBlock, exercise: selectedExercise,
        drafts: exerciseDrafts, superset: activeSuperset, members: Array.from(supersetMembers)
      }));
    } catch (e) { /* storage unavailable: nothing is lost that was saved before */ }
  }
  window.addEventListener('pagehide', saveSession);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSession(); });
  function restoreSession() {
    if (location.hash === '#recalc') return;
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return; }
    if (!s || !(Date.now() - s.at < 12 * 3600 * 1000)) return;
    try {
      if (s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date)) { dateInput.value = s.date; updateHeaderDateDisplay(); }
      if (s.category && categories.includes(s.category)) active = s.category;
      activeBlock = (s.block && blocks.includes(s.block)) ? s.block : null;
      exerciseDrafts = (s.drafts && typeof s.drafts === 'object') ? s.drafts : {};
      if (s.superset && s.superset.id) { activeSuperset = s.superset; supersetMembers = new Set(s.members || []); }
      renderBlockSelect();
      updateExercisePicker();
      if (s.exercise && sortedExerciseList().some(p => p.exObj.name === s.exercise)) {
        selectedExercise = s.exercise;
        updateExercisePicker();
        restoreDraft(s.exercise);
        renderModifiers();
      }
      updateSupersetUI();
    } catch (e) { /* a stale or odd session is simply ignored */ }
  }

  applyMode(themeMode);
  renderModeToggle();
  applyTheme(themeIndex);
  buildSetsGrid();
  buildAttemptsGrid();
  loadData();
  saveData(); // also compacts data saved by an older version
  // one-time: set weights used to be stored as typed; from now on they are stored in kg
  (function migrateWeightsToKg() {
    const FLAG = 'workout-log-weights-kg-v1';
    try { if (localStorage.getItem(FLAG)) return; } catch (e) { return; }
    if (unitSystem === 'imperial') {
      categories.forEach(c => (data[c] || []).forEach(en => (en.sets || []).forEach(st => {
        if (st && typeof st === 'object' && st.kg != null && st.kg !== '' && !isNaN(Number(st.kg))) st.kg = Math.round(Number(st.kg) / KG_TO_LB * 1000) / 1000;
      })));
      saveData();
    }
    lsSet(FLAG, '1');
  })();
  loadLayout();
  renderBlockSelect();
  renderEquipmentSelect();
  fillMissingPatterns();
  updateSkillsBadge();
  updateExercisePicker();
  applyLayout();
  renderThemeSwatches();
  navigateTo(({ '#history': 'history', '#config': 'config', '#skills': 'skills' })[location.hash] || 'home');
  restoreSession();
  render();
  // the graph page's "Recalculate PRs" opens this page hidden with #recalc and waits for the answer
  if (location.hash === '#recalc' && window.parent !== window) {
    const n = recalcPRs();
    try { window.parent.postMessage({ type: 'recalc-done', n }, location.origin); } catch (e) { /* ignore */ }
  }
})();
