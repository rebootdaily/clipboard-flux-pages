/* Clipboard-Flux deployment loader.
   0.23.2 keeps the field-stable Footprint runtime from 0.23.1.1 and adds
   the isolated responsive-layout bridge before core. Multi-sheet UI/print
   companions remain in the repository for rework but are not loaded in the
   live app. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.23.2';

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

  function loadResponsiveLayout() {
    var responsive = document.createElement('script');
    responsive.src = 'responsive_layout.js?v=' + encodeURIComponent(RELEASE_VERSION);
    responsive.onload = loadReferencePrintBridge;
    responsive.onerror = loadReferencePrintBridge;
    document.body.appendChild(responsive);
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js?v=' + encodeURIComponent(RELEASE_VERSION);
  guard.onload = loadResponsiveLayout;
  guard.onerror = loadResponsiveLayout;
  document.body.appendChild(guard);
})();
