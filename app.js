/* Clipboard-Flux deployment loader.
   0.23.2.1 cleanup keeps the field-stable Footprint runtime from 0.23.1.1,
   loads each compatibility helper exactly once, and keeps the isolated
   responsive-layout bridge before core. Multi-sheet UI/print companions
   remain in the repository for rework but are not loaded in the live app. */
(function () {
  'use strict';
  var RELEASE_VERSION = '0.23.2.1';
  window.__CLIPBOARD_FLUX_RELEASE_VERSION = RELEASE_VERSION;

  var badge = document.getElementById('version');
  if (badge) badge.textContent = RELEASE_VERSION;
  if (/^Clipboard-Flux\b/.test(document.title || '')) document.title = 'Clipboard-Flux ' + RELEASE_VERSION;

  function scriptAlreadyPresent(fileName) {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i += 1) {
      var src = scripts[i].getAttribute('src') || '';
      var path = src.split('?')[0];
      if (path.slice(-(fileName.length + 1)) === '/' + fileName || path === fileName) return true;
    }
    return false;
  }

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

  // Some pre-cleanup generated pages already contain the iOS print bridge
  // directly in index.html. Reuse that instance instead of loading a second
  // copy; fresh generated builds continue to work through the normal helper
  // linker. The bridge itself also has an idempotency guard as a backstop.
  if (scriptAlreadyPresent('ios_print_pagination.js')) {
    loadResponsiveLayout();
    return;
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js?v=' + encodeURIComponent(RELEASE_VERSION);
  guard.onload = loadResponsiveLayout;
  guard.onerror = loadResponsiveLayout;
  document.body.appendChild(guard);
})();
