/* Ev TV telefon sayfası: çizim, asistan, ayarlar. TV kutusundaki yerel sunucuyla konuşur. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  // Erişim kodu QR'daki adresten gelir; sonraki açılışlar için saklanır.
  var params = new URLSearchParams(location.search);
  var token = params.get('k') || store('k') || '';
  if (params.get('k')) store('k', params.get('k'));

  var me = store('who') || ('p' + Math.random().toString(36).slice(2, 8));
  store('who', me);

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem('evtv-' + k);
      localStorage.setItem('evtv-' + k, v);
    } catch (e) { return null; }
  }

  function api(path, body) {
    return fetch('/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': token },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('Hata ' + r.status));
        return j;
      });
    });
  }

  // ---------------------------------------------------------------- sekmeler
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab); });
      if (b.dataset.tab === 'draw') sizePad();
      if (b.dataset.tab === 'ask') { renderChat(); }
    });
  });

  // ---------------------------------------------------------------- çizim
  var COLORS = ['#ffffff', '#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#5e5ce6', '#bf5af2'];
  var SIZES = [0.004, 0.008, 0.016];
  var color = store('color') || COLORS[1];
  var size = parseFloat(store('size')) || SIZES[1];

  var colorsEl = $('#colors');
  COLORS.forEach(function (c) {
    var b = document.createElement('button');
    b.style.background = c;
    b.addEventListener('click', function () { color = c; store('color', c); markTools(); });
    b.dataset.c = c;
    colorsEl.appendChild(b);
  });
  var sizesEl = $('#sizes');
  SIZES.forEach(function (s, i) {
    var b = document.createElement('button');
    b.innerHTML = '<i style="width:' + (6 + i * 7) + 'px;height:' + (6 + i * 7) + 'px"></i>';
    b.addEventListener('click', function () { size = s; store('size', s); markTools(); });
    b.dataset.s = s;
    sizesEl.appendChild(b);
  });
  function markTools() {
    colorsEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.c === color); });
    sizesEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', parseFloat(b.dataset.s) === size); });
  }
  markTools();

  var pad = $('#pad'), ctx = pad.getContext('2d');
  var strokes = new Map();

  function sizePad() {
    var r = pad.getBoundingClientRect();
    if (!r.width) return;
    var dpr = window.devicePixelRatio || 1;
    pad.width = Math.round(r.width * dpr);
    pad.height = Math.round(r.height * dpr);
    redraw();
  }
  window.addEventListener('resize', sizePad);

  function drawSeg(s, from) {
    var p = s.pts, W = pad.width, H = pad.height, n = p.length / 2;
    if (!n) return;
    ctx.strokeStyle = ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(1, s.size * W);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (n === 1) {
      ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var st = Math.max(0, from - 1);
    ctx.beginPath();
    ctx.moveTo(p[st * 2] * W, p[st * 2 + 1] * H);
    for (var i = st + 1; i < n; i++) ctx.lineTo(p[i * 2] * W, p[i * 2 + 1] * H);
    ctx.stroke();
  }
  function redraw() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    strokes.forEach(function (s) { drawSeg(s, 0); });
  }

  // Kendi çizgilerimizi gönderme: noktalar biriktirilip ~40ms'de bir sırayla yollanır.
  var current = null, pending = [], counter = 0, sending = Promise.resolve(), flushTimer = null;

  function pointFrom(e) {
    var r = pad.getBoundingClientRect();
    var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    var y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  }

  function flush() {
    flushTimer = null;
    if (!current || !pending.length) return;
    var body = { id: current.id, who: me, color: current.color, size: current.size, pts: pending };
    pending = [];
    sending = sending.then(function () { return api('stroke', body); }).catch(function () { setStatus('bad', 'Bağlantı sorunu'); });
  }

  pad.addEventListener('pointerdown', function (e) {
    pad.setPointerCapture(e.pointerId);
    current = { id: me + '-' + Date.now().toString(36) + '-' + (counter++), who: me, color: color, size: size, pts: [] };
    strokes.set(current.id, current);
    addPoint(e);
  });
  pad.addEventListener('pointermove', function (e) {
    if (!current) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(addPoint);
  });
  function end() {
    if (!current) return;
    flush();
    current = null;
  }
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  function addPoint(e) {
    var p = pointFrom(e);
    var from = current.pts.length / 2;
    current.pts.push(p[0], p[1]);
    pending.push(p[0], p[1]);
    drawSeg(current, from);
    if (!flushTimer) flushTimer = setTimeout(flush, 40);
  }

  $('#undo').addEventListener('click', function () { api('undo', { who: me }); });
  $('#clear').addEventListener('click', function () {
    if (confirm('Tahta herkes için temizlensin mi?')) api('clear', {});
  });

  // ---------------------------------------------------------------- asistan
  var chat = [], thinking = false, hasKey = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderChat() {
    var box = $('#chat');
    var html = '';
    if (!chat.length && !thinking) {
      html = '<div class="empty">' + (hasKey
        ? 'Sorunu yaz, cevap hem burada hem TV\'de görünsün.'
        : 'Önce <b>Ayarlar</b> sekmesinden Claude API anahtarını gir.') + '</div>';
    }
    chat.forEach(function (m) { html += '<div class="msg ' + m.role + '">' + esc(m.text) + '</div>'; });
    if (thinking) html += '<div class="msg assistant typing">Düşünüyor…</div>';
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  var askText = $('#askText');
  askText.addEventListener('input', function () {
    askText.style.height = 'auto';
    askText.style.height = Math.min(120, askText.scrollHeight) + 'px';
  });
  askText.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#askForm').requestSubmit(); }
  });
  $('#askForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = askText.value.trim();
    if (!text || thinking) return;
    askText.value = '';
    askText.style.height = 'auto';
    $('#askBtn').disabled = true;
    api('ask', { text: text }).catch(function (err) {
      chat.push({ role: 'error', text: err.message });
      renderChat();
    }).then(function () { $('#askBtn').disabled = false; });
  });
  $('#resetChat').addEventListener('click', function () { api('chat/reset', {}); });

  // ---------------------------------------------------------------- ayarlar
  function showKeyState() {
    $('#keyState').textContent = hasKey ? 'Anahtar kayıtlı ✓ (değiştirmek için yenisini yapıştır)' : 'Henüz anahtar girilmedi.';
  }
  $('#saveKey').addEventListener('click', function () {
    var k = $('#apiKey').value.trim();
    if (!k) return;
    api('config', { apiKey: k }).then(function () {
      $('#apiKey').value = '';
      hasKey = true; showKeyState();
      alert('Kaydedildi. Asistan hazır!');
    }).catch(function (e) { alert(e.message); });
  });
  var nameEl = $('#name');
  nameEl.value = store('name') || '';
  nameEl.addEventListener('change', function () { store('name', nameEl.value.trim()); });

  // ---------------------------------------------------------------- canlı bağlantı
  function setStatus(cls, text) {
    var s = $('#status');
    s.className = 'status ' + cls;
    s.querySelector('span').textContent = text;
  }

  function onEvent(ev) {
    switch (ev.type) {
      case 'state':
        strokes.clear();
        (ev.strokes || []).forEach(function (s) { strokes.set(s.id, s); });
        if (current) strokes.set(current.id, current);
        chat = (ev.chat || []).slice();
        thinking = !!ev.thinking;
        hasKey = !!ev.hasKey;
        redraw(); renderChat(); showKeyState();
        break;
      case 'stroke': {
        if (ev.who === me) return; // kendi çizgimiz zaten ekranda
        var s = strokes.get(ev.id);
        if (!s) { s = { id: ev.id, who: ev.who, color: ev.color, size: ev.size, pts: [] }; strokes.set(ev.id, s); }
        var from = s.pts.length / 2;
        Array.prototype.push.apply(s.pts, ev.pts || []);
        drawSeg(s, from);
        break;
      }
      case 'remove': strokes.delete(ev.id); redraw(); break;
      case 'clear': strokes.clear(); redraw(); break;
      case 'chat':
        chat.push({ role: ev.role, text: ev.text });
        thinking = ev.role === 'user';
        renderChat();
        break;
      case 'chatError': thinking = false; chat.push({ role: 'error', text: ev.text }); renderChat(); break;
      case 'thinking': thinking = !!ev.value; renderChat(); break;
      case 'chatReset': chat = []; thinking = false; renderChat(); break;
      case 'config': hasKey = !!ev.hasKey; showKeyState(); renderChat(); break;
    }
  }

  function connect() {
    if (!token) { setStatus('bad', 'TV\'deki QR\'ı okut'); return; }
    var es = new EventSource('/api/events?k=' + encodeURIComponent(token));
    es.onopen = function () { setStatus('ok', 'TV\'ye bağlı'); };
    es.onmessage = function (m) { try { onEvent(JSON.parse(m.data)); } catch (e) { /* yok say */ } };
    es.onerror = function () { setStatus('bad', 'Yeniden bağlanıyor…'); };
  }

  sizePad();
  connect();
})();
