/* Variations card in Settings (the page with blocks, categories and equipment):
   - merge look-alike exercises (Wide, Archer, Pull up ...) into one exercise plus a variation, with a preview and an undo
   - edit the variation list of any exercise
   The logic that touches your data lives in workout-log.js (WorkoutApp); this file is only the screen. */
(function () {
  'use strict';
  var App = window.WorkoutApp;
  var anchor = document.getElementById('module-config-equipment');
  if (!App || !anchor || !App.planMerge) return;

  function $(id) { return document.getElementById(id); }
  function dot(c) { return '<span class="var-dot" style="background:' + esc(c || '#999') + '"></span>'; }
  function esc(x) { return window.WorkoutShared.escapeHtml(x); }
  function exKey(n) { return window.WorkoutShared.exKey(n); }
  function lib() { return window.WorkoutLibrary && window.WorkoutLibrary.get(); }

  var mod = document.createElement('div');
  mod.className = 'module'; mod.id = 'module-config-variations';
  mod.innerHTML =
    '<div class="section-label-row"><div class="section-label">Variations</div><button class="icon-btn" id="variationsCollapseBtn" type="button"></button></div>' +
    '<div id="variationsSectionBody">' +
    '<div class="empty" style="padding:0 0 8px;">One exercise, many variations: pick the variation on each set (lever position, grip, tempo) instead of keeping a separate exercise for each.</div>' +
    '<details class="var-sec" open><summary>Merge look-alike exercises</summary>' +
      '<div class="empty" style="padding:6px 0;">Folds exercises such as <b>Wide</b> or <b>Archer</b> into <b>Pull-ups</b> with the matching variation. Your entries move with them, nothing is deleted, and you can undo the last merge.</div>' +
      '<div class="var-actions"><button type="button" class="primary-btn" id="varScan">Check my exercises</button>' +
        '<button type="button" class="text-btn hidden" id="varMergeAll">Merge all that are safe</button>' +
        '<button type="button" class="text-btn hidden" id="varUndo"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Undo last merge</button></div>' +
      '<div id="varSuggestions" class="var-list"></div>' +
      '<div class="lib-filter-label" style="margin-top:12px;">Merge by hand</div>' +
      '<div class="var-manual">' +
        '<select id="varSrc" aria-label="Exercise to merge"></select>' +
        '<span class="var-arrow"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i> into</span>' +
        '<select id="varTgt" aria-label="Merge into this exercise"></select>' +
        '<select id="varTgtVar" aria-label="With this variation"></select>' +
        '<input type="text" id="varNew" placeholder="or type a new variation" maxlength="40" />' +
        '<div class="var-preview" id="varPreview"></div>' +
        '<div class="var-actions"><button type="button" class="text-btn" id="varPreviewBtn">Preview</button><button type="button" class="primary-btn" id="varDoManual">Merge</button></div>' +
        '<div class="empty" id="varManualMsg" style="padding:4px 0;"></div>' +
      '</div>' +
    '</details>' +
    '<details class="var-sec"><summary>Edit variation lists</summary>' +
      '<div class="var-manual">' +
        '<select id="varListEx" aria-label="Exercise"></select>' +
        '<textarea id="varListText" rows="7" placeholder="One variation per line, easiest first"></textarea>' +
        '<div class="var-actions"><button type="button" class="primary-btn" id="varListSave">Save list</button><button type="button" class="text-btn" id="varListReset">Use the default list</button></div>' +
        '<div class="empty" id="varListMsg" style="padding:4px 0;"></div>' +
      '</div>' +
    '</details>' +
    '<details class="var-sec"><summary>Tidy categories</summary>' +
      '<div class="empty" style="padding:6px 0;">The library files core work (planks, hollow holds, leg raises) under <b>Core</b> and stretches and joint drills under <b>Mobility</b>. This lists your exercises that sit elsewhere. Your entries move with them, and you can undo.</div>' +
      '<div class="var-actions"><button type="button" class="primary-btn" id="catScan">Check categories</button>' +
        '<button type="button" class="text-btn hidden" id="catMoveAll">Move all</button></div>' +
      '<div id="catTidyList" class="var-list"></div>' +
    '</details>' +
    '</div>';
  anchor.insertAdjacentElement('afterend', mod);
  window.WorkoutShared.ui.collapse($('variationsCollapseBtn'), $('variationsSectionBody'), 'collapsed:variationsSectionBody');
  window.WorkoutShared.ui.details(mod.querySelectorAll('.var-sec')[0], 'details:var-merge');
  window.WorkoutShared.ui.details(mod.querySelectorAll('.var-sec')[1], 'details:var-lists');
  window.WorkoutShared.ui.details(mod.querySelectorAll('.var-sec')[2], 'details:var-tidy');

  // ---------------- suggestions ----------------
  function suggestions() {
    var L = lib(), out = [];
    if (!L || !L.variationAliases) return out;
    var baseInfo = {};
    (L.exercises || []).forEach(function (c) { baseInfo[exKey(c.name)] = c; });
    var byAlias = {};
    L.variationAliases.forEach(function (a) { (byAlias[exKey(a.name)] = byAlias[exKey(a.name)] || []).push(a); });
    var all = App.listExercisesForVariations();
    all.forEach(function (ex) {
      var cands = byAlias[exKey(ex.name)] || [];
      // an alias can be limited to one category (Wide means a wide grip in Pull, a wide hand position in Push)
      var a = cands.filter(function (x) { return x.category === ex.category; })[0] || cands.filter(function (x) { return !x.category; })[0];
      if (!a || ex.name === a.exercise) return;   // the properly named exercise is the one we merge INTO, never away
      // same name as the target (e.g. "Muscle up" vs "Muscle-up") only matters when a second, separate exercise exists
      var twin = all.some(function (o) { return o !== ex && exKey(o.name) === exKey(a.exercise); });
      if (exKey(a.exercise) === exKey(ex.name) && !a.variation && !twin) return;
      var base = baseInfo[exKey(a.exercise)] || {};
      var tgt = { name: a.exercise, category: base.category, isometric: base.isometric, unilateral: base.unilateral };
      var plan = App.planMerge(ex.category, ex.name, tgt, a.variation || null);
      var tx = all.filter(function (o) { return exKey(o.name) === exKey(a.exercise); })[0];
      out.push({ ex: ex, alias: a, tgt: tgt, plan: plan, tcolor: tx ? tx.color : ex.color });
    });
    return out;
  }
  function describe(s) {
    var p = s.plan, to = (p.ok ? p.tgtName : s.alias.exercise) + (s.alias.variation ? ' · ' + s.alias.variation : '');
    var html = '<div class="var-row"><div class="var-main">' + dot(s.ex.color) + '<b>' + esc(s.ex.name) + '</b> <span class="var-cat">' + esc(s.ex.category) + '</span> → ' + dot(s.tcolor) + '<b>' + esc(to) + '</b>' +
      '<div class="var-sub">';
    if (!p.ok) html += '<span class="var-block">' + esc(p.reason) + '</span>';
    else {
      html += p.entries + (p.entries === 1 ? ' entry' : ' entries');
      if (s.ex.orphan) html += ' · found in your entries only (not in your exercise list)';
      if (p.creating) html += ' · creates the exercise "' + esc(p.tgtName) + '"';
      if (p.sides) html += ' · left/right values become one value (' + esc(p.sides) + ')';
    }
    html += '</div></div>' + (p.ok ? '<button type="button" class="text-btn" data-merge="' + esc(s.ex.category + '||' + s.ex.name) + '">Merge</button>' : '') + '</div>';
    return html;
  }
  var current = [];
  function renderSuggestions(msg) {
    var box = $('varSuggestions');
    current = suggestions();
    var safe = current.filter(function (s) { return s.plan.ok; }).length;
    box.innerHTML = current.length ? current.map(describe).join('') : '<div class="empty" style="padding:6px 0;">' + (msg || (lib() ? 'No look-alike exercises found.' : 'The library file is not loaded, so there are no suggestions. You can still merge by hand below.')) + '</div>';
    $('varMergeAll').classList.toggle('hidden', safe < 2);
    $('varUndo').classList.toggle('hidden', !App.hasMergeUndo());
  }
  $('varScan').onclick = function () { renderSuggestions(); };
  $('varSuggestions').onclick = function (e) {
    var b = e.target.closest('[data-merge]'); if (!b) return;
    var parts = b.dataset.merge.split('||');
    var s = current.filter(function (x) { return x.ex.category === parts[0] && x.ex.name === parts[1]; })[0];
    if (!s) return;
    if (!confirm('Merge "' + s.ex.name + '" into "' + s.alias.exercise + (s.alias.variation ? ' · ' + s.alias.variation : '') + '"?\nYour entries move with it. You can undo this afterwards.')) return;
    App.snapshotForUndo();
    var r = App.applyMerge(s.ex.category, s.ex.name, s.tgt, s.alias.variation || null);
    App.showToast(r.ok ? 'Merged ' + r.moved + (r.moved === 1 ? ' entry' : ' entries') : r.reason);
    renderSuggestions(); refreshSelects();
  };
  $('varMergeAll').onclick = function () {
    var safe = current.filter(function (s) { return s.plan.ok; });
    if (!safe.length || !confirm('Merge ' + safe.length + ' exercises? Your entries move with them. You can undo this afterwards (one undo covers all of them).')) return;
    App.snapshotForUndo();
    var moved = 0, merged = 0, guard = 0, list = suggestions();
    while (guard++ < 100) {
      var next = list.filter(function (s) { return s.plan.ok; })[0];
      if (!next) break;
      var r = App.applyMerge(next.ex.category, next.ex.name, next.tgt, next.alias.variation || null);
      if (!r.ok) break;
      moved += r.moved; merged++;
      list = suggestions();   // the target may now exist, so look again
    }
    App.showToast('Merged ' + merged + ' exercises (' + moved + ' entries)');
    renderSuggestions(); refreshSelects();
  };
  $('varUndo').onclick = function () {
    if (confirm('Undo the last merge? The page reloads and your exercises and entries go back to how they were before it.')) App.undoLastMerge();
  };

  // ---------------- merge by hand ----------------
  // ---- custom dropdown: the real <select> stays (hidden) so values and change events work as before, but the list can show colour dots ----
  var csOpen = null;
  function csClose() { if (csOpen) { csOpen.list.classList.add('hidden'); csOpen.btn.setAttribute('aria-expanded', 'false'); csOpen = null; } }
  document.addEventListener('click', function (e) { if (csOpen && !csOpen.wrap.contains(e.target)) csClose(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') csClose(); });
  function enhance(sel) {
    if (sel._cs) return;
    var wrap = document.createElement('div'); wrap.className = 'cs-wrap';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cs-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', sel.getAttribute('aria-label') || 'Exercise');
    var list = document.createElement('div'); list.className = 'cs-list hidden'; list.setAttribute('role', 'listbox');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel); wrap.appendChild(btn); wrap.appendChild(list);
    sel.classList.add('cs-native'); sel.tabIndex = -1;
    sel._cs = { wrap: wrap, btn: btn, list: list };
    btn.onclick = function () {
      var wasOpen = csOpen && csOpen.list === list;
      csClose();
      if (wasOpen) return;
      list.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); csOpen = sel._cs;
      var cur = list.querySelector('.cs-item.on'); if (cur) list.scrollTop = cur.offsetTop - 40;
    };
    list.onclick = function (e) {
      var it = e.target.closest('.cs-item'); if (!it) return;
      sel.value = it.dataset.v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      csClose();
    };
    sel.addEventListener('change', function () { csRefresh(sel); });
  }
  function csItem(o, on) {
    return '<span class="var-dot" style="background:' + esc(o.dataset.color || '#999') + '"></span>' + esc(o.textContent);
  }
  function csRefresh(sel) {
    var cs = sel._cs; if (!cs) return;
    var cur = sel.options[sel.selectedIndex];
    cs.btn.innerHTML = (cur ? csItem(cur) : 'Choose…') + '<i class="fa-solid fa-chevron-down cs-arrow" aria-hidden="true"></i>';
    cs.list.innerHTML = Array.prototype.map.call(sel.options, function (o) {
      return '<div class="cs-item' + (o.value === sel.value ? ' on' : '') + '" role="option" data-v="' + esc(o.value) + '">' + csItem(o) + '</div>';
    }).join('');
  }
  function exOptions(selectEl, keep, withOrphans) {
    var list = App.listExercisesForVariations().filter(function (e) { return withOrphans || !e.orphan; });
    selectEl.innerHTML = list.map(function (e) {
      var col = App.categoryColor ? App.categoryColor(e.category) : '#999';
      return '<option value="' + esc(e.category + '||' + e.name) + '" data-color="' + esc(col) + '">' + esc(e.category + ' · ' + e.name + (e.entries ? ' (' + e.entries + ')' : '')) + '</option>';
    }).join('');
    if (keep && Array.prototype.some.call(selectEl.options, function (o) { return o.value === keep; })) selectEl.value = keep;
    enhance(selectEl); csRefresh(selectEl);
  }
  function split(v) { var p = String(v || '').split('||'); return { category: p[0], name: p[1] }; }
  function fillTargetVariations() {
    var t = split($('varTgt').value), list = t.name ? App.exerciseVariations(t.name) : [];
    $('varTgtVar').innerHTML = '<option value="">no variation (standard)</option>' + list.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('');
  }
  function refreshSelects() {
    exOptions($('varSrc'), $('varSrc').value, true); exOptions($('varTgt'), $('varTgt').value); exOptions($('varListEx'), $('varListEx').value);
    fillTargetVariations(); fillListText(); updatePreviews();
  }
  $('varTgt').onchange = fillTargetVariations;
  function manualArgs() {
    var s = split($('varSrc').value), t = split($('varTgt').value);
    var variation = $('varNew').value.trim() || $('varTgtVar').value || null;
    return { s: s, t: t, variation: variation };
  }
  $('varPreviewBtn').onclick = function () {
    var a = manualArgs(), p = App.planMerge(a.s.category, a.s.name, { name: a.t.name, category: a.t.category }, a.variation);
    $('varManualMsg').textContent = !p.ok ? p.reason : p.entries + (p.entries === 1 ? ' entry' : ' entries') + ' (' + p.sets + ' sets) of "' + a.s.name + '" move into "' + p.tgtName + '"' + (a.variation ? ' as ' + a.variation : '') + '.' + (p.sides ? ' Left/right values become one value (' + p.sides + ').' : '');
  };
  $('varDoManual').onclick = function () {
    var a = manualArgs(), p = App.planMerge(a.s.category, a.s.name, { name: a.t.name, category: a.t.category }, a.variation);
    if (!p.ok) { $('varManualMsg').textContent = p.reason; return; }
    if (!confirm('Merge "' + a.s.name + '" into "' + p.tgtName + '"' + (a.variation ? ' · ' + a.variation : '') + '? You can undo this afterwards.')) return;
    App.snapshotForUndo();
    var r = App.applyMerge(a.s.category, a.s.name, { name: a.t.name, category: a.t.category }, a.variation);
    $('varManualMsg').textContent = r.ok ? 'Done: ' + r.moved + ' entries moved.' : r.reason;
    $('varNew').value = '';
    renderSuggestions(); refreshSelects();
  };

  // ---------------- edit lists ----------------
  function fillListText() {
    var e = split($('varListEx').value);
    var info = App.listExercisesForVariations().filter(function (x) { return x.category === e.category && x.name === e.name; })[0];
    $('varListText').value = info ? info.effective.join('\n') : '';
    $('varListMsg').textContent = info ? (info.custom ? 'This is your own list.' : (info.effective.length ? 'This is the default list from the library. Saving makes it your own.' : 'No list yet. Add variations and save.')) : '';
  }
  $('varListEx').onchange = fillListText;
  $('varListSave').onclick = function () {
    var e = split($('varListEx').value);
    var lines = $('varListText').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    App.setCustomVariations(e.category, e.name, lines);
    App.showToast(lines.length ? 'Variations saved' : 'List cleared');
    fillListText();
  };
  $('varListReset').onclick = function () {
    var e = split($('varListEx').value);
    App.setCustomVariations(e.category, e.name, null);
    App.showToast('Back to the default list');
    fillListText();
  };

  // ---------------- tidy categories ----------------
  var tidyCurrent = [];
  function catMismatches() {
    var L = lib(); if (!L) return [];
    var idx = {};
    (L.exercises || []).forEach(function (c) { idx[exKey(c.name)] = c; (c.aliases || []).forEach(function (a) { idx[exKey(a)] = c; }); });
    var out = [];
    App.listExercisesForVariations().forEach(function (ex) {
      var c = idx[exKey(ex.name)];
      if (c && c.category !== ex.category) out.push({ ex: ex, to: c.category });
    });
    return out;
  }
  function renderCatTidy() {
    var list = catMismatches(); tidyCurrent = list;
    $('catTidyList').innerHTML = list.length ? list.map(function (m, i) {
      return '<div class="var-row"><div class="var-main">' + dot(m.ex.color) + '<b>' + esc(m.ex.name) + '</b> <span class="var-cat">' + esc(m.ex.category) + '</span> → ' + dot(App.categoryColor ? App.categoryColor(m.to) : '') + '<b>' + esc(m.to) + '</b>' +
        '<div class="var-sub">' + m.ex.entries + (m.ex.entries === 1 ? ' entry moves with it' : ' entries move with it') + '</div></div>' +
        '<button type="button" class="text-btn" data-refile="' + i + '">Move</button></div>';
    }).join('') : '<div class="empty" style="padding:6px 0;">' + (lib() ? 'Everything is already in the suggested category.' : 'The library file is not loaded.') + '</div>';
    $('catMoveAll').classList.toggle('hidden', list.length < 2);
  }
  function afterRefile() { App.refreshAfterRefile(); renderCatTidy(); refreshSelects(); renderSuggestions(); }
  $('catScan').onclick = renderCatTidy;
  $('catTidyList').onclick = function (e) {
    var b = e.target.closest('[data-refile]'); if (!b) return;
    var m = tidyCurrent[+b.dataset.refile]; if (!m) return;
    if (!confirm('Move "' + m.ex.name + '" from ' + m.ex.category + ' to ' + m.to + '? Its entries move with it. You can undo this afterwards.')) return;
    App.snapshotForUndo();
    App.showToast(App.refileExercise(m.ex.name, m.ex.category, m.to) ? 'Moved to ' + m.to : 'Could not move it (same name already there?)');
    afterRefile();
  };
  $('catMoveAll').onclick = function () {
    if (!tidyCurrent.length || !confirm('Move ' + tidyCurrent.length + ' exercises to their suggested categories? Entries move with them. You can undo this afterwards.')) return;
    App.snapshotForUndo();
    var n = 0; tidyCurrent.slice().forEach(function (m) { if (App.refileExercise(m.ex.name, m.ex.category, m.to)) n++; });
    App.showToast('Moved ' + n + ' exercises');
    afterRefile();
  };

  function exInfo(v) { var p = split(v); return App.listExercisesForVariations().filter(function (e) { return e.category === p.category && e.name === p.name; })[0]; }
  function previewOf(v) { var i = exInfo(v); return i ? dot(i.color) + '<b>' + esc(i.name) + '</b> <span class="var-cat">' + esc(i.category) + '</span>' : ''; }
  function updatePreviews() {
    $('varPreview').innerHTML = previewOf($('varSrc').value) + ' <span class="var-arrow">→</span> ' + previewOf($('varTgt').value);
  }
  ['varSrc', 'varTgt', 'varListEx'].forEach(function (id) { $(id).addEventListener('change', updatePreviews); });

  // keep everything current whenever the Settings page is opened
  var page = $('page-config');
  if (page) new MutationObserver(function () { if (!page.classList.contains('hidden')) { refreshSelects(); renderSuggestions(); } }).observe(page, { attributes: true, attributeFilter: ['class'] });
  if (window.WorkoutLibrary) window.WorkoutLibrary.ready.then(function () { refreshSelects(); renderSuggestions(); });
  refreshSelects();
  renderSuggestions();
})();
