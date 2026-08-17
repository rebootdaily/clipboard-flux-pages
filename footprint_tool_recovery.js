/* Clipboard-Flux Footprint tool recovery -- 0.23.0.2
   The core Footprint engine deliberately gives an unlocked reference sketch
   first refusal on canvas pointer input. That is useful while positioning a
   reference, but it can make Pencil/Eraser appear stuck in Pan/move mode when
   the reference was left unlocked (including after a sheet/reference workflow).

   Keep the proven core drawing engine untouched. When the user explicitly
   chooses Pencil or Eraser, first lock any currently-unlocked reference using
   the core's own Lock control, then replay the requested tool click against the
   freshly-rendered toolbar. Pan remains unchanged and reference editing remains
   available by explicitly unlocking the reference again. */
(function () {
  'use strict';
  if (window.__clipboardFluxFootprintToolRecoveryInstalled) return;
  window.__clipboardFluxFootprintToolRecoveryInstalled = true;

  var replaying = false;

  document.addEventListener('click', function (ev) {
    if (replaying) return;
    var target = ev.target && ev.target.closest ? ev.target.closest('[data-role]') : null;
    if (!target) return;
    var role = target.getAttribute('data-role');
    if (role !== 'footprint-tool-pencil' && role !== 'footprint-tool-eraser') return;

    var lock = document.querySelector('[data-role="footprint-reference-lock-toggle"]');
    if (!lock || lock.getAttribute('aria-pressed') !== 'false') return;

    // Stop the click from reaching the now-stale toolbar node. The core Lock
    // handler re-renders Footprint, so replay the requested tool on the new DOM.
    ev.preventDefault();
    ev.stopImmediatePropagation();
    lock.click();

    setTimeout(function () {
      var fresh = document.querySelector('[data-role="' + role + '"]');
      if (!fresh) return;
      replaying = true;
      try { fresh.click(); }
      finally { replaying = false; }
    }, 0);
  }, true);
})();
