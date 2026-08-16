/* Clipboard-Flux mobile PDF asset-readiness guard.
   Safari can snapshot a print iframe before blob-backed photos, Footprint,
   and Hand Notes images have finished decoding. The core exporter already
   builds the complete inspection document; this wrapper delays only the
   iframe's native print() call until its images are ready (or a bounded
   timeout expires), then gives layout two animation frames to settle. */
(function () {
  'use strict';
  var MAX_WAIT_MS = 15000;
  function afterTwoFrames(win, fn) {
    var raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : function (cb) { return win.setTimeout(cb, 16); };
    raf(function () { raf(fn); });
  }
  function waitForImage(img) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
        resolve();
      }
      function decodeThenFinish() {
        if (typeof img.decode === 'function') {
          try {
            var decoded = img.decode();
            if (decoded && typeof decoded.then === 'function') { decoded.then(finish, finish); return; }
          } catch (e) {}
        }
        finish();
      }
      function onLoad() { decodeThenFinish(); }
      function onError() { finish(); }
      if (img.complete) {
        if (img.naturalWidth > 0) decodeThenFinish(); else finish();
        return;
      }
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
    });
  }
  function waitForPrintableAssets(win) {
    var doc = win.document;
    var waits = Array.prototype.map.call(doc.images || [], waitForImage);
    if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') waits.push(doc.fonts.ready.catch(function () {}));
    return Promise.all(waits);
  }
  function patchPdfIframe(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return;
    if (!Object.prototype.hasOwnProperty.call(iframe, '__objectUrls')) return;
    if (iframe.__clipboardFluxPdfPrintPatched) return;
    var win;
    try { win = iframe.contentWindow; } catch (e) { return; }
    if (!win || typeof win.print !== 'function') return;
    var nativePrint = win.print.bind(win);
    iframe.__clipboardFluxPdfPrintPatched = true;
    win.print = function () {
      if (win.__clipboardFluxPdfPrintQueued) return;
      win.__clipboardFluxPdfPrintQueued = true;
      var fired = false;
      function fireNativePrint() {
        if (fired) return;
        fired = true;
        afterTwoFrames(win, function () {
          try { nativePrint(); } finally { win.__clipboardFluxPdfPrintQueued = false; }
        });
      }
      waitForPrintableAssets(win).then(fireNativePrint, fireNativePrint);
      win.setTimeout(fireNativePrint, MAX_WAIT_MS);
    };
  }
  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') patchPdfIframe(node);
        if (node.querySelectorAll) Array.prototype.forEach.call(node.querySelectorAll('iframe'), patchPdfIframe);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), patchPdfIframe);
})();
