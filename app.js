/* Clipboard-Flux deployment loader.
   One-build bridge for the checked-in generated output: load the proven
   iOS pagination guard, then Milestone 23's multi-sheet Footprint helper,
   before the unchanged generated app core. Normal local builds link the
   same helpers directly into output/index.html. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.23.0';
  var current = document.currentScript;
  var query = '';
  if (current && current.src) {
    var q = current.src.indexOf('?');
    if (q !== -1) query = current.src.slice(q);
  }

  var badge = document.getElementById('version');
  if (badge) badge.textContent = RELEASE_VERSION;
  if (/^Clipboard-Flux\b/.test(document.title || '')) document.title = 'Clipboard-Flux ' + RELEASE_VERSION;

  function loadCore() {
    var core = document.createElement('script');
    core.src = 'app-core.js?v=' + encodeURIComponent(RELEASE_VERSION);
    document.body.appendChild(core);
  }

  function loadMultiSheet() {
    var helper = document.createElement('script');
    helper.src = 'footprint_multisheet.js?v=' + encodeURIComponent(RELEASE_VERSION);
    helper.onload = loadCore;
    helper.onerror = loadCore;
    document.body.appendChild(helper);
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js?v=' + encodeURIComponent(RELEASE_VERSION);
  guard.onload = loadMultiSheet;
  guard.onerror = loadMultiSheet;
  document.body.appendChild(guard);
})();
