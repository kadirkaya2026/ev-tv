/* Ev TV arayüzü: kumanda ile gezinme, uygulamalar, çizim tahtası, asistan. */
(function () {
  'use strict';

  var A = window.Android || null; // Android köprüsü; tarayıcıda önizlemede yok
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var S = {
    screen: 'home',
    focus: null,
    lastHomeFocus: null,
    apps: [],
    appsKey: '',
    favs: null,
    strokes: new Map(),
    chat: [],
    thinking: false,
    hasKey: false,
    url: ''
  };

  // ------------------------------------------------------------ yardımcılar
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* yok say */ }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer;
  function toast(text) {
    var t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  var GLYPHS = {
    draw: '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    assistant: '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    connect: '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    settings: '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  var BUILTIN = {
    draw: { label: 'Çizim Tahtası', kicker: 'Birlikte çizin', sub: 'Telefonlarınızdan çizdiğiniz her çizgi burada anında görünür.' },
    assistant: { label: 'Asistan', kicker: 'Claude ile', sub: 'Film önerisi, tarif, merak ettiğin her şey. Mikrofon tuşuna bas ya da telefondan yaz.' },
    connect: { label: 'Telefonu Bağla', kicker: 'Ev ağı', sub: 'QR kodu okut; telefonun çizim kalemi, klavye ve ayar ekranı olsun.' },
    settings: { label: 'Ayarlar', kicker: 'Sistem', sub: 'Wi-Fi, ses, görüntü ve diğer Android ayarları.' }
  };

  // ------------------------------------------------------------ önizleme verisi (tarayıcıda)
  function mockApps() {
    var list = [
      ['Video Dünyası', '#e50914', '#831010'], ['Müzik', '#1db954', '#0b5e2c'], ['Sinema+', '#0f79af', '#09324d'],
      ['Belgesel', '#f5a623', '#8a4b06'], ['Çocuk', '#ff6fb1', '#8c2a63'], ['Spor Canlı', '#2bd2ff', '#0b4d6b'],
      ['Haberler', '#e5e5ea', '#5a5a5f'], ['Oyunlar', '#bf5af2', '#4b1a66'], ['Podcast', '#ff9f0a', '#7a3b00'],
      ['Tarayıcı', '#64d2ff', '#1d5a73'], ['Dosyalar', '#ffd60a', '#6e5a00'], ['Kamera', '#30d158', '#0e5e2b']
    ];
    return list.map(function (a, i) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a[1] + '"/><stop offset="1" stop-color="' + a[2] + '"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="160" y="102" font-family="Helvetica,Arial" font-size="30" font-weight="700" fill="white" text-anchor="middle">' + a[0] + '</text></svg>';
      return { pkg: 'demo.app' + i, label: a[0], tv: true, banner: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) };
    });
  }

  function fetchApps() {
    if (!A) return mockApps();
    try { return JSON.parse(A.getApps()); } catch (e) { return []; }
  }

  // ------------------------------------------------------------ uygulamalar ve favoriler
  var POPULAR = ['youtube', 'netflix', 'primevideo', 'amazon.avod', 'disney', 'spotify', 'blutv', 'exxen', 'gain', 'mubi', 'tabii', 'twitch', 'plex', 'kodi'];

  function defaultFavs(apps) {
    var picks = [];
    POPULAR.forEach(function (p) {
      apps.forEach(function (a) {
        if (picks.length < 6 && a.pkg.toLowerCase().indexOf(p) >= 0 && picks.indexOf(a.pkg) < 0) picks.push(a.pkg);
      });
    });
    apps.forEach(function (a) { if (picks.length < 4 && a.tv && picks.indexOf(a.pkg) < 0) picks.push(a.pkg); });
    return picks;
  }

  function appByPkg(pkg) {
    for (var i = 0; i < S.apps.length; i++) if (S.apps[i].pkg === pkg) return S.apps[i];
    return null;
  }

  function tileHtml(kind, data) {
    var art, label;
    if (kind === 'app') {
      label = data.label;
      if (data.banner) art = '<div class="art"><img class="banner" src="' + data.banner + '" alt=""></div>';
      else if (data.icon) art = '<div class="art"><img class="icon" src="' + data.icon + '" alt=""></div>';
      else art = '<div class="art"><span style="font-size:2rem;font-weight:700">' + esc(data.label.charAt(0)) + '</span></div>';
    } else {
      label = BUILTIN[kind].label;
      art = '<div class="art c-' + kind + '">' + GLYPHS[kind] + '</div>';
    }
    return art + '<div class="fav-dot"></div><div class="label">' + esc(label) + '</div>';
  }

  function makeTile(kind, data) {
    var el = document.createElement('div');
    el.className = 'tile focusable';
    el.dataset.kind = kind;
    if (data) el.dataset.pkg = data.pkg;
    el.innerHTML = tileHtml(kind, data);
    if (data && S.favs.indexOf(data.pkg) >= 0) el.classList.add('is-fav');
    return el;
  }

  function renderHome(keepFocus) {
    var prev = S.focus && S.focus.dataset ? { kind: S.focus.dataset.kind, pkg: S.focus.dataset.pkg, inDock: $('#dock').contains(S.focus) } : null;
    var dock = $('#dock'), grid = $('#grid');
    dock.innerHTML = '';
    grid.innerHTML = '';

    dock.appendChild(makeTile('draw'));
    dock.appendChild(makeTile('assistant'));
    S.favs.forEach(function (pkg) {
      var a = appByPkg(pkg);
      if (a) dock.appendChild(makeTile('app', a));
    });

    S.apps.forEach(function (a) { grid.appendChild(makeTile('app', a)); });
    grid.appendChild(makeTile('connect'));
    grid.appendChild(makeTile('settings'));

    var target = null;
    if (keepFocus && prev) {
      var root = prev.inDock ? dock : grid;
      target = $$('.tile', root).filter(function (t) {
        return t.dataset.kind === prev.kind && (t.dataset.pkg || '') === (prev.pkg || '');
      })[0] || null;
    }
    if (S.screen === 'home') setFocus(target || dock.firstElementChild);
  }

  function loadApps(force) {
    var apps = fetchApps();
    var key = apps.map(function (a) { return a.pkg; }).join(',');
    if (!force && key === S.appsKey) return;
    S.apps = apps;
    S.appsKey = key;
    if (S.favs === null) {
      S.favs = load('favs', null) || defaultFavs(apps);
      save('favs', S.favs);
    }
    renderHome(true);
  }

  function toggleFav(tile) {
    if (!tile || tile.dataset.kind !== 'app') return;
    var pkg = tile.dataset.pkg;
    var i = S.favs.indexOf(pkg);
    var a = appByPkg(pkg);
    if (i >= 0) { S.favs.splice(i, 1); toast((a ? a.label : 'Uygulama') + ' üst sıradan çıkarıldı'); }
    else { S.favs.push(pkg); toast((a ? a.label : 'Uygulama') + ' üst sıraya eklendi'); }
    save('favs', S.favs);
    renderHome(true);
  }

  // ------------------------------------------------------------ odak ve gezinme
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function setFocus(el) {
    if (!el) return;
    if (S.focus && S.focus !== el) S.focus.classList.remove('focused');
    S.focus = el;
    el.classList.add('focused');
    if (S.screen === 'home') {
      S.lastHomeFocus = el;
      updateHomeScroll();
      updateShelf();
    }
  }

  function navigate(dir) {
    var els = $$('.screen.active .focusable').filter(visible);
    if (!els.length) return;
    var cur = S.focus;
    if (!cur || els.indexOf(cur) < 0) { setFocus(els[0]); return; }
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    els.forEach(function (el) {
      if (el === cur) return;
      var b = el.getBoundingClientRect();
      var x = b.left + b.width / 2, y = b.top + b.height / 2;
      var dx = x - cx, dy = y - cy, main, cross, score;
      if (dir === 'left' || dir === 'right') {
        main = dir === 'left' ? -dx : dx;
        cross = Math.abs(dy);
        if (main <= 4 || cross > r.height * 0.6) return; // aynı sıra
        score = main + cross * 4;
      } else {
        main = dir === 'up' ? -dy : dy;
        cross = Math.abs(dx);
        if (main <= r.height * 0.4) return;
        score = main * 1.5 + cross;
      }
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) setFocus(best);
  }

  function offsetWithin(el, ancestor) {
    var y = 0;
    while (el && el !== ancestor) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  function updateHomeScroll() {
    var el = S.focus, sc = $('#homeScroller'), home = $('#home');
    if (!el || !sc.contains(el)) return;
    if ($('#dock').contains(el)) {
      sc.style.transform = 'translateY(0)';
      home.classList.remove('scrolled');
      document.body.classList.remove('grid-scrolled');
      scrollDock(el);
      return;
    }
    home.classList.add('scrolled');
    document.body.classList.add('grid-scrolled');
    var top = offsetWithin(el, sc);
    var target = window.innerHeight * 0.2;
    sc.style.transform = 'translateY(' + Math.min(0, -(top - target)) + 'px)';
  }

  // Üst sıra taşarsa odaklanan kutucuk görünür kalacak şekilde yatay kaydır
  var dockX = 0;
  function scrollDock(el) {
    var track = $('#dock'), dock = track.parentNode;
    var pad = parseFloat(getComputedStyle(dock).paddingLeft) || 0;
    var view = dock.clientWidth - pad * 2;
    var left = el.offsetLeft, right = left + el.offsetWidth;
    var maxX = Math.max(0, track.scrollWidth - view);
    if (left - dockX < 0) dockX = left;
    else if (right - dockX > view) dockX = right - view;
    dockX = Math.min(maxX, Math.max(0, dockX));
    track.style.transform = 'translateX(' + (-dockX) + 'px)';
  }

  // ------------------------------------------------------------ üst raf (seçili öğenin tanıtımı)
  var wpFlip = false, wpCurrent = '';
  function setWallpaper(src) {
    if (src === wpCurrent) return;
    wpCurrent = src;
    var a = $('#wpA'), b = $('#wpB');
    var show = wpFlip ? a : b, hide = wpFlip ? b : a;
    wpFlip = !wpFlip;
    if (src) {
      show.style.backgroundImage = 'url("' + src + '")';
      show.classList.add('show');
    }
    hide.classList.remove('show');
  }

  function updateShelf() {
    var el = S.focus;
    if (!el || !el.dataset.kind) return;
    var kind = el.dataset.kind, side = $('#shelfSide');
    var kicker = '', title = '', sub = '';
    side.innerHTML = '';
    if (kind === 'app') {
      var a = appByPkg(el.dataset.pkg) || { label: '' };
      kicker = S.favs.indexOf(a.pkg) >= 0 ? 'Üst sırada' : 'Uygulama';
      title = a.label;
      sub = 'Açmak için OK. Üst sıraya eklemek/çıkarmak için OK\'a basılı tut.';
      setWallpaper(a.banner || a.icon || '');
    } else {
      var b = BUILTIN[kind];
      kicker = b.kicker; title = b.label; sub = b.sub;
      setWallpaper('');
      if (kind === 'draw') {
        var c = document.createElement('canvas');
        c.width = 960; c.height = 540; c.id = 'shelfBoard';
        side.appendChild(c);
        copyBoard();
      } else if (kind === 'assistant') {
        var last = S.chat.filter(function (m) { return m.role === 'assistant'; }).pop();
        if (last) sub = '“' + last.text + '”';
        else if (!S.hasKey) sub = 'Kurulum: Telefonu bağla → Ayarlar sekmesinde Claude API anahtarını gir.';
      } else if (kind === 'connect') {
        side.innerHTML = '<div class="qr-card"><div class="qr" data-qr></div><span>Okut ve bağlan</span></div>';
        renderQrs();
      }
    }
    $('#shelfKicker').textContent = kicker;
    $('#shelfTitle').textContent = title;
    $('#shelfSub').textContent = sub;
  }

  // ------------------------------------------------------------ ekranlar
  function show(name) {
    document.body.classList.remove('grid-scrolled');
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === name); });
    S.screen = name;
    if (name === 'home') {
      setWallpaper('');
      setFocus(S.lastHomeFocus && document.body.contains(S.lastHomeFocus) ? S.lastHomeFocus : $('#dock').firstElementChild);
      return;
    }
    setWallpaper('');
    var first = $('#' + name + ' .focusable');
    if (name === 'draw') { resizeBoardNote(); }
    if (name === 'assistant') { renderChat(); }
    setFocus(first);
  }

  function activate(el) {
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 150);
    var kind = el.dataset.kind, action = el.dataset.action;
    if (kind === 'app') {
      if (A) { if (!A.launch(el.dataset.pkg)) toast('Uygulama açılamadı'); }
      else toast(el.textContent.trim() + ' açılıyor (önizleme)');
    } else if (kind === 'draw' || kind === 'assistant' || kind === 'connect') {
      show(kind);
    } else if (kind === 'settings') {
      if (A) A.openSettings(); else toast('Android ayarları açılır');
    } else if (action === 'home') {
      show('home');
    } else if (action === 'clearBoard') {
      if (A) A.clearBoard(); else onEvent({ type: 'clear' });
      toast('Tahta temizlendi');
    } else if (action === 'voice') {
      startVoice();
    } else if (action === 'resetChat') {
      if (A) A.resetAssistant(); else onEvent({ type: 'chatReset' });
    }
  }

  function back() {
    if (S.screen !== 'home') { show('home'); return; }
    if (!$('#dock').contains(S.focus)) setFocus($('#dock').firstElementChild);
  }

  function startVoice() {
    if (S.screen !== 'assistant') show('assistant');
    if (!S.hasKey) { toast('Önce telefondan API anahtarını gir'); return; }
    if (A) A.startVoice(); else toast('Mikrofon (önizlemede yok)');
  }

  // ------------------------------------------------------------ tuşlar
  var okDownAt = 0, okTimer = null, okConsumed = false;
  var OK_KEYS = { 13: 1, 23: 1, 66: 1 };

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 37) { navigate('left'); e.preventDefault(); }
    else if (k === 38) { navigate('up'); e.preventDefault(); }
    else if (k === 39) { navigate('right'); e.preventDefault(); }
    else if (k === 40) { navigate('down'); e.preventDefault(); }
    else if (OK_KEYS[k]) {
      e.preventDefault();
      if (e.repeat || okDownAt) return;
      okDownAt = Date.now(); okConsumed = false;
      var el = S.focus;
      okTimer = setTimeout(function () {
        if (el && el.dataset.kind === 'app') { okConsumed = true; toggleFav(el); }
      }, 700);
    } else if (k === 27 || k === 8) { back(); e.preventDefault(); }
  });

  document.addEventListener('keyup', function (e) {
    if (!OK_KEYS[e.keyCode]) return;
    e.preventDefault();
    clearTimeout(okTimer);
    if (okDownAt && !okConsumed) activate(S.focus);
    okDownAt = 0;
  });

  // Fare/dokunmatik (geliştirme için)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.focusable');
    if (el) { setFocus(el); activate(el); }
  });

  // ------------------------------------------------------------ çizim tahtası
  var board = $('#board'), bctx = board.getContext('2d');

  function strokeStyle(ctx, s) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(1, s.size * ctx.canvas.width);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }

  function drawSegment(ctx, s, fromPoint) {
    var p = s.pts, W = ctx.canvas.width, H = ctx.canvas.height, n = p.length / 2;
    if (n === 0) return;
    strokeStyle(ctx, s);
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(p[0] * W, p[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    var start = Math.max(0, fromPoint - 1);
    ctx.beginPath();
    ctx.moveTo(p[start * 2] * W, p[start * 2 + 1] * H);
    for (var i = start + 1; i < n; i++) ctx.lineTo(p[i * 2] * W, p[i * 2 + 1] * H);
    ctx.stroke();
  }

  function redrawBoard() {
    bctx.clearRect(0, 0, board.width, board.height);
    S.strokes.forEach(function (s) { drawSegment(bctx, s, 0); });
    boardChanged();
  }

  var copyPending = false;
  function boardChanged() {
    $('#boardEmpty').style.display = S.strokes.size ? 'none' : 'flex';
    if (!copyPending) {
      copyPending = true;
      requestAnimationFrame(function () { copyPending = false; copyBoard(); });
    }
  }

  function copyBoard() {
    var c = $('#shelfBoard');
    if (!c) return;
    var x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(board, 0, 0, c.width, c.height);
  }

  function resizeBoardNote() { boardChanged(); }

  // ------------------------------------------------------------ asistan
  function renderChat() {
    var box = $('#chat');
    $('#keyNotice').hidden = S.hasKey;
    var html = '';
    if (!S.chat.length && !S.thinking) {
      html = '<div class="chat-empty">Ne sormak istersin?<br>“Bu akşam ne izlesek?” • “Menemen nasıl yapılır?”</div>';
    }
    S.chat.slice(-12).forEach(function (m) {
      html += '<div class="msg ' + m.role + '">' + esc(m.text) + '</div>';
    });
    if (S.thinking) html += '<div class="msg assistant typing"><i></i><i></i><i></i></div>';
    box.innerHTML = html;
  }

  // ------------------------------------------------------------ sunucu olayları
  function onEvent(ev) {
    switch (ev.type) {
      case 'state':
        S.strokes.clear();
        (ev.strokes || []).forEach(function (s) { S.strokes.set(s.id, s); });
        S.chat = (ev.chat || []).slice();
        S.thinking = !!ev.thinking;
        S.hasKey = !!ev.hasKey;
        redrawBoard();
        renderChat();
        break;
      case 'stroke': {
        var s = S.strokes.get(ev.id);
        if (!s) { s = { id: ev.id, who: ev.who, color: ev.color, size: ev.size, pts: [] }; S.strokes.set(ev.id, s); }
        var from = s.pts.length / 2;
        Array.prototype.push.apply(s.pts, ev.pts || []);
        drawSegment(bctx, s, from);
        boardChanged();
        break;
      }
      case 'remove':
        S.strokes.delete(ev.id);
        redrawBoard();
        break;
      case 'clear':
        S.strokes.clear();
        redrawBoard();
        break;
      case 'chat':
        S.chat.push({ role: ev.role, text: ev.text });
        if (ev.role === 'user') {
          S.thinking = true;
          if (S.screen === 'home' || S.screen === 'connect') show('assistant');
        } else {
          S.thinking = false;
        }
        renderChat();
        break;
      case 'chatError':
        S.thinking = false;
        S.chat.push({ role: 'error', text: ev.text });
        renderChat();
        break;
      case 'thinking':
        S.thinking = !!ev.value;
        renderChat();
        break;
      case 'chatReset':
        S.chat = [];
        S.thinking = false;
        renderChat();
        toast('Yeni sohbet başladı');
        break;
      case 'config':
        S.hasKey = !!ev.hasKey;
        renderChat();
        if (S.hasKey) toast('API anahtarı kaydedildi ✓');
        break;
    }
    if (S.screen === 'home' && S.focus && S.focus.dataset.kind === 'assistant') updateShelf();
  }

  // ------------------------------------------------------------ QR
  function renderQrs() {
    if (!S.url || typeof qrcode !== 'function') return;
    var qr = qrcode(0, 'M');
    qr.addData(S.url);
    qr.make();
    var svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $$('[data-qr]').forEach(function (el) { el.innerHTML = svg; });
    $('#connectUrl').textContent = S.url.replace(/\?k=.*/, '');
  }

  // ------------------------------------------------------------ saat
  function tick() {
    var d = new Date();
    $('#time').textContent = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    $('#date').textContent = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ------------------------------------------------------------ Android'den gelen çağrılar
  window.tv = {
    key: function (name) {
      if (name === 'back') back();
      else if (name === 'menu') { if (S.screen === 'home') toggleFav(S.focus); }
      else if (name === 'voice') startVoice();
    },
    home: function () { show('home'); setFocus($('#dock').firstElementChild); },
    resumed: function () { loadApps(false); refreshConnect(); },
    appsChanged: function () { loadApps(true); },
    serverEvent: function (json) { try { onEvent(JSON.parse(json)); } catch (e) { /* yok say */ } },
    voiceResult: function (text) {
      if (text === null) toast('Bu cihazda ses tanıma yok. Telefondan yazabilirsin.');
      else if (text) A && A.ask(text);
    }
  };

  function refreshConnect() {
    if (A) {
      try {
        var info = JSON.parse(A.getConnectInfo());
        S.url = info.url; S.hasKey = !!info.hasKey;
      } catch (e) { /* yok say */ }
    } else {
      S.url = 'http://192.168.1.50:8765/?k=onizleme';
    }
    renderQrs();
  }

  // ------------------------------------------------------------ başlat
  function init() {
    tick();
    setInterval(tick, 10000);
    refreshConnect();
    loadApps(true);
    if (A) {
      try { onEvent(JSON.parse(A.getState())); } catch (e) { /* yok say */ }
    } else if (/demo/.test(location.hash)) {
      demo();
    }
    renderChat();
    if (location.hash.indexOf('screen=') >= 0) show(location.hash.split('screen=')[1].split('&')[0]);
  }

  // Tarayıcı önizlemesi için örnek içerik (#demo)
  function demo() {
    var t = [], u = [];
    for (var i = 0; i <= 60; i++) {
      var a = i / 60 * Math.PI * 2;
      t.push(0.3 + Math.cos(a) * 0.12, 0.45 + Math.sin(a) * 0.2);
      u.push(0.5 + i / 60 * 0.3, 0.6 - Math.sin(i / 60 * Math.PI * 3) * 0.15);
    }
    onEvent({ type: 'state', hasKey: true, strokes: [
      { id: 'a', color: '#ff375f', size: 0.008, pts: t },
      { id: 'b', color: '#64d2ff', size: 0.006, pts: u }
    ], chat: [
      { role: 'user', text: 'Bu akşam ikimiz için hafif bir komedi filmi önerir misin?' },
      { role: 'assistant', text: 'Tabii! Kısa ve keyifli bir şey isterseniz romantik komedi türünde, 90-100 dakikalık bir film iyi gider. Platformunuzu söylerseniz oradaki seçeneklerden üç tanesini sıralayayım.' }
    ] });
  }

  init();
})();
