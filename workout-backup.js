/* Automatic daily backup to a folder on this device.
   Uses the browser's File System Access API (Chrome / Edge on a computer): you pick a folder once, then the app
   writes workout-backup-YYYY-MM-DD.json into it once a day and deletes older ones so only the newest 5 stay.
   It only ever deletes files whose names match that exact pattern; anything else in the folder is left alone.
   Photos and the profile picture are not part of these files (they live in the browser and sync via Google Drive). */
(function () {
  'use strict';
  var App = window.WorkoutApp;
  var sheet = document.getElementById('profileSheet');
  if (!App || !sheet) return;

  var KEEP = 5;
  var PREFIX = 'workout-backup-';
  var NAME_RE = /^workout-backup-(\d{4}-\d{2}-\d{2})\.json$/;
  var LS_KEY = 'workout-log-autobackup-v1';
  var SUPPORTED = typeof window.showDirectoryPicker === 'function';

  var state = { enabled: true, last: '', lastAt: 0, folder: '' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(LS_KEY)) || {}); } catch (e) { /* first run */ }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function toast(m) { App.showToast(m); }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------------- remembering the folder (a handle can't go in localStorage, so IndexedDB) ----------------
  var store = {
    open: function () {
      return new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('no IndexedDB'));
        var r = indexedDB.open('workout-log-backup', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    },
    get: function () {
      return store.open().then(function (db) {
        return new Promise(function (res, rej) {
          var q = db.transaction('handles', 'readonly').objectStore('handles').get('dir');
          q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { rej(q.error); };
        });
      });
    },
    put: function (h) {
      return store.open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('handles', 'readwrite');
          if (h) t.objectStore('handles').put(h, 'dir'); else t.objectStore('handles').delete('dir');
          t.oncomplete = function () { res(); }; t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
  };

  // ---------------- folder access ----------------
  function permission(handle, ask) {
    var opts = { mode: 'readwrite' };
    return handle.queryPermission(opts).then(function (p) {
      if (p === 'granted') return true;
      if (!ask) return false;
      return handle.requestPermission(opts).then(function (q) { return q === 'granted'; });
    });
  }
  // Write straight into the folder if it is called "backup", otherwise into a "backup" folder inside it.
  function resolveDir(root) {
    return String(root.name).toLowerCase() === 'backup' ? Promise.resolve(root) : root.getDirectoryHandle('backup', { create: true });
  }
  function listBackups(dir) {
    var out = [];
    return (async function () {
      for await (var h of dir.values()) { if (h.kind === 'file' && NAME_RE.test(h.name)) out.push(h.name); }
      return out.sort().reverse(); // newest first (the date is in the name)
    })();
  }
  function isEmpty(p) {
    var n = 0;
    Object.keys(p.data || {}).forEach(function (k) { n += Array.isArray(p.data[k]) ? p.data[k].length : 0; });
    return n === 0 && !(p.bodyweight || []).length && !(p.skills || []).length;
  }

  var busy = false, needsPermission = false, lastError = '';
  // opts: { ask: bool (may show the browser's permission prompt), manual: bool, date: 'YYYY-MM-DD' (tests) }
  function backupNow(opts) {
    opts = opts || {};
    if (busy) return Promise.resolve(false);
    busy = true; lastError = '';
    return store.get().then(function (root) {
      if (!root) { throw new Error('Choose a backup folder first.'); }
      return permission(root, !!opts.ask).then(function (ok) {
        if (!ok) { needsPermission = true; return false; }
        needsPermission = false;
        var payload = App.buildBackupPayload();
        if (isEmpty(payload)) {
          if (opts.manual) toast('Nothing to back up yet'); return false;
        }
        payload.exportedAt = new Date().toISOString();
        var day = opts.date || todayISO();
        return resolveDir(root).then(function (dir) {
          return dir.getFileHandle(PREFIX + day + '.json', { create: true }).then(function (fh) {
            return fh.createWritable().then(function (w) {
              return w.write(JSON.stringify(payload)).then(function () { return w.close(); });
            });
          }).then(function () { return listBackups(dir); }).then(function (names) {
            var drop = names.slice(KEEP);
            return drop.reduce(function (p, n) { return p.then(function () { return dir.removeEntry(n); }); }, Promise.resolve());
          }).then(function () {
            state.last = day; state.lastAt = Date.now(); state.folder = root.name; save();
            if (opts.manual) toast('Backup saved');
            return true;
          });
        });
      });
    })['catch'](function (e) {
      lastError = e && e.message ? e.message : 'Backup failed';
      if (opts.manual) toast(lastError);
      return false;
    }).then(function (ok) { busy = false; render(); return ok; });
  }

  // ---------------- when to run ----------------
  var tapArmed = false;
  function armTap() {
    if (tapArmed) return; tapArmed = true;
    // the browser only lets us ask for folder access in response to a tap, so use the next one
    document.addEventListener('click', function () { tapArmed = false; backupNow({ ask: true }); }, { once: true, capture: true });
  }
  function maybeAuto() {
    if (!SUPPORTED || !state.enabled || state.last === todayISO()) return;
    store.get().then(function (root) {
      if (!root) return;
      return backupNow({ ask: false }).then(function (ok) { if (!ok && needsPermission) { armTap(); render(); } });
    })['catch'](function () { /* ignore */ });
  }
  setTimeout(maybeAuto, 3000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') maybeAuto(); });
  setInterval(maybeAuto, 30 * 60 * 1000); // a tab left open past midnight still gets its backup

  // ---------------- the settings card (inside the profile screen, above Google Drive sync) ----------------
  var mod = document.createElement('div');
  mod.className = 'module'; mod.id = 'bkModule';
  mod.innerHTML =
    '<div class="section-label-row"><div class="section-label">Automatic backup</div></div>' +
    '<div class="empty" style="padding:0 0 8px;" id="bkInfo"></div>' +
    '<label class="lib-opt" id="bkEnabledRow"><input type="checkbox" id="bkEnabled" /> Back up automatically once a day</label>' +
    '<div class="bk-actions">' +
      '<button type="button" class="text-btn" id="bkPick"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Choose backup folder</button>' +
      '<button type="button" class="primary-btn" id="bkNow">Back up now</button>' +
      '<button type="button" class="text-btn" id="bkDownload"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Download a copy</button>' +
    '</div>' +
    '<div class="empty" id="bkStatus" style="padding:8px 0 0;"></div>' +
    '<div class="bk-list" id="bkList"></div>' +
    '<details class="profile-help"><summary>Good to know</summary><ul>' +
      '<li>Make a folder called <b>backup</b> anywhere you like and choose it. If you choose a different folder, the app makes a <b>backup</b> folder inside it.</li>' +
      '<li>One file a day, named <code>workout-backup-YYYY-MM-DD.json</code>. After each backup, only the newest 5 are kept. Other files in that folder are never touched.</li>' +
      '<li>Backups run when you open the app (and about every 30 minutes while it stays open). If the browser asks for folder access after a restart, tap Allow.</li>' +
      '<li>To restore, use Restore beside a file below, or Import backup in the settings menu. Restoring merges: it adds what is missing and does not overwrite.</li>' +
      '<li>Photos and your profile picture are not in these files. Google Drive sync covers those.</li>' +
    '</ul></details>';
  var anchor = document.getElementById('pfSync');
  var anchorModule = anchor ? anchor.closest('.module') : null;
  if (anchorModule) anchorModule.parentNode.insertBefore(mod, anchorModule);
  else sheet.querySelector('.profile-body').appendChild(mod);

  function $(id) { return document.getElementById(id); }
  var listToken = 0;
  function render() {
    $('bkInfo').textContent = SUPPORTED
      ? 'Saves a backup file once a day into a folder on this device and keeps the newest ' + KEEP + '.'
      : 'This browser cannot save into a folder by itself (use Chrome or Edge on a computer for that). You can still download a copy by hand, or use Google Drive sync below.';
    $('bkEnabled').checked = !!state.enabled;
    ['bkPick', 'bkNow', 'bkEnabledRow'].forEach(function (id) { $(id).classList.toggle('hidden', !SUPPORTED); });
    var s = '';
    if (SUPPORTED) {
      if (state.folder) s += 'Folder: <b>' + esc(state.folder) + '</b>. ';
      s += state.lastAt ? 'Last backup: ' + esc(new Date(state.lastAt).toLocaleString()) + '.' : 'No backup yet.';
      if (needsPermission) s += ' <button type="button" class="text-btn" id="bkAllow">Allow folder access</button>';
      if (lastError) s += ' <span class="bk-err">' + esc(lastError) + '</span>';
    }
    $('bkStatus').innerHTML = s;
    var allow = $('bkAllow'); if (allow) allow.onclick = function () { backupNow({ ask: true, manual: true }); };
    // list what is in the folder right now (only when access is already granted)
    var token = ++listToken, box = $('bkList');
    if (!SUPPORTED) { box.innerHTML = ''; return; }
    store.get().then(function (root) {
      if (!root) { box.innerHTML = ''; return; }
      return permission(root, false).then(function (ok) {
        if (!ok) { box.innerHTML = ''; return; }
        return resolveDir(root).then(listBackups).then(function (names) {
          if (token !== listToken) return;
          box.innerHTML = names.length ? '' : '';
          names.forEach(function (n) {
            var row = document.createElement('div'); row.className = 'bk-row';
            row.innerHTML = '<span>' + esc(n.replace(PREFIX, '').replace('.json', '')) + '</span><button type="button" class="text-btn">Restore</button>';
            row.querySelector('button').onclick = function () { restore(root, n); };
            box.appendChild(row);
          });
        });
      });
    })['catch'](function () { /* folder gone or blocked: nothing to list */ });
  }
  function restore(root, name) {
    if (!confirm('Restore ' + name + '? This adds anything missing from that backup to what you have now.')) return;
    resolveDir(root).then(function (dir) { return dir.getFileHandle(name); })
      .then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); })
      .then(function (text) { if (App.importBackupText(text)) toast('Backup restored'); })
      ['catch'](function () { toast('Could not read that file'); });
  }

  $('bkEnabled').onchange = function () { state.enabled = this.checked; save(); if (state.enabled) maybeAuto(); };
  $('bkPick').onclick = function () {
    window.showDirectoryPicker({ id: 'workout-backup', mode: 'readwrite' }).then(function (h) {
      return store.put(h).then(function () {
        state.folder = h.name; state.last = ''; save(); needsPermission = false;
        return backupNow({ ask: true, manual: true });
      });
    })['catch'](function (e) { if (e && e.name !== 'AbortError') toast('Could not use that folder'); });
  };
  $('bkNow').onclick = function () { backupNow({ ask: true, manual: true }); };
  $('bkDownload').onclick = function () {
    var payload = App.buildBackupPayload(); payload.exportedAt = new Date().toISOString();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    a.download = PREFIX + todayISO() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  new MutationObserver(function () { if (!sheet.classList.contains('hidden')) render(); }).observe(sheet, { attributes: true, attributeFilter: ['class'] });

  window.WorkoutBackup = { backupNow: backupNow, store: store, state: state, KEEP: KEEP };
  render();
})();
