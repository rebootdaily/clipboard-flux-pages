/* Clipboard-Flux deployment loader.
   Corrective rollback for Milestone 23: keep the proven iOS print-pagination
   guard and Footprint reference-print helper, but do not load the multi-sheet
   bridge while its touch/tool interaction regression is being reworked. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.23.0.1';

  var badge = document.getElementById('version');
  if (badge) badge.textContent = RELEASE_VERSION;
  if (/^Clipboard-Flux\b/.test(document.title || '')) document.title = 'Clipboard-Flux ' + RELEASE_VERSION;

  function loadCore() {
    var core = document.createElement('script');
    core.src = 'app-core.js?v=' + encodeURIComponent(RELEASE_VERSION);
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
  guard.src = 'ios_print_pagination.js?v=' + encodeURIComponent(RELEASE_VERSION);
  guard.onload = loadReferencePrintBridge;
  guard.onerror = loadReferencePrintBridge;
  document.body.appendChild(guard);
})();
