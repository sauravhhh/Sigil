/* Sigil — animated signature studio. Pure helpers exported for headless tests. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Sigil = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var W = 1200, H = 600;
  var DURATION = 3200;          // full animation ms
  var TEXT_PHASE = 0.72;        // fraction of time spent revealing the text

  // Default styles if fonts/fonts.json cannot be loaded.
  // Add your own: drop a .ttf/.otf/.woff file into fonts/ and list it in fonts/fonts.json.
  var DEFAULT_STYLES = [
    { name: 'Pinyon',      font: '"Pinyon Script"' },
    { name: 'Muellerhoff', font: '"Herr Von Muellerhoff"' },
    { name: 'Doulaise',    font: '"Monsieur La Doulaise"' },
    { name: 'Qwigley',     font: '"Qwigley"' },
    { name: 'Arizonia',    font: '"Arizonia"' },
    { name: 'Euphoria',    font: '"Euphoria Script"' }
  ];
  var STYLES = DEFAULT_STYLES.slice();
  var INKS = [
    { name: 'Midnight', c: '#141414' }, { name: 'Royal blue', c: '#1d4ed8' },
    { name: 'Crimson', c: '#b91c1c' },  { name: 'Emerald', c: '#047857' },
    { name: 'Gold', c: '#b45309' },     { name: 'Violet', c: '#6d28d9' }
  ];
  var BACKGROUNDS = [
    { name: 'Paper', c: '#ffffff' }, { name: 'Clear', c: 'transparent' }
  ];

  function sanitizeName(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  function fileName(name, ext) {
    var base = sanitizeName(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'signature';
    return 'sigil-' + base + '.' + ext;
  }

  function pickMime(candidates, isSupported) {
    for (var i = 0; i < candidates.length; i++)
      if (isSupported(candidates[i])) return candidates[i];
    return null;
  }

  function extFor(mime) {
    return mime && mime.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
  }

  // ---- gallery storage (injectable for tests) ----
  var LS_GALLERY = 'sigil_gallery';
  function loadGallery(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return [];
    try {
      var arr = JSON.parse(storage.getItem(LS_GALLERY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveGallery(list, storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return;
    try { storage.setItem(LS_GALLERY, JSON.stringify(list.slice(0, 24))); } catch (e) {}
  }
  function addToGallery(list, entry) {
    return [entry].concat(list).slice(0, 24);
  }
  function removeFromGallery(list, id) {
    return list.filter(function (e) { return e.id !== id; });
  }

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  // Quadratic bezier point for the flourish underline
  function flourishPoint(q) {
    var x0 = W * 0.16, y0 = H * 0.80;
    var cx = W * 0.50, cy = H * 0.99;
    var x1 = W * 0.86, y1 = H * 0.66;
    var x = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * cx + q * q * x1;
    var y = (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * cy + q * q * y1;
    return { x: x, y: y };
  }

  // ---- browser-only engine ----
  var state = {
    styleIdx: 0, inkIdx: 0, bgIdx: 0,
    raf: 0, start: 0, off: null, fontPx: 150
  };

  function getCtx(id) { return document.getElementById(id).getContext('2d'); }

  function fitFont(ctx, name, font) {
    var px = 190;
    ctx.textBaseline = 'middle';
    while (px > 40) {
      ctx.font = px + 'px ' + font;
      if (ctx.measureText(name).width <= W * 0.86) break;
      px -= 6;
    }
    return px;
  }

  function renderOffscreen(name) {
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var ctx = off.getContext('2d');
    var style = STYLES[state.styleIdx] || STYLES[0], ink = INKS[state.inkIdx];
    var display = name || 'Your signature';
    state.fontPx = fitFont(ctx, display, style.font);
    ctx.font = state.fontPx + 'px ' + style.font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = name ? ink.c : '#b9bdc4';
    ctx.fillText(display, W / 2, H * 0.44);
    state.off = off;
  }

  function paintBackground(ctx) {
    var bg = BACKGROUNDS[state.bgIdx];
    if (bg.c === 'transparent') { ctx.clearRect(0, 0, W, H); return; }
    ctx.fillStyle = bg.c; ctx.fillRect(0, 0, W, H);
  }

  function drawFrame(ctx, progress, skipFlourish) {
    var ink = INKS[state.inkIdx];
    paintBackground(ctx);
    // text reveal
    var tp = Math.min(progress / TEXT_PHASE, 1);
    var revealW = W * easeOutCubic(tp);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, revealW, H); ctx.clip();
    ctx.drawImage(state.off, 0, 0);
    ctx.restore();
    // flourish underline (skipped for clean PNG export)
    var fp = skipFlourish ? 0 : Math.max(0, Math.min((progress - TEXT_PHASE) / (1 - TEXT_PHASE), 1));
    var pen = null;
    if (fp > 0) {
      ctx.strokeStyle = ink.c; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      var steps = 48, n = Math.max(2, Math.round(steps * fp));
      for (var i = 0; i <= n; i++) {
        var pt = flourishPoint(i / steps);
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      pen = flourishPoint(Math.min(fp, 1));
    } else if (tp < 1) {
      pen = { x: Math.min(revealW, W - 8), y: H * 0.44 };
    }
    // pen nib dot
    if (pen) {
      ctx.save();
      ctx.shadowColor = ink.c; ctx.shadowBlur = 18;
      ctx.fillStyle = ink.c;
      ctx.beginPath(); ctx.arc(pen.x, pen.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function frameAt(progress) {
    drawFrame(getCtx('stage'), progress);
  }

  function play(onDone) {
    cancelAnimationFrame(state.raf);
    state.start = performance.now();
    function tick(now) {
      var p = Math.min((now - state.start) / DURATION, 1);
      frameAt(p);
      if (p < 1) state.raf = requestAnimationFrame(tick);
      else if (onDone) onDone();
    }
    state.raf = requestAnimationFrame(tick);
  }

  function currentName() {
    return sanitizeName(document.getElementById('nameInput').value);
  }

  function refresh() {
    renderOffscreen(currentName());
    play();
    document.getElementById('stageWrap').classList
      .toggle('checker', BACKGROUNDS[state.bgIdx].c === 'transparent');
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function thumbnail() {
    var c = document.createElement('canvas');
    c.width = 480; c.height = 240;
    c.getContext('2d').drawImage(document.getElementById('stage'), 0, 0, 480, 240);
    return c.toDataURL('image/png');
  }

  function saveToGallery(name) {
    var gallery = loadGallery();
    gallery = addToGallery(gallery, {
      id: 'g' + Date.now(),
      name: name, thumb: thumbnail(),
      styleIdx: state.styleIdx, inkIdx: state.inkIdx, bgIdx: state.bgIdx,
      ts: Date.now()
    });
    saveGallery(gallery);
    renderGallery();
  }

  function setBusy(btn, busy) {
    btn.disabled = busy; btn.classList.toggle('loading', busy);
  }

  function exportPNG() {
    var name = currentName();
    var btn = document.getElementById('pngBtn');
    if (!name) { hint('Type your name first.'); return; }
    setBusy(btn, true);
    cancelAnimationFrame(state.raf);
    drawFrame(getCtx('stage'), 1, true); // clean export: no flourish line
    document.getElementById('stage').toBlob(function (blob) {
      setBusy(btn, false);
      if (!blob) { hint('PNG export failed on this browser.'); return; }
      downloadBlob(blob, fileName(name, 'png'));
      saveToGallery(name);
      hint('PNG saved. Find it in "My autographs" too.');
      play();
    }, 'image/png');
  }

  function exportVideo() {
    var name = currentName();
    var btn = document.getElementById('vidBtn');
    if (!name) { hint('Type your name first.'); return; }
    if (!window.MediaRecorder || !document.getElementById('stage').captureStream) {
      hint('Video recording is not supported on this browser.'); return;
    }
    var mime = pickMime(
      ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'],
      function (m) { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } });
    if (!mime) { hint('Video recording is not supported on this browser.'); return; }
    setBusy(btn, true);
    hint('Recording…');
    var stream = document.getElementById('stage').captureStream(30);
    var rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 }); }
    catch (e) { setBusy(btn, false); hint('Could not start recording.'); return; }
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      setBusy(btn, false);
      var blob = new Blob(chunks, { type: mime });
      downloadBlob(blob, fileName(name, extFor(mime)));
      saveToGallery(name);
      hint('Video saved (' + extFor(mime).toUpperCase() + ').');
    };
    play();
    rec.start();
    setTimeout(function () { if (rec.state !== 'inactive') rec.stop(); }, DURATION + 500);
  }

  function hint(msg) {
    var el = document.getElementById('hint');
    el.textContent = msg;
    clearTimeout(hint._t);
    hint._t = setTimeout(function () { el.textContent = ''; }, 4000);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderGallery() {
    var wrap = document.getElementById('gallery');
    var gallery = loadGallery();
    wrap.innerHTML = '';
    if (!gallery.length) {
      wrap.innerHTML = '<div class="empty">Nothing yet. Create a signature and download it.</div>';
      return;
    }
    gallery.forEach(function (g) {
      var div = document.createElement('div');
      div.className = 'g-item';
      var d = new Date(g.ts);
      div.innerHTML =
        '<img alt="autograph">' +
        '<div class="g-body"><div class="g-name">' + esc(g.name) + '</div>' +
        '<div class="g-date">' + esc(d.toLocaleDateString()) + '</div>' +
        '<div class="g-actions"><button data-a="load">Remake</button>' +
        '<button data-a="del" class="del">Delete</button></div></div>';
      div.querySelector('img').src = g.thumb;
      div.querySelector('[data-a="load"]').onclick = function () {
        state.styleIdx = g.styleIdx; state.inkIdx = g.inkIdx; state.bgIdx = g.bgIdx;
        document.getElementById('nameInput').value = g.name;
        syncControls(); refresh();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      div.querySelector('[data-a="del"]').onclick = function () {
        saveGallery(removeFromGallery(loadGallery(), g.id));
        renderGallery();
      };
      wrap.appendChild(div);
    });
  }

  function syncControls() {
    var chips = document.getElementById('styleChips').children;
    for (var i = 0; i < chips.length; i++)
      chips[i].classList.toggle('active', i === state.styleIdx);
    var sws = document.getElementById('inkSwatches').children;
    for (var j = 0; j < sws.length; j++)
      sws[j].classList.toggle('active', j === state.inkIdx);
    var segs = document.getElementById('bgSeg').children;
    for (var k = 0; k < segs.length; k++)
      segs[k].classList.toggle('active', k === state.bgIdx);
  }

  // Load fonts listed in fonts/fonts.json via FontFace, then rebuild the style chips.
  // Falls back to DEFAULT_STYLES when the manifest or a file cannot be loaded.
  function loadFontSet() {
    if (!window.FontFace || !document.fonts) return Promise.resolve();
    return fetch('fonts/fonts.json').then(function (r) {
      if (!r.ok) throw new Error('fonts.json missing');
      return r.json();
    }).then(function (manifest) {
      var list = ((manifest && manifest.fonts) || []).filter(function (f) { return f.family && f.file; });
      if (!list.length) throw new Error('no fonts listed');
      var loads = list.map(function (f) {
        var face = new FontFace(f.family, "url('" + 'fonts/' + f.file.replace(/'/g, '') + "')");
        return face.load().then(function (loaded) {
          document.fonts.add(loaded);
          return { name: f.name || f.family, font: '"' + f.family + '"' };
        }).catch(function () { return null; });
      });
      return Promise.all(loads).then(function (results) {
        var okStyles = results.filter(Boolean);
        if (okStyles.length) { STYLES = okStyles; state.styleIdx = 0; }
      });
    }).catch(function () { /* keep DEFAULT_STYLES */ });
  }

  function buildStyleChips() {
    var chips = document.getElementById('styleChips');
    chips.innerHTML = '';
    STYLES.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'chip' + (i === state.styleIdx ? ' active' : '');
      b.style.fontFamily = s.font;
      b.textContent = s.name;
      b.title = s.name;
      b.onclick = function () { state.styleIdx = i; syncControls(); refresh(); };
      chips.appendChild(b);
    });
  }

  function init() {
    var nameInput = document.getElementById('nameInput');
    var sws = document.getElementById('inkSwatches');
    INKS.forEach(function (ink, i) {
      var b = document.createElement('button');
      b.className = 'sw' + (i === 0 ? ' active' : '');
      b.style.background = ink.c; b.title = ink.name;
      b.setAttribute('aria-label', ink.name);
      b.onclick = function () { state.inkIdx = i; syncControls(); refresh(); };
      sws.appendChild(b);
    });
    var seg = document.getElementById('bgSeg');
    BACKGROUNDS.forEach(function (bg, i) {
      var b = document.createElement('button');
      b.className = i === 0 ? 'active' : '';
      b.textContent = bg.name;
      b.onclick = function () { state.bgIdx = i; syncControls(); refresh(); };
      seg.appendChild(b);
    });

    var deb;
    nameInput.addEventListener('input', function () {
      clearTimeout(deb);
      deb = setTimeout(refresh, 350);
    });

    document.getElementById('replayBtn').onclick = function () { refresh(); };
    document.getElementById('pngBtn').onclick = exportPNG;
    document.getElementById('vidBtn').onclick = exportVideo;

    renderGallery();

    // theme follows the device (prefers-color-scheme in CSS); no toggle button.
    // load bundled fonts, build the style chips, then draw
    loadFontSet().then(function () {
      buildStyleChips(); syncControls(); refresh();
    });
    setTimeout(function () {
      if (!state.off) { buildStyleChips(); syncControls(); refresh(); }
    }, 3000); // fallback
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    STYLES: STYLES, INKS: INKS, BACKGROUNDS: BACKGROUNDS,
    sanitizeName: sanitizeName, fileName: fileName,
    pickMime: pickMime, extFor: extFor,
    loadGallery: loadGallery, saveGallery: saveGallery,
    addToGallery: addToGallery, removeFromGallery: removeFromGallery,
    flourishPoint: flourishPoint, easeOutCubic: easeOutCubic,
    W: W, H: H, DURATION: DURATION
  };
});
