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

  // ---------- your own warm-ups and stretches ----------
  var CUSTOM_KEY = 'workout-log-custom-routines-v1';
  var custom = { items: [], removed: {} };
  try {
    var sv = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (sv && Array.isArray(sv.items)) custom.items = sv.items.filter(function (r) { return r && r.id && r.name && arr(r.exercises).length; });
    if (sv && sv.removed && typeof sv.removed === 'object') custom.removed = sv.removed;
  } catch (e) { /* none yet */ }
  function saveCustom() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch (e) { /* ignore */ } }
  function find(id) {
    var lib = Lib.get();
    return arr(lib && lib.warmups).concat(arr(lib && lib.stretches), custom.items).filter(function (r) { return r.id === id; })[0] || null;
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
  var UI = window.WorkoutShared.ui;
  var mod = document.createElement('div');
  mod.className = 'module lib-routines'; mod.id = 'libRoutines';
  mod.innerHTML =
    '<div class="section-label-row"><div class="section-label">Warm-ups &amp; stretches</div><button class="icon-btn" id="routinesCollapseBtn" type="button"></button></div>' +
    '<div id="routinesBody">' +
      '<div class="empty" style="padding:0 0 8px;">Tap a name to see its moves. Play guides you through it with a countdown for each move; sides switch automatically, and you can log the routine as one entry at the end.</div>' +
      '<div id="routineList"></div>' +
      '<details class="lib-create" id="routineCreate"><summary><i class="fa-solid fa-plus" aria-hidden="true"></i> <span id="rtFormTitle">Create your own warm-up or stretch</span></summary>' +
        '<input type="text" id="rtName" placeholder="Name (e.g. Pull day warm-up)" maxlength="60" />' +
        '<select id="rtKind" aria-label="Type"><option value="warmup">Warm-up</option><option value="stretch">Stretch</option></select>' +
        '<textarea id="rtMoves" rows="6" placeholder="One move per line, for example:\nJumping jacks - 45 s\nShoulder circles - 5 reps per direction\nDeep squat hold - 2 x 30 s\nCouch stretch - 45 s per side"></textarea>' +
        '<div class="empty" style="padding:4px 0 0; font-size:12px;">Use "per side" for moves done on both sides, and "2 x" to repeat a move. A move with no time or reps gets 30 s.</div>' +
        '<div class="var-actions"><button type="button" class="primary-btn" id="rtSave">Add</button><button type="button" class="text-btn hidden" id="rtCancel">Cancel</button></div>' +
      '</details>' +
    '</div>';
  root.appendChild(mod);
  function $m(id) { return mod.querySelector('#' + id); }
  UI.collapse($m('routinesCollapseBtn'), $m('routinesBody'), 'collapsed:routines');
  var editingId = null;

  function movesLine(x) { return esc(x.name) + ' — ' + esc((x.sets > 1 ? x.sets + ' × ' : '') + (x.target || '')) + (x.note ? ' <span class="lib-note">(' + esc(x.note) + ')</span>' : ''); }
  function rowHTML(item) {
    var r = item.r, open = !!UI.get('routine:' + r.id, false), n = stepsFor(r).length;
    return '<div class="routine-item" data-id="' + esc(r.id) + '"><div class="routine-head">' +
      '<button type="button" class="routine-toggle" data-toggle="' + esc(r.id) + '" aria-expanded="' + open + '"><i class="fa-solid fa-chevron-' + (open ? 'down' : 'right') + '" aria-hidden="true"></i>' +
        '<span><b>' + esc(r.name) + '</b>' + (item.own ? ' <span class="lib-badge">Own</span>' : '') + '<span class="routine-meta">~' + (r.minutes || 5) + ' min · ' + arr(r.exercises).length + ' moves · ' + n + ' steps</span></span></button>' +
      (item.own ? '<button type="button" class="icon-btn" data-edit="' + esc(r.id) + '" aria-label="Edit ' + esc(r.name) + '" title="Edit"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button>' +
        '<button type="button" class="icon-btn" data-del="' + esc(r.id) + '" aria-label="Delete ' + esc(r.name) + '" title="Delete"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>' : '') +
      '<button type="button" class="lib-start-btn primary" data-play="' + esc(r.id) + '"><i class="fa-solid fa-play" aria-hidden="true"></i> Play</button></div>' +
      '<ul class="routine-moves' + (open ? '' : ' hidden') + '">' + arr(r.exercises).map(function (x) { return '<li>' + movesLine(x) + '</li>'; }).join('') + '</ul></div>';
  }
  function renderList() {
    var lib = Lib.get(), box = $m('routineList');
    function group(title, libList, kind) {
      var items = arr(libList).map(function (r) { return { r: r, own: false }; }).concat(custom.items.filter(function (r) { return (r.kind === 'stretch' ? 'stretch' : 'warmup') === kind; }).map(function (r) { return { r: r, own: true }; }));
      return items.length ? '<div class="lib-filter-label routine-group">' + title + '</div>' + items.map(rowHTML).join('') : '';
    }
    box.innerHTML = group('Warm-ups', lib && lib.warmups, 'warmup') + group('Stretches', lib && lib.stretches, 'stretch');
  }
  // ---- create / edit your own ----
  function parseMoves(text) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^(.+?)\s+[–—-]\s+(.+)$/) || l.match(/^(.+?):\s*(.+)$/);
      var name = m ? m[1].trim() : l, target = m ? m[2].trim() : '30 s', sets = 1;
      var sm = target.match(/^(\d+)\s*[x×]\s*(.+)$/i);
      if (sm) { sets = Math.min(10, Math.max(1, +sm[1])); target = sm[2].trim(); }
      return { name: name, sets: sets, target: target };
    });
  }
  function movesText(r) { return arr(r.exercises).map(function (x) { return x.name + ' - ' + (x.sets > 1 ? x.sets + ' x ' : '') + x.target; }).join('\n'); }
  function estMinutes(ex) {
    var t = 0; stepsFor({ exercises: ex }).forEach(function (s) { t += (s.secs || (s.reps ? s.reps * 3 : 20)) + 3; });
    return Math.max(1, Math.round(t / 60));
  }
  function resetForm() {
    editingId = null; $m('rtName').value = ''; $m('rtMoves').value = ''; $m('rtKind').value = 'warmup';
    $m('rtSave').textContent = 'Add'; $m('rtCancel').classList.add('hidden'); $m('rtFormTitle').textContent = 'Create your own warm-up or stretch';
  }
  $m('rtSave').onclick = function () {
    var name = $m('rtName').value.trim(), moves = parseMoves($m('rtMoves').value);
    if (!name) { App.showToast('Give it a name'); return; }
    if (!moves.length) { App.showToast('Add at least one move'); return; }
    var kind = $m('rtKind').value === 'stretch' ? 'stretch' : 'warmup', now = Date.now();
    var item = editingId ? custom.items.filter(function (r) { return r.id === editingId; })[0] : null;
    if (!item) { item = { id: 'cu-' + now.toString(36) + Math.random().toString(36).slice(2, 6) }; custom.items.push(item); }
    item.name = name; item.kind = kind; item.exercises = moves; item.minutes = estMinutes(moves); item.updatedAt = now;
    saveCustom(); resetForm(); $m('routineCreate').open = false; renderList();
    App.showToast(editingId ? 'Saved' : 'Added to your warm-ups & stretches');
  };
  $m('rtCancel').onclick = function () { resetForm(); $m('routineCreate').open = false; };
  mod.onclick = function (e) {
    var b;
    if ((b = e.target.closest('[data-play]'))) { play(b.dataset.play); return; }
    if ((b = e.target.closest('[data-toggle]'))) {
      var row = b.closest('.routine-item'), ul = row.querySelector('.routine-moves'), open = ul.classList.contains('hidden');
      ul.classList.toggle('hidden', !open); b.setAttribute('aria-expanded', String(open));
      b.querySelector('i').className = 'fa-solid fa-chevron-' + (open ? 'down' : 'right');
      UI.set('routine:' + b.dataset.toggle, open); return;
    }
    if ((b = e.target.closest('[data-edit]'))) {
      var r = custom.items.filter(function (x) { return x.id === b.dataset.edit; })[0]; if (!r) return;
      editingId = r.id; $m('rtName').value = r.name; $m('rtKind').value = r.kind === 'stretch' ? 'stretch' : 'warmup'; $m('rtMoves').value = movesText(r);
      $m('rtSave').textContent = 'Save changes'; $m('rtCancel').classList.remove('hidden'); $m('rtFormTitle').textContent = 'Edit "' + r.name + '"';
      $m('routineCreate').open = true; $m('rtName').focus(); return;
    }
    if ((b = e.target.closest('[data-del]'))) {
      var d = custom.items.filter(function (x) { return x.id === b.dataset.del; })[0];
      if (!d || !confirm('Delete "' + d.name + '"?')) return;
      custom.items = custom.items.filter(function (x) { return x.id !== d.id; }); custom.removed[d.id] = Date.now();
      if (editingId === d.id) resetForm();
      saveCustom(); renderList();
    }
  };
  // your own routines travel with backups and Drive sync
  if (App.registerBackupPart) App.registerBackupPart('customRoutines', {
    get: function () { return custom; },
    merge: function (inc) {
      if (!inc || typeof inc !== 'object') return;
      Object.keys(inc.removed || {}).forEach(function (k) { if ((+inc.removed[k] || 0) > (custom.removed[k] || 0)) custom.removed[k] = +inc.removed[k]; });
      arr(inc.items).forEach(function (r) {
        if (!r || !r.id || !r.name || !arr(r.exercises).length || custom.removed[r.id]) return;
        var have = custom.items.filter(function (x) { return x.id === r.id; })[0];
        if (!have) custom.items.push(r);
        else if ((r.updatedAt || 0) > (have.updatedAt || 0)) Object.assign(have, r);
      });
      custom.items = custom.items.filter(function (r) { return !custom.removed[r.id]; });
      saveCustom(); renderList();
    }
  });
  Lib.ready.then(renderList);
  Lib.onChange(renderList);
  renderList();

  window.WorkoutRoutines = { play: play };
})();
