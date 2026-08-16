/* Clipboard-Flux Footprint multi-sheet bridge -- Milestone 23.
   Adds floor/sheet management around the existing single-sheet Footprint
   engine without replacing that proven drawing code. The active sheet is
   projected into the legacy inspectionData.footprint/reference fields so
   Pencil/Eraser/Pan/reference import continue to work unchanged; inactive
   sheets are stored as companion IndexedDB records keyed beneath the same
   inspection. Switching sheets snapshots the current legacy fields, swaps
   the selected sheet into them, then reloads the app back into Footprint.
   PDF export is enriched at print time to render every populated sheet in
   order, each labeled separately. */
(function () {
  'use strict';

  if (window.__clipboardFluxMultiSheetInstalled) return;
  window.__clipboardFluxMultiSheetInstalled = true;
  if (typeof indexedDB === 'undefined' || typeof MutationObserver === 'undefined') return;

  var DB_NAME = 'clipboard-flux-photos';
  var DATA_STORE = 'inspectionData';
  var REFERENCE_STORE = 'footprintReferenceBlobs';
  var ACTIVE_INSPECTION_KEY = 'clipboard-flux-active-inspection';
  var RETURN_TO_FOOTPRINT_KEY = 'clipboard-flux-return-to-footprint';
  var META_SUFFIX = '::footprint-sheets-meta';
  var SHEET_PREFIX = '::footprint-sheet::';
  var REF_PREFIX = '::footprint-sheet-reference::';
  var TARGET_LONG_EDGE = 1600;
  var PADDING_RATIO = 0.08;
  var LINE_WIDTHS = { thin: 2.5, medium: 4.5, thick: 7.5 };
  var CORE_FLUSH_WAIT_MS = 850;
  var PRINT_PREPARE_TIMEOUT_MS = 4500;
  var panelRenderToken = 0;
  var confirmWrapped = false;

  function currentInspectionId() {
    try { return localStorage.getItem(ACTIVE_INSPECTION_KEY) || ''; } catch (e) { return ''; }
  }

  function metaKey(inspectionId) { return inspectionId + META_SUFFIX; }
  function sheetDataKey(inspectionId, sheetId) { return inspectionId + SHEET_PREFIX + sheetId; }
  function sheetRefKey(inspectionId, sheetId) { return inspectionId + REF_PREFIX + sheetId; }
  function nowIso() { return new Date().toISOString(); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function blankFootprint() { return { version: 1, strokes: [] }; }
  function makeSheetId() { return 'sheet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  function finiteNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
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

  function withDb(stores, mode, worker) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var names = Array.isArray(stores) ? stores : [stores];
        for (var i = 0; i < names.length; i++) {
          if (!db.objectStoreNames.contains(names[i])) {
            db.close();
            reject(new Error('Required storage is not available: ' + names[i]));
            return;
          }
        }
        var tx;
        try { tx = db.transaction(names, mode); } catch (e) { db.close(); reject(e); return; }
        var result;
        try { result = worker(tx); } catch (e) { db.close(); reject(e); return; }
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = function () { var err = tx.error || new Error('Storage operation failed.'); db.close(); reject(err); };
        tx.onabort = function () { var err = tx.error || new Error('Storage operation was aborted.'); db.close(); reject(err); };
      });
    });
  }

  function getRecord(storeName, key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(null); return; }
        var tx = db.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function () { var value = req.result || null; db.close(); resolve(value); };
        req.onerror = function () { var err = req.error; db.close(); reject(err); };
      });
    });
  }

  function putRecord(storeName, record) {
    return withDb(storeName, 'readwrite', function (tx) { tx.objectStore(storeName).put(record); });
  }

  function deleteRecord(storeName, key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(); return; }
        var tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { var err = tx.error; db.close(); reject(err); };
      });
    });
  }

  function defaultSheetName(index) {
    var names = ['1st Floor', '2nd Floor', '3rd Floor', 'Basement', 'Garage', 'ADU'];
    return names[index] || ('Sheet ' + (index + 1));
  }

  function cleanSheetName(name, fallback) {
    var text = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
    if (!text) text = fallback || 'Footprint';
    return text.slice(0, 60);
  }

  function normalizeMeta(raw, inspectionId) {
    if (!raw || !Array.isArray(raw.sheets) || !raw.sheets.length) return null;
    var seen = {};
    var sheets = raw.sheets.filter(function (s) {
      return s && typeof s.id === 'string' && s.id && !seen[s.id] && (seen[s.id] = true);
    }).map(function (s, i) {
      return { id: s.id, name: cleanSheetName(s.name, defaultSheetName(i)), order: i };
    });
    if (!sheets.length) return null;
    var active = raw.activeSheetId;
    if (!sheets.some(function (s) { return s.id === active; })) active = sheets[0].id;
    return {
      inspectionId: metaKey(inspectionId),
      kind: 'footprintSheetsMeta',
      parentInspectionId: inspectionId,
      version: 1,
      activeSheetId: active,
      sheets: sheets,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso()
    };
  }

  function readMeta(inspectionId) {
    return getRecord(DATA_STORE, metaKey(inspectionId)).then(function (raw) { return normalizeMeta(raw, inspectionId); });
  }

  function writeMeta(meta) {
    meta.updatedAt = nowIso();
    meta.sheets.forEach(function (s, i) { s.order = i; });
    return putRecord(DATA_STORE, meta);
  }

  function readActiveInspectionData(inspectionId) { return getRecord(DATA_STORE, inspectionId); }
  function readActiveReferenceRecord(inspectionId) { return getRecord(REFERENCE_STORE, inspectionId); }

  function writeSheetSnapshot(inspectionId, sheetId, activeData, activeRefRecord) {
    var sheetRecord = {
      inspectionId: sheetDataKey(inspectionId, sheetId),
      kind: 'footprintSheet',
      parentInspectionId: inspectionId,
      sheetId: sheetId,
      footprint: clone(activeData && activeData.footprint) || blankFootprint(),
      reference: clone(activeData && activeData.reference) || null,
      updatedAt: nowIso()
    };
    return putRecord(DATA_STORE, sheetRecord).then(function () {
      if (activeRefRecord && activeRefRecord.blob) {
        return putRecord(REFERENCE_STORE, { inspectionId: sheetRefKey(inspectionId, sheetId), blob: activeRefRecord.blob });
      }
      return deleteRecord(REFERENCE_STORE, sheetRefKey(inspectionId, sheetId));
    });
  }

  function ensureMeta(inspectionId) {
    if (!inspectionId) return Promise.reject(new Error('No active inspection.'));
    return readMeta(inspectionId).then(function (meta) {
      if (meta) return meta;
      return Promise.all([readActiveInspectionData(inspectionId), readActiveReferenceRecord(inspectionId)]).then(function (results) {
        var sheetId = makeSheetId();
        var fresh = {
          inspectionId: metaKey(inspectionId),
          kind: 'footprintSheetsMeta',
          parentInspectionId: inspectionId,
          version: 1,
          activeSheetId: sheetId,
          sheets: [{ id: sheetId, name: '1st Floor', order: 0 }],
          updatedAt: nowIso()
        };
        return writeSheetSnapshot(inspectionId, sheetId, results[0] || { footprint: blankFootprint(), reference: null }, results[1])
          .then(function () { return writeMeta(fresh); })
          .then(function () { return fresh; });
      });
    });
  }

  function syncActiveSheet(inspectionId, meta) {
    return Promise.all([readActiveInspectionData(inspectionId), readActiveReferenceRecord(inspectionId)]).then(function (results) {
      if (!results[0]) throw new Error('Active inspection data is unavailable.');
      return writeSheetSnapshot(inspectionId, meta.activeSheetId, results[0], results[1]);
    });
  }

  function requestCoreFlush() {
    try { window.dispatchEvent(new Event('pagehide')); } catch (e) {}
    return new Promise(function (resolve) { setTimeout(resolve, CORE_FLUSH_WAIT_MS); });
  }

  function readSheetRecord(inspectionId, sheetId) {
    return getRecord(DATA_STORE, sheetDataKey(inspectionId, sheetId));
  }

  function readSheetReferenceRecord(inspectionId, sheetId) {
    return getRecord(REFERENCE_STORE, sheetRefKey(inspectionId, sheetId));
  }

  function writeActiveFromSheet(inspectionId, sheetRecord, refRecord) {
    return readActiveInspectionData(inspectionId).then(function (activeData) {
      if (!activeData) throw new Error('Active inspection data is unavailable.');
      var merged = clone(activeData);
      merged.inspectionId = inspectionId;
      merged.footprint = clone(sheetRecord && sheetRecord.footprint) || blankFootprint();
      merged.reference = clone(sheetRecord && sheetRecord.reference) || null;
      return putRecord(DATA_STORE, merged);
    }).then(function () {
      if (refRecord && refRecord.blob) {
        return putRecord(REFERENCE_STORE, { inspectionId: inspectionId, blob: refRecord.blob });
      }
      return deleteRecord(REFERENCE_STORE, inspectionId);
    });
  }

  function setReturnToFootprint() {
    try { sessionStorage.setItem(RETURN_TO_FOOTPRINT_KEY, '1'); } catch (e) {}
  }

  function reloadIntoFootprint() {
    setReturnToFootprint();
    window.location.reload();
  }

  function switchSheet(inspectionId, targetSheetId) {
    setPanelBusy(true, 'Saving current sheet…');
    return ensureMeta(inspectionId).then(function (meta) {
      if (targetSheetId === meta.activeSheetId) return null;
      return requestCoreFlush().then(function () { return syncActiveSheet(inspectionId, meta); }).then(function () {
        return Promise.all([readSheetRecord(inspectionId, targetSheetId), readSheetReferenceRecord(inspectionId, targetSheetId)]).then(function (results) {
          var target = results[0] || {
            inspectionId: sheetDataKey(inspectionId, targetSheetId),
            footprint: blankFootprint(),
            reference: null
          };
          return writeActiveFromSheet(inspectionId, target, results[1]);
        });
      }).then(function () {
        meta.activeSheetId = targetSheetId;
        return writeMeta(meta);
      }).then(function () { reloadIntoFootprint(); return null; });
    }).catch(function (e) {
      setPanelBusy(false);
      window.console && console.error && console.error('Clipboard-Flux: could not switch Footprint sheet', e);
      window.alert('Could not switch Footprint sheets: ' + e.message);
    });
  }

  function suggestedDuplicateName(meta) {
    if (meta.sheets.length === 1 && meta.sheets[0].name === '1st Floor') return '2nd Floor';
    var nextDefault = defaultSheetName(meta.sheets.length);
    if (!meta.sheets.some(function (s) { return s.name === nextDefault; })) return nextDefault;
    var active = meta.sheets.filter(function (s) { return s.id === meta.activeSheetId; })[0];
    return (active ? active.name : 'Footprint') + ' Copy';
  }

  function createBlankSheet(inspectionId) {
    return ensureMeta(inspectionId).then(function (meta) {
      var name = window.prompt('Name the new Footprint sheet:', defaultSheetName(meta.sheets.length));
      if (name === null) return;
      name = cleanSheetName(name, defaultSheetName(meta.sheets.length));
      setPanelBusy(true, 'Creating sheet…');
      return requestCoreFlush().then(function () { return syncActiveSheet(inspectionId, meta); }).then(function () {
        var sheetId = makeSheetId();
        var rec = {
          inspectionId: sheetDataKey(inspectionId, sheetId),
          kind: 'footprintSheet',
          parentInspectionId: inspectionId,
          sheetId: sheetId,
          footprint: blankFootprint(),
          reference: null,
          updatedAt: nowIso()
        };
        return putRecord(DATA_STORE, rec).then(function () {
          meta.sheets.push({ id: sheetId, name: name, order: meta.sheets.length });
          meta.activeSheetId = sheetId;
          return writeMeta(meta).then(function () { return writeActiveFromSheet(inspectionId, rec, null); });
        });
      }).then(function () { reloadIntoFootprint(); });
    }).catch(function (e) {
      setPanelBusy(false);
      window.alert('Could not create a Footprint sheet: ' + e.message);
    });
  }

  function duplicateActiveSheet(inspectionId) {
    return ensureMeta(inspectionId).then(function (meta) {
      var name = window.prompt('Name the duplicated Footprint sheet:', suggestedDuplicateName(meta));
      if (name === null) return;
      name = cleanSheetName(name, suggestedDuplicateName(meta));
      setPanelBusy(true, 'Duplicating sheet…');
      return requestCoreFlush().then(function () { return syncActiveSheet(inspectionId, meta); }).then(function () {
        return Promise.all([readSheetRecord(inspectionId, meta.activeSheetId), readSheetReferenceRecord(inspectionId, meta.activeSheetId)]);
      }).then(function (results) {
        var source = results[0] || { footprint: blankFootprint(), reference: null };
        var sourceRef = results[1];
        var newId = makeSheetId();
        var duplicate = {
          inspectionId: sheetDataKey(inspectionId, newId),
          kind: 'footprintSheet',
          parentInspectionId: inspectionId,
          sheetId: newId,
          footprint: clone(source.footprint) || blankFootprint(),
          reference: clone(source.reference) || null,
          updatedAt: nowIso()
        };
        return putRecord(DATA_STORE, duplicate).then(function () {
          if (sourceRef && sourceRef.blob) return putRecord(REFERENCE_STORE, { inspectionId: sheetRefKey(inspectionId, newId), blob: sourceRef.blob });
        }).then(function () {
          meta.sheets.push({ id: newId, name: name, order: meta.sheets.length });
          meta.activeSheetId = newId;
          return writeMeta(meta);
        }).then(function () {
          return renderSheetPanel();
        });
      });
    }).catch(function (e) {
      setPanelBusy(false);
      window.alert('Could not duplicate the Footprint sheet: ' + e.message);
    });
  }

  function renameActiveSheet(inspectionId) {
    return ensureMeta(inspectionId).then(function (meta) {
      var sheet = meta.sheets.filter(function (s) { return s.id === meta.activeSheetId; })[0];
      if (!sheet) return;
      var name = window.prompt('Rename Footprint sheet:', sheet.name);
      if (name === null) return;
      sheet.name = cleanSheetName(name, sheet.name);
      return writeMeta(meta).then(renderSheetPanel);
    }).catch(function (e) { window.alert('Could not rename the Footprint sheet: ' + e.message); });
  }

  function deleteActiveSheet(inspectionId) {
    return ensureMeta(inspectionId).then(function (meta) {
      if (meta.sheets.length <= 1) {
        window.alert('At least one Footprint sheet is required. Use the existing sheet or create another first.');
        return;
      }
      var index = meta.sheets.findIndex(function (s) { return s.id === meta.activeSheetId; });
      var current = meta.sheets[index];
      if (!current) return;
      if (!window.confirm('Delete the Footprint sheet “' + current.name + '”? This deletes its drawing and reference image.')) return;
      setPanelBusy(true, 'Deleting sheet…');
      var target = meta.sheets[index > 0 ? index - 1 : 1];
      return requestCoreFlush().then(function () {
        return Promise.all([
          deleteRecord(DATA_STORE, sheetDataKey(inspectionId, current.id)),
          deleteRecord(REFERENCE_STORE, sheetRefKey(inspectionId, current.id))
        ]);
      }).then(function () {
        meta.sheets.splice(index, 1);
        meta.activeSheetId = target.id;
        return Promise.all([readSheetRecord(inspectionId, target.id), readSheetReferenceRecord(inspectionId, target.id)]);
      }).then(function (results) {
        return writeActiveFromSheet(inspectionId, results[0], results[1]);
      }).then(function () { return writeMeta(meta); }).then(function () { reloadIntoFootprint(); });
    }).catch(function (e) {
      setPanelBusy(false);
      window.alert('Could not delete the Footprint sheet: ' + e.message);
    });
  }

  function setPanelBusy(busy, message) {
    var panel = document.getElementById('clipboard-flux-footprint-sheets');
    if (!panel) return;
    panel.classList.toggle('busy', !!busy);
    Array.prototype.forEach.call(panel.querySelectorAll('button,select'), function (el) { el.disabled = !!busy; });
    var status = panel.querySelector('.fp-sheet-status');
    if (status) status.textContent = busy ? (message || 'Working…') : '';
  }

  function installStyles() {
    if (document.getElementById('clipboard-flux-footprint-sheets-style')) return;
    var style = document.createElement('style');
    style.id = 'clipboard-flux-footprint-sheets-style';
    style.textContent =
      '#clipboard-flux-footprint-sheets{background:#fff;border:1px solid var(--line,#d9e0e6);border-radius:12px;padding:9px 10px;margin-bottom:10px}' +
      '.fp-sheet-title{font-size:11.5px;font-weight:800;color:var(--muted,#66727e);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}' +
      '.fp-sheet-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
      '.fp-sheet-select{flex:1 1 160px;min-width:0;min-height:44px;border:1.5px solid var(--navy,#17324d);border-radius:10px;background:#fff;color:var(--navy,#17324d);padding:0 10px;font:700 14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;touch-action:manipulation}' +
      '.fp-sheet-btn{flex:none;min-height:44px;border:1.5px solid var(--navy,#17324d);border-radius:10px;background:#fff;color:var(--navy,#17324d);padding:0 11px;font-size:13px;font-weight:800;touch-action:manipulation}' +
      '.fp-sheet-btn.primary{background:var(--navy,#17324d);color:#fff}' +
      '.fp-sheet-btn.danger{border-color:#a33;color:#a33}' +
      '.fp-sheet-status{font-size:11.5px;color:var(--muted,#66727e);min-height:14px;margin-top:5px}' +
      '#clipboard-flux-footprint-sheets.busy{opacity:.75}' +
      '@media(max-width:430px){.fp-sheet-row .fp-sheet-select{flex-basis:100%}.fp-sheet-btn{flex:1 1 auto;padding:0 9px}}';
    document.head.appendChild(style);
  }

  function panelHtml(meta) {
    var options = meta.sheets.map(function (s) {
      var selected = s.id === meta.activeSheetId ? ' selected' : '';
      return '<option value="' + escapeAttr(s.id) + '"' + selected + '>' + escapeHtml(s.name) + '</option>';
    }).join('');
    return '<div class="fp-sheet-title">Footprint Sheets</div>' +
      '<div class="fp-sheet-row">' +
        '<select class="fp-sheet-select" aria-label="Footprint sheet">' + options + '</select>' +
        '<button type="button" class="fp-sheet-btn primary" data-fp-sheet-action="new">+ New</button>' +
        '<button type="button" class="fp-sheet-btn" data-fp-sheet-action="duplicate">Duplicate</button>' +
        '<button type="button" class="fp-sheet-btn" data-fp-sheet-action="rename">Rename</button>' +
        '<button type="button" class="fp-sheet-btn danger" data-fp-sheet-action="delete"' + (meta.sheets.length <= 1 ? ' disabled' : '') + '>Delete</button>' +
      '</div><div class="fp-sheet-status"></div>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function renderSheetPanel() {
    var canvas = document.getElementById('footprint-canvas');
    if (!canvas) return Promise.resolve();
    var inspectionId = currentInspectionId();
    if (!inspectionId) return Promise.resolve();
    var token = ++panelRenderToken;
    installStyles();
    return ensureMeta(inspectionId).then(function (meta) {
      if (token !== panelRenderToken || !document.getElementById('footprint-canvas')) return;
      var panel = document.getElementById('clipboard-flux-footprint-sheets');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'clipboard-flux-footprint-sheets';
        var toolbar = document.querySelector('.footprint-toolbar');
        if (toolbar && toolbar.parentNode) toolbar.parentNode.insertBefore(panel, toolbar);
        else canvas.parentNode.insertBefore(panel, canvas);
      }
      panel.innerHTML = panelHtml(meta);
      var select = panel.querySelector('.fp-sheet-select');
      select.addEventListener('change', function () { switchSheet(inspectionId, select.value); });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-fp-sheet-action]'), function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-fp-sheet-action');
          if (action === 'new') createBlankSheet(inspectionId);
          else if (action === 'duplicate') duplicateActiveSheet(inspectionId);
          else if (action === 'rename') renameActiveSheet(inspectionId);
          else if (action === 'delete') deleteActiveSheet(inspectionId);
        });
      });
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not initialize Footprint sheets', e);
    });
  }

  function resumeFootprintAfterReload() {
    var shouldReturn = false;
    try { shouldReturn = sessionStorage.getItem(RETURN_TO_FOOTPRINT_KEY) === '1'; } catch (e) {}
    if (!shouldReturn) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      var buttons = document.querySelectorAll('#tabs button');
      for (var i = 0; i < buttons.length; i++) {
        if ((buttons[i].textContent || '').trim().replace(/\s+/g, ' ') === 'Footprint') {
          clearInterval(timer);
          try { sessionStorage.removeItem(RETURN_TO_FOOTPRINT_KEY); } catch (e) {}
          buttons[i].click();
          return;
        }
      }
      if (attempts > 80) {
        clearInterval(timer);
        try { sessionStorage.removeItem(RETURN_TO_FOOTPRINT_KEY); } catch (e) {}
      }
    }, 100);
  }

  function clearSheetStorage(inspectionId) {
    if (!inspectionId) return Promise.resolve();
    return readMeta(inspectionId).then(function (meta) {
      if (!meta) return;
      var jobs = [deleteRecord(DATA_STORE, metaKey(inspectionId))];
      meta.sheets.forEach(function (s) {
        jobs.push(deleteRecord(DATA_STORE, sheetDataKey(inspectionId, s.id)));
        jobs.push(deleteRecord(REFERENCE_STORE, sheetRefKey(inspectionId, s.id)));
      });
      return Promise.all(jobs);
    }).catch(function (e) {
      window.console && console.warn && console.warn('Clipboard-Flux: could not clear Footprint sheet companions after reset', e);
    });
  }

  function wrapConfirmForResetCleanup() {
    if (confirmWrapped || typeof window.confirm !== 'function') return;
    confirmWrapped = true;
    var original = window.confirm;
    window.confirm = function (message) {
      var result = original.call(window, message);
      var text = String(message || '');
      if (result && /reset/i.test(text) && /inspection/i.test(text)) {
        var inspectionId = currentInspectionId();
        setTimeout(function () { clearSheetStorage(inspectionId); }, 1200);
      }
      return result;
    };
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
    return {
      cx: finiteNumber(t.x, 0),
      cy: finiteNumber(t.y, 0),
      width: width * scale,
      height: height * scale,
      rotation: finiteNumber(t.rotation, 0),
      opacity: Math.max(0.05, Math.min(1, finiteNumber(reference.opacity, 0.55)))
    };
  }

  function addPoint(bounds, x, y) {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (y > bounds.maxY) bounds.maxY = y;
  }

  function computeBounds(strokes, refGeom) {
    var bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    (strokes || []).forEach(function (stroke) {
      validStrokePoints(stroke).forEach(function (p) {
        if (p) addPoint(bounds, Number(p.x), Number(p.y));
      });
    });
    if (refGeom) {
      var hw = refGeom.width / 2, hh = refGeom.height / 2;
      var cos = Math.cos(refGeom.rotation), sin = Math.sin(refGeom.rotation);
      [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (c) {
        addPoint(bounds, refGeom.cx + c[0] * cos - c[1] * sin, refGeom.cy + c[0] * sin + c[1] * cos);
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

  function decodeBlob(blob) {
    if (!blob) return Promise.resolve(null);
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob).then(function (bitmap) {
        return { image: bitmap, close: function () { try { bitmap.close(); } catch (e) {} } };
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { resolve({ image: img, close: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not decode reference sketch image.')); };
      img.src = url;
    });
  }

  function renderSheetImage(sheetRecord, refRecord) {
    var footprint = sheetRecord && sheetRecord.footprint;
    var strokes = footprint && Array.isArray(footprint.strokes) ? footprint.strokes : [];
    var refGeom = referenceGeometry(sheetRecord && sheetRecord.reference);
    if (!strokes.length && !refGeom) return Promise.resolve(null);
    return decodeBlob(refGeom && refRecord && refRecord.blob).then(function (decoded) {
      if (refGeom && !decoded) refGeom = null;
      var bounds = computeBounds(strokes, refGeom);
      if (!bounds) { if (decoded) decoded.close(); return null; }
      var w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
      var longEdge = Math.max(w, h, 1);
      var pad = Math.max(longEdge * PADDING_RATIO, 10);
      var totalW = w + pad * 2, totalH = h + pad * 2;
      var scale = TARGET_LONG_EDGE / Math.max(totalW, totalH, 1);
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(totalW * scale));
      canvas.height = Math.max(1, Math.round(totalH * scale));
      var ctx = canvas.getContext('2d');
      if (!ctx) { if (decoded) decoded.close(); return null; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate((pad - bounds.minX) * scale, (pad - bounds.minY) * scale);
      ctx.scale(scale, scale);
      if (refGeom && decoded) {
        ctx.save();
        ctx.globalAlpha = refGeom.opacity;
        ctx.translate(refGeom.cx, refGeom.cy);
        ctx.rotate(refGeom.rotation);
        ctx.drawImage(decoded.image, -refGeom.width / 2, -refGeom.height / 2, refGeom.width, refGeom.height);
        ctx.restore();
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1c3a52';
      strokes.forEach(function (stroke) { drawStroke(ctx, stroke); });
      if (decoded) decoded.close();
      return canvas.toDataURL('image/png');
    });
  }

  function waitForImage(img) {
    if (!img) return Promise.resolve();
    if (img.complete) return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    return new Promise(function (resolve) {
      var done = function () { resolve(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  function installSheetSections(frameDoc, rendered) {
    var oldSections = Array.prototype.slice.call(frameDoc.querySelectorAll('.pdf-footprint-section'));
    var firstOld = oldSections[0] || null;
    var notes = frameDoc.querySelector('.pdf-notes-section');
    var footer = frameDoc.querySelector('.pdf-footer-note');
    var anchor = firstOld || notes || footer;
    var parent = anchor && anchor.parentNode ? anchor.parentNode : frameDoc.body;
    var before = anchor || null;
    var printable = rendered.filter(function (item) { return !!item.dataUrl; });
    printable.forEach(function (item, index) {
      var section = frameDoc.createElement('div');
      section.className = 'pdf-section pdf-footprint-section';
      if (index > 0) {
        section.style.breakBefore = 'page';
        section.style.pageBreakBefore = 'always';
      }
      var heading = frameDoc.createElement('div');
      heading.className = 'pdf-section-heading';
      heading.textContent = 'FOOTPRINT — ' + item.name;
      var img = frameDoc.createElement('img');
      img.className = 'pdf-footprint-image';
      img.alt = '';
      img.src = item.dataUrl;
      section.appendChild(heading);
      section.appendChild(img);
      parent.insertBefore(section, before);
    });
    oldSections.forEach(function (section) { if (section.parentNode) section.parentNode.removeChild(section); });
    var empty = frameDoc.querySelector('.pdf-empty-note');
    if (printable.length && empty && empty.parentNode) empty.parentNode.removeChild(empty);
    return Promise.all(Array.prototype.slice.call(frameDoc.querySelectorAll('.pdf-footprint-section img')).map(waitForImage));
  }

  function renderAllSheetsForPrint(frameDoc) {
    var inspectionId = currentInspectionId();
    var footer = frameDoc.querySelector('.pdf-footer-note');
    if (footer) {
      var text = footer.textContent || '';
      var at = text.lastIndexOf('ID:');
      if (at !== -1 && text.slice(at + 3).trim()) inspectionId = text.slice(at + 3).trim();
    }
    if (!inspectionId) return Promise.resolve();
    return ensureMeta(inspectionId).then(function (meta) {
      return syncActiveSheet(inspectionId, meta).then(function () { return meta; });
    }).then(function (meta) {
      return Promise.all(meta.sheets.map(function (sheet) {
        return Promise.all([readSheetRecord(inspectionId, sheet.id), readSheetReferenceRecord(inspectionId, sheet.id)]).then(function (records) {
          return renderSheetImage(records[0], records[1]).then(function (dataUrl) {
            return { id: sheet.id, name: sheet.name, dataUrl: dataUrl };
          });
        });
      }));
    }).then(function (rendered) { return installSheetSections(frameDoc, rendered); });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms);
      promise.then(function () {
        if (done) return;
        done = true; clearTimeout(timer); resolve();
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(timer);
        window.console && console.warn && console.warn('Clipboard-Flux: multi-sheet Footprint PDF enrichment failed', e);
        resolve();
      });
    });
  }

  function installPrintWrapper(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return;
    if (!Object.prototype.hasOwnProperty.call(iframe, '__objectUrls')) return;

    function wrapPrint() {
      var frameWin = iframe.contentWindow;
      var frameDoc = frameWin && frameWin.document;
      if (!frameWin || !frameDoc || typeof frameWin.print !== 'function') return false;
      var downstream = frameWin.print;
      if (downstream.__clipboardFluxMultiSheetPrintWrapper) return true;
      var wrapped = function () {
        if (iframe.__clipboardFluxMultiSheetPrintInProgress) return;
        iframe.__clipboardFluxMultiSheetPrintInProgress = true;
        withTimeout(renderAllSheetsForPrint(frameDoc), PRINT_PREPARE_TIMEOUT_MS).then(function () {
          iframe.__clipboardFluxMultiSheetPrintInProgress = false;
          downstream.call(frameWin);
        });
      };
      wrapped.__clipboardFluxMultiSheetPrintWrapper = true;
      try { frameWin.print = wrapped; }
      catch (e) {
        try { Object.defineProperty(frameWin, 'print', { configurable: true, writable: true, value: wrapped }); }
        catch (ignore) {}
      }
      return frameWin.print === wrapped;
    }

    if (!iframe.__clipboardFluxMultiSheetLoadListener) {
      iframe.__clipboardFluxMultiSheetLoadListener = true;
      iframe.addEventListener('load', wrapPrint, true);
    }
    wrapPrint();
  }

  var observer = new MutationObserver(function (records) {
    var sawCanvas = false;
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.id === 'footprint-canvas' || (node.querySelector && node.querySelector('#footprint-canvas'))) sawCanvas = true;
        if (node.tagName === 'IFRAME') installPrintWrapper(node);
        if (node.querySelectorAll) Array.prototype.forEach.call(node.querySelectorAll('iframe'), installPrintWrapper);
      });
    });
    if (sawCanvas) setTimeout(renderSheetPanel, 0);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), installPrintWrapper);
  if (document.getElementById('footprint-canvas')) renderSheetPanel();
  wrapConfirmForResetCleanup();
  resumeFootprintAfterReload();
})();
