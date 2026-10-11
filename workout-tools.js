/* Floating timer / stopwatch / metronome for the workout log.
   Self-contained: no libraries (Web Audio + timestamps only), so it works offline.
   Opened from #toolsBtn; styles live in workout-log-style.css (.tools-win). */
(function () {
  'use strict';
  var openBtn = document.getElementById('toolsBtn');
  if (!openBtn) return;

  var LS_KEY = 'workout-log-tools-v1';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { saved = {}; }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ tab: tab, timerTotal: timerTotal, bpm: bpm, beats: beats, pos: pos }));
    } catch (e) { /* storage unavailable */ }
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ---------- state ----------
  var tab = ['timer', 'stopwatch', 'metronome'].indexOf(saved.tab) >= 0 ? saved.tab : 'timer';
  var pos = saved.pos || null;                                  // {left, top} once dragged
  var timerTotal = clamp(+saved.timerTotal || 90, 5, 5999);     // seconds
  var timerLeft = timerTotal * 1000;                            // ms remaining while paused
  var timerEnd = 0, timerRunning = false, timerDone = false;
  var swElapsed = 0, swStart = 0, swRunning = false;
  var bpm = clamp(+saved.bpm || 90, 30, 240);
  var beats = clamp(Math.round(+saved.beats) || 4, 1, 20);
  var metRunning = false, nextNote = 0, beatIdx = 0, schedId = 0;

  // ---------- audio ----------
  var ctx = null;
  function ensureAudio() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(freq, when, dur, vol) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(when); o.stop(when + dur + 0.02);
  }

  // ---------- DOM ----------
  var win = document.createElement('div');
  win.className = 'tools-win hidden';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Timer, stopwatch and metronome');
  win.innerHTML =
    '<div class="tools-head">' +
      '<span class="tools-grip" aria-hidden="true" title="Drag to move"><i class="fa-solid fa-grip-vertical"></i></span>' +
      '<div class="tools-tabs" role="tablist">' +
        '<button type="button" role="tab" data-tab="timer">Timer</button>' +
        '<button type="button" role="tab" data-tab="stopwatch">Stopwatch</button>' +
        '<button type="button" role="tab" data-tab="metronome">Metronome</button>' +
      '</div>' +
      '<button type="button" class="tools-close" aria-label="Close" title="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
    '</div>' +
    '<div class="tools-pane" data-pane="timer">' +
      '<div class="tools-readout-row">' +
        '<button type="button" class="tools-step" data-tstep="-15" aria-label="Minus 15 seconds">−15</button>' +
        '<div class="tools-readout" id="tmrOut">01:30</div>' +
        '<button type="button" class="tools-step" data-tstep="15" aria-label="Plus 15 seconds">+15</button>' +
      '</div>' +
      '<div class="tools-presets">' +
        '<button type="button" data-preset="30">0:30</button><button type="button" data-preset="60">1:00</button>' +
        '<button type="button" data-preset="90">1:30</button><button type="button" data-preset="120">2:00</button>' +
        '<button type="button" data-preset="180">3:00</button>' +
      '</div>' +
      '<div class="tools-actions">' +
        '<button type="button" class="tools-primary" id="tmrStart">Start</button>' +
        '<button type="button" id="tmrReset">Reset</button>' +
      '</div>' +
    '</div>' +
    '<div class="tools-pane" data-pane="stopwatch">' +
      '<div class="tools-readout" id="swOut">00:00.0</div>' +
      '<div class="tools-actions">' +
        '<button type="button" class="tools-primary" id="swStart">Start</button>' +
        '<button type="button" id="swReset">Reset</button>' +
      '</div>' +
    '</div>' +
    '<div class="tools-pane" data-pane="metronome">' +
      '<div class="tools-readout-row">' +
        '<button type="button" class="tools-step" data-bstep="-1" aria-label="Slower">−</button>' +
        '<div class="tools-readout" id="bpmRead"><span id="bpmOut">90</span><small> BPM</small></div>' +
        '<button type="button" class="tools-step" data-bstep="1" aria-label="Faster">+</button>' +
      '</div>' +
      '<input type="range" id="bpmSlider" min="30" max="240" step="1" aria-label="Tempo (BPM)" />' +
      '<div class="tools-beats" id="beatDots" aria-hidden="true"></div>' +
      '<div class="tools-beats-row"><label for="beatsSlider">Beats per bar: <b id="beatsOut">4</b></label>' +
        '<input type="range" id="beatsSlider" min="1" max="20" step="1" aria-label="Beats per bar" /></div>' +
      '<div class="tools-actions">' +
        '<button type="button" class="tools-primary" id="metStart">Start</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(win);

  function $(id) { return win.querySelector('#' + id); }
  var tmrOut = $('tmrOut'), tmrStart = $('tmrStart'), swOut = $('swOut'), swStartBtn = $('swStart');
  var bpmOut = $('bpmOut'), bpmSlider = $('bpmSlider'), metStart = $('metStart');
  var beatDots = $('beatDots'), beatsSlider = $('beatsSlider'), beatsOut = $('beatsOut');

  // ---------- formatting / rendering ----------
  function mmss(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60);
    return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function swFormat(ms) {
    var t = Math.floor(ms / 100), tenths = t % 10, s = Math.floor(t / 10) % 60, m = Math.floor(t / 600);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + tenths;
  }
  function timerRemaining() { return timerRunning ? Math.max(0, timerEnd - Date.now()) : timerLeft; }
  function swTime() { return swRunning ? swElapsed + (Date.now() - swStart) : swElapsed; }

  function renderTimer() {
    tmrOut.textContent = mmss(timerRemaining());
    tmrOut.classList.toggle('done', timerDone);
    tmrStart.textContent = timerRunning ? 'Pause' : (timerLeft > 0 && timerLeft < timerTotal * 1000 ? 'Resume' : 'Start');
  }
  function renderStopwatch() {
    swOut.textContent = swFormat(swTime());
    swStartBtn.textContent = swRunning ? 'Pause' : (swElapsed > 0 ? 'Resume' : 'Start');
  }
  function renderMetronome() {
    bpmOut.textContent = bpm;
    bpmSlider.value = bpm;
    metStart.textContent = metRunning ? 'Stop' : 'Start';
    var dots = '';
    for (var i = 0; i < beats; i++) dots += '<span class="tools-dot' + (i === 0 ? ' first' : '') + '"></span>';
    beatDots.innerHTML = dots;
    beatDots.classList.toggle('many', beats > 8);
    beatsSlider.value = beats;
    beatsOut.textContent = beats;
  }
  function renderIndicator() {
    var active = timerRunning || swRunning || metRunning;
    openBtn.classList.toggle('on', active || !win.classList.contains('hidden'));
  }
  function renderAll() { renderTimer(); renderStopwatch(); renderMetronome(); renderIndicator(); }

  function showTab(name) {
    tab = name;
    Array.prototype.forEach.call(win.querySelectorAll('[data-tab]'), function (b) {
      var on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(win.querySelectorAll('[data-pane]'), function (p) {
      p.classList.toggle('hidden', p.dataset.pane !== name);
    });
    persist();
  }

  // ---------- one shared tick (only while something is running) ----------
  var tickId = 0;
  function tick() {
    if (timerRunning && Date.now() >= timerEnd) finishTimer();
    if (!win.classList.contains('hidden')) {
      if (tab === 'timer') renderTimer();
      else if (tab === 'stopwatch') renderStopwatch();
    }
    if (!timerRunning && !swRunning && tickId) { clearInterval(tickId); tickId = 0; }
  }
  function ensureTick() { if (!tickId) tickId = setInterval(tick, 100); }

  // ---------- timer ----------
  function setTimerTotal(sec) {
    timerTotal = clamp(sec, 5, 5999);
    timerLeft = timerTotal * 1000; timerRunning = false; timerDone = false;
    persist(); renderTimer(); renderIndicator();
  }
  function startTimer() {
    ensureAudio();
    if (timerDone || timerLeft <= 0) { timerLeft = timerTotal * 1000; timerDone = false; }
    timerEnd = Date.now() + timerLeft; timerRunning = true;
    ensureTick(); renderTimer(); renderIndicator();
  }
  function pauseTimer() {
    timerLeft = timerRemaining(); timerRunning = false;
    renderTimer(); renderIndicator();
  }
  function finishTimer() {
    timerRunning = false; timerLeft = 0; timerDone = true;
    if (ensureAudio()) { var t = ctx.currentTime + 0.05; for (var i = 0; i < 3; i++) tone(1200, t + i * 0.28, 0.18, 0.5); }
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) { /* ignore */ } }
    renderTimer(); renderIndicator();
  }
  tmrStart.onclick = function () { timerRunning ? pauseTimer() : startTimer(); };
  $('tmrReset').onclick = function () { setTimerTotal(timerTotal); };
  Array.prototype.forEach.call(win.querySelectorAll('[data-preset]'), function (b) {
    b.onclick = function () { setTimerTotal(+b.dataset.preset); startTimer(); }; // one tap = rest timer running
  });
  Array.prototype.forEach.call(win.querySelectorAll('[data-tstep]'), function (b) {
    b.onclick = function () {
      var d = +b.dataset.tstep;
      if (timerRunning) { timerEnd = Math.max(Date.now() + 1000, timerEnd + d * 1000); }
      else { timerTotal = clamp(timerTotal + d, 5, 5999); timerLeft = timerTotal * 1000; timerDone = false; persist(); }
      renderTimer();
    };
  });

  // ---------- stopwatch ----------
  swStartBtn.onclick = function () {
    if (swRunning) { swElapsed += Date.now() - swStart; swRunning = false; }
    else { swStart = Date.now(); swRunning = true; ensureTick(); }
    renderStopwatch(); renderIndicator();
  };
  $('swReset').onclick = function () { swRunning = false; swElapsed = 0; renderStopwatch(); renderIndicator(); };

  // ---------- metronome (Web Audio look-ahead scheduler) ----------
  function scheduler() {
    while (nextNote < ctx.currentTime + 0.12) {
      var accent = beatIdx === 0 && beats > 1;
      tone(accent ? 1600 : 1000, nextNote, 0.05, accent ? 0.6 : 0.4);
      (function (i, delay) {
        setTimeout(function () { if (metRunning) pulse(i); }, Math.max(0, delay));
      })(beatIdx, (nextNote - ctx.currentTime) * 1000);
      nextNote += 60 / bpm;
      beatIdx = (beatIdx + 1) % beats;
    }
  }
  function pulse(i) {
    var d = beatDots.children;
    for (var k = 0; k < d.length; k++) d[k].classList.toggle('lit', k === i);
  }
  function startMetronome() {
    if (!ensureAudio()) return;
    beatIdx = 0; nextNote = ctx.currentTime + 0.06; metRunning = true;
    scheduler(); schedId = setInterval(scheduler, 25);
    renderMetronome(); renderIndicator();
  }
  function stopMetronome() {
    metRunning = false; clearInterval(schedId); schedId = 0; pulse(-1);
    renderMetronome(); renderIndicator();
  }
  function setBpm(v) { bpm = clamp(Math.round(v), 30, 240); persist(); renderMetronome(); }
  metStart.onclick = function () { metRunning ? stopMetronome() : startMetronome(); };
  bpmSlider.oninput = function () { setBpm(+bpmSlider.value); };
  Array.prototype.forEach.call(win.querySelectorAll('[data-bstep]'), function (b) {
    b.onclick = function () { setBpm(bpm + +b.dataset.bstep); };
  });
  beatsSlider.oninput = function () { beats = clamp(+beatsSlider.value, 1, 20); beatIdx = 0; persist(); renderMetronome(); };


  // ---------- tap a number to type it ----------
  // Timer / stopwatch accept "2:15" or just digits like a phone clock ("215" = 2:15, "90" = 1:30).
  function parseClock(str) {
    str = String(str).trim();
    if (/^\d+:\d{1,2}$/.test(str)) { var p = str.split(':'); return (+p[0]) * 60 + (+p[1]); }
    if (/^\d+$/.test(str)) { var n = +str; return Math.floor(n / 100) * 60 + (n % 100); }
    return null;
  }
  function clockStr(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  var editing = false;
  function makeEditable(readout, label, hint, getValue, onStart, apply) {
    readout.setAttribute('tabindex', '0');
    readout.setAttribute('role', 'button');
    readout.setAttribute('aria-label', label + ' (tap to edit)');
    readout.title = 'Tap to edit';
    function begin() {
      if (editing) return;
      editing = true;
      if (onStart) onStart();
      var input = document.createElement('input');
      input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off';
      input.className = 'tools-edit'; input.value = getValue(); input.placeholder = hint;
      input.setAttribute('aria-label', label);
      readout.classList.add('hidden');
      readout.parentNode.insertBefore(input, readout.nextSibling);
      input.focus(); input.select();
      var done = false;
      function finish(commit) {
        if (done) return; done = true;
        var v = input.value;
        input.remove(); readout.classList.remove('hidden'); editing = false;
        if (commit) apply(v);
        renderAll();
      }
      input.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      input.onblur = function () { finish(true); };
    }
    readout.onclick = begin;
    readout.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); } };
  }
  makeEditable(tmrOut, 'Timer length', 'e.g. 130 = 1:30', function () { return clockStr(timerRemaining() || timerTotal * 1000); },
    function () { if (timerRunning) pauseTimer(); },
    function (v) { var s = parseClock(v); if (s !== null && s >= 5) setTimerTotal(Math.min(5999, s)); });
  makeEditable(swOut, 'Stopwatch time', 'e.g. 130 = 1:30', function () { return clockStr(swTime()); },
    function () { if (swRunning) { swElapsed += Date.now() - swStart; swRunning = false; } },
    function (v) { var s = parseClock(v); if (s !== null) { swElapsed = Math.min(s, 359999) * 1000; swRunning = false; } });
  makeEditable($('bpmRead'), 'Tempo', '30 to 240', function () { return String(bpm); }, null,
    function (v) { var n = parseInt(v, 10); if (!isNaN(n)) setBpm(n); });

  // ---------- window: open / close / tabs / drag ----------
  function applyPos() {
    if (!pos) { win.style.left = win.style.top = ''; return; }
    var w = win.offsetWidth, h = win.offsetHeight;
    pos.left = clamp(pos.left, 6, Math.max(6, window.innerWidth - w - 6));
    pos.top = clamp(pos.top, 6, Math.max(6, window.innerHeight - h - 6));
    win.style.left = pos.left + 'px'; win.style.top = pos.top + 'px';
    win.style.right = 'auto'; win.style.bottom = 'auto';
  }
  function setOpen(open) {
    win.classList.toggle('hidden', !open);
    if (open) { showTab(tab); renderAll(); applyPos(); }
    renderIndicator();
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  openBtn.onclick = function () { setOpen(win.classList.contains('hidden')); };
  win.querySelector('.tools-close').onclick = function () { setOpen(false); }; // timers keep running while closed
  win.querySelector('.tools-tabs').onclick = function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    showTab(b.dataset.tab); renderAll();
  };
  window.addEventListener('resize', function () { if (pos && !win.classList.contains('hidden')) applyPos(); });

  var drag = null;
  win.querySelector('.tools-head').addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    var r = win.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    this.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  win.querySelector('.tools-head').addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    pos = { left: e.clientX - drag.dx, top: e.clientY - drag.dy };
    applyPos();
  });
  function endDrag(e) { if (drag && e.pointerId === drag.id) { drag = null; persist(); } }
  win.querySelector('.tools-head').addEventListener('pointerup', endDrag);
  win.querySelector('.tools-head').addEventListener('pointercancel', endDrag);

  showTab(tab);
  renderAll();
})();
