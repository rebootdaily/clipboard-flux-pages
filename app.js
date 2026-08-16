/* Clipboard-Flux deployment loader.
   This is a one-build bridge for the current generated output: load the
   iOS print-pagination guard, then the Footprint reference-print helper,
   before the unchanged generated app core. The normal local build path
   links both helpers directly into output/index.html. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.22.5';
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
    core.src = 'app-core.js' + query;
    document.body.appendChild(core);
  }

  function loadReferencePrintBridge() {
    var ref = document.createElement('script');
    ref.src = 'footprint_reference_print.js?v=' + encodeURIComponent(RELEASE_VERSION);
    ref.onload = loadCore;
    ref.onerror = loadCore;
    document.body.appendChild(ref);
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js' + query;
  guard.onload = loadReferencePrintBridge;
  guard.onerror = loadReferencePrintBridge;
  document.body.appendChild(guard);
})();
