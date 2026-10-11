/* Profile for the workout log: avatar, progress photos, bodyweight (moved here) and Google Drive sync.
   Loaded after the main script (see <script src="workout-profile.js" defer>); talks to it through window.WorkoutApp.
   Photos + avatar live in IndexedDB (too big for localStorage). Drive sync uses the private appDataFolder,
   so the app can only ever see files it created itself. */
(function () {
  'use strict';
  var App = window.WorkoutApp;
  var openBtn = document.getElementById('profileBtn');
  if (!App || !openBtn) return;

  var LS_KEY = 'workout-log-profile-v1';
  var state = { name: '', clientId: '', linked: false, lastSync: 0, deleted: [] };
  try { Object.assign(state, JSON.parse(localStorage.getItem(LS_KEY)) || {}); } catch (e) { /* first run */ }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function toast(m) { App.showToast(m); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---------------- IndexedDB ----------------
  var dbp = new Promise(function (res, rej) {
    if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
    var r = indexedDB.open('workout-log-profile', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('photos', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
  dbp['catch'](function () { /* surfaced when a photo action is attempted */ });
  function tx(store, mode, fn) {
    return dbp.then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode), req = fn(t.objectStore(store));
        t.oncomplete = function () { res(req ? req.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  var dbGet = function (s, k) { return tx(s, 'readonly', function (o) { return o.get(k); }); };
  var dbAll = function (s) { return tx(s, 'readonly', function (o) { return o.getAll(); }); };
  var dbPut = function (s, v, k) { return tx(s, 'readwrite', function (o) { return k === undefined ? o.put(v) : o.put(v, k); }); };
  var dbDel = function (s, k) { return tx(s, 'readwrite', function (o) { return o['delete'](k); }); };

  // ---------------- images ----------------
  function toJpeg(file, maxSide, square, quality) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var sw = img.width, sh = img.height, sx = 0, sy = 0, w, h;
        if (square) { var m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
        var s = Math.min(1, maxSide / Math.max(sw, sh));
        w = Math.round(sw * s); h = Math.round(sh * s);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('Could not encode image')); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That file is not a readable image')); };
      img.src = url;
    });
  }

  // ---------------- DOM ----------------
  var sheet = document.createElement('div');
  sheet.id = 'profileSheet';
  sheet.className = 'profile-sheet hidden';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Profile');
  sheet.innerHTML =
    '<div class="profile-bar"><button type="button" class="icon-btn" id="pfClose" aria-label="Back" title="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button><div class="profile-title">Profile</div></div>' +
    '<div class="profile-body">' +
      '<div class="module profile-user">' +
        '<button type="button" class="profile-avatar-lg" id="pfAvatarBtn" aria-label="Change profile picture" title="Change profile picture"></button>' +
        '<div class="profile-user-fields">' +
          '<input type="text" id="pfName" placeholder="Your name" maxlength="40" autocomplete="name" aria-label="Your name" />' +
          '<button type="button" class="text-btn hidden" id="pfAvatarRemove">Remove picture</button>' +
        '</div>' +
      '</div>' +
      '<div id="pfBodyweightSlot"></div>' +
      '<div class="module">' +
        '<div class="section-label-row"><div class="section-label">Measurements</div></div>' +
        '<div class="ms-grid" id="msSummary"></div>' +
        '<div class="ms-form">' +
          '<input type="date" id="msDate" aria-label="Date" />' +
          '<select id="msType" aria-label="Measurement"></select>' +
          '<input type="number" step="0.1" min="0" id="msValue" aria-label="Value" />' +
          '<button type="button" id="msAdd">Add</button>' +
        '</div>' +
        '<details class="profile-help" id="msHistoryWrap"><summary>History</summary><div id="msHistory" class="scroll-list" style="max-height:240px; margin-top:6px;"></div></details>' +
      '</div>' +
      '<div class="module">' +
        '<div class="section-label-row"><div class="section-label">Goals</div></div>' +
        '<div class="add-inline"><input type="text" id="goalText" placeholder="New goal (e.g. Hold a 10 s tuck planche)" maxlength="100" />' +
          '<input type="date" id="goalDue" aria-label="Target date (optional)" title="Target date (optional)" />' +
          '<button type="button" id="goalAdd">Add</button></div>' +
        '<div id="goalList" style="margin-top:8px;"></div>' +
      '</div>' +
      '<div class="module">' +
        '<div class="section-label-row"><div class="section-label">Achievements</div><div class="lib-count" id="achCount" style="margin:0;"></div></div>' +
        '<div class="ach-grid" id="achGrid"></div>' +
        '<button type="button" class="text-btn hidden" id="achMore"></button>' +
      '</div>' +
      '<div class="module">' +
        '<div class="section-label-row"><div class="section-label">Progress photos</div>' +
          '<div class="profile-photo-actions">' +
            '<button type="button" class="icon-btn" id="pfCompare" aria-label="Compare two photos" title="Compare two photos"><i class="fa-solid fa-code-compare" aria-hidden="true"></i></button>' +
            '<button type="button" class="icon-btn" id="pfUpload" aria-label="Upload a photo" title="Upload a photo"><i class="fa-solid fa-image" aria-hidden="true"></i></button>' +
            '<button type="button" class="icon-btn" id="pfCamera" aria-label="Take a photo" title="Take a photo"><i class="fa-solid fa-camera" aria-hidden="true"></i></button>' +
          '</div></div>' +
        '<div class="empty hidden" id="pfCompareHint">Tap two photos to compare them.</div>' +
        '<div class="photo-grid" id="pfGrid"></div>' +
      '</div>' +
      '<div class="module">' +
        '<div class="section-label-row"><div class="section-label">Google Drive sync</div></div>' +
        '<div class="empty" style="padding:0 0 8px;">Backs up your workouts, bodyweight, avatar and photos to a private app folder in your own Drive.</div>' +
        '<input type="text" id="pfClientId" placeholder="Google OAuth client ID" autocomplete="off" spellcheck="false" aria-label="Google OAuth client ID" />' +
        '<div class="profile-sync-actions">' +
          '<button type="button" id="pfSync" class="primary-btn">Sync now</button>' +
          '<button type="button" id="pfPush" class="text-btn" title="Make Drive match this device (removed workouts stay removed)">Overwrite Drive</button>' +
        '</div>' +
        '<div class="empty" id="pfSyncStatus" style="padding:6px 0 0;"></div>' +
        '<details class="profile-help"><summary>How do I get a client ID?</summary>' +
          '<ol><li>In Google Cloud Console, create a project and enable the <b>Google Drive API</b>.</li>' +
          '<li>Set up the OAuth consent screen, then create an <b>OAuth client ID</b> of type <b>Web application</b>.</li>' +
          '<li>Add the address you open this app from under <b>Authorized JavaScript origins</b> (e.g. <code>https://you.github.io</code> or <code>http://localhost:8000</code>).</li>' +
          '<li>Paste the client ID above. It only works from an http(s) address, not from a file opened directly from disk.</li></ol>' +
          '<p>Sync merges both ways. Workouts deleted on one device can come back on the next merge-sync; use <b>Overwrite Drive</b> to make Drive match this device.</p></details>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="pfAvatarFile" accept="image/*" class="hidden" />' +
    '<input type="file" id="pfCameraFile" accept="image/*" capture="environment" class="hidden" />' +
    '<input type="file" id="pfUploadFile" accept="image/*" multiple class="hidden" />';
  document.body.appendChild(sheet);

  var viewer = document.createElement('div');
  viewer.className = 'photo-viewer hidden';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-label', 'Photo');
  viewer.innerHTML =
    '<div class="photo-viewer-bar"><button type="button" class="icon-btn" id="pvClose" aria-label="Close" title="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
      '<div class="photo-viewer-actions"><button type="button" class="icon-btn" id="pvDate" aria-label="Change date" title="Change date"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i></button>' +
      '<button type="button" class="icon-btn" id="pvDelete" aria-label="Delete photo" title="Delete photo"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></div>' +
    '<div class="photo-viewer-stage" id="pvStage"></div>' +
    '<div class="photo-viewer-nav"><button type="button" class="icon-btn" id="pvPrev" aria-label="Older photo" title="Older"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
      '<div class="photo-viewer-caption" id="pvCaption"></div>' +
      '<button type="button" class="icon-btn" id="pvNext" aria-label="Newer photo" title="Newer"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div>';
  document.body.appendChild(viewer);

  function $(id) { return document.getElementById(id); }
  var urls = [];                                   // object URLs to release on re-render
  function objUrl(blob) { var u = URL.createObjectURL(blob); urls.push(u); return u; }
  function releaseUrls() { urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = []; }

  // ---------------- avatar ----------------
  var avatarBlob = null;
  function paintAvatar(el, blobUrl) {
    el.innerHTML = blobUrl ? '<img alt="" src="' + blobUrl + '" />' : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
  }
  var avatarUrl = null;
  function refreshAvatar() {
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    avatarUrl = avatarBlob ? URL.createObjectURL(avatarBlob) : null;
    paintAvatar(openBtn, avatarUrl);
    paintAvatar($('pfAvatarBtn'), avatarUrl);
    $('pfAvatarBtn').insertAdjacentHTML('beforeend', '<span class="profile-avatar-edit"><i class="fa-solid fa-camera" aria-hidden="true"></i></span>');
    $('pfAvatarRemove').classList.toggle('hidden', !avatarBlob);
    openBtn.setAttribute('aria-label', state.name ? 'Profile: ' + state.name : 'Profile');
  }
  function loadAvatar() {
    return dbGet('meta', 'avatar').then(function (rec) { avatarBlob = rec ? rec.blob : null; refreshAvatar(); })['catch'](refreshAvatar);
  }
  $('pfAvatarBtn').onclick = function () { $('pfAvatarFile').click(); };
  $('pfAvatarFile').onchange = function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    toJpeg(f, 320, true, 0.85).then(function (b) {
      return dbPut('meta', { blob: b, updated: Date.now() }, 'avatar').then(function () { avatarBlob = b; refreshAvatar(); });
    })['catch'](function (e) { toast(e.message || 'Could not save picture'); });
  };
  $('pfAvatarRemove').onclick = function () {
    dbDel('meta', 'avatar').then(function () { avatarBlob = null; refreshAvatar(); });
  };
  $('pfName').value = state.name;
  $('pfName').oninput = function () { state.name = this.value.trim(); save(); openBtn.setAttribute('aria-label', state.name ? 'Profile: ' + state.name : 'Profile'); };

  // ---------------- progress photos ----------------
  var photos = [];                                  // sorted oldest -> newest, each {id,date,blob}
  var compareMode = false, picked = [];
  function loadPhotos() {
    return dbAll('photos').then(function (all) {
      photos = all.sort(function (a, b) { return a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date); });
      renderGrid();
      if (typeof renderAchievements === 'function') renderAchievements();
    })['catch'](function () { photos = []; renderGrid(); });
  }
  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function renderGrid() {
    releaseUrls();
    var grid = $('pfGrid');
    grid.innerHTML = '';
    if (!photos.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">No photos yet. Use the camera or upload icon to add your first one.</div>'; return; }
    photos.slice().reverse().forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'photo-tile' + (picked.indexOf(p.id) >= 0 ? ' picked' : '');
      b.innerHTML = '<img alt="Progress photo, ' + fmtDate(p.date) + '" src="' + objUrl(p.blob) + '" /><span>' + fmtDate(p.date) + '</span>';
      b.onclick = function () { onTile(p.id); };
      grid.appendChild(b);
    });
  }
  function onTile(id) {
    if (!compareMode) return openViewer([id]);
    var i = picked.indexOf(id);
    if (i >= 0) picked.splice(i, 1); else picked.push(id);
    if (picked.length === 2) { var pair = picked.slice(); setCompare(false); openViewer(pair); return; }
    renderGrid();
  }
  function setCompare(on) {
    compareMode = on; picked = [];
    $('pfCompare').classList.toggle('on', on);
    $('pfCompareHint').classList.toggle('hidden', !on);
    renderGrid();
  }
  $('pfCompare').onclick = function () {
    if (photos.length < 2) { toast('Add at least two photos to compare'); return; }
    setCompare(!compareMode);
  };
  function addPhotos(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    var date = todayISO();
    Promise.all(list.map(function (f) {
      return toJpeg(f, 1280, false, 0.82).then(function (b) { return dbPut('photos', { id: uid(), date: date, blob: b }); });
    })).then(function () { toast(list.length > 1 ? list.length + ' photos added' : 'Photo added'); return loadPhotos(); })
      ['catch'](function (e) { toast(e && e.message ? e.message : 'Could not save photo'); });
  }
  $('pfCamera').onclick = function () { $('pfCameraFile').click(); };
  $('pfUpload').onclick = function () { $('pfUploadFile').click(); };
  $('pfCameraFile').onchange = function () { var f = this.files; addPhotos(f); this.value = ''; };
  $('pfUploadFile').onchange = function () { var f = this.files; addPhotos(f); this.value = ''; };

  // viewer: one photo (browse older/newer through the timeline) or two side by side (compare)
  var viewIds = [], viewIdx = 0, vUrls = [];
  function photoById(id) { return photos.filter(function (p) { return p.id === id; })[0]; }
  function bwLine(date) { var s = App.bodyweightOn(date); return s ? ' · ' + s : ''; }
  function viewUrl(b) { var u = URL.createObjectURL(b); vUrls.push(u); return u; }
  function releaseViewerUrls() { vUrls.forEach(function (u) { URL.revokeObjectURL(u); }); vUrls = []; }
  function daysBetween(a, b) {
    var d = Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    return d === 0 ? 'Same day' : d + (d === 1 ? ' day' : ' days') + ' apart';
  }
  function openViewer(ids) {
    viewIds = ids.slice();
    if (viewIds.length === 2) viewIds.sort(function (x, y) { return photoById(x).date.localeCompare(photoById(y).date); });
    else viewIdx = photos.map(function (p) { return p.id; }).indexOf(viewIds[0]);
    viewer.classList.remove('hidden');
    renderViewer();
  }
  function renderViewer() {
    releaseViewerUrls();
    var stage = $('pvStage'), two = viewIds.length === 2;
    var shown = two ? viewIds.map(photoById) : [photos[viewIdx]];
    stage.className = 'photo-viewer-stage' + (two ? ' two' : '');
    stage.innerHTML = '';
    shown.forEach(function (p) {
      if (!p) return;
      var fig = document.createElement('figure');
      fig.innerHTML = '<img alt="" src="' + viewUrl(p.blob) + '" /><figcaption>' + fmtDate(p.date) + bwLine(p.date) + '</figcaption>';
      stage.appendChild(fig);
    });
    $('pvCaption').textContent = two ? (shown[0] && shown[1] ? daysBetween(shown[0].date, shown[1].date) : '') : (viewIdx + 1) + ' / ' + photos.length;
    ['pvPrev', 'pvNext', 'pvDate', 'pvDelete'].forEach(function (id) { $(id).classList.toggle('hidden', two); });
    $('pvPrev').disabled = viewIdx <= 0;
    $('pvNext').disabled = viewIdx >= photos.length - 1;
  }
  $('pvClose').onclick = function () { viewer.classList.add('hidden'); releaseViewerUrls(); };
  $('pvPrev').onclick = function () { if (viewIdx > 0) { viewIdx--; renderViewer(); } };
  $('pvNext').onclick = function () { if (viewIdx < photos.length - 1) { viewIdx++; renderViewer(); } };
  $('pvDate').onclick = function () {
    var p = photos[viewIdx]; if (!p) return;
    var v = prompt('Photo date (YYYY-MM-DD):', p.date);
    if (v === null) return;
    v = v.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T00:00:00'))) { toast('Use the format YYYY-MM-DD'); return; }
    p.date = v;
    dbPut('photos', p).then(loadPhotos).then(function () { viewIdx = photos.map(function (x) { return x.id; }).indexOf(p.id); renderViewer(); });
  };
  $('pvDelete').onclick = function () {
    var p = photos[viewIdx]; if (!p || !confirm('Delete this photo?')) return;
    dbDel('photos', p.id).then(function () {
      if (state.deleted.indexOf(p.id) < 0) state.deleted.push(p.id);
      save();
      return loadPhotos();
    }).then(function () {
      if (!photos.length) { $('pvClose').onclick(); return; }
      viewIdx = Math.min(viewIdx, photos.length - 1); renderViewer();
    });
  };

  // ---------------- bodyweight: adopt the existing module so its ids and handlers keep working ----------------
  var bwModule = document.getElementById('module-config-bodyweight');
  if (bwModule) {
    $('pfBodyweightSlot').appendChild(bwModule);
    var bwCollapse = document.getElementById('bodyweightCollapseBtn');
    if (bwCollapse) bwCollapse.classList.add('hidden');
  }


  // ---------------- measurements ----------------
  var MS_KEY = 'workout-log-measurements-v1', GOAL_KEY = 'workout-log-goals-v1';
  function readLS(key) { try { var a = JSON.parse(localStorage.getItem(key)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function writeLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  var measurements = readLS(MS_KEY).filter(function (m) { return m && m.id && m.type && m.date && isFinite(m.value); });
  var goals = readLS(GOAL_KEY).filter(function (g) { return g && g.id && g.text; });
  var CM_PER_IN = 2.54;
  function imperial() { return App.weightUnit && App.weightUnit() === 'lb'; }
  function lenUnit() { return imperial() ? 'in' : 'cm'; }
  function mTypes() { var l = window.WorkoutLibrary && window.WorkoutLibrary.get(); return l ? l.measurementTypes : []; }
  function mType(id) { return mTypes().filter(function (t) { return t.id === id; })[0]; }
  function unitOf(t) { return t && t.unit === 'percent' ? '%' : lenUnit(); }
  function toShown(t, v) { var x = (t && t.unit === 'percent') ? v : (imperial() ? v / CM_PER_IN : v); return Math.round(x * 10) / 10; }
  function fromShown(t, v) { return (t && t.unit === 'percent') ? v : (imperial() ? v * CM_PER_IN : v); }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function renderMeasurements() {
    var types = mTypes(), sel = $('msType'), keep = sel.value;
    if (!types.length) {
      $('msSummary').innerHTML = '<div class="empty" style="grid-column:1/-1;">Measurement types come from <code>workout-library.json</code>. <button type="button" class="text-btn" id="msPick">Choose file</button></div>';
      var pk = $('msPick'); if (pk && window.WorkoutLibrary) pk.onclick = window.WorkoutLibrary.pickFile;
      sel.innerHTML = ''; $('msHistory').innerHTML = ''; return;
    }
    sel.innerHTML = types.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('');
    if (keep && mType(keep)) sel.value = keep;
    $('msValue').placeholder = unitOf(mType(sel.value));
    // latest value per type with change since the previous reading
    var sum = '';
    types.forEach(function (t) {
      var rows = measurements.filter(function (m) { return m.type === t.id; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      if (!rows.length) return;
      var latest = toShown(t, rows[0].value), delta = '';
      if (rows[1]) {
        var d = Math.round((latest - toShown(t, rows[1].value)) * 10) / 10;
        delta = '<span class="ms-delta">' + (d > 0 ? '+' : '') + d + '</span>';
      }
      sum += '<div class="ms-card"><div class="ms-name">' + esc(t.name) + '</div><div class="ms-val">' + latest + ' <small>' + unitOf(t) + '</small>' + delta + '</div></div>';
    });
    $('msSummary').innerHTML = sum || '<div class="empty" style="grid-column:1/-1;">No measurements yet. Pick a measurement below and add your first value.</div>';
    // history, newest first
    var hist = measurements.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || a.type.localeCompare(b.type); });
    $('msHistory').innerHTML = hist.length ? '' : '<div class="empty">Nothing logged yet.</div>';
    hist.forEach(function (m) {
      var t = mType(m.type);
      var row = document.createElement('div');
      row.className = 'ms-row';
      row.innerHTML = '<span>' + esc(m.date) + ' — ' + esc(t ? t.name : m.type) + ': <b>' + toShown(t, m.value) + ' ' + unitOf(t) + '</b></span>' +
        '<button type="button" class="icon-btn" aria-label="Delete" title="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>';
      row.querySelector('button').onclick = function () {
        measurements = measurements.filter(function (x) { return x.id !== m.id; });
        writeLS(MS_KEY, measurements); renderMeasurements(); renderAchievements();
      };
      $('msHistory').appendChild(row);
    });
  }
  $('msType').onchange = function () { $('msValue').placeholder = unitOf(mType(this.value)); };
  $('msDate').value = todayISO();
  $('msAdd').onclick = function () {
    var t = mType($('msType').value), v = parseFloat($('msValue').value), date = $('msDate').value || todayISO();
    if (!t) { toast('Choose a measurement first'); return; }
    if (!(v > 0)) { toast('Enter a value above 0'); return; }
    var stored = Math.round(fromShown(t, v) * 100) / 100;
    var existing = measurements.filter(function (m) { return m.type === t.id && m.date === date; })[0];
    if (existing) existing.value = stored; else measurements.push({ id: uid(), type: t.id, date: date, value: stored });
    writeLS(MS_KEY, measurements);
    $('msValue').value = '';
    renderMeasurements(); renderAchievements();
  };
  $('msValue').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('msAdd').click(); });

  // ---------------- goals ----------------
  function daysUntil(iso) { return Math.round((new Date(iso + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000); }
  function dueText(g) {
    if (!g.due) return '';
    var d = daysUntil(g.due);
    return d < 0 ? 'Overdue by ' + (-d) + (d === -1 ? ' day' : ' days') : d === 0 ? 'Due today' : 'Due in ' + d + (d === 1 ? ' day' : ' days');
  }
  function renderGoals() {
    var box = $('goalList');
    box.innerHTML = '';
    if (!goals.length) { box.innerHTML = '<div class="empty">No goals yet. Add something you are working toward.</div>'; return; }
    var open = goals.filter(function (g) { return !g.done; }).sort(function (a, b) { return (a.due || '9999').localeCompare(b.due || '9999'); });
    var done = goals.filter(function (g) { return g.done; }).sort(function (a, b) { return (b.doneDate || '').localeCompare(a.doneDate || ''); });
    open.concat(done).forEach(function (g) {
      var row = document.createElement('div');
      row.className = 'goal-row' + (g.done ? ' done' : '');
      var overdue = !g.done && g.due && daysUntil(g.due) < 0;
      row.innerHTML =
        '<button type="button" class="goal-check" aria-label="' + (g.done ? 'Mark as not done' : 'Mark as done') + '"><i class="fa-solid ' + (g.done ? 'fa-circle-check' : 'fa-circle') + '" aria-hidden="true"></i></button>' +
        '<div class="goal-body"><div class="goal-text">' + esc(g.text) + '</div>' +
          '<div class="goal-sub' + (overdue ? ' overdue' : '') + '">' + (g.done ? 'Done ' + esc(g.doneDate || '') : esc(dueText(g))) + '</div></div>' +
        '<button type="button" class="icon-btn goal-del" aria-label="Delete goal" title="Delete goal"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>';
      row.querySelector('.goal-check').onclick = function () {
        g.done = !g.done; g.doneDate = g.done ? todayISO() : null;
        writeLS(GOAL_KEY, goals); renderGoals(); renderAchievements();
        if (g.done) toast('Goal reached 🎯');
      };
      row.querySelector('.goal-del').onclick = function () {
        if (!confirm('Delete this goal?')) return;
        goals = goals.filter(function (x) { return x.id !== g.id; });
        writeLS(GOAL_KEY, goals); renderGoals(); renderAchievements();
      };
      box.appendChild(row);
    });
  }
  $('goalAdd').onclick = function () {
    var text = $('goalText').value.trim();
    if (!text) { toast('Write the goal first'); return; }
    goals.push({ id: uid(), text: text, due: $('goalDue').value || null, done: false, doneDate: null, created: todayISO() });
    writeLS(GOAL_KEY, goals);
    $('goalText').value = ''; $('goalDue').value = '';
    renderGoals();
  };
  $('goalText').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('goalAdd').click(); });

  // ---------------- achievements (definitions come from workout-library.json) ----------------
  var achShowAll = false;
  function renderAchievements() {
    var lib = window.WorkoutLibrary && window.WorkoutLibrary.get();
    var grid = $('achGrid'), more = $('achMore');
    grid.innerHTML = '';
    if (!lib || !lib.achievements.length) {
      $('achCount').textContent = '';
      more.classList.add('hidden');
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">Achievements come from <code>workout-library.json</code>. <button type="button" class="text-btn" id="achPick">Choose file</button></div>';
      var pk = $('achPick'); if (pk && window.WorkoutLibrary) pk.onclick = window.WorkoutLibrary.pickFile;
      return;
    }
    var stats = Object.assign({}, App.stats ? App.stats() : {}, {
      photos: photos.length, goalsDone: goals.filter(function (g) { return g.done; }).length, measurementLogs: measurements.length
    });
    var items = lib.achievements.map(function (a) {
      var v = +stats[a.metric] || 0, t = +a.target || 1;
      return { a: a, v: v, t: t, earned: v >= t, ratio: Math.min(1, v / t) };
    });
    var earned = items.filter(function (x) { return x.earned; });
    var locked = items.filter(function (x) { return !x.earned; }).sort(function (x, y) { return y.ratio - x.ratio; });
    $('achCount').textContent = earned.length + ' of ' + items.length + ' earned';
    var shown = achShowAll ? earned.concat(locked) : earned.concat(locked.slice(0, 6));
    shown.forEach(function (x) {
      var d = document.createElement('div');
      d.className = 'ach-card' + (x.earned ? ' earned' : '');
      d.innerHTML = '<div class="ach-icon"><i class="fa-solid ' + esc(x.a.icon || 'fa-star') + '" aria-hidden="true"></i></div>' +
        '<div class="ach-name">' + esc(x.a.name) + '</div><div class="ach-desc">' + esc(x.a.description || '') + '</div>' +
        (x.earned ? '<div class="ach-done"><i class="fa-solid fa-check" aria-hidden="true"></i> Earned</div>'
                  : '<div class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + x.t + '" aria-valuenow="' + Math.min(x.v, x.t) + '"><span style="width:' + Math.round(x.ratio * 100) + '%"></span></div><div class="ach-prog">' + x.v + ' / ' + x.t + '</div>');
      grid.appendChild(d);
    });
    var hidden = items.length - shown.length;
    more.classList.toggle('hidden', !hidden && !achShowAll);
    more.textContent = achShowAll ? 'Show fewer' : 'Show all (' + items.length + ')';
  }
  $('achMore').onclick = function () { achShowAll = !achShowAll; renderAchievements(); };
  if (window.WorkoutLibrary) {
    window.WorkoutLibrary.ready.then(function () { renderMeasurements(); renderAchievements(); });
    window.WorkoutLibrary.onChange(function () { renderMeasurements(); renderAchievements(); });
  }
  if (App.registerBackupPart) {
    var mergeById = function (list, incoming, ok) {
      var have = {}; list.forEach(function (x) { have[x.id] = 1; });
      (Array.isArray(incoming) ? incoming : []).forEach(function (x) { if (x && x.id && ok(x) && !have[x.id]) list.push(x); });
    };
    App.registerBackupPart('measurements', { get: function () { return measurements; }, merge: function (inc) {
      mergeById(measurements, inc, function (m) { return m.type && m.date && isFinite(m.value); });
      writeLS(MS_KEY, measurements); renderMeasurements(); renderAchievements();
    } });
    App.registerBackupPart('goals', { get: function () { return goals; }, merge: function (inc) {
      mergeById(goals, inc, function (g) { return g.text; });
      writeLS(GOAL_KEY, goals); renderGoals(); renderAchievements();
    } });
  }
  renderGoals();

  // ---------------- open / close ----------------
  function setOpen(open) {
    sheet.classList.toggle('hidden', !open);
    document.documentElement.classList.toggle('profile-open', open);
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { App.renderBodyweight(); loadPhotos().then(renderAchievements); renderMeasurements(); renderGoals(); renderAchievements(); preloadGis(); sheet.scrollTop = 0; }
    else { setCompare(false); }
  }
  openBtn.onclick = function () { setOpen(sheet.classList.contains('hidden')); };
  $('pfClose').onclick = function () { setOpen(false); };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!viewer.classList.contains('hidden')) $('pvClose').onclick();
    else if (!sheet.classList.contains('hidden')) setOpen(false);
  });

  // ---------------- Google Drive sync ----------------
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var token = null, tokenExp = 0, gisPromise = null, busy = false;
  $('pfClientId').value = state.clientId;
  $('pfClientId').onchange = function () { state.clientId = this.value.trim(); state.linked = false; token = null; save(); };
  function status(msg, isErr) {
    var el = $('pfSyncStatus');
    el.textContent = msg; el.classList.toggle('error', !!isErr);
  }
  // Google refuses sign-in from pages opened straight from disk (their origin is "null").
  var FILE_MSG = 'Google sign-in does not work when the app is opened from a file. Open it from a web address instead (for example GitHub Pages, or http://localhost:8000), and add that address to the OAuth client.';
  function onFile() { return location.protocol === 'file:' || location.origin === 'null'; }
  function showLastSync() {
    if (onFile()) { status(FILE_MSG, true); return; }
    status(state.lastSync ? 'Last synced ' + new Date(state.lastSync).toLocaleString() : 'Not synced yet.');
  }
  function preloadGis() {
    if (gisPromise || !state.clientId) return gisPromise;
    gisPromise = new Promise(function (res, rej) {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = res;
      s.onerror = function () { gisPromise = null; rej(new Error('Could not load Google sign-in. Are you online?')); };
      document.head.appendChild(s);
    });
    gisPromise['catch'](function () { /* reported when Sync is pressed */ });
    return gisPromise;
  }
  function getToken() {
    if (onFile()) return Promise.reject(new Error(FILE_MSG));
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    var g = preloadGis();
    if (!g) return Promise.reject(new Error('Paste your Google client ID first.'));
    return g.then(function () {
      return new Promise(function (res, rej) {
        var client = google.accounts.oauth2.initTokenClient({
          client_id: state.clientId, scope: SCOPE,
          callback: function (r) {
            if (r.error) return rej(new Error(r.error_description || r.error));
            token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
            state.linked = true; save(); res(token);
          },
          error_callback: function (e) { rej(new Error(e && e.type === 'popup_closed' ? 'Sign-in was closed.' : 'Google sign-in failed' + (e && e.type ? ' (' + e.type + ')' : ''))); }
        });
        client.requestAccessToken({ prompt: state.linked ? '' : 'consent' });
      });
    });
  }
  function dfetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (r.ok) return r;
      return r.text().then(function (t) { throw new Error('Drive error ' + r.status + (t ? ': ' + t.slice(0, 140) : '')); });
    });
  }
  function listFiles() {
    return (function page(tk, acc) {
      return dfetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime)' + (tk ? '&pageToken=' + tk : ''))
        .then(function (r) { return r.json(); })
        .then(function (j) { acc = acc.concat(j.files || []); return j.nextPageToken ? page(j.nextPageToken, acc) : acc; });
    })(null, []);
  }
  function upload(name, blob, mime, existing) {
    var boundary = 'wl' + uid();
    var meta = existing ? { name: name } : { name: name, parents: ['appDataFolder'] };
    var body = new Blob(['--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', JSON.stringify(meta),
      '\r\n--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n', blob, '\r\n--' + boundary + '--']);
    return dfetch('https://www.googleapis.com/upload/drive/v3/files' + (existing ? '/' + existing.id : '') + '?uploadType=multipart&fields=id',
      { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body });
  }
  function download(f, asBlob) {
    return dfetch('https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media').then(function (r) { return asBlob ? r.blob() : r.text(); });
  }
  function removeRemote(f) { return dfetch('https://www.googleapis.com/drive/v3/files/' + f.id, { method: 'DELETE' }); }
  function seq(items, fn) { return items.reduce(function (p, it) { return p.then(function () { return fn(it); }); }, Promise.resolve()); }

  // mode 'merge': pull Drive into this device, then push the merged result. mode 'push': make Drive match this device.
  function sync(mode) {
    if (busy) return;
    if (!state.clientId) { status('Paste your Google client ID first.', true); return; }
    busy = true; $('pfSync').disabled = $('pfPush').disabled = true;
    status('Connecting to Google…');
    getToken().then(listFiles).then(function (files) {
      var byName = {};
      files.forEach(function (f) { byName[f.name] = f; });
      var pull = (mode === 'merge' && byName['backup.json'])
        ? (status('Reading Drive backup…'), download(byName['backup.json']).then(function (t) { return JSON.parse(t); }))
        : Promise.resolve(null);
      return pull.then(function (remote) {
        var remotePhotos = [];
        if (remote) {
          if (remote.payload && !App.importBackupText(JSON.stringify(remote.payload), { quiet: true })) throw new Error('The Drive backup could not be read, so nothing was changed.');
          if (remote.profile && remote.profile.name && !state.name) { state.name = remote.profile.name; $('pfName').value = state.name; }
          (remote.deletedPhotos || []).forEach(function (id) { if (state.deleted.indexOf(id) < 0) state.deleted.push(id); });
          remotePhotos = remote.photos || [];
        }
        save();
        status('Syncing photos…');
        return dbAll('photos').then(function (local) {
          var localIds = {}; local.forEach(function (p) { localIds[p.id] = p; });
          // photos deleted elsewhere: drop them here too
          var drops = local.filter(function (p) { return state.deleted.indexOf(p.id) >= 0; });
          return seq(drops, function (p) { delete localIds[p.id]; return dbDel('photos', p.id); }).then(function () {
            // photos only on Drive: fetch them
            var need = remotePhotos.filter(function (p) { return !localIds[p.id] && state.deleted.indexOf(p.id) < 0 && byName['photo-' + p.id + '.jpg']; });
            return seq(need, function (p) {
              return download(byName['photo-' + p.id + '.jpg'], true).then(function (b) { return dbPut('photos', { id: p.id, date: p.date, blob: b }); });
            });
          }).then(function () {
            return dbAll('photos');
          }).then(function (nowLocal) {
            // photos only here: upload them; photos deleted here: remove from Drive
            var up = nowLocal.filter(function (p) { return !byName['photo-' + p.id + '.jpg']; });
            var gone = state.deleted.map(function (id) { return byName['photo-' + id + '.jpg']; }).filter(Boolean);
            return seq(up, function (p) { return upload('photo-' + p.id + '.jpg', p.blob, 'image/jpeg'); })
              .then(function () { return seq(gone, removeRemote); })
              .then(function () { return nowLocal; });
          });
        }).then(function (nowLocal) {
          // avatar: newest copy wins
          return dbGet('meta', 'avatar').then(function (rec) {
            var rf = byName['avatar.jpg'];
            if (rec && (!rf || rec.updated > Date.parse(rf.modifiedTime))) return upload('avatar.jpg', rec.blob, 'image/jpeg', rf);
            if (!rec && rf) return download(rf, true).then(function (b) { return dbPut('meta', { blob: b, updated: Date.now() }, 'avatar'); });
          }).then(function () {
            status('Uploading backup…');
            var backup = {
              version: 1, updatedAt: Date.now(),
              payload: App.buildBackupPayload(),
              profile: { name: state.name },
              photos: nowLocal.map(function (p) { return { id: p.id, date: p.date }; }),
              deletedPhotos: state.deleted
            };
            return upload('backup.json', new Blob([JSON.stringify(backup)], { type: 'application/json' }), 'application/json', byName['backup.json']);
          });
        });
      });
    }).then(function () {
      state.lastSync = Date.now(); save();
      showLastSync(); toast('Synced with Google Drive');
      return Promise.all([loadAvatar(), loadPhotos()]);
    })['catch'](function (e) {
      status(e && e.message ? e.message : 'Sync failed', true);
    }).then(function () { busy = false; $('pfSync').disabled = $('pfPush').disabled = false; });
  }
  $('pfSync').onclick = function () { sync('merge'); };
  $('pfPush').onclick = function () {
    if (confirm('Replace the backup on Google Drive with what is on this device?')) sync('push');
  };

  loadAvatar();
  showLastSync();
})();
