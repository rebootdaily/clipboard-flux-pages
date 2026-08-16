/* Clipboard-Flux deployment loader.
   Corrective Footprint build: keep the proven iOS print-pagination and
   reference-print helpers, keep Milestone 23 multi-sheet disabled, and load
   the Footprint tool-recovery guard before the unchanged generated app core. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.23.0.2';

  var badge = document.getElementById('version');
  if (badge) badge.textContent = RELEASE_VERSION;
  if (/^Clipboard-Flux\b/.test(document.title || '')) document.title = 'Clipboard-Flux ' + RELEASE_VERSION;

  function loadCore() {
    var core = document.createElement('script');
    core.src = 'app-core.js?v=' + encodeURIComponent(RELEASE_VERSION);
    document.body.appendChild(core);
  }

  function loadToolRecovery() {
    var recovery = document.createElement('script');
    recovery.src = 'footprint_tool_recovery.js?v=' + encodeURIComponent(RELEASE_VERSION);
    recovery.onload = loadCore;
    recovery.onerror = loadCore;
    document.body.appendChild(recovery);
  }

  function loadReferencePrintBridge() {
    var ref = document.createElement('script');
    ref.src = 'footprint_reference_print.js?v=' + encodeURIComponent(RELEASE_VERSION);
    ref.onload = loadToolRecovery;
    ref.onerror = loadToolRecovery;
    document.body.appendChild(ref);
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js?v=' + encodeURIComponent(RELEASE_VERSION);
  guard.onload = loadReferencePrintBridge;
  guard.onerror = loadReferencePrintBridge;
  document.body.appendChild(guard);
})();
