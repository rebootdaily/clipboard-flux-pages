/* Clipboard-Flux iOS print bridge.
   iPhone/iPad WebKit does not reliably honor iframe.contentWindow.print()
   as a distinct paged print target. A 0x0 print iframe can collapse a long
   report to one page. On Apple touch devices, intercept only Clipboard-
   Flux's transient PDF iframe, mirror its already-built report into the
   top-level document, and print that host. The print-isolation rules are
   installed when the app loads (not at the instant print() is called), so
   WebKit has them in its stylesheet before it snapshots the print tree. */
(function () {
  'use strict';

  var HOST_ID = 'clipboard-flux-ios-print-host';
  var STYLE_ID = 'clipboard-flux-ios-report-style';
  var BASE_STYLE_ID = 'clipboard-flux-ios-print-base-style';
  var PRINTING_CLASS = 'clipboard-flux-ios-printing';
  var cleanupTimer = null;
  var priorTitle = null;
  var parentAfterPrint = null;

  function isAppleTouchDevice() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  if (!isAppleTouchDevice() || typeof MutationObserver === 'undefined') return;

  function ensureBasePrintStyle() {
    if (document.getElementById(BASE_STYLE_ID)) return;
    var base = document.createElement('style');
    base.id = BASE_STYLE_ID;
    base.textContent =
      '@media print{' +
        'body.' + PRINTING_CLASS + ' > *:not(#' + HOST_ID + '){display:none!important}' +
        'body.' + PRINTING_CLASS + ' #' + HOST_ID + '{display:block!important;position:static!important;' +
          'left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;' +
          'width:auto!important;height:auto!important;max-width:none!important;' +
          'visibility:visible!important;opacity:1!important;overflow:visible!important;' +
          'pointer-events:auto!important;transform:none!important}' +
        'body.' + PRINTING_CLASS + ' #' + HOST_ID + ' *{visibility:visible!important;opacity:1!important}' +
        'body.' + PRINTING_CLASS + '{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '}';
    document.head.appendChild(base);
  }

  ensureBasePrintStyle();

  function cleanupTopLevelPrintHost() {
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    if (parentAfterPrint) {
      window.removeEventListener('afterprint', parentAfterPrint);
      parentAfterPrint = null;
    }
    document.body.classList.remove(PRINTING_CLASS);
    var host = document.getElementById(HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    var style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) style.parentNode.removeChild(style);
    if (priorTitle !== null) {
      document.title = priorTitle;
      priorTitle = null;
    }
  }

  function framePrintCss(frameDoc) {
    var css = [];
    Array.prototype.forEach.call(frameDoc.querySelectorAll('style'), function (style) {
      css.push(style.textContent || '');
    });
    return css.join('\n');
  }

  function waitForImages(root, done) {
    var images = Array.prototype.slice.call(root.querySelectorAll('img'));
    if (!images.length) {
      done();
      return;
    }

    var remaining = images.length;
    var finished = false;
    var fallback = setTimeout(finish, 3000);

    function finishOne() {
      remaining -= 1;
      if (remaining <= 0) finish();
    }

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      done();
    }

    images.forEach(function (img) {
      if (img.complete) {
        finishOne();
        return;
      }
      img.addEventListener('load', finishOne, { once: true });
      img.addEventListener('error', finishOne, { once: true });
    });
  }

  function afterPrintLayoutCommitted(host, done) {
    var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
    raf(function () {
      raf(function () {
        void host.offsetHeight;
        done();
      });
    });
  }

  function printTopLevelFromIframe(iframe) {
    var frameWin = iframe && iframe.contentWindow;
    var frameDoc = frameWin && frameWin.document;
    if (!frameDoc || !frameDoc.body) return;

    cleanupTopLevelPrintHost();
    ensureBasePrintStyle();
    priorTitle = document.title;
    if (frameDoc.title) document.title = frameDoc.title;

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.innerHTML = frameDoc.body.innerHTML;
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.width = '8.5in';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.media = 'print';
    style.textContent = framePrintCss(frameDoc);
    document.head.appendChild(style);

    var printed = false;
    waitForImages(host, function () {
      if (printed) return;
      printed = true;
      document.body.classList.add(PRINTING_CLASS);

      afterPrintLayoutCommitted(host, function () {
        parentAfterPrint = function () { cleanupTopLevelPrintHost(); };
        window.addEventListener('afterprint', parentAfterPrint);
        window.focus();
        window.print();
        cleanupTimer = setTimeout(cleanupTopLevelPrintHost, 60000);
      });
    });
  }

  function installPrintBridge(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return;
    if (!Object.prototype.hasOwnProperty.call(iframe, '__objectUrls')) return;

    function patchWindowPrint() {
      var frameWin = iframe.contentWindow;
      if (!frameWin) return false;
      var replacement = function () { printTopLevelFromIframe(iframe); };
      try {
        frameWin.print = replacement;
      } catch (e) {
        try {
          Object.defineProperty(frameWin, 'print', {
            configurable: true,
            writable: true,
            value: replacement
          });
        } catch (ignore) {}
      }
      return frameWin.print === replacement;
    }

    if (!iframe.__clipboardFluxIosPrintBridgeListener) {
      iframe.__clipboardFluxIosPrintBridgeListener = true;
      iframe.addEventListener('load', patchWindowPrint, true);
    }

    if (!patchWindowPrint()) {
      iframe.style.position = 'fixed';
      iframe.style.left = '-10000px';
      iframe.style.right = 'auto';
      iframe.style.top = '0';
      iframe.style.bottom = 'auto';
      iframe.style.width = '8.5in';
      iframe.style.height = '11in';
      iframe.style.border = '0';
      iframe.style.pointerEvents = 'none';
    }
  }

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') installPrintBridge(node);
        if (node.querySelectorAll) {
          Array.prototype.forEach.call(node.querySelectorAll('iframe'), installPrintBridge);
        }
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), installPrintBridge);
})();
