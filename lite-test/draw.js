'use strict';
/* =====================================================================
   Field Lite - freehand sketch canvas (Sketch tab, "Draw").

   One endless canvas with no pages: draw the house, garage and guest house side by side and zoom
   in or out as far as you like. World units are feet, so with snapping on, walls come out to
   length (the grid's small squares are 1 ft when zoomed in, 5/10/50 ft further out).

   Input: the Pencil (or a mouse) draws. One finger pans, two fingers pan and zoom. With Finger
   on, one finger draws and two fingers pan and zoom. While the Pencil is down, and for a moment
   after, touches are ignored (palm rejection).

   Straighten uses Footprint's rule: a stroke becomes a straight wall only when it is clearly
   line-like (it never strays more than 7% of its length from the line between its ends, and its
   path is at most 12% longer than that line). Circles and curves stay freehand, lightly smoothed.
   Snap then:
     - squares a wall to 0/45/90 degrees when it is within 6 degrees,
     - lands its ends on another wall's end when close (so shapes close), otherwise on the grid.

   Data: cur.sketch.draw = {strokes: [{t:'line', a:[x,y], b:[x,y], w} | {t:'free', pts:[[x,y]...], w}],
                            labels: [{id, t, x, y}], ref: {id, x, y, w, h, locked, op} | null,
                            view: {s, tx, ty}}   (s = screen px per foot)
   ===================================================================== */
const DRAW = (() => {
  const W_PX = [1.5, 2.5, 4];                    // line widths on screen (thin / medium / thick)
  const SMIN = 0.02, SMAX = 4000;                // zoom: practically endless both ways
  const NOISE_PX = 6, SNAP_PX = 14, ERASE_PX = 14;
  const STRAIGHT_DEV = 0.07, STRAIGHT_LEN = 1.12, ANGLE_SNAP_DEG = 6;
  let tool = 'pen', hist = [], redo = [], labelPick = false, labelPending = null, bmp = null, bmpId = null;

  const D = () => {
    const d = cur.sketch.draw = cur.sketch.draw || {};
    d.strokes = d.strokes || []; d.labels = d.labels || []; d.ref = d.ref || null;
    d.view = d.view || {s: 18, tx: 60, ty: 60};
    return d;
  };
  const opts = () => Object.assign({straighten: true, snap: true, lengths: true, width: 1}, SET.draw || {});
  const setOpt = (k, v) => { SET.draw = Object.assign(opts(), {[k]: v}); saveSettings(); };
  const has = () => { const d = D(); return d.strokes.length || d.labels.length || d.ref; };

  /* ---------- geometry ---------- */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function perp(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L; }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
  }
  function isLine(pts) {   // Footprint's line-intent test
    const a = pts[0], b = pts[pts.length - 1], straight = dist(a, b);
    if (straight <= 0) return false;
    let len = 0, dev = 0;
    for (let i = 0; i < pts.length; i++) { dev = Math.max(dev, perp(pts[i], a, b)); if (i) len += dist(pts[i], pts[i - 1]); }
    return dev / straight <= STRAIGHT_DEV && len / straight <= STRAIGHT_LEN;
  }
  function smooth(pts) {   // one light pass; ends untouched
    if (pts.length < 5) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) out.push([pts[i - 1][0] * .25 + pts[i][0] * .5 + pts[i + 1][0] * .25, pts[i - 1][1] * .25 + pts[i][1] * .5 + pts[i + 1][1] * .25]);
    out.push(pts[pts.length - 1]); return out;
  }
  const r2 = v => Math.round(v * 100) / 100;
  function gridStep(s) { for (const g of [1, 5, 10, 50, 100, 500, 1000, 5000, 10000]) if (g * s >= 10) return g; return 10000; }
  // nearest end of another wall, within SNAP_PX on screen
  function nearEnd(p, s, skip) {
    let best = null, bd = SNAP_PX / s;
    for (const st of D().strokes) {
      if (st === skip || st.t !== 'line') continue;
      for (const q of [st.a, st.b]) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
    }
    return best && [best[0], best[1]];
  }
  function snapPt(p, s) { const e = nearEnd(p, s); if (e) return e; const g = gridStep(s); return [r2(Math.round(p[0] / g) * g), r2(Math.round(p[1] / g) * g)]; }
  function snapLine(a, b, s) {
    const o = opts();
    if (!o.snap) return [a, b];
    a = snapPt(a, s);
    const e = nearEnd(b, s);
    if (e) return [a, e];                                 // closes onto an existing corner
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    let ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const k = Math.round(ang / 45) * 45, g = gridStep(s);
    if (Math.abs(ang - k) <= ANGLE_SNAP_DEG) {           // square it up, then snap its length to the grid
      const rad = k * Math.PI / 180, ux = Math.round(Math.cos(rad) * 1e6) / 1e6, uy = Math.round(Math.sin(rad) * 1e6) / 1e6;
      const step = k % 90 === 0 ? g : g * Math.SQRT2;
      const n = Math.max(1, Math.round(L / step)) * step;
      return [a, [r2(a[0] + ux * n), r2(a[1] + uy * n)]];
    }
    return [a, snapPt(b, s)];
  }
  function fmtLen(ft) { let f = Math.floor(ft + 1e-9), i = Math.round((ft - f) * 12); if (i === 12) { f++; i = 0; } return i ? `${f}'${i}"` : `${f}'`; }

  /* ---------- drawing ---------- */
  function paint(ctx, W, H, view, {exp = false, live = null} = {}) {
    const d = D(), {s, tx, ty} = view, o = opts();
    const X = x => x * s + tx, Y = y => y * s + ty;
    ctx.save();
    ctx.fillStyle = exp ? '#fff' : (getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff');
    ctx.fillRect(0, 0, W, H);
    if (!exp) {   // grid: small squares + every 5th line darker
      const g = gridStep(s), x0 = Math.floor(-tx / s / g) * g, y0 = Math.floor(-ty / s / g) * g;
      ctx.lineWidth = 1;
      for (let x = x0; X(x) <= W; x += g) { ctx.strokeStyle = Math.round(x / g) % 5 ? 'rgba(120,130,145,.16)' : 'rgba(120,130,145,.38)'; ctx.beginPath(); ctx.moveTo(Math.round(X(x)) + .5, 0); ctx.lineTo(Math.round(X(x)) + .5, H); ctx.stroke(); }
      for (let y = y0; Y(y) <= H; y += g) { ctx.strokeStyle = Math.round(y / g) % 5 ? 'rgba(120,130,145,.16)' : 'rgba(120,130,145,.38)'; ctx.beginPath(); ctx.moveTo(0, Math.round(Y(y)) + .5); ctx.lineTo(W, Math.round(Y(y)) + .5); ctx.stroke(); }
    }
    if (d.ref && bmp && bmpId === d.ref.id) {
      ctx.globalAlpha = d.ref.op;
      ctx.drawImage(bmp, X(d.ref.x), Y(d.ref.y), d.ref.w * s, d.ref.h * s);
      ctx.globalAlpha = 1;
      if (!exp && !d.ref.locked) {
        ctx.setLineDash([6, 4]); ctx.strokeStyle = '#e65100'; ctx.lineWidth = 2;
        ctx.strokeRect(X(d.ref.x), Y(d.ref.y), d.ref.w * s, d.ref.h * s); ctx.setLineDash([]);
        ctx.fillStyle = '#e65100'; ctx.beginPath(); ctx.arc(X(d.ref.x + d.ref.w), Y(d.ref.y + d.ref.h), 11, 0, 7); ctx.fill();
      }
    }
    const ink = exp ? '#111' : (getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#111');
    ctx.lineCap = ctx.lineJoin = 'round';
    const lens = [];
    const one = st => {
      ctx.strokeStyle = st.c || ink; ctx.lineWidth = W_PX[st.w ?? 1] * (exp ? view.k || 1 : 1);
      ctx.beginPath();
      if (st.t === 'line') { ctx.moveTo(X(st.a[0]), Y(st.a[1])); ctx.lineTo(X(st.b[0]), Y(st.b[1])); if (o.lengths) lens.push(st); }
      else { const P = st.pts; ctx.moveTo(X(P[0][0]), Y(P[0][1])); for (let i = 1; i < P.length; i++) ctx.lineTo(X(P[i][0]), Y(P[i][1])); if (P.length === 1) ctx.lineTo(X(P[0][0]) + .1, Y(P[0][1])); }
      ctx.stroke();
    };
    d.strokes.forEach(one);
    if (live) one(live);
    const fs = Math.round(12 * (exp ? view.k || 1 : 1));
    ctx.font = `600 ${fs}px -apple-system,Helvetica,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const halo = (t, x, y, col) => { ctx.lineWidth = fs * .3; ctx.strokeStyle = exp ? '#fff' : 'rgba(255,255,255,.85)'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
    for (const st of lens) {   // wall lengths, set off to one side of the wall
      const L = dist(st.a, st.b); if (L * s < 34) continue;
      const mx = X((st.a[0] + st.b[0]) / 2), my = Y((st.a[1] + st.b[1]) / 2), nx = -(st.b[1] - st.a[1]) / L, ny = (st.b[0] - st.a[0]) / L;
      halo(fmtLen(L), mx + nx * fs * .9, my + ny * fs * .9, exp ? '#1f4e79' : '#2f6fab');
    }
    ctx.font = `700 ${Math.round(fs * 1.15)}px -apple-system,Helvetica,Arial,sans-serif`;
    for (const l of d.labels) halo(l.t, X(l.x), Y(l.y), exp ? '#111' : ink);
    ctx.restore();
  }
  function bounds() {
    const d = D(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    d.strokes.forEach(st => st.t === 'line' ? (add(...st.a), add(...st.b)) : st.pts.forEach(p => add(...p)));
    d.labels.forEach(l => { add(l.x - 3, l.y - 1); add(l.x + 3, l.y + 1); });
    if (d.ref) { add(d.ref.x, d.ref.y); add(d.ref.x + d.ref.w, d.ref.y + d.ref.h); }
    return x0 > x1 ? null : [x0, y0, x1, y1];
  }
  async function loadRef() {
    const d = D();
    if (!d.ref) { bmp = null; bmpId = null; return; }
    if (bmpId === d.ref.id && bmp) return;
    const blob = refBlobs.get(d.ref.id) || ((await dbGet('photos', d.ref.id)) || {}).blob;
    if (!blob) return;
    refBlobs.set(d.ref.id, blob); bmp = await createImageBitmap(blob); bmpId = d.ref.id;
  }

  /* ---------- export (PDF page and Drawing.png) ---------- */
  async function image(longEdge = 1800) {
    if (!has()) return null;
    await loadRef();
    const b = bounds(), pad = Math.max(3, Math.max(b[2] - b[0], b[3] - b[1]) * 0.06);
    const wFt = b[2] - b[0] + pad * 2, hFt = b[3] - b[1] + pad * 2, s = longEdge / Math.max(wFt, hFt);
    const c = document.createElement('canvas'); c.width = Math.round(wFt * s); c.height = Math.round(hFt * s);
    const k = longEdge / 900;   // line widths and text scale with the image
    paint(c.getContext('2d'), c.width, c.height, {s, tx: -(b[0] - pad) * s, ty: -(b[1] - pad) * s, k}, {exp: true});
    return c;
  }

  /* ---------- the Draw view ---------- */
  function render(main, beforeHtml, afterHtml) {
    const d = D(), o = opts();
    main.innerHTML = `${beforeHtml}
     <div class="tools dtools">
       <button class="tb ${tool === 'pen' ? 'on' : ''}" data-dt="pen">&#9998; Pen</button>
       <button class="tb ${tool === 'erase' ? 'on' : ''}" data-dt="erase" aria-label="Eraser">&#9003;</button>
       <button class="tb ${tool === 'label' ? 'on' : ''}" data-dt="label">Label</button>
       <span class="sep"></span>
       <button class="tb ${o.straighten ? 'on' : ''}" data-do="straighten">&#8725; Straighten</button>
       <button class="tb ${o.snap ? 'on' : ''}" data-do="snap">&#9638; Snap</button>
       <button class="tb ${o.lengths ? 'on' : ''}" data-do="lengths">Ft</button>
       <button class="tb" id="dWidth" aria-label="Line thickness"><span class="dotsz" style="width:${6 + o.width * 5}px;height:${6 + o.width * 5}px"></span></button>
       <span class="sep"></span>
       <button class="tb" id="dUndo" aria-label="Undo">&#8630;</button>
       <button class="tb" id="dRedo" aria-label="Redo">&#8631;</button>
       <button class="tb" id="dFit">Fit</button>
       <span class="sep"></span>
       ${d.ref ? `<button class="tb ${d.ref.locked ? '' : 'on'}" id="dLock">${d.ref.locked ? '&#128274; Ref locked' : '&#128275; Moving ref'}</button>
         <button class="tb" id="dFade">Fade ${Math.round(d.ref.op * 100)}%</button><button class="tb" id="dRefDel" aria-label="Remove reference">&#10005; Ref</button>`
        : `<button class="tb" id="dRef">&#128247; Reference</button>`}
       <button class="tb ${SET.finger ? 'on' : ''}" id="dFinger">&#9757; Finger ${SET.finger ? 'ON' : 'OFF'}</button>
     </div>
     ${tool === 'label' ? `<div class="chips dchips">${ROOM_LABELS.map(l => `<button class="chip ${labelPending === l ? 'on' : ''}" data-dl="${esc(l)}">${esc(l)}</button>`).join('')}
        <button class="chip add" data-dl="__custom">Custom…</button><span class="muted">${labelPending ? `Tap where <b>${esc(nextDrawLabel(labelPending))}</b> goes` : 'Pick a label, then tap the drawing. Drag a label to move it, tap it to rename.'}</span></div>` : ''}
     <div id="dv" class="dv"><canvas id="dc"></canvas></div>${afterHtml || ''}`;
    const dv = main.querySelector('#dv'), cv = main.querySelector('#dc');
    const size = () => {
      const bar = $('#bar'), bh = bar && !bar.classList.contains('hide') ? bar.offsetHeight : 0;
      const after = dv.nextElementSibling ? dv.nextElementSibling.offsetHeight + 12 : 0;   // keep the room tally in view below
      dv.style.height = Math.max(300, window.innerHeight - dv.getBoundingClientRect().top - bh - after - 10) + 'px';
      const dpr = window.devicePixelRatio || 1, r = dv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    };
    size();
    const ctx = cv.getContext('2d', {desynchronized: true});
    let live = null, raf = 0;
    const draw = () => { const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paint(ctx, cv.width / dpr, cv.height / dpr, D().view, {live}); };
    const req = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
    loadRef().then(req);
    if (!d.view.fitted && has()) fit(); d.view.fitted = 1;
    draw();
    function fit() {
      const b = bounds(), r = dv.getBoundingClientRect();
      if (!b) { D().view = {s: 18, tx: 60, ty: 60, fitted: 1}; return; }
      const w = Math.max(10, b[2] - b[0]), h = Math.max(10, b[3] - b[1]), s = Math.min(SMAX, Math.max(SMIN, Math.min(r.width / w, r.height / h) * 0.85));
      D().view = {s, tx: r.width / 2 - (b[0] + w / 2) * s, ty: r.height / 2 - (b[1] + h / 2) * s, fitted: 1};
    }
    const snapshot = () => { hist.push(JSON.stringify({s: D().strokes, l: D().labels, r: D().ref})); if (hist.length > 60) hist.shift(); redo = []; };
    const restore = j => { const o2 = JSON.parse(j); const dd = D(); dd.strokes = o2.s; dd.labels = o2.l; dd.ref = o2.r; };
    const toW = (cx, cy) => { const r = cv.getBoundingClientRect(), v = D().view; return [(cx - r.left - v.tx) / v.s, (cy - r.top - v.ty) / v.s]; };
    const toS = (x, y) => { const v = D().view; return [x * v.s + v.tx, y * v.s + v.ty]; };
    const touches = new Map();
    let st = null, pen = {down: false, last: 0}, gesture = null, dragRef = null, dragLabel = null;
    const palm = e => e.pointerType === 'touch' && (pen.down || Date.now() - pen.last < 900);
    const drawsWith = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && SET.finger);
    const labelAt = (x, y) => D().labels.find(l => { const [sx, sy] = toS(l.x, l.y), [px, py] = toS(x, y); return Math.abs(sx - px) < 40 && Math.abs(sy - py) < 14; });
    const startGesture = () => {
      const p = [...touches.values()];
      if (p.length < 2) { gesture = {pan: p[0], v0: Object.assign({}, D().view)}; return; }
      const c = [(p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2], dd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      gesture = {c, d: dd, v0: Object.assign({}, D().view), w: toW(...c)};
    };
    const moveGesture = () => {
      const p = [...touches.values()], r = cv.getBoundingClientRect(), v = D().view;
      if (!gesture) return;
      if (p.length >= 2 && gesture.d) {
        const c = [(p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2], dd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        v.s = Math.min(SMAX, Math.max(SMIN, gesture.v0.s * dd / gesture.d));
        v.tx = c[0] - r.left - gesture.w[0] * v.s; v.ty = c[1] - r.top - gesture.w[1] * v.s;
      } else if (p.length === 1 && gesture.pan) {
        v.tx = gesture.v0.tx + p[0].x - gesture.pan.x0; v.ty = gesture.v0.ty + p[0].y - gesture.pan.y0;
      }
      req();
    };
    cv.onpointerdown = e => {
      if (e.pointerType === 'pen') { pen.down = true; pen.last = Date.now(); }
      if (palm(e)) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY});
        if (touches.size >= 2 || !SET.finger) {   // a second finger turns a finger stroke into a pinch
          if (st && st.touch) { st = null; live = null; }
          startGesture(); req(); return;
        }
      }
      const w = toW(e.clientX, e.clientY), dd = D(), v = dd.view;
      // reference sketch: when unlocked, drag it or its corner handle
      if (dd.ref && !dd.ref.locked) {
        const [hx, hy] = toS(dd.ref.x + dd.ref.w, dd.ref.y + dd.ref.h);
        const r = cv.getBoundingClientRect();
        if (Math.hypot(e.clientX - r.left - hx, e.clientY - r.top - hy) < 24) { snapshot(); dragRef = {mode: 'size', w0: dd.ref.w, h0: dd.ref.h, p0: w}; return; }
        if (w[0] >= dd.ref.x && w[0] <= dd.ref.x + dd.ref.w && w[1] >= dd.ref.y && w[1] <= dd.ref.y + dd.ref.h) { snapshot(); dragRef = {mode: 'move', x0: dd.ref.x, y0: dd.ref.y, p0: w}; return; }
      }
      if (tool === 'label') {
        const l = labelAt(...w);
        if (l) { dragLabel = {l, p0: w, x0: l.x, y0: l.y, c0: [e.clientX, e.clientY], moved: false}; return; }
        if (labelPending) { snapshot(); dd.labels.push({id: uid(), t: nextDrawLabel(labelPending), x: r2(w[0]), y: r2(w[1])}); labelPending = null; save(); rerender(); }
        return;
      }
      if (tool === 'erase') { snapshot(); st = {erase: true, id: e.pointerId, hit: false}; eraseAt(w); return; }
      snapshot();
      st = {id: e.pointerId, pts: [w], touch: e.pointerType === 'touch', s: v.s};
      live = {t: 'free', pts: st.pts, w: opts().width};
      req();
    };
    cv.onpointermove = e => {
      if (touches.has(e.pointerId)) { const t = touches.get(e.pointerId); t.x = e.clientX; t.y = e.clientY; if (gesture) { moveGesture(); return; } }
      const w = toW(e.clientX, e.clientY), dd = D();
      if (dragRef) {
        if (dragRef.mode === 'move') { dd.ref.x = r2(dragRef.x0 + w[0] - dragRef.p0[0]); dd.ref.y = r2(dragRef.y0 + w[1] - dragRef.p0[1]); }
        else { const k = Math.max(0.05, (dragRef.w0 + w[0] - dragRef.p0[0]) / dragRef.w0); dd.ref.w = r2(dragRef.w0 * k); dd.ref.h = r2(dragRef.h0 * k); }
        req(); return;
      }
      if (dragLabel) { if (Math.hypot(e.clientX - dragLabel.c0[0], e.clientY - dragLabel.c0[1]) > 6) dragLabel.moved = true;
        if (dragLabel.moved) { dragLabel.l.x = r2(dragLabel.x0 + w[0] - dragLabel.p0[0]); dragLabel.l.y = r2(dragLabel.y0 + w[1] - dragLabel.p0[1]); req(); } return; }
      if (!st || e.pointerId !== st.id) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (st.erase) { evs.forEach(ev => eraseAt(toW(ev.clientX, ev.clientY))); return; }
      for (const ev of evs) { const q = toW(ev.clientX, ev.clientY), l = st.pts[st.pts.length - 1]; if (dist(q, l) * dd.view.s > 1.5) st.pts.push(q); }
      req();
    };
    const end = e => {
      if (e.pointerType === 'pen') { pen.down = false; pen.last = Date.now(); }
      if (touches.delete(e.pointerId)) {
        if (gesture) { if (touches.size) startGesture(); else { gesture = null; save(); } return; }
      }
      if (dragRef) { dragRef = null; save(); return; }
      if (dragLabel) {
        const L = dragLabel; dragLabel = null;
        if (L.moved) { save(); req(); return; }
        if (e.type !== 'pointerup') return;
        const n = prompt('Rename this label - clear it to delete it', L.l.t); if (n === null) return;
        snapshot(); if (n.trim()) L.l.t = n.trim(); else D().labels = D().labels.filter(x => x !== L.l);
        save(); rerender(); return;
      }
      if (!st || e.pointerId !== st.id) return;
      const s0 = st; st = null; live = null;
      if (s0.erase) { if (!s0.hit) hist.pop(); else { save(); syncDrawLabels(); } req(); return; }
      let len = 0; for (let i = 1; i < s0.pts.length; i++) len += dist(s0.pts[i], s0.pts[i - 1]);
      if (len * s0.s < NOISE_PX) { hist.pop(); req(); return; }
      const o = opts();
      let stroke;
      if (o.straighten && isLine(s0.pts)) { const [a, b] = snapLine(s0.pts[0], s0.pts[s0.pts.length - 1], s0.s); stroke = {t: 'line', a: a.map(r2), b: b.map(r2), w: o.width}; }
      else stroke = {t: 'free', pts: smooth(s0.pts).map(p => [r2(p[0]), r2(p[1])]), w: o.width};
      D().strokes.push(stroke); save(); req();
    };
    cv.onpointerup = end; cv.onpointercancel = end;
    cv.addEventListener('touchstart', e => e.preventDefault(), {passive: false});   // the canvas handles its own pan/zoom
    cv.addEventListener('wheel', e => {
      e.preventDefault(); const v = D().view, r = cv.getBoundingClientRect();
      if (e.ctrlKey) { const w = toW(e.clientX, e.clientY); v.s = Math.min(SMAX, Math.max(SMIN, v.s * Math.exp(-e.deltaY * 0.01))); v.tx = e.clientX - r.left - w[0] * v.s; v.ty = e.clientY - r.top - w[1] * v.s; }
      else { v.tx -= e.deltaX; v.ty -= e.deltaY; }
      req(); clearTimeout(cv._wt); cv._wt = setTimeout(save, 400);
    }, {passive: false});
    function eraseAt(w) {
      const dd = D(), rad = ERASE_PX / dd.view.s, before = dd.strokes.length + dd.labels.length;
      dd.strokes = dd.strokes.filter(s => s.t === 'line' ? segDist(w, s.a, s.b) > rad : !s.pts.some((p, i) => i ? segDist(w, s.pts[i - 1], p) <= rad : dist(w, p) <= rad));
      const hitL = labelAt(...w); if (hitL) dd.labels = dd.labels.filter(l => l !== hitL);
      if (dd.strokes.length + dd.labels.length !== before) { st && (st.hit = true); req(); }
    }
    const rerender = () => renderSketch();
    main.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return; const dd = D();
      if (sketchCommonClick(b)) return;
      if (b.dataset.dt) { tool = b.dataset.dt; labelPending = null; rerender(); }
      else if (b.dataset.do) { setOpt(b.dataset.do, !opts()[b.dataset.do]); rerender(); }
      else if (b.id === 'dWidth') { setOpt('width', (opts().width + 1) % 3); rerender(); }
      else if (b.id === 'dUndo') { const h = hist.pop(); if (!h) { toast('Nothing to undo'); return; } redo.push(JSON.stringify({s: dd.strokes, l: dd.labels, r: dd.ref})); restore(h); save(); syncDrawLabels(); await loadRef(); req(); }
      else if (b.id === 'dRedo') { const h = redo.pop(); if (!h) { toast('Nothing to redo'); return; } hist.push(JSON.stringify({s: dd.strokes, l: dd.labels, r: dd.ref})); restore(h); save(); syncDrawLabels(); await loadRef(); req(); }
      else if (b.id === 'dFit') { fit(); save(); req(); }
      else if (b.id === 'dRef') { $('#drawRef').value = ''; $('#drawRef').click(); }
      else if (b.id === 'dLock') { dd.ref.locked = !dd.ref.locked; save(); rerender(); }
      else if (b.id === 'dFade') { const steps = [0.25, 0.4, 0.55, 0.75, 1]; dd.ref.op = steps[(steps.indexOf(dd.ref.op) + 1) % steps.length] || 0.55; save(); rerender(); }
      else if (b.id === 'dRefDel') { if (!confirm('Remove the reference sketch?')) return; snapshot(); dd.ref = null; bmp = null; save(); rerender(); }
      else if (b.id === 'dFinger') { SET.finger = !SET.finger; saveSettings(); rerender(); }
      else if (b.dataset.dl) { let l = b.dataset.dl; if (l === '__custom') { l = (prompt('Label (e.g. Office, Bonus room)') || '').trim(); if (!l) return; } labelPending = l; rerender(); }
    };
    // a new reference sketch lands in view, scaled to fit, unlocked so it can be placed
    $('#drawRef').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f || !cur) return;
      try {
        toast('Adding reference…');
        const blob = await shrink(f, 2400), bm = await createImageBitmap(blob), id = uid(), r = cv.getBoundingClientRect(), v = D().view;
        const vw = r.width / v.s * 0.8, vh = r.height / v.s * 0.8; let w = vw, h = w * bm.height / bm.width; if (h > vh) { h = vh; w = h * bm.width / bm.height; }
        await dbPut('photos', {id, insp: cur.id, kind: 'ref', label: f.name || 'Reference sketch', ts: Date.now(), blob});
        refBlobs.set(id, blob); snapshot();
        D().ref = {id, x: r2((r.width / 2 - v.tx) / v.s - w / 2), y: r2((r.height / 2 - v.ty) / v.s - h / 2), w: r2(w), h: r2(h), locked: false, op: 0.55};
        bmp = bm; bmpId = id; save(); rerender(); toast('Drag to place, corner to resize, then Lock');
      } catch (err) { alert('Could not add the reference: ' + err.message); }
    };
    const onResize = () => { if (!document.body.contains(cv)) { window.removeEventListener('resize', onResize); return; } size(); draw(); };
    window.addEventListener('resize', onResize);
  }
  function nextDrawLabel(base) { return nextLabelIn(base, [...cur.sketch.labels, ...D().labels]); }
  function syncDrawLabels() { const w = document.querySelector('.labwarn'); if (w) w.innerHTML = labelMismatch().map(m => `&#9888; ${esc(m)}`).join('<br>'); }
  return {render, image, has, labels: () => D().labels, D, isLine, snapLine, gridStep, fmtLen};
})();
