// 바다 점령전 — 세력 3개(파도·폭풍·태양)가 가상의 바다를 나눠 갖는 지도
//  · 그림 파일이 있으면 자동으로 사용: assets/seamap.jpg, assets/faction_wave.png, faction_storm.png, faction_sun.png
//  · 없으면 임시 도형으로 그립니다.
(function () {
  const WAR = {};
  WAR.FACTIONS = [
    { id: 1, key: 'wave', color: '#1FD1B8', rgb: [31, 209, 184], home: [0.13, 0.80], img: 'assets/faction_wave.png' },
    { id: 2, key: 'storm', color: '#8E5CF6', rgb: [142, 92, 246], home: [0.50, 0.14], img: 'assets/faction_storm.png' },
    { id: 3, key: 'sun', color: '#FFC531', rgb: [255, 197, 49], home: [0.87, 0.80], img: 'assets/faction_sun.png' }
  ];
  WAR.FLAGS = ['KR', 'JP', 'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'BR', 'IN'];
  WAR.byId = id => WAR.FACTIONS.find(f => f.id === Number(id)) || null;
  // 국기는 그림 파일로 표시 (PC 등 국기 이모지가 안 나오는 기기 대응)
  WAR.flagEmoji = cc => /^[A-Z]{2}$/.test(cc || '') ? '<img class="flag" alt="' + cc + '" src="https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/' + cc.toLowerCase() + '.svg">' : '';

  // 임시 문장 (그림이 오기 전까지)
  const GLYPH = {
    wave: '<path d="M4 10c2.5-3 5-3 8 0s5.5 3 8 0M4 15.5c2.5-3 5-3 8 0s5.5 3 8 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
    storm: '<path d="M13 3L6 13h5l-1 8 8-11h-5z" fill="#fff"/>',
    sun: '<circle cx="12" cy="12" r="4.2" fill="#fff"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
  };
  const svgUrl = f => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.5" fill="' + f.color + '" stroke="#fff" stroke-width="1"/>' + GLYPH[f.key] + '</svg>');
  const loadImg = (src, fallback) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => { if (fallback) { const fb = new Image(); fb.onload = () => res(fb); fb.onerror = () => res(null); fb.src = fallback; } else res(null); }; im.src = src; });
  WAR.FACTIONS.forEach(f => { f.icon = svgUrl(f); f.ready = loadImg(f.img, f.icon).then(im => { f.im = im; if (im && im.src.indexOf('data:') !== 0) f.icon = f.img; return im; }); });
  const mapImg = loadImg('assets/seamap.jpg');
  WAR.assets = Promise.all(WAR.FACTIONS.map(f => f.ready).concat(mapImg));

  // ---- 해역(셀) : 고정된 씨앗 40개 ----
  const COLS = 24, ROWS = 15, N = COLS * ROWS, GW = 352, GH = 220;
  let seed = 20261005; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const SEEDS = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) SEEDS.push([(c + 0.5 + (rnd() - 0.5) * 0.9) / COLS, (r + 0.5 + (rnd() - 0.5) * 0.9) / ROWS]);
  const ISLES = []; for (let i = 0; i < 7; i++) ISLES.push([0.1 + rnd() * 0.8, 0.12 + rnd() * 0.76, 0.02 + rnd() * 0.025]);
  let CELL = null;
  function cells() {
    if (CELL) return CELL;
    CELL = new Uint16Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      // 경계가 물결처럼 보이게 좌표를 살짝 흔든다
      const u = (x + 0.5) / GW + Math.sin(y * 0.11) * 0.006 + Math.sin(y * 0.31 + x * 0.07) * 0.003, v = (y + 0.5) / GH + Math.sin(x * 0.09) * 0.009 + Math.sin(x * 0.27 + y * 0.05) * 0.004;
      const gc = Math.floor(u * COLS), gr = Math.floor(v * ROWS);
      let best = 0, bd = 9;
      for (let r = gr - 2; r <= gr + 2; r++) for (let c = gc - 2; c <= gc + 2; c++) {
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        const i = r * COLS + c, dx = (u - SEEDS[i][0]) * 1.6, dy = v - SEEDS[i][1], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; }
      }
      CELL[y * GW + x] = best;
    }
    return CELL;
  }

  // 누적 점수 비율만큼 해역 배분 (각 세력은 본거지에서 가까운 해역부터)
  WAR.allocate = function (totals) {
    const owner = new Array(N).fill(0);
    const sum = totals.reduce((a, t) => a + t.total, 0);
    if (!sum) return owner;
    const q = totals.map(t => { const x = t.total / sum * N; return { f: t.f, n: Math.floor(x), r: x - Math.floor(x), has: t.total > 0 }; });
    let left = N - q.reduce((a, b) => a + b.n, 0);
    q.slice().sort((a, b) => b.r - a.r).forEach(o => { if (left > 0) { o.n++; left--; } });
    q.forEach(o => { if (o.has && o.n === 0) { const big = q.slice().sort((a, b) => b.n - a.n)[0]; big.n--; o.n = 1; } });
    const order = q.map(o => { const h = WAR.byId(o.f).home; return SEEDS.map((s, i) => [i, Math.hypot((s[0] - h[0]) * 1.6, s[1] - h[1])]).sort((a, b) => a[1] - b[1]).map(a => a[0]); });
    let moved = true;
    while (moved) { moved = false; q.forEach((o, k) => { if (o.n <= 0) return; const i = order[k].find(j => !owner[j]); if (i === undefined) return; owner[i] = o.f; o.n--; moved = true; }); }
    return owner;
  };

  WAR.draw = async function (canvas, totals) {
    const bg = await mapImg; await WAR.assets;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = canvas.clientWidth || 320, h = Math.round(w * GH / GW);
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
    const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) { const s = Math.max(w / bg.width, h / bg.height); c.drawImage(bg, (w - bg.width * s) / 2, (h - bg.height * s) / 2, bg.width * s, bg.height * s); }
    else {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d3558'); g.addColorStop(1, '#061c33'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    const owner = WAR.allocate(totals || []), cell = cells();
    const off = document.createElement('canvas'); off.width = GW; off.height = GH;
    const oc = off.getContext('2d'), im = oc.createImageData(GW, GH), d = im.data;
    // 격자선 없이: 세력 색을 반투명으로 입히고, 세력이 맞닿는 전선만 밝은 선으로
    const own = (x, y) => owner[cell[Math.min(GH - 1, Math.max(0, y)) * GW + Math.min(GW - 1, Math.max(0, x))]];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const p = (y * GW + x) * 4, o = own(x, y);
      const front = own(x + 1, y) !== o || own(x, y + 1) !== o || own(x - 1, y) !== o || own(x, y - 1) !== o;
      const near = !front && (own(x + 3, y) !== o || own(x - 3, y) !== o || own(x, y + 3) !== o || own(x, y - 3) !== o);
      if (front) { d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = 215; }
      else if (o) { const f = WAR.byId(o).rgb; d[p] = f[0]; d[p + 1] = f[1]; d[p + 2] = f[2]; d[p + 3] = near ? 150 : 88; }
      else { d[p + 3] = 0; }
    }
    oc.putImageData(im, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(off, 0, 0, w, h);
    if (!bg) { c.fillStyle = '#0a1522'; c.strokeStyle = 'rgba(190,225,255,.5)'; c.lineWidth = 1; ISLES.forEach(s => { c.beginPath(); c.ellipse(s[0] * w, s[1] * h, s[2] * w * 1.5, s[2] * w, s[0] * 9, 0, 6.3); c.fill(); c.stroke(); }); }
    const sum = (totals || []).reduce((a, t) => a + t.total, 0);
    WAR.FACTIONS.forEach(f => {
      const x = f.home[0] * w, y = f.home[1] * h, s = Math.max(26, w * 0.1);
      c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6; if (f.im) c.drawImage(f.im, x - s / 2, y - s / 2, s, s); c.restore();
      if (sum) { const tt = (totals.find(t => t.f === f.id) || {}).total || 0; c.font = '800 ' + Math.max(11, w * 0.04) + 'px Orbitron, system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; const txt = Math.round(tt / sum * 100) + '%'; c.strokeText(txt, x, y + s / 2 + w * 0.045); c.fillStyle = '#fff'; c.fillText(txt, x, y + s / 2 + w * 0.045); }
    });
  };

  // 카드 하나(제목 + 지도 + 세력별 누적 점수)를 el 안에 만든다
  const mounts = []; let last;
  WAR.mount = function (el) {
    el.innerHTML = '<h3 class="war-title"></h3><canvas class="war-map"></canvas><div class="war-rows"></div><div class="note war-note"></div>';
    mounts.push(el); paint(el);
  };
  function paint(el) {
    const m = LB.warMonth(), sum = last ? last.reduce((a, t) => a + t.total, 0) : 0, mine = (LB.profile() || {}).faction;
    el.querySelector('.war-title').textContent = t('war.title', { ym: m.y + '.' + String(m.m).padStart(2, '0') });
    WAR.draw(el.querySelector('.war-map'), last || []);
    el.querySelector('.war-rows').innerHTML = WAR.FACTIONS.map(f => {
      const tt = last ? (last.find(x => x.f === f.id) || {}).total || 0 : 0;
      return '<div class="war-row' + (mine === f.id ? ' mine' : '') + '"><img src="' + f.icon + '" alt=""><b style="color:' + f.color + '">' + t('f.' + f.key) + '</b><span class="pct">' + (sum ? Math.round(tt / sum * 100) + '%' : '–') + '</span><span class="pts">' + (last ? I18N.num(tt) : '…') + '</span></div>';
    }).join('');
    el.querySelector('.war-note').textContent = last === null ? t('war.fail') : last && !sum ? t('war.empty') : '';
  }
  WAR.repaint = () => mounts.forEach(paint);
  WAR.refresh = async function () { last = await LB.warTotals(); WAR.repaint(); return last; };
  window.addEventListener('resize', () => WAR.repaint());
  window.WAR = WAR;
})();
