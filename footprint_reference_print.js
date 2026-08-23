/* Clipboard-Flux Footprint reference-sketch print bridge.
   The core PDF renderer intentionally exports only Flux strokes. This
   bridge enriches the transient print document just before print(): if
   the active inspection has a visible imported reference sketch, it
   rebuilds the Footprint image from the saved reference transform plus
   saved strokes so the printed PDF matches the marked-up field sketch.
   It runs on every platform and deliberately wraps (rather than replaces)
   the iOS pagination bridge when that bridge is active. */
(function () {
  'use strict';

  if (window.__clipboardFluxReferencePrintBridgeInstalled) return;
  window.__clipboardFluxReferencePrintBridgeInstalled = true;
  if (typeof MutationObserver === 'undefined' || typeof indexedDB === 'undefined') return;

  var DB_NAME = 'clipboard-flux-photos';
  var DATA_STORE = 'inspectionData';
  var REFERENCE_STORE = 'footprintReferenceBlobs';
  var ACTIVE_KEY = 'clipboard-flux-active-inspection';
  var TARGET_LONG_EDGE = 1600;
  var PADDING_RATIO = 0.08;
  var LINE_WIDTHS = { thin: 2.5, medium: 4.5, thick: 7.5 };
  var PREPARE_TIMEOUT_MS = 2500;

  function finiteNumber(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  function getInspectionId(frameDoc) {
    var footer = frameDoc && frameDoc.querySelector && frameDoc.querySelector('.pdf-footer-note');
    var text = footer ? (footer.textContent || '') : '';
    var marker = 'ID:';
    var at = text.lastIndexOf(marker);
    if (at !== -1) {
      var fromFooter = text.slice(at + marker.length).trim();
      if (fromFooter) return fromFooter;
    }
    try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) { return ''; }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME); } catch (e) { reject(e); return; }
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Could not open inspection storage.')); };
      req.onblocked = function () { reject(new Error('Inspection storage is blocked.')); };
    });
  }

  function loadSavedFootprintAndReference(inspectionId) {
    if (!inspectionId) return Promise.resolve(null);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains(DATA_STORE) || !db.objectStoreNames.contains(REFERENCE_STORE)) {
          db.close();
          resolve(null);
          return;
        }
        var tx = db.transaction([DATA_STORE, REFERENCE_STORE], 'readonly');
        var dataReq = tx.objectStore(DATA_STORE).get(inspectionId);
        var refReq = tx.objectStore(REFERENCE_STORE).get(inspectionId);
        tx.oncomplete = function () {
          var data = dataReq.result || null;
          var refRecord = refReq.result || null;
          db.close();
          resolve(data && refRecord && refRecord.blob
            ? { data: data, blob: refRecord.blob, mimeType: refRecord.mimeType }
            : null);
        };
        tx.onerror = function () {
          var err = tx.error || new Error('Could not read Footprint reference data.');
          db.close();
          reject(err);
        };
      });
    });
  }

  // WebKit/iOS Safari fix (same root cause and fix as app.js's
  // decodeAndStorePhoto()/idbPutReferenceBlob()): storing a Blob/File
  // value directly as an IndexedDB record field can fail on-device with
  // "UnknownError: Error preparing Blob/File data to be stored in object
  // store" -- idbPutReferenceBlob() now stores the reference's bytes as
  // an ArrayBuffer plus its mimeType instead of a raw Blob. This bridge
  // reads that same store, so it needs the identical reconstruction; a
  // pre-fix record already holds a real Blob (with its own correct
  // .type baked in) and is used as-is.
  function decodeBlob(blob, mimeType) {
    var source = (blob instanceof Blob) ? blob : new Blob([blob], { type: mimeType || 'image/png' });
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(source).then(function (bitmap) {
        return { image: bitmap, close: function () { try { bitmap.close(); } catch (e) {} } };
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(source);
      var img = new Image();
      img.onload = function () {
        resolve({ image: img, close: function () { URL.revokeObjectURL(url); } });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not decode reference sketch image.'));
      };
      img.src = url;
    });
  }

  function addPoint(bounds, x, y) {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (y > bounds.maxY) bounds.maxY = y;
  }

  function validStrokePoints(stroke) {
    if (!stroke || typeof stroke !== 'object') return [];
    if (stroke.type === 'line' && stroke.a && stroke.b) return [stroke.a, stroke.b];
    if (stroke.type === 'freehand' && Array.isArray(stroke.points)) return stroke.points;
    return [];
  }

  function referenceGeometry(reference) {
    if (!reference || typeof reference !== 'object' || reference.visible === false) return null;
    var width = finiteNumber(reference.width, 0);
    var height = finiteNumber(reference.height, 0);
    if (width <= 0 || height <= 0) return null;
    var t = reference.transform || {};
    var scale = finiteNumber(t.scale, 1);
    if (scale <= 0) scale = 1;
    var cx = finiteNumber(t.x, 0);
    var cy = finiteNumber(t.y, 0);
    var rotation = finiteNumber(t.rotation, 0);
    return {
      cx: cx,
      cy: cy,
      width: width * scale,
      height: height * scale,
      rotation: rotation,
      opacity: Math.max(0.05, Math.min(1, finiteNumber(reference.opacity, 0.55)))
    };
  }

  function computeBounds(strokes, refGeom) {
    var bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    (strokes || []).forEach(function (stroke) {
      validStrokePoints(stroke).forEach(function (p) {
        if (p && typeof p === 'object') addPoint(bounds, Number(p.x), Number(p.y));
      });
    });
    if (refGeom) {
      var hw = refGeom.width / 2;
      var hh = refGeom.height / 2;
      var cos = Math.cos(refGeom.rotation);
      var sin = Math.sin(refGeom.rotation);
      [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (corner) {
        var x = refGeom.cx + corner[0] * cos - corner[1] * sin;
        var y = refGeom.cy + corner[0] * sin + corner[1] * cos;
        addPoint(bounds, x, y);
      });
    }
    return isFinite(bounds.minX) ? bounds : null;
  }

  function drawStroke(ctx, stroke) {
    var pts = validStrokePoints(stroke);
    if (pts.length < 2) return;
    ctx.lineWidth = LINE_WIDTHS[stroke.width] || LINE_WIDTHS.medium;
    ctx.beginPath();
    ctx.moveTo(Number(pts[0].x), Number(pts[0].y));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(Number(pts[i].x), Number(pts[i].y));
    ctx.stroke();
  }

  function renderComposite(data, decoded) {
    var footprint = data && data.footprint;
    var strokes = footprint && Array.isArray(footprint.strokes) ? footprint.strokes : [];
    var reference = data && data.reference;
    var refGeom = referenceGeometry(reference);
    if (!refGeom || !decoded || !decoded.image) return null;

    var bounds = computeBounds(strokes, refGeom);
    if (!bounds) return null;
    var w = bounds.maxX - bounds.minX;
    var h = bounds.maxY - bounds.minY;
    var longEdge = Math.max(w, h, 1);
    var pad = Math.max(longEdge * PADDING_RATIO, 10);
    var totalW = w + pad * 2;
    var totalH = h + pad * 2;
    var scale = TARGET_LONG_EDGE / Math.max(totalW, totalH, 1);

    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(totalW * scale));
    canvas.height = Math.max(1, Math.round(totalH * scale));
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate((pad - bounds.minX) * scale, (pad - bounds.minY) * scale);
    ctx.scale(scale, scale);

    ctx.save();
    ctx.globalAlpha = refGeom.opacity;
    ctx.translate(refGeom.cx, refGeom.cy);
    ctx.rotate(refGeom.rotation);
    ctx.drawImage(decoded.image, -refGeom.width / 2, -refGeom.height / 2, refGeom.width, refGeom.height);
    ctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c3a52';
    strokes.forEach(function (stroke) { drawStroke(ctx, stroke); });
    return canvas.toDataURL('image/png');
  }

  function waitForImage(img) {
    if (!img) return Promise.resolve();
    if (img.complete) {
      if (img.decode) return img.decode().catch(function () {});
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var done = function () { resolve(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  function installCompositeInPrintDocument(frameDoc, dataUrl) {
    if (!frameDoc || !frameDoc.body || !dataUrl) return Promise.resolve();
    var section = frameDoc.querySelector('.pdf-footprint-section');
    var img;
    if (!section) {
      section = frameDoc.createElement('div');
      section.className = 'pdf-section pdf-footprint-section';
      var heading = frameDoc.createElement('div');
      heading.className = 'pdf-section-heading';
      heading.textContent = 'FOOTPRINT';
      img = frameDoc.createElement('img');
      img.className = 'pdf-footprint-image';
      img.alt = '';
      section.appendChild(heading);
      section.appendChild(img);
      var notesSection = frameDoc.querySelector('.pdf-notes-section');
      var footer = frameDoc.querySelector('.pdf-footer-note');
      var anchor = notesSection || footer;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
      else frameDoc.body.appendChild(section);
    } else {
      img = section.querySelector('.pdf-footprint-image');
      if (!img) {
        img = frameDoc.createElement('img');
        img.className = 'pdf-footprint-image';
        img.alt = '';
        section.appendChild(img);
      }
    }
    var emptyNote = frameDoc.querySelector('.pdf-empty-note');
    if (emptyNote && emptyNote.parentNode) emptyNote.parentNode.removeChild(emptyNote);
    img.src = dataUrl;
    return waitForImage(img);
  }

  function enrichFootprint(frameDoc) {
    var inspectionId = getInspectionId(frameDoc);
    if (!inspectionId) return Promise.resolve();
    return loadSavedFootprintAndReference(inspectionId).then(function (saved) {
      if (!saved || !saved.data || !saved.data.reference || saved.data.reference.visible === false) return;
      return decodeBlob(saved.blob, saved.mimeType).then(function (decoded) {
        var dataUrl;
        try { dataUrl = renderComposite(saved.data, decoded); }
        finally { decoded.close(); }
        return installCompositeInPrintDocument(frameDoc, dataUrl);
      });
    });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve();
      }, ms);
      promise.then(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      }, function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (window.console && console.warn) console.warn('Clipboard-Flux: reference sketch could not be added to PDF', e);
        resolve();
      });
    });
  }

  function installReferencePrintBridge(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return;
    if (!Object.prototype.hasOwnProperty.call(iframe, '__objectUrls')) return;

    function wrapPrint() {
      var frameWin = iframe.contentWindow;
      var frameDoc = frameWin && frameWin.document;
      if (!frameWin || !frameDoc) return false;
      var downstream = frameWin.print;
      if (typeof downstream !== 'function') return false;
      if (downstream.__clipboardFluxReferencePrintWrapper) return true;

      var wrapped = function () {
        if (iframe.__clipboardFluxReferencePrintInProgress) return;
        iframe.__clipboardFluxReferencePrintInProgress = true;
        withTimeout(enrichFootprint(frameDoc), PREPARE_TIMEOUT_MS).then(function () {
          iframe.__clipboardFluxReferencePrintInProgress = false;
          downstream.call(frameWin);
        });
      };
      wrapped.__clipboardFluxReferencePrintWrapper = true;
      try {
        frameWin.print = wrapped;
      } catch (e) {
        try {
          Object.defineProperty(frameWin, 'print', {
            configurable: true,
            writable: true,
            value: wrapped
          });
        } catch (ignore) {}
      }
      return frameWin.print === wrapped;
    }

    if (!iframe.__clipboardFluxReferencePrintLoadListener) {
      iframe.__clipboardFluxReferencePrintLoadListener = true;
      // Registered after the iOS pagination bridge when both are loaded in
      // normal order, so on Apple devices this wrapper sits outside that
      // bridge: enrich the iframe first, then let the proven top-level iOS
      // print path run.
      iframe.addEventListener('load', wrapPrint, true);
    }
    wrapPrint();
  }

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') installReferencePrintBridge(node);
        if (node.querySelectorAll) {
          Array.prototype.forEach.call(node.querySelectorAll('iframe'), installReferencePrintBridge);
        }
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), installReferencePrintBridge);
})();
