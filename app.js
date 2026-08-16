/* Clipboard-Flux deployment loader.
   This is a one-build bridge for the current generated output: load the
   iOS print-pagination guard before the unchanged generated app core.
   The normal local build path does not depend on this wrapper; the
   post-build linker adds the guard directly to output/index.html. */
(function () {
  'use strict';
  var current = document.currentScript;
  var query = '';
  if (current && current.src) {
    var q = current.src.indexOf('?');
    if (q !== -1) query = current.src.slice(q);
  }

  function loadCore() {
    var core = document.createElement('script');
    core.src = 'app-core.js' + query;
    document.body.appendChild(core);
  }

  var guard = document.createElement('script');
  guard.src = 'ios_print_pagination.js' + query;
  guard.onload = loadCore;
  guard.onerror = loadCore;
  document.body.appendChild(guard);
})();
