/* Guided routine player: steps through a warm-up or stretch routine from the library with a countdown for each move,
   switches sides automatically, beeps before each change, and can log the whole routine as one entry.
   Shown at the bottom of the Skills page (Warm-ups & stretches) and from the Play buttons on plan cards. */
(function () {
  'use strict';
  var App = window.WorkoutApp, Lib = window.WorkoutLibrary, root = document.getElementById('libRoot');
  if (!App || !Lib || !root) return;

  function arr(x) { return Array.isArray(x) ? x : []; }
  function esc(s) { return window.WorkoutShared.escapeHtml(s); }

  // ---------- sound ----------
  var ctx = null;
  function audio() {
    try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { ctx = null; }
    return ctx;
  }
  function beep(freq, dur, delay) {
    if (!audio()) return;
    var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function buzz(p) { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } } }

  // ---------- turning the library text into steps ----------
  // "45 s per side" -> two timed steps; "10 reps" -> one step you finish with Done; "5 reps per direction" -> two rep steps
  function stepsFor(routine) {
    var steps = [];
    arr(routine.exercises).forEach(function (x, xi) {
      var t = String(x.target || ''), secs = 0, reps = 0;
      var m = t.match(/(\d+)\s*(min|sec|s)\b/i);
      if (m) secs = /min/i.test(m[2]) ? +m[1] * 60 : +m[1];
      else { var r = t.match(/(\d+)/); reps = r ? +r[1] : 0; }
      var sideWord = (t.match(/per (side|leg|arm)/i) || [])[1];
      var sides = sideWord ? ['Left ' + sideWord.toLowerCase(), 'Right ' + sideWord.toLowerCase()] : (/per direction/i.test(t) ? ['Direction 1', 'Direction 2'] : ['']);
      var sets = Math.max(1, +x.sets || 1);
      for (var s = 1; s <= sets; s++) {
        sides.forEach(function (side, si) {
          steps.push({ name: x.name, side: side, secs: secs, reps: reps, text: t, setNo: s, sets: sets, ex: xi, firstOfExercise: s === 1 && si === 0, note: x.note || '' });
        });
      }
    });
    return steps;
  }

  // ---------- player ----------
  var el = document.createElement('div');
  el.className = 'routine-player hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Guided routine');
  el.innerHTML =
    '<div class="rp-bar"><div class="rp-title" id="rpTitle">Routine</div><button type="button" class="icon-btn" id="rpClose" aria-label="Stop and close" title="Stop and close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
    '<div class="rp-body">' +
      '<div class="rp-progress"><div id="rpProgressFill"></div></div>' +
      '<div class="rp-count" id="rpCount"></div>' +
      '<div class="rp-phase" id="rpPhase"></div>' +
      '<div class="rp-name" id="rpName"></div>' +
      '<div class="rp-side" id="rpSide"></div>' +
      '<div class="rp-time" id="rpTime"></div>' +
      '<div class="rp-next" id="rpNext"></div>' +
      '<div class="rp-controls">' +
        '<button type="button" class="icon-btn rp-ctl" id="rpPrev" aria-label="Previous move" title="Previous"><i class="fa-solid fa-backward-step" aria-hidden="true"></i></button>' +
        '<button type="button" class="rp-main" id="rpMain">Pause</button>' +
        '<button type="button" class="icon-btn rp-ctl" id="rpSkip" aria-label="Next move" title="Next"><i class="fa-solid fa-forward-step" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="rp-finish hidden" id="rpFinish"><div class="rp-done-line" id="rpDoneLine"></div>' +
        '<button type="button" class="rp-main" id="rpLog">Log as one entry</button><button type="button" class="text-btn" id="rpCloseDone">Close</button></div>' +
    '</div>';
  document.body.appendChild(el);
  function $(id) { return el.querySelector('#' + id); }

  var P = null, timer = 0, lastTick = 0, lastWhole = -1;
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }
  function begin(i) {
    var s = P.steps[i]; P.i = i;
    var prev = P.steps[i - 1];
    var ready = (i === 0 || !prev || prev.ex !== s.ex) ? 5 : 3;
    P.phase = 'ready'; P.remMs = ready * 1000; lastWhole = -1;
    P.switching = !!(prev && prev.ex === s.ex && prev.side !== s.side);
    render();
  }
  function startRun() {
    var s = P.steps[P.i];
    beep(1200, 0.3); buzz(80);
    if (s.secs) { P.phase = 'run'; P.remMs = s.secs * 1000; lastWhole = -1; } else { P.phase = 'reps'; P.remMs = 0; }
    render();
  }
  function next() { if (P.i + 1 >= P.steps.length) finish(); else begin(P.i + 1); }
  function finish() {
    P.phase = 'done'; stopTimer(); beep(1000, 0.2); beep(1300, 0.2, 0.25); beep(1600, 0.35, 0.5); buzz([200, 100, 200]); render();
  }
  function tick() {
    var now = Date.now(), d = now - lastTick; lastTick = now;
    if (!P || P.paused || P.phase === 'done') return;
    P.elapsed += d;
    if (P.phase === 'ready' || P.phase === 'run') {
      P.remMs -= d;
      var whole = Math.ceil(P.remMs / 1000);
      if (whole !== lastWhole) { lastWhole = whole; if (whole > 0 && whole <= 3) beep(880, 0.12); }
      if (P.remMs <= 0) { if (P.phase === 'ready') startRun(); else { beep(1500, 0.2); next(); } return; }
    }
    render();
  }
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function render() {
    if (!P) return;
    var fin = P.phase === 'done';
    $('rpFinish').classList.toggle('hidden', !fin);
    el.querySelector('.rp-controls').classList.toggle('hidden', fin);
    $('rpTitle').textContent = P.routine.name;
    $('rpProgressFill').style.width = Math.round((fin ? P.steps.length : P.i) / P.steps.length * 100) + '%';
    if (fin) {
      $('rpCount').textContent = ''; $('rpPhase').textContent = 'Routine complete'; $('rpName').textContent = '';
      $('rpSide').textContent = ''; $('rpTime').textContent = mmss(P.elapsed / 1000); $('rpNext').textContent = '';
      $('rpDoneLine').textContent = P.steps.length + ' moves in ' + mmss(P.elapsed / 1000) + ' (' + (P.logged ? 'logged' : 'not logged yet') + ')';
      $('rpLog').disabled = !!P.logged;
      return;
    }
    var s = P.steps[P.i], nx = P.steps[P.i + 1];
    $('rpCount').textContent = 'Move ' + (P.i + 1) + ' of ' + P.steps.length;
    $('rpName').textContent = s.name;
    $('rpSide').textContent = s.side + (s.sets > 1 ? (s.side ? ' · ' : '') + 'set ' + s.setNo + ' of ' + s.sets : '');
    if (P.phase === 'ready') { $('rpPhase').textContent = P.switching ? 'Switch sides' : 'Get ready'; $('rpTime').textContent = mmss(P.remMs / 1000); }
    else if (P.phase === 'run') { $('rpPhase').textContent = 'Go'; $('rpTime').textContent = mmss(P.remMs / 1000); }
    else { $('rpPhase').textContent = 'Reps'; $('rpTime').textContent = s.reps ? s.reps + ' reps' : s.text; }
    $('rpNext').textContent = nx ? 'Next: ' + nx.name + (nx.side ? ' · ' + nx.side : '') : 'Last move';
    $('rpMain').textContent = P.phase === 'reps' ? 'Done' : (P.paused ? 'Resume' : 'Pause');
    el.className = 'routine-player phase-' + P.phase;
  }
  $('rpMain').onclick = function () {
    if (!P) return;
    if (P.phase === 'reps') { next(); return; }
    P.paused = !P.paused; lastTick = Date.now(); render();
  };
  $('rpSkip').onclick = function () { if (P && P.phase !== 'done') next(); };
  $('rpPrev').onclick = function () { if (P && P.phase !== 'done') begin(Math.max(0, P.i - 1)); };
  function close() { stopTimer(); P = null; el.className = 'routine-player hidden'; }
  $('rpClose').onclick = function () { if (!P || P.phase === 'done' || confirm('Stop this routine?')) close(); };
  $('rpCloseDone').onclick = close;
  $('rpLog').onclick = function () {
    if (!P || P.logged) return;
    if (App.logRoutineEntry && App.logRoutineEntry(P.routine.name, Math.round(P.elapsed / 1000), 'Guided routine, ' + P.steps.length + ' moves')) { P.logged = true; render(); }
  };

  function find(id) {
    var lib = Lib.get();
    if (!lib) return null;
    return arr(lib.warmups).concat(arr(lib.stretches)).filter(function (r) { return r.id === id; })[0] || null;
  }
  function play(id) {
    var r = find(id);
    if (!r) { if (App.showToast) App.showToast('That routine is not available'); return; }
    var steps = stepsFor(r);
    if (!steps.length) return;
    audio();
    P = { routine: r, steps: steps, i: 0, phase: 'ready', remMs: 0, paused: false, elapsed: 0, logged: false, switching: false };
    el.className = 'routine-player';
    lastTick = Date.now();
    stopTimer(); timer = setInterval(tick, 100);
    begin(0);
  }

  // ---------- list on the Skills page ----------
  var mod = document.createElement('div');
  mod.className = 'module lib-routines'; mod.id = 'libRoutines';
  mod.innerHTML = '<div class="section-label-row"><div class="section-label">Warm-ups &amp; stretches</div></div><div class="empty" style="padding:0 0 8px;">Tap Play to be guided through a routine with a countdown for each move. Sides switch automatically, and you can log the routine as one entry at the end.</div><div id="routineList"></div>';
  root.appendChild(mod);
  function renderList() {
    var lib = Lib.get(), box = mod.querySelector('#routineList');
    if (!lib) { box.innerHTML = ''; return; }
    var rows = arr(lib.warmups).map(function (r) { return ['Warm-up', r]; }).concat(arr(lib.stretches).map(function (r) { return ['Stretch', r]; }));
    box.innerHTML = rows.map(function (p) {
      var r = p[1], moves = stepsFor(r).length;
      return '<div class="routine-row"><div><b>' + esc(r.name) + '</b><div class="lib-bits">' + p[0] + ' · ~' + (r.minutes || 5) + ' min · ' + moves + ' moves</div></div>' +
        '<button type="button" class="lib-start-btn primary" data-play="' + esc(r.id) + '"><i class="fa-solid fa-play" aria-hidden="true"></i> Play</button></div>';
    }).join('');
  }
  mod.onclick = function (e) { var b = e.target.closest('[data-play]'); if (b) play(b.dataset.play); };
  Lib.ready.then(renderList);
  Lib.onChange(renderList);
  renderList();

  window.WorkoutRoutines = { play: play };
})();
