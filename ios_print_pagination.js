/* Clipboard-Flux iOS print bridge.
   iPhone/iPad WebKit does not reliably honor iframe.contentWindow.print()
   as a distinct paged print target. A 0x0 print iframe can collapse a long
   report to one page, and moving a Letter-sized iframe off-screen can make
   Safari print a blank top-level page. On Apple touch devices, intercept
   only Clipboard-Flux's transient PDF iframe, mirror its already-built
   report into a temporary top-level print host, and invoke window.print().
   This follows the same current-page print model that has proven reliable
   in Clipboard-test while leaving Clipboard-Flux's normal screen DOM and
   inspection state untouched. */
(function () {
  'use strict';

  var HOST_ID = 'clipboard-flux-ios-print-host';
  var STYLE_ID = 'clipboard-flux-ios-print-style';
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

  function cleanupTopLevelPrintHost() {
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    if (parentAfterPrint) {
      window.removeEventListener('afterprint', parentAfterPrint);
      parentAfterPrint = null;
    }
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
    var fallback = setTimeout(finish, 2500);

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

  function printTopLevelFromIframe(iframe) {
    var frameWin = iframe && iframe.contentWindow;
    var frameDoc = frameWin && frameWin.document;
    if (!frameDoc || !frameDoc.body) return;

    cleanupTopLevelPrintHost();
    priorTitle = document.title;
    if (frameDoc.title) document.title = frameDoc.title;

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.innerHTML = frameDoc.body.innerHTML;
    // Keep the cloned report fully laid out so object-URL images load, but
    // place it outside the visible screen until the print media query wins.
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
    style.textContent = framePrintCss(frameDoc) + '\n' +
      'body > *:not(#' + HOST_ID + '){display:none!important}' +
      '#' + HOST_ID + '{display:block!important;position:static!important;' +
        'left:auto!important;top:auto!important;width:auto!important;height:auto!important;' +
        'visibility:visible!important;overflow:visible!important;pointer-events:auto!important}' +
      '#' + HOST_ID + ' *{visibility:visible}' +
      'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
    document.head.appendChild(style);

    var printed = false;
    waitForImages(host, function () {
      if (printed) return;
      printed = true;
      parentAfterPrint = function () { cleanupTopLevelPrintHost(); };
      window.addEventListener('afterprint', parentAfterPrint);
      window.focus();
      window.print();
      // iOS WebKit has historically been inconsistent about afterprint.
      // Keep the off-screen host alive long enough for the native sheet to
      // finish consuming it, then clean up as a safety net.
      cleanupTimer = setTimeout(cleanupTopLevelPrintHost, 60000);
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
      // Capture-phase load patching runs before the app's iframe.onload
      // handler calls print(), even if WebKit refreshes the Window method
      // while document.open()/document.write() replaces about:blank.
      iframe.addEventListener('load', patchWindowPrint, true);
    }

    if (!patchWindowPrint()) {
      // Defensive fallback to the previous pagination guard if an engine
      // makes Window.print non-overridable.
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
