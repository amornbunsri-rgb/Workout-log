/* Hold timer and rest timer for the workout log.
   - Hold timer (timed/isometric exercises): short "get ready" countdown, then counts the hold, then writes the seconds into the
     first empty set (or attempt) field. One-sided sets are filled left first, then right.
   - Rest timer: counts down after each set. Turn "Auto rest timer" on to start it whenever you finish typing a set, or
     after a hold you timed here. Settings are remembered on this device.
   Loaded after the main script (see workout-log-standalone.html); talks to it through window.WorkoutApp and the page's inputs. */
(function () {
  'use strict';
  var App = window.WorkoutApp;
  var header = document.querySelector('.metrics-header-left');
  if (!App || !header) return;

  var KEY = 'workout-log-holdtimer-v1';
  var cfg = { prep: 5, rest: 90, autoRest: false };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY));
    if (sv) {
      if ([0, 3, 5, 10, 15].indexOf(+sv.prep) >= 0) cfg.prep = +sv.prep;
      if (+sv.rest >= 10 && +sv.rest <= 600) cfg.rest = +sv.rest;
      cfg.autoRest = !!sv.autoRest;
    }
  } catch (e) { /* defaults */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }

  // ---------- audio ----------
  var ctx = null;
  function audio() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    return ctx;
  }
  function beep(freq, dur, delay) {
    if (!audio()) return;
    var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function buzz(p) { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } } }
  document.addEventListener('pointerdown', function () { audio(); }, { once: true });

  // ---------- DOM ----------
  var btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'holdTimerBtn'; btn.className = 'pill-select-btn';
  btn.innerHTML = '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> <span id="holdBtnLabel">Rest</span>';
  header.appendChild(btn);

  var bar = document.createElement('div');
  bar.className = 'hold-bar hidden';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Hold and rest timer');
  bar.innerHTML =
    '<div class="hold-head"><span id="hbPhase">Timer</span><button type="button" class="tools-close" id="hbClose" aria-label="Close" title="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
    '<div class="hold-time" id="hbTime">0:00</div>' +
    '<div class="hold-sub" id="hbSub"></div>' +
    '<div class="hold-actions"><button type="button" class="hold-primary" id="hbMain">Start</button><button type="button" id="hbAlt">Skip</button></div>' +
    '<div class="hold-settings">' +
      '<label class="hold-only">Get ready <select id="hbPrep"></select></label>' +
      '<label><input type="checkbox" id="hbAuto" /> Auto rest timer</label>' +
      '<label>Rest <select id="hbRest"></select></label>' +
    '</div>';
  document.body.appendChild(bar);
  function $(id) { return bar.querySelector('#' + id); }

  [0, 3, 5, 10, 15].forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s ? s + ' s' : 'off'; $('hbPrep').appendChild(o); });
  function fillRest() {
    var list = [30, 45, 60, 90, 120, 180, 240];
    if (list.indexOf(cfg.rest) < 0) list.push(cfg.rest);
    list.sort(function (a, b) { return a - b; });
    $('hbRest').innerHTML = list.map(function (s) { return '<option value="' + s + '">' + (s % 60 === 0 ? (s / 60) + ' min' : s + ' s') + '</option>'; }).join('');
    $('hbRest').value = cfg.rest;
  }
  fillRest();
  $('hbPrep').value = cfg.prep;
  $('hbAuto').checked = cfg.autoRest;
  $('hbPrep').onchange = function () { cfg.prep = +this.value; save(); };
  $('hbRest').onchange = function () { cfg.rest = +this.value; save(); };
  $('hbAuto').onchange = function () { cfg.autoRest = this.checked; save(); if (this.checked) audio(); };

  // ---------- where the seconds go ----------
  function setVal(el, v) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }
  function reveal(el) {
    var col = el.closest('.set-col'); if (!col) return;
    var attempts = !!el.closest('#attemptsGrid');
    var up = document.getElementById(attempts ? 'attemptsScrollUpBtn' : 'setsScrollUpBtn');
    var down = document.getElementById(attempts ? 'attemptsScrollDownBtn' : 'setsScrollDownBtn');
    for (var g = 0; g < 25 && col.classList.contains('hidden'); g++) {
      var idx = Array.prototype.indexOf.call(col.parentNode.children, col);
      var first = Array.prototype.findIndex.call(col.parentNode.children, function (c) { return !c.classList.contains('hidden'); });
      (idx < first ? up : down).click();
    }
  }
  // the next empty field; create = add a set/attempt when all are full
  function target(create) {
    var attemptsWrap = document.getElementById('attemptsWrap');
    var i, el;
    if (attemptsWrap && !attemptsWrap.classList.contains('hidden')) {
      for (i = 1; i <= 20; i++) {
        el = document.getElementById('attempt' + i);
        if (!el) {
          if (!create) return { label: 'a new attempt' };
          document.getElementById('addAttemptBtn').click();
          el = document.getElementById('attempt' + i);
          if (!el) return null;
        }
        if (el.value === '') return { el: el, label: 'Attempt ' + i };
      }
      return null;
    }
    for (i = 1; i <= 20; i++) {
      var prim = document.getElementById('set' + i);
      if (!prim) {
        if (!create) return { label: 'a new set' };
        var add = document.getElementById('addSetBtn');
        if (!add || add.disabled) return null;
        add.click();
        prim = document.getElementById('set' + i);
        if (!prim) return null;
      }
      var lr = document.getElementById('lr' + i);
      var uni = lr && !lr.classList.contains('hidden');
      var fields = uni ? [[document.getElementById('left' + i), ' · L'], [document.getElementById('right' + i), ' · R']] : [[prim, '']];
      for (var k = 0; k < fields.length; k++) {
        if (fields[k][0].value === '') return { el: fields[k][0], label: 'Set ' + i + fields[k][1] };
      }
    }
    return null;
  }

  // ---------- state machine ----------
  var phase = 'idle', tStart = 0, tEnd = 0, lastShown = -1, timer = 0, note = '';
  var info = { isometric: false, distance: false };
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function isOpen() { return !bar.classList.contains('hidden'); }
  function open() { bar.classList.remove('hidden'); render(); }
  function ensureTick() { if (!timer) timer = setInterval(tick, 100); }
  function stopTick() { if (timer) { clearInterval(timer); timer = 0; } }
  function toIdle(msg) { phase = 'idle'; note = msg || ''; stopTick(); render(); }

  function startPrep() {
    audio();
    if (!cfg.prep) { startHold(); return; }
    phase = 'prep'; tEnd = Date.now() + cfg.prep * 1000; lastShown = -1; note = ''; ensureTick(); render();
  }
  function startHold() {
    phase = 'hold'; tStart = Date.now(); note = ''; beep(1200, 0.35); buzz(80); ensureTick(); render();
  }
  function stopHold(broke) {
    var sec = Math.floor((Date.now() - tStart) / 1000);
    if (sec < 1) { toIdle('Too short to save'); return; }
    var t = target(true);
    if (t && t.el) {
      setVal(t.el, sec); reveal(t.el);
      var m = /(\d+)$/.exec(t.el.id), fl = broke && m ? document.getElementById('flag' + m[1]) : null;
      if (fl) { fl.value = (fl.value === 'pain' || fl.value === 'both') ? 'both' : 'broke'; }
      toIdle('Saved ' + sec + ' s to ' + t.label + (fl ? ' (form broke)' : ''));
    }
    else toIdle(sec + ' s (no free field to save it in)');
    buzz(60);
    if (cfg.autoRest) startRest();
  }
  function startRest() {
    if (phase === 'prep' || phase === 'hold') return;
    audio();
    var keep = note;
    phase = 'rest'; tEnd = Date.now() + cfg.rest * 1000; lastShown = -1; note = keep; ensureTick(); open();
  }
  function tick() {
    var now = Date.now();
    if (phase === 'prep' || phase === 'rest') {
      var rem = Math.ceil((tEnd - now) / 1000);
      if (rem !== lastShown) {
        lastShown = rem;
        if (rem > 0 && rem <= 3) beep(880, 0.12);
      }
      if (now >= tEnd) {
        if (phase === 'prep') startHold();
        else { beep(1200, 0.18); beep(1200, 0.18, 0.28); beep(1500, 0.3, 0.56); buzz([200, 100, 200]); var nx = target(false); toIdle('Rest done' + (nx ? ' · next: ' + nx.label : '')); }
        return;
      }
    }
    render();
  }

  // ---------- drawing ----------
  function render() {
    bar.className = 'hold-bar phase-' + phase + (phase !== 'idle' ? ' running' : '') + (info.isometric ? '' : ' no-hold') + (isOpen() ? '' : ' hidden');
    var now = Date.now(), time = '0:00', label = 'Timer', main = 'Start', alt = '', sub = note;
    if (phase === 'idle') {
      label = info.isometric ? 'Hold timer' : 'Rest timer';
      time = info.isometric ? '0:00' : mmss(cfg.rest);
      main = info.isometric ? 'Start hold' : 'Start rest';
      if (info.isometric) { var nt = target(false); if (!note && nt) sub = 'Fills: ' + nt.label; }
      alt = info.isometric ? 'Start rest' : '';
    } else if (phase === 'prep') { label = 'Get ready'; time = mmss(Math.ceil((tEnd - now) / 1000)); main = 'Cancel'; alt = 'Start now'; sub = 'Hold starts at 0'; }
    else if (phase === 'hold') { label = 'Hold'; time = mmss((now - tStart) / 1000); main = 'Stop & save'; alt = 'Form broke'; sub = 'Seconds go into the next empty set'; }
    else if (phase === 'rest') { label = 'Rest'; time = mmss(Math.ceil((tEnd - now) / 1000)); main = 'Skip rest'; alt = '+15 s'; }
    $('hbPhase').textContent = label;
    $('hbTime').textContent = time;
    $('hbSub').textContent = sub || '';
    $('hbMain').textContent = main;
    var a = $('hbAlt'); a.textContent = alt; a.style.display = alt ? '' : 'none';
    var lbl = document.getElementById('holdBtnLabel'); if (lbl) lbl.textContent = info.isometric ? 'Hold' : 'Rest';
    btn.classList.toggle('on', phase !== 'idle');
  }

  $('hbMain').onclick = function () {
    if (phase === 'idle') { if (info.isometric) startPrep(); else startRest(); }
    else if (phase === 'prep') toIdle('');
    else if (phase === 'hold') stopHold();
    else if (phase === 'rest') toIdle('');
  };
  $('hbAlt').onclick = function () {
    if (phase === 'idle') startRest();
    else if (phase === 'prep') startHold();
    else if (phase === 'hold') stopHold(true);
    else if (phase === 'rest') tEnd += 15000;
  };
  $('hbClose').onclick = function () { if (phase !== 'idle') toIdle(''); bar.classList.add('hidden'); render(); };
  btn.onclick = function () { if (isOpen()) bar.classList.add('hidden'); else open(); };

  // rest timer after each set: starts when a set value is committed (not while a hold is being timed here)
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!cfg.autoRest || !t || !t.id || !/^(set|left|right|attempt)\d+$/.test(t.id) || t.value === '') return;
    if (!t.closest('#setsGrid') && !t.closest('#attemptsGrid')) return;
    startRest();
  });

  App.onMetricsUpdate = function (i) { info = i || info; if (isOpen() && phase === 'idle') render(); else { var l = document.getElementById('holdBtnLabel'); if (l) l.textContent = info.isometric ? 'Hold' : 'Rest'; } };
  if (App.metricsInfo) info = App.metricsInfo();
  render();
})();
