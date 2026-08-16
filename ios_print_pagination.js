/* Clipboard-Flux iOS print pagination guard.
   The PDF exporter intentionally prints through a same-page iframe so the
   native print sheet overlays Clipboard-Flux instead of navigating away.
   On iPhone/iPad WebKit, a 0x0 print iframe can be laid out against a
   degenerate viewport and the entire long report is then scaled onto one
   physical page. Keep the existing export/print flow untouched; only give
   that specific transient PDF iframe a real Letter-sized viewport before
   Safari paginates it. */
(function () {
  'use strict';

  function isAppleTouchDevice() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  if (!isAppleTouchDevice() || typeof MutationObserver === 'undefined') return;

  function sizePdfPrintIframe(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return;
    if (!Object.prototype.hasOwnProperty.call(iframe, '__objectUrls')) return;
    if (iframe.__clipboardFluxIosPrintSized) return;

    iframe.__clipboardFluxIosPrintSized = true;
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

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') sizePdfPrintIframe(node);
        if (node.querySelectorAll) {
          Array.prototype.forEach.call(node.querySelectorAll('iframe'), sizePdfPrintIframe);
        }
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), sizePdfPrintIframe);
})();
