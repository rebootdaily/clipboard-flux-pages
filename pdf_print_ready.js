/* Clipboard-Flux mobile PDF print guard.
   The core exporter builds the complete report inside a same-page iframe.
   Desktop browsers can print that iframe directly. iOS/iPadOS WebKit can
   instead collapse a zero-size print iframe into a single scaled page, so
   Apple touch devices print an off-screen clone through the top-level
   document. That preserves normal browser pagination without navigating
   away from Clipboard-Flux. Asset readiness is still bounded and all
   temporary print DOM is removed after the native print sheet closes. */
(function () {
  'use strict';
  var MAX_WAIT_MS = 15000;
  var TOP_LEVEL_CLEANUP_MS = 300000;
  var PRINT_HOST_ID = 'clipboard-flux-print-host';
  var PRINT_STYLE_ID = 'clipboard-flux-print-style';
  var activeTopLevelCleanup = null;

  function afterTwoFrames(win, fn) {
    var raf = win.requestAnimationFrame
      ? win.requestAnimationFrame.bind(win)
      : function (cb) { return win.setTimeout(cb, 16); };
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
            if (decoded && typeof decoded.then === 'function') {
              decoded.then(finish, finish);
              return;
            }
          } catch (e) {}
        }
        finish();
      }
      function onLoad() { decodeThenFinish(); }
      function onError() { finish(); }
      if (img.complete) {
        if (img.naturalWidth > 0) decodeThenFinish();
        else finish();
        return;
      }
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
    });
  }

  function waitForImages(images) {
    return Promise.all(Array.prototype.map.call(images || [], waitForImage));
  }

  function waitForPrintableAssets(win) {
    var doc = win.document;
    var waits = [waitForImages(doc.images || [])];
    if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') {
      waits.push(doc.fonts.ready.catch(function () {}));
    }
    return Promise.all(waits);
  }

  function isAppleTouchDevice() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function removePrintBridgeNodes() {
    var host = document.getElementById(PRINT_HOST_ID);
    var style = document.getElementById(PRINT_STYLE_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    if (style && style.parentNode) style.parentNode.removeChild(style);
  }

  function sourcePrintCss(sourceDoc) {
    return Array.prototype.map.call(sourceDoc.querySelectorAll('style'), function (style) {
      return style.textContent || '';
    }).join('\n');
  }

  function printThroughTopLevel(iframe, win, done) {
    if (activeTopLevelCleanup) activeTopLevelCleanup();
    removePrintBridgeNodes();

    var sourceDoc = win.document;
    if (!sourceDoc || !sourceDoc.body) {
      done();
      return;
    }

    var host = document.createElement('div');
    host.id = PRINT_HOST_ID;
    host.style.position = 'absolute';
    host.style.left = '-100000px';
    host.style.top = '0';
    host.style.width = '8.5in';
    host.style.pointerEvents = 'none';
    host.innerHTML = sourceDoc.body.innerHTML;
    document.body.appendChild(host);

    var style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    style.media = 'print';
    style.textContent = sourcePrintCss(sourceDoc) + '\n' +
      '@media print{' +
      'body>*:not(#' + PRINT_HOST_ID + '){display:none!important}' +
      '#' + PRINT_HOST_ID + '{display:block!important;position:static!important;' +
      'left:auto!important;top:auto!important;width:auto!important;max-width:none!important;' +
      'height:auto!important;overflow:visible!important;pointer-events:auto!important}' +
      '}';
    document.head.appendChild(style);

    var previousTitle = document.title;
    if (sourceDoc.title) document.title = sourceDoc.title;
    var cleaned = false;
    var cleanupTimer = 0;

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener('afterprint', cleanup);
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
      removePrintBridgeNodes();
      document.title = previousTitle;
      if (activeTopLevelCleanup === cleanup) activeTopLevelCleanup = null;
      try { win.dispatchEvent(new Event('afterprint')); } catch (e) {}
      done();
    }

    activeTopLevelCleanup = cleanup;
    window.addEventListener('afterprint', cleanup);
    cleanupTimer = window.setTimeout(cleanup, TOP_LEVEL_CLEANUP_MS);

    var assetsReady = waitForImages(host.querySelectorAll('img'));
    var boundedReady = new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }
      assetsReady.then(finish, finish);
      window.setTimeout(finish, MAX_WAIT_MS);
    });

    boundedReady.then(function () {
      afterTwoFrames(window, function () {
        try { window.print(); }
        catch (e) { cleanup(); }
      });
    });
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
      function finishQueue() { win.__clipboardFluxPdfPrintQueued = false; }
      function fireNativePrint() {
        if (fired) return;
        fired = true;
        if (isAppleTouchDevice()) {
          printThroughTopLevel(iframe, win, finishQueue);
          return;
        }
        afterTwoFrames(win, function () {
          try { nativePrint(); }
          finally { finishQueue(); }
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
        if (node.querySelectorAll) {
          Array.prototype.forEach.call(node.querySelectorAll('iframe'), patchPdfIframe);
        }
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), patchPdfIframe);
})();
