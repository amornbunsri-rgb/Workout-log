/* Registers the service worker (offline use) and keeps the browser's top bar colour in step with light / dark mode.
   Does nothing on browsers or addresses where service workers are not allowed (for example a file opened from disk). */
(function () {
  'use strict';
  // links between the app's own pages open in this same window, never a new tab or window
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self') || location.protocol === 'file:') return;
    var u; try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin) return;
    e.preventDefault();
    location.assign(u.href);
  });
  // top bar colour follows the app's own light / dark switch
  var meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  function syncBar() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    meta.setAttribute('content', dark ? '#171613' : '#fbfaf8');
  }
  syncBar();
  new MutationObserver(syncBar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () {
          // an older worker was already running, so this is an update, not the first install
          if (w.state === 'activated' && navigator.serviceWorker.controller && window.WorkoutApp) {
            window.WorkoutApp.showToast('App updated. Reload to use the new version.');
          }
        });
      });
    })['catch'](function () { /* offline mode simply stays off */ });
  });
})();
