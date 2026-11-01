/* Ev TV arayüzü: sinematik ana ekran, film rafları, çizim tahtası, asistan, kumanda ile gezinme. */
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
    url: '',
    lanUrl: '',
    walls: [],
    wallIdx: 0,
    media: { enabled: false, movies: [], shows: [] },
    details: {},
    detailItem: null,
    update: null,
    updateToasted: false
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

  GLYPHS.update = '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';

  var BUILTIN = {
    draw: { label: 'Çizim Tahtası', kicker: 'Birlikte çizin', sub: 'Telefonlarınızdan çizdiğiniz her çizgi burada anında görünür.' },
    assistant: { label: 'Asistan', kicker: 'Claude ile', sub: 'Film önerisi, tarif, merak ettiğin her şey. Mikrofon tuşuna bas ya da telefondan yaz.' },
    connect: { label: 'Telefonu Bağla', kicker: 'Ev ağı', sub: 'QR kodu okut; telefonun çizim kalemi, klavye ve ayar ekranı olsun.' },
    settings: { label: 'Ayarlar', kicker: 'Sistem', sub: 'Wi-Fi, ses, görüntü ve diğer Android ayarları.' },
    update: { label: 'Güncellemeler', kicker: 'Ev TV', sub: 'Yeni sürüm çıktığında tek tuşla, silmeden güncelle.' }
  };
  BUILTIN.connect.kicker = 'Her yerden';
  BUILTIN.connect.sub = 'QR kodu okut; telefonun çizim kalemi, klavye ve ayar ekranı olsun.';

  var REMOTE_BASE = 'https://ekatalox.com';
  var IDLE_MS = 5 * 60 * 1000; // ekran koruyucu

  function fetchJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // ------------------------------------------------------------ önizleme verisi (tarayıcıda)
  function svgUri(svg) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }

  function mockApps() {
    var list = [
      ['Video Dünyası', '#e50914', '#831010'], ['Müzik', '#1db954', '#0b5e2c'], ['Sinema+', '#0f79af', '#09324d'],
      ['Belgesel', '#f5a623', '#8a4b06'], ['Çocuk', '#ff6fb1', '#8c2a63'], ['Spor Canlı', '#2bd2ff', '#0b4d6b'],
      ['Haberler', '#e5e5ea', '#5a5a5f'], ['Oyunlar', '#bf5af2', '#4b1a66'], ['Podcast', '#ff9f0a', '#7a3b00'],
      ['Tarayıcı', '#64d2ff', '#1d5a73'], ['Dosyalar', '#ffd60a', '#6e5a00'], ['Kamera', '#30d158', '#0e5e2b']
    ];
    return list.map(function (a, i) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a[1] + '"/><stop offset="1" stop-color="' + a[2] + '"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="160" y="102" font-family="Helvetica,Arial" font-size="30" font-weight="700" fill="white" text-anchor="middle">' + a[0] + '</text></svg>';
      return { pkg: 'demo.app' + i, label: a[0], tv: true, banner: svgUri(svg) };
    });
  }

  function landscape(sky1, sky2, m1, m2, m3, sun) {
    return svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="' + sun + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + sun + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="1920" height="1080" fill="url(#s)"/><circle cx="1350" cy="520" r="420" fill="url(#g)"/><circle cx="1350" cy="520" r="70" fill="' + sun + '"/>' +
      '<path d="M0 700 L260 470 L520 640 L820 400 L1120 620 L1420 450 L1700 600 L1920 520 L1920 1080 L0 1080Z" fill="' + m1 + '"/>' +
      '<path d="M0 820 L340 640 L640 780 L980 600 L1300 790 L1600 660 L1920 760 L1920 1080 L0 1080Z" fill="' + m2 + '"/>' +
      '<path d="M0 940 L420 820 L860 930 L1260 840 L1920 960 L1920 1080 L0 1080Z" fill="' + m3 + '"/></svg>');
  }
  function mockWalls() {
    return [
      { hd: landscape('#1b2a4a', '#f2a65a', '#3b3f63', '#262844', '#14152a', '#ffd9a0'), credit: 'Önizleme manzarası — gerçek cihazda 4K fotoğraflar gelir' },
      { hd: landscape('#0b3d5c', '#7fc8d8', '#2f5d62', '#1e3f44', '#0f2426', '#ffffff'), credit: 'Önizleme manzarası' },
      { hd: landscape('#2a1145', '#ff7b54', '#4a2a5e', '#2c1a3d', '#160d20', '#ffe0b0'), credit: 'Önizleme manzarası' }
    ];
  }
  function mockMedia() {
    var cols = [['#5b1f45', '#ff375f'], ['#0b3d5c', '#64d2ff'], ['#2a1145', '#bf5af2'], ['#3b2a10', '#ff9f0a'], ['#0e3b2a', '#30d158'], ['#1b2a4a', '#5e5ce6']];
    function mk(type, n) {
      return cols.map(function (c, i) {
        var art = landscape(c[0], c[1], '#1c1c24', '#111118', '#08080c', '#ffffff');
        return {
          id: i + n, type: type, title: (type === 'movie' ? 'Örnek Film ' : 'Örnek Dizi ') + (i + 1),
          overview: 'Bu bir önizleme açıklamasıdır. Gerçek cihazda bu hafta Türkiye\'de en çok ilgi gören yapımlar, Türkçe özetleri ve 4K sahne görselleriyle burada görünür.',
          year: '2026', rating: (7 + i / 4).toFixed(1), backdrop: art, card: art
        };
      });
    }
    return { enabled: true, movies: mk('movie', 0), shows: mk('tv', 100) };
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
    apps.forEach(function (a) { if (picks.length < 5 && a.tv && picks.indexOf(a.pkg) < 0) picks.push(a.pkg); });
    return picks;
  }

  function appByPkg(pkg) {
    for (var i = 0; i < S.apps.length; i++) if (S.apps[i].pkg === pkg) return S.apps[i];
    return null;
  }

  function appTile(kind, data) {
    var el = document.createElement('div');
    el.className = 'tile app focusable';
    el.dataset.kind = kind;
    var art, label;
    if (kind === 'app') {
      el.dataset.pkg = data.pkg;
      label = data.label;
      if (data.banner) art = '<div class="art"><img class="banner" src="' + data.banner + '" alt=""></div>';
      else if (data.icon) art = '<div class="art"><img class="icon" src="' + data.icon + '" alt=""></div>';
      else art = '<div class="art"><span class="letter">' + esc(data.label.charAt(0)) + '</span></div>';
      if (S.favs.indexOf(data.pkg) >= 0) el.classList.add('is-fav');
    } else {
      label = BUILTIN[kind].label;
      art = '<div class="art c-' + kind + '">' + GLYPHS[kind] + '</div>';
    }
    var badge = (kind === 'update' && S.update && S.update.newer) ? '<span class="badge">YENİ</span>' : '';
    el.innerHTML = art + badge + '<div class="fav-dot"></div><div class="label">' + esc(label) + '</div>';
    return el;
  }

  function mediaTile(item, list, idx) {
    var el = document.createElement('div');
    el.className = 'tile media focusable';
    el.dataset.kind = 'media';
    el.dataset.list = list;
    el.dataset.idx = idx;
    el.dataset.mid = item.type + item.id;
    el.innerHTML = '<div class="art">' + (item.card ? '<img src="' + esc(item.card) + '" alt="" loading="lazy">' : '') +
      '<span class="rank">#' + (idx + 1) + '</span><div class="cap">' + esc(item.title) + '</div></div>';
    return el;
  }

  function focusKey(el) {
    if (!el || !el.dataset) return null;
    return { kind: el.dataset.kind, pkg: el.dataset.pkg || '', mid: el.dataset.mid || '', row: el.closest('.row') ? el.closest('.row').dataset.row : '' };
  }

  function row(id, title, sub, grid) {
    var r = document.createElement('div');
    r.className = 'row';
    r.dataset.row = id;
    r.innerHTML = (title ? '<h2 class="row-title">' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</h2>' : '') +
      (grid ? '<div class="grid"></div>' : '<div class="track-clip"><div class="track"></div></div>');
    return r;
  }

  function buildRows(keepFocus) {
    var prev = keepFocus ? focusKey(S.focus) : null;
    var rows = $('#rows');
    rows.innerHTML = '';

    var top = row('top', '', '', false), t = $('.track', top);
    t.appendChild(appTile('draw'));
    t.appendChild(appTile('assistant'));
    S.favs.forEach(function (pkg) { var a = appByPkg(pkg); if (a) t.appendChild(appTile('app', a)); });
    if (S.update && S.update.newer) t.appendChild(appTile('update'));
    rows.appendChild(top);

    if (S.media.movies && S.media.movies.length) {
      var mv = row('movies', 'Bu Hafta Popüler Filmler', 'Türkiye', false);
      S.media.movies.forEach(function (it, i) { $('.track', mv).appendChild(mediaTile(it, 'movies', i)); });
      rows.appendChild(mv);
    }
    if (S.media.shows && S.media.shows.length) {
      var sh = row('shows', 'Popüler Diziler', 'Türkiye', false);
      S.media.shows.forEach(function (it, i) { $('.track', sh).appendChild(mediaTile(it, 'shows', i)); });
      rows.appendChild(sh);
    }

    var all = row('all', 'Tüm Uygulamalar', 'OK\'a basılı tut: üst sıraya ekle / çıkar', true), g = $('.grid', all);
    S.apps.forEach(function (a) { g.appendChild(appTile('app', a)); });
    g.appendChild(appTile('connect'));
    g.appendChild(appTile('settings'));
    g.appendChild(appTile('update'));
    rows.appendChild(all);

    var foot = document.createElement('div');
    foot.className = 'attrib';
    foot.textContent = (S.media.movies && S.media.movies.length)
      ? 'Film ve dizi bilgileri TMDB\'den gelir. Bu ürün TMDB API\'sini kullanır ancak TMDB tarafından onaylanmamıştır. Manzara fotoğrafları: Bing.'
      : 'Manzara fotoğrafları: Bing.';
    rows.appendChild(foot);

    var target = null;
    if (prev) {
      target = $$('.tile', rows).filter(function (el) {
        var k = focusKey(el);
        return k.kind === prev.kind && k.pkg === prev.pkg && k.mid === prev.mid && k.row === prev.row;
      })[0] || null;
    }
    if (S.screen === 'home') setFocus(target || $('.row[data-row=top] .tile'));
    else S.lastHomeFocus = target || $('.row[data-row=top] .tile');
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
    buildRows(true);
  }

  function toggleFav(tile) {
    if (!tile || tile.dataset.kind !== 'app') return;
    var pkg = tile.dataset.pkg;
    var i = S.favs.indexOf(pkg);
    var a = appByPkg(pkg);
    if (i >= 0) { S.favs.splice(i, 1); toast((a ? a.label : 'Uygulama') + ' üst sıradan çıkarıldı'); }
    else { S.favs.push(pkg); toast((a ? a.label : 'Uygulama') + ' üst sıraya eklendi'); }
    save('favs', S.favs);
    buildRows(true);
  }

  // ------------------------------------------------------------ arka plan (Ken Burns)
  var BG = { cur: 0, src: '', kb: 0, timer: null, mode: 'wall', mediaTimer: null };

  function bgShow(src, onFail) {
    if (!src || src === BG.src) return;
    BG.src = src;
    var img = new Image();
    img.onload = function () {
      if (BG.src !== src) return;
      var layers = [$('#bgA'), $('#bgB')];
      var next = layers[1 - BG.cur], prev = layers[BG.cur];
      next.className = 'bg-layer';
      next.style.backgroundImage = 'url("' + src + '")';
      void next.offsetWidth; // animasyonu baştan başlat
      BG.kb = (BG.kb % 4) + 1;
      next.className = 'bg-layer on kb' + BG.kb;
      prev.classList.remove('on');
      BG.cur = 1 - BG.cur;
    };
    img.onerror = function () { if (BG.src === src) { BG.src = ''; if (onFail) onFail(); } };
    img.src = src;
  }

  function wallUrl(w) {
    var px = (window.screen && window.screen.width ? window.screen.width : 1920) * (window.devicePixelRatio || 1);
    return (px >= 3000 && w.uhd) ? w.uhd : (w.hd || w.uhd);
  }

  function showWall() {
    BG.mode = 'wall';
    document.body.classList.remove('media');
    if (!S.walls.length) return;
    var w = S.walls[S.wallIdx % S.walls.length];
    bgShow(wallUrl(w), nextWall);
    $('#credit').textContent = w.credit || w.title || '';
    clearTimeout(BG.timer);
    BG.timer = setTimeout(nextWall, document.body.classList.contains('saving') ? 20000 : 32000);
  }

  function nextWall() {
    if (!S.walls.length) return;
    S.wallIdx = (S.wallIdx + 1) % S.walls.length;
    if (BG.mode === 'wall') showWall();
  }

  function showMediaBg(item) {
    BG.mode = 'media';
    document.body.classList.add('media');
    clearTimeout(BG.timer);
    clearTimeout(BG.mediaTimer);
    // Hızlı gezinirken her kart için 4K görsel indirmesin
    BG.mediaTimer = setTimeout(function () { if (BG.mode === 'media') bgShow(item.backdrop || item.card); }, 380);
  }

  function setWalls(list) {
    var first = !S.walls.length;
    S.walls = list;
    if (first) S.wallIdx = 0;
    if (first && BG.mode === 'wall') showWall();
  }

  function loadWalls() {
    if (!A) { setWalls(mockWalls()); return; }
    var cached = load('walls', null);
    if (cached && cached.length) setWalls(cached);
    fetchJson(REMOTE_BASE + '/api/evtv/wallpapers').then(function (d) {
      if (d && d.images && d.images.length) { save('walls', d.images); setWalls(d.images); }
    }).catch(function () { /* önbellek yeter */ });
  }

  function loadMedia() {
    if (!A) { if (/demo/.test(location.hash)) { S.media = mockMedia(); buildRows(true); } return; }
    var cached = load('media', null);
    if (cached && cached.enabled) { S.media = cached; buildRows(true); }
    fetchJson(REMOTE_BASE + '/api/evtv/discover').then(function (d) {
      if (!d) return;
      S.media = d.enabled ? d : { enabled: false, movies: [], shows: [] };
      save('media', S.media);
      buildRows(true);
    }).catch(function () { /* önbellek yeter */ });
  }

  // Bir yapımın Türkiye'deki platformları + fragmanı (önbellekli)
  function loadDetails(item) {
    var key = item.type + item.id;
    if (S.details[key]) return Promise.resolve(S.details[key]);
    if (!A) {
      S.details[key] = { providers: ['Netflix', 'Disney Plus'], trailer: 'dQw4w9WgXcQ' };
      return Promise.resolve(S.details[key]);
    }
    return fetchJson(REMOTE_BASE + '/api/evtv/discover?type=' + item.type + '&id=' + item.id)
      .then(function (d) { S.details[key] = d; return d; })
      .catch(function () { return { providers: [], trailer: null }; });
  }

  // Platform adı → kutuda yüklü uygulama
  var PROVIDER_KEYS = {
    'amazon prime video': ['prime video', 'amazon'], 'disney plus': ['disney'], 'apple tv plus': ['apple tv'],
    'apple tv': ['apple tv'], 'hbo max': ['max', 'hbo'], 'max': ['max', 'hbo'], 'blutv': ['blutv', 'blu tv'],
    'tv+': ['tv+', 'tvplus'], 'youtube premium': ['youtube'], 'netflix basic with ads': ['netflix']
  };
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9+ ]/g, '').replace(/\s+/g, ' ').trim(); }
  function appForProvider(name) {
    var n = norm(name);
    var keys = PROVIDER_KEYS[n] || [n.split(' ')[0]];
    for (var i = 0; i < S.apps.length; i++) {
      var l = norm(S.apps[i].label);
      for (var j = 0; j < keys.length; j++) if (keys[j] && l.indexOf(keys[j]) >= 0) return S.apps[i];
    }
    return null;
  }

  // ------------------------------------------------------------ hero (seçili öğe tanıtımı)
  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : h < 22 ? 'İyi akşamlar' : 'İyi geceler';
  }

  function mediaItem(el) {
    var list = S.media[el.dataset.list] || [];
    return list[+el.dataset.idx] || null;
  }

  function metaHtml(item, details) {
    var parts = ['<span class="chip">' + (item.type === 'tv' ? 'DİZİ' : 'FİLM') + '</span>'];
    if (item.year) parts.push('<span>' + esc(item.year) + '</span>');
    if (item.rating) parts.push('<span><span class="star">★</span> ' + String(item.rating).replace('.', ',') + '</span>');
    if (details && details.providers && details.providers.length) {
      parts.push('<span>' + esc(details.providers.slice(0, 3).join(' · ')) + '</span>');
    }
    return parts.join('');
  }

  var heroTimer = null, heroKey = '';
  function setHero(key, kicker, title, metaH, sub) {
    if (key === heroKey) return;
    heroKey = key;
    var h = $('#hero');
    h.classList.add('swap');
    clearTimeout(heroTimer);
    heroTimer = setTimeout(function () {
      $('#heroKicker').textContent = kicker;
      $('#heroTitle').textContent = title;
      $('#heroMeta').innerHTML = metaH;
      $('#heroSub').textContent = sub;
      h.classList.remove('swap');
    }, 200);
  }

  function updateHero() {
    var el = S.focus;
    if (!el || S.screen !== 'home' || !el.dataset.kind) return;
    var kind = el.dataset.kind;
    if (kind === 'media') {
      var it = mediaItem(el);
      if (!it) return;
      showMediaBg(it);
      var list = el.dataset.list === 'shows' ? 'Bu hafta popüler dizi' : 'Bu hafta popüler film';
      setHero('m' + it.type + it.id, list + ' · #' + (+el.dataset.idx + 1), it.title, metaHtml(it, S.details[it.type + it.id]), it.overview);
      loadDetails(it).then(function (d) {
        if (S.focus === el) $('#heroMeta').innerHTML = metaHtml(it, d);
      });
      return;
    }
    if (BG.mode !== 'wall') showWall();
    if (kind === 'app') {
      var a = appByPkg(el.dataset.pkg) || { label: '' };
      setHero('a' + a.pkg, greeting(), a.label, '', '');
    } else {
      var b = BUILTIN[kind];
      var sub = b.sub;
      if (kind === 'assistant') {
        var last = S.chat.filter(function (m) { return m.role === 'assistant'; }).pop();
        if (last) sub = '“' + last.text + '”';
        else if (!S.hasKey) sub = 'Kurulum: Telefonu Bağla → Ayarlar sekmesinde Claude API anahtarını gir.';
      }
      if (kind === 'update' && S.update) {
        sub = S.update.newer ? 'Yeni sürüm hazır: v' + S.update.latest + ' (yüklü: v' + S.update.current + '). Açmak için OK.'
          : 'En güncel sürümü kullanıyorsun (v' + S.update.current + ').';
      }
      setHero('b' + kind + (kind === 'assistant' ? S.chat.length : '') + (kind === 'update' && S.update ? S.update.latest : ''), b.kicker, b.label, '', sub);
    }
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
      updateScroll();
      updateHero();
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
        if (main <= 4 || cross > r.height * 0.6) return;
        score = main + cross * 4;
      } else {
        main = dir === 'up' ? -dy : dy;
        cross = Math.abs(dx);
        if (main <= r.height * 0.4) return;
        // Raflar arasında önce en yakın satıra, sonra yatayda en yakına
        score = main * 3 + cross;
      }
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) setFocus(best);
  }

  // Satırı dikeyde, kutucuğu yatayda görünür tut
  function updateScroll() {
    var el = S.focus, rows = $('#rows');
    if (!el || !rows.contains(el)) return;
    var rowEl = el.closest('.row');
    var all = $$('.row', rows), idx = all.indexOf(rowEl);
    all.forEach(function (r, i) { r.classList.toggle('past', i < idx); });
    var y = rowEl.offsetTop;
    var grid = el.closest('.grid');
    if (grid) y += Math.max(0, el.offsetTop - 0);
    if (idx === 0) y = 0;
    rows.style.transform = 'translateY(' + (-y) + 'px)';
    document.body.classList.toggle('deep', !!grid);

    var track = el.closest('.track');
    if (track) {
      var clip = track.parentNode;
      var pad = parseFloat(getComputedStyle(clip).paddingLeft) || 0;
      var view = clip.clientWidth - pad * 2;
      var x = track._x || 0;
      var left = el.offsetLeft, right = left + el.offsetWidth;
      var maxX = Math.max(0, track.scrollWidth - view);
      if (left - x < 0) x = left;
      else if (right - x > view) x = right - view;
      x = Math.min(maxX, Math.max(0, x));
      track._x = x;
      track.style.transform = 'translateX(' + (-x) + 'px)';
    }
  }

  // ------------------------------------------------------------ ekranlar
  function show(name) {
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === name); });
    S.screen = name;
    var panel = name === 'draw' || name === 'assistant' || name === 'connect' || name === 'update';
    document.body.classList.toggle('panel', panel);
    document.body.classList.toggle('deep', false);
    if (name === 'home') {
      var f = S.lastHomeFocus && document.body.contains(S.lastHomeFocus) ? S.lastHomeFocus : $('.row[data-row=top] .tile');
      heroKey = '';
      setFocus(f);
      return;
    }
    if (panel && BG.mode !== 'wall') showWall();
    if (name === 'draw') boardChanged();
    if (name === 'assistant') renderChat();
    if (name === 'update') { renderUpdate(); checkUpdate(); }
    if (name !== 'detail') setFocus($('#' + name + ' .focusable'));
  }

  function openDetail(item) {
    S.detailItem = item;
    $('#dKicker').textContent = item.type === 'tv' ? 'Dizi' : 'Film';
    $('#dTitle').textContent = item.title;
    $('#dMeta').innerHTML = metaHtml(item, S.details[item.type + item.id]);
    $('#dSub').textContent = item.overview || 'Türkçe özet bulunmuyor.';
    $('#dNote').textContent = 'Platformlar yükleniyor…';
    showMediaBg(item);
    show('detail');
    renderDetailActions(item, null);
    loadDetails(item).then(function (d) {
      if (S.detailItem !== item) return;
      $('#dMeta').innerHTML = metaHtml(item, d);
      renderDetailActions(item, d);
    });
  }

  function renderDetailActions(item, d) {
    var box = $('#dActions');
    var html = '';
    var missing = [];
    if (d && d.trailer) html += '<button class="btn focusable" data-action="trailer" data-v="' + esc(d.trailer) + '">▶  Fragmanı İzle</button>';
    if (d && d.providers) {
      d.providers.forEach(function (p) {
        var app = appForProvider(p);
        if (app) html += '<button class="btn focusable" data-action="openApp" data-pkg="' + esc(app.pkg) + '">' + esc(app.label) + '\'te Aç</button>';
        else missing.push(p);
      });
    }
    html += '<button class="btn focusable" data-action="askAbout">✨  Asistana Sor</button>';
    html += '<button class="btn focusable" data-action="back">Geri</button>';
    box.innerHTML = html;
    var note = '';
    if (d) {
      if (!d.providers || !d.providers.length) note = 'Türkiye\'de abonelikle izlenebileceği bir platform bilgisi yok.';
      else if (missing.length) note = 'Türkiye\'de ayrıca: ' + missing.join(', ') + ' (kutuda yüklü değil)';
    }
    $('#dNote').textContent = d ? note : 'Platformlar yükleniyor…';
    if (S.screen === 'detail') setFocus($('#dActions .btn'));
  }

  function activate(el) {
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 150);
    var kind = el.dataset.kind, action = el.dataset.action;
    if (kind === 'app') {
      if (A) { if (!A.launch(el.dataset.pkg)) toast('Uygulama açılamadı'); }
      else toast((appByPkg(el.dataset.pkg) || {}).label + ' açılıyor (önizleme)');
    } else if (kind === 'media') {
      var it = mediaItem(el);
      if (it) openDetail(it);
    } else if (kind === 'draw' || kind === 'assistant' || kind === 'connect' || kind === 'update') {
      show(kind);
    } else if (kind === 'settings') {
      if (A) A.openSettings(); else toast('Android ayarları açılır');
    } else if (action === 'home' || action === 'back') {
      show('home');
    } else if (action === 'clearBoard') {
      if (A) A.clearBoard(); else onEvent({ type: 'clear' });
      toast('Tahta temizlendi');
    } else if (action === 'voice') {
      startVoice();
    } else if (action === 'resetChat') {
      if (A) A.resetAssistant(); else onEvent({ type: 'chatReset' });
    } else if (action === 'checkUpdate') {
      $('#updMsg').textContent = 'Kontrol ediliyor…';
      checkUpdate();
    } else if (action === 'doUpdate') {
      if (!S.update || !S.update.url) return;
      $('#updMsg').textContent = 'İndiriliyor…';
      $('#updBarWrap').hidden = false;
      $('#updBar').style.width = '0';
      if (A && A.startUpdate) A.startUpdate(S.update.url);
      else { tv.updateProgress(60); setTimeout(function () { tv.updateStatus(true, 'İndirildi. Ekrandaki onayda “Güncelle”ye bas.'); }, 500); }
    } else if (action === 'trailer') {
      openUrl('https://www.youtube.com/watch?v=' + el.dataset.v);
    } else if (action === 'openApp') {
      if (A) { if (!A.launch(el.dataset.pkg)) toast('Uygulama açılamadı'); } else toast('Uygulama açılır (önizleme)');
    } else if (action === 'askAbout') {
      var item = S.detailItem;
      if (!item) return;
      if (!S.hasKey) { toast('Önce telefondan API anahtarını gir'); return; }
      show('assistant');
      var q = '"' + item.title + '"' + (item.year ? ' (' + item.year + ')' : '') + ' ' + (item.type === 'tv' ? 'dizisi' : 'filmi') +
        ' hakkında spoiler vermeden kısaca bilgi ver; beğenirsek izleyebileceğimiz 3 benzer yapım öner.';
      if (A) A.ask(q); else onEvent({ type: 'chat', role: 'user', text: q });
    }
  }

  function openUrl(url) {
    if (A && A.openUrl) { if (!A.openUrl(url)) toast('Açılamadı'); }
    else toast('Açılır: ' + url);
  }

  function back() {
    if (S.screen === 'detail') { show('home'); return; }
    if (S.screen !== 'home') { show('home'); return; }
    var first = $('.row[data-row=top] .tile');
    if (S.focus !== first) setFocus(first);
  }

  function startVoice() {
    if (S.screen !== 'assistant') show('assistant');
    if (!S.hasKey) { toast('Önce telefondan API anahtarını gir'); return; }
    if (A) A.startVoice(); else toast('Mikrofon (önizlemede yok)');
  }

  // ------------------------------------------------------------ ekran koruyucu
  var idleTimer = null;
  function saving() { return document.body.classList.contains('saving'); }
  function poke() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startSaver, IDLE_MS);
  }
  function startSaver() {
    if (S.screen !== 'home' && S.screen !== 'detail') { poke(); return; }
    document.body.classList.add('saving');
    showWall();
    tick();
  }
  function stopSaver() {
    document.body.classList.remove('saving');
    if (S.screen === 'home') { heroKey = ''; updateHero(); }
    else if (S.screen === 'detail' && S.detailItem) showMediaBg(S.detailItem);
  }

  // ------------------------------------------------------------ tuşlar
  var okDownAt = 0, okTimer = null, okConsumed = false;
  var OK_KEYS = { 13: 1, 23: 1, 66: 1 };

  document.addEventListener('keydown', function (e) {
    poke();
    if (saving()) { e.preventDefault(); if (OK_KEYS[e.keyCode]) okDownAt = -1; stopSaver(); return; }
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
    if (okDownAt > 0 && !okConsumed) activate(S.focus);
    okDownAt = 0;
  });

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
    if (S.screen === 'home' && S.focus && S.focus.dataset.kind === 'assistant') updateHero();
  }

  // ------------------------------------------------------------ QR
  function renderQrs() {
    if (!S.url || typeof qrcode !== 'function') return;
    var qr = qrcode(0, 'M');
    qr.addData(S.url);
    qr.make();
    var svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $$('[data-qr]').forEach(function (el) { el.innerHTML = svg; });
    $('#connectUrl').textContent = S.url.replace(/^https?:\/\//, '').replace(/\?.*/, '');
  }

  // ------------------------------------------------------------ internet odası (Supabase Realtime)
  // Telefonlar ekatalox.com/tv?r=ODA sayfasından bu odaya bağlanır; ev ağı şart değil.
  // TV tek doğruluk kaynağıdır: telefonlar "cmd" gönderir, TV işleyip sonucu "ev" ile yayınlar.
  var R = { channel: null, room: '', ready: false, cfg: load('sbcfg', null), retry: null };
  var RELAY = { stroke: 1, remove: 1, clear: 1, chat: 1, chatError: 1, thinking: 1, chatReset: 1, config: 1 };

  function updateQrUrl() {
    S.url = (R.cfg && R.room) ? REMOTE_BASE + '/tv?r=' + R.room : S.lanUrl;
    renderQrs();
  }

  function startRemote() {
    if (!A || !R.room || R.channel || !window.supabase) return;
    var go = function (cfg) {
      if (R.channel || !cfg || !cfg.url || !cfg.key) return;
      var sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 50 } }
      });
      var ch = sb.channel('evtv-' + R.room, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'cmd' }, function (m) { onRemoteCmd(m.payload || {}); });
      ch.subscribe(function (status) {
        R.ready = status === 'SUBSCRIBED';
        if (R.ready) sendState();
      });
      R.channel = ch;
    };
    if (R.cfg) go(R.cfg);
    fetch(REMOTE_BASE + '/api/evtv/config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (cfg && cfg.url && cfg.key) {
          var first = !R.cfg;
          R.cfg = cfg; save('sbcfg', cfg);
          if (first) updateQrUrl();
          go(cfg);
        }
      })
      .catch(function () {
        clearTimeout(R.retry);
        R.retry = setTimeout(startRemote, 30000);
      });
  }

  function relay(ev) {
    if (!R.ready) return;
    R.channel.send({ type: 'broadcast', event: 'ev', payload: ev });
  }

  function onRemoteCmd(c) {
    if (c.type === 'hello') sendState();
    else if (A) A.remoteCmd(JSON.stringify(c));
  }

  // Durumu parça parça gönder (tek mesajı küçük tutmak için)
  function sendState() {
    if (!A || !R.ready) return;
    var st;
    try { st = JSON.parse(A.getState()); } catch (e) { return; }
    var strokes = st.strokes || [];
    st.strokes = [];
    st.lan = S.lanUrl;
    relay(st);
    var batch = [], size = 0;
    strokes.forEach(function (s) {
      batch.push(s);
      size += (s.pts ? s.pts.length : 0) * 8 + 80;
      if (size > 60000) { relay({ type: 'strokesBatch', strokes: batch }); batch = []; size = 0; }
    });
    if (batch.length) relay({ type: 'strokesBatch', strokes: batch });
  }


  // ------------------------------------------------------------ güncellemeler
  function checkUpdate() {
    if (A && A.checkUpdate) { A.checkUpdate(); return; }
    // Önizleme
    tv.updateInfo(JSON.stringify({ current: '1.2', latest: '1.3', newer: true, url: 'https://example.invalid/ev-tv.apk',
      notes: 'Önizleme: gerçek cihazda GitHub Releases notları burada görünür.' }));
  }

  function renderUpdate() {
    var u = S.update, btn = $('#updBtn');
    var cur = (A && A.getVersion) ? A.getVersion() : (u ? u.current : '');
    if (!u) {
      $('#updVer').textContent = 'Yüklü sürüm: v' + cur;
    } else if (u.newer) {
      $('#updVer').textContent = 'Yeni sürüm hazır: v' + u.latest + '  ·  yüklü: v' + u.current;
    } else {
      $('#updVer').textContent = 'En güncel sürümü kullanıyorsun (v' + u.current + ')';
    }
    $('#updNotes').textContent = u && u.newer ? (u.notes || '') : '';
    var show = !!(u && u.newer && u.url);
    btn.hidden = !show;
    btn.classList.toggle('focusable', show);
    if (S.screen === 'update' && S.focus && !visible(S.focus)) setFocus($('#update .focusable'));
    if (S.screen === 'update' && show && S.focus && S.focus.dataset.action !== 'doUpdate' && !S.updFocused) {
      S.updFocused = true; setFocus(btn);
    }
  }

  // ------------------------------------------------------------ saat
  function tick() {
    var d = new Date();
    var t = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    $('#time').textContent = t;
    $('#saverTime').textContent = t;
    $('#saverDate').textContent = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ------------------------------------------------------------ Android'den gelen çağrılar
  window.tv = {
    key: function (name) {
      poke();
      if (saving()) { stopSaver(); return; }
      if (name === 'back') back();
      else if (name === 'menu') { if (S.screen === 'home') toggleFav(S.focus); }
      else if (name === 'voice') startVoice();
    },
    home: function () {
      poke();
      if (saving()) stopSaver();
      show('home');
      setFocus($('.row[data-row=top] .tile'));
    },
    resumed: function () { poke(); loadApps(false); refreshConnect(); },
    appsChanged: function () { loadApps(true); },
    serverEvent: function (json) {
      var ev;
      try { ev = JSON.parse(json); } catch (e) { return; }
      onEvent(ev);
      if (RELAY[ev.type]) relay(ev);
    },
    updateInfo: function (json) {
      var d;
      try { d = JSON.parse(json); } catch (e) { return; }
      if (d.error) { $('#updMsg').textContent = d.error; return; }
      var had = S.update && S.update.newer;
      S.update = d;
      renderUpdate();
      if (d.newer && !had) {
        buildRows(true);
        if (!S.updateToasted) { S.updateToasted = true; toast('Yeni sürüm hazır: v' + d.latest + ' — Güncellemeler\'e git'); }
      }
    },
    updateProgress: function (pct) {
      $('#updBarWrap').hidden = false;
      $('#updBar').style.width = pct + '%';
      $('#updMsg').textContent = 'İndiriliyor… %' + pct;
    },
    updateStatus: function (ok, msg) {
      $('#updMsg').textContent = msg;
      if (!ok) $('#updBarWrap').hidden = true;
      toast(msg);
    },
    voiceResult: function (text) {
      if (text === null) toast('Bu cihazda ses tanıma yok. Telefondan yazabilirsin.');
      else if (text) A && A.ask(text);
    }
  };

  function refreshConnect() {
    if (A) {
      try {
        var info = JSON.parse(A.getConnectInfo());
        S.lanUrl = info.url; R.room = info.room || ''; S.hasKey = !!info.hasKey;
      } catch (e) { /* yok say */ }
    } else {
      S.lanUrl = 'http://192.168.1.50:8765/?k=onizleme';
      R.room = 'onizleme'; R.cfg = R.cfg || { preview: true };
    }
    updateQrUrl();
    startRemote();
  }

  // ------------------------------------------------------------ başlat
  function init() {
    tick();
    setInterval(tick, 10000);
    refreshConnect();
    loadApps(true);
    loadWalls();
    loadMedia();
    setInterval(loadWalls, 6 * 3600 * 1000);
    setInterval(loadMedia, 3600 * 1000);
    setTimeout(checkUpdate, 8000);
    setInterval(checkUpdate, 6 * 3600 * 1000);
    if (A) {
      try { onEvent(JSON.parse(A.getState())); } catch (e) { /* yok say */ }
    } else if (/demo/.test(location.hash)) {
      demo();
    }
    renderChat();
    poke();
    if (location.hash.indexOf('screen=') >= 0) show(location.hash.split('screen=')[1].split('&')[0]);
    if (location.hash.indexOf('saver') >= 0) startSaver();
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
      { role: 'assistant', text: 'Tabii! Kısa ve keyifli bir şey isterseniz romantik komedi türünde, 90-100 dakikalık bir film iyi gider.' }
    ] });
  }

  init();
})();
