/* Clipboard-Flux deployment loader.
   0.23.1 keeps the proven Footprint core untouched. Print helpers and the
   Pencil/Pan recovery guard load before core; the isolated sheet manager loads
   only after core has finished loading and never attaches to the canvas. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.23.1';

  var badge = document.getElementById('version');
  if (badge) badge.textContent = RELEASE_VERSION;
  if (/^Clipboard-Flux\b/.test(document.title || '')) document.title = 'Clipboard-Flux ' + RELEASE_VERSION;

  function loadSheetManager() {
    var manager = document.createElement('script');
    manager.src = 'footprint_sheet_manager.js?v=' + encodeURIComponent(RELEASE_VERSION);
    document.body.appendChild(manager);
  }

  function loadCore() {
    var core = document.createElement('script');
    core.src = 'app-core.js?v=' + encodeURIComponent(RELEASE_VERSION);
    core.onload = loadSheetManager;
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

  function loadSheetsPrintBridge() {
    var sheets = document.createElement('script');
    sheets.src = 'footprint_sheets_print.js?v=' + encodeURIComponent(RELEASE_VERSION);
    sheets.onload = loadReferencePrintBridge;
    sheets.onerror = loadReferencePrintBridge;
    document.body.appendChild(sheets);
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js?v=' + encodeURIComponent(RELEASE_VERSION);
  guard.onload = loadSheetsPrintBridge;
  guard.onerror = loadSheetsPrintBridge;
  document.body.appendChild(guard);
})();
