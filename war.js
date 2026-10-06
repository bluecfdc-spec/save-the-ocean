// 바다 점령전 — 세력 3개(서지·게일·솔라)가 가상의 바다를 나눠 갖는 지도
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
  WAR.flagEmoji = cc => /^[A-Z]{2}$/.test(cc || '') ? '<img class="flag" alt="' + cc + '" src="' + (window.FLAG_BASE || 'https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/') + cc.toLowerCase() + '.svg">' : '';

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
    const sum = totals.reduce((a, t) => a + t.w, 0);
    if (!sum) return owner;
    const q = totals.map(t => { const x = t.w / sum * N; return { f: t.f, n: Math.floor(x), r: x - Math.floor(x), has: t.w > 0 }; });
    let left = N - q.reduce((a, b) => a + b.n, 0);
    q.slice().sort((a, b) => b.r - a.r).forEach(o => { if (left > 0) { o.n++; left--; } });
    q.forEach(o => { if (o.has && o.n === 0) { const big = q.slice().sort((a, b) => b.n - a.n)[0]; big.n--; o.n = 1; } });
    const order = q.map(o => { const h = WAR.byId(o.f).home; return SEEDS.map((s, i) => [i, Math.hypot((s[0] - h[0]) * 1.6, s[1] - h[1])]).sort((a, b) => a[1] - b[1]).map(a => a[0]); });
    let moved = true;
    while (moved) { moved = false; q.forEach((o, k) => { if (o.n <= 0) return; const i = order[k].find(j => !owner[j]); if (i === undefined) return; owner[i] = o.f; o.n--; moved = true; }); }
    return owner;
  };

  WAR.draw = async function (canvas, totals, hFix) {
    const bg = await mapImg; await WAR.assets;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = canvas.clientWidth || 320, h = Math.round(hFix || w * GH / GW);
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
    const sum = (totals || []).reduce((a, t) => a + t.w, 0);
    const s = Math.max(30, Math.min(w * 0.155, h * 0.36)), fs = Math.max(12, Math.min(w * 0.046, h * 0.12));   // 세력 문장은 큼직하게
    WAR.FACTIONS.forEach(f => {
      // 문장과 % 글자가 지도 밖으로 잘리지 않게 위아래를 맞춘다
      const x = f.home[0] * w, y = Math.max(s / 2 + 3, Math.min(f.home[1] * h, h - s / 2 - fs - 5));
      c.save(); c.shadowColor = f.color; c.shadowBlur = s * 0.35; if (f.im) c.drawImage(f.im, x - s / 2, y - s / 2, s, s); c.restore();
      c.save(); c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 5; if (f.im) c.drawImage(f.im, x - s / 2, y - s / 2, s, s); c.restore();
      if (sum) { const tt = (totals.find(t => t.f === f.id) || {}).w || 0; c.font = '800 ' + fs + 'px Orbitron, system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; const txt = Math.round(tt / sum * 100) + '%'; c.strokeText(txt, x, y + s / 2 + fs); c.fillStyle = '#fff'; c.fillText(txt, x, y + s / 2 + fs); }
    });
    // 애니메이션용: 지금 그린 정지 화면을 보관
    const keep = document.createElement('canvas'); keep.width = canvas.width; keep.height = canvas.height; keep.getContext('2d').drawImage(canvas, 0, 0);
    const sig = (totals || []).map(t => t.f + ':' + Math.round((t.w || 0) / (sum || 1) * 100)).join(',');
    canvas._war = { base: keep, w, h, dpr, owner, sum, totals: totals || [], sig, ships: canvas._war && canvas._war.sig === sig && canvas._war.w === w ? canvas._war.ships : null, shots: canvas._war && canvas._war.sig === sig ? canvas._war.shots : [], fx: [] };
  };

  // ---------- 지도 위 함대 애니메이션 (장식용: 점수와 무관) ----------
  //  세력마다 점유율에 따라 1~3척이 자기 해역을 돌며 서로 포격한다. 맞으면 불꽃이 튀고, 가끔 침몰했다가 다시 나타난다.
  const ownerAt = (st, u, v) => { if (u < 0 || v < 0 || u >= 1 || v >= 1) return -1; return st.owner[cells()[Math.min(GH - 1, Math.floor(v * GH)) * GW + Math.min(GW - 1, Math.floor(u * GW))]]; };
  function findSpot(st, f, near) {
    const home = WAR.byId(f).home; let best = null, bs = -1e9;
    for (let i = 0; i < 70; i++) {
      const u = near ? near[0] + (Math.random() - 0.5) * 0.16 : 0.06 + Math.random() * 0.88, v = near ? near[1] + (Math.random() - 0.5) * 0.2 : 0.1 + Math.random() * 0.8;
      if (ownerAt(st, u, v) !== f) continue;
      if (Math.hypot((u - home[0]) * 1.6, v - home[1]) < 0.3) continue;                       // 세력 문장을 가리지 않게
      if ([[0.05, 0], [-0.05, 0], [0, 0.07], [0, -0.07]].some(o => ownerAt(st, u + o[0], v + o[1]) !== f)) continue;   // 경계선에서 조금 안쪽
      let sc = -Math.hypot(u - 0.5, v - 0.5) * (near ? 0 : 1) + Math.random() * 0.25;        // 전선(가운데) 쪽을 선호
      (st.ships || []).forEach(o => { const d = Math.hypot((u - o.x) * 1.6, v - o.y); if (d < 0.16) sc -= 2; });
      if (sc > bs) { bs = sc; best = [u, v]; }
    }
    return best;
  }
  function makeFleet(st) {
    st.ships = [];
    st.totals.forEach(t => {
      const share = st.sum ? t.w / st.sum : 0, n = share >= 0.4 ? 3 : share >= 0.24 ? 2 : share > 0 ? 1 : 0;
      for (let i = 0; i < n; i++) { const p = findSpot(st, t.f); if (p) st.ships.push({ f: t.f, x: p[0], y: p[1], ax: p[0], ay: p[1], tx: p[0], ty: p[1], ang: Math.random() * 6.28, hp: 2, cd: 0.5 + Math.random() * 2.5, sink: 0, born: 0, hit: 0 }); }
    });
  }
  function stepFleet(st, dt) {
    if (!st.ships) makeFleet(st);
    for (const s of st.ships) {
      if (s.sink > 0) {                                   // 침몰 중 → 잠시 뒤 다른 곳에서 다시 출항
        s.sink += dt;
        if (s.sink > 4.5) { const p = findSpot(st, s.f) || [s.ax, s.ay]; Object.assign(s, { x: p[0], y: p[1], ax: p[0], ay: p[1], tx: p[0], ty: p[1], hp: 2, sink: 0, born: 0, cd: 1 + Math.random() * 2 }); }
        continue;
      }
      s.born += dt; s.hit = Math.max(0, s.hit - dt);
      if (Math.hypot(s.tx - s.x, s.ty - s.y) < 0.012) { const p = findSpot(st, s.f, [s.ax, s.ay]); if (p) { s.tx = p[0]; s.ty = p[1]; } }
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy) || 1, sp = 0.022;
      s.x += dx / d * sp * dt; s.y += dy / d * sp * dt;
      let da = Math.atan2(dy * st.h, dx * st.w) - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ang += da * Math.min(1, dt * 2);
      s.cd -= dt;
      if (s.cd <= 0) {
        const foes = st.ships.filter(o => o.f !== s.f && o.sink === 0 && o.born > 0.6).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
        const tg = foes[Math.random() < 0.75 ? 0 : Math.floor(Math.random() * foes.length)];
        s.cd = 1.1 + Math.random() * 2.4;
        if (tg) {
          const hit = Math.random() < 0.34, mx = hit ? 0 : (Math.random() - 0.5) * 0.09, my = hit ? 0 : (Math.random() - 0.5) * 0.11;
          st.shots.push({ f: s.f, x0: s.x, y0: s.y, x1: tg.x + mx, y1: tg.y + my, t: 0, dur: 0.55 + Math.hypot(tg.x - s.x, tg.y - s.y) * 1.1, tg: hit ? tg : null });
          st.fx.push({ k: 'muzzle', x: s.x, y: s.y, t: 0, dur: 0.18 });
        }
      }
    }
    for (let i = st.shots.length - 1; i >= 0; i--) {
      const b = st.shots[i]; b.t += dt;
      if (b.t >= b.dur) {
        st.shots.splice(i, 1);
        if (b.tg && b.tg.sink === 0) { b.tg.hp--; b.tg.hit = 0.5; st.fx.push({ k: 'boom', x: b.x1, y: b.y1, t: 0, dur: 0.55 }); if (b.tg.hp <= 0) { b.tg.sink = 0.001; st.fx.push({ k: 'boom', x: b.x1, y: b.y1, t: 0, dur: 0.9, big: 1 }); } }
        else st.fx.push({ k: 'splash', x: b.x1, y: b.y1, t: 0, dur: 0.6 });
      }
    }
    for (let i = st.fx.length - 1; i >= 0; i--) { st.fx[i].t += dt; if (st.fx[i].t >= st.fx[i].dur) st.fx.splice(i, 1); }
  }
  function drawFleet(canvas, st) {
    const c = canvas.getContext('2d'), w = st.w, h = st.h, L = Math.max(17, Math.min(w * 0.078, h * 0.165));
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(st.base, 0, 0); c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    for (const s of st.ships || []) {
      const f = WAR.byId(s.f), x = s.x * w, y = s.y * h, sk = s.sink > 0 ? Math.min(1, s.sink / 1.6) : 0;
      if (s.sink > 1.6) { const k = (s.sink - 1.6) / 1.2; if (k < 1) { c.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - k)) + ')'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, L * (0.4 + k), 0, 6.283); c.stroke(); } continue; }
      c.save(); c.translate(x, y); c.rotate(s.ang + sk * 0.9); c.globalAlpha = Math.min(1, s.born / 0.6) * (1 - sk * 0.85); c.scale(1 - sk * 0.35, 1 - sk * 0.35);
      if (!sk) { c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-L * 0.5, -L * 0.12); c.lineTo(-L * 0.95, -L * 0.3); c.moveTo(-L * 0.5, L * 0.12); c.lineTo(-L * 0.95, L * 0.3); c.stroke(); }   // 항적
      c.shadowColor = f.color; c.shadowBlur = 6;
      c.beginPath(); c.moveTo(L * 0.55, 0); c.quadraticCurveTo(L * 0.3, -L * 0.27, -L * 0.42, -L * 0.22); c.lineTo(-L * 0.5, 0); c.lineTo(-L * 0.42, L * 0.22); c.quadraticCurveTo(L * 0.3, L * 0.27, L * 0.55, 0); c.closePath();
      c.fillStyle = s.hit > 0 ? '#fff' : '#cfd8e3'; c.fill(); c.shadowBlur = 0; c.lineWidth = 1; c.strokeStyle = '#0b1826'; c.stroke();
      c.fillStyle = f.color; c.fillRect(-L * 0.24, -L * 0.12, L * 0.4, L * 0.24);                      // 갑판(세력 색)
      c.fillStyle = '#0b1826'; c.beginPath(); c.arc(L * 0.27, 0, L * 0.055, 0, 6.283); c.arc(-L * 0.3, 0, L * 0.05, 0, 6.283); c.fill();   // 포탑
      c.restore();
      if (sk) { c.fillStyle = 'rgba(255,255,255,' + (0.6 * (1 - sk)) + ')'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + Math.sin(i * 2.1 + s.sink * 6) * L * 0.4, y - sk * L * 0.3 + Math.cos(i * 1.7) * L * 0.25, 1.4, 0, 6.283); c.fill(); } }
    }
    for (const b of st.shots) {
      const k = b.t / b.dur, x = (b.x0 + (b.x1 - b.x0) * k) * w, y = (b.y0 + (b.y1 - b.y0) * k) * h - Math.sin(k * Math.PI) * h * 0.07, f = WAR.byId(b.f);
      const k2 = Math.max(0, k - 0.12), x2 = (b.x0 + (b.x1 - b.x0) * k2) * w, y2 = (b.y0 + (b.y1 - b.y0) * k2) * h - Math.sin(k2 * Math.PI) * h * 0.07;
      c.strokeStyle = f.color; c.globalAlpha = 0.8; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x2, y2); c.lineTo(x, y); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(x, y, 1.9, 0, 6.283); c.fill();
    }
    for (const e of st.fx) {
      const k = e.t / e.dur, x = e.x * w, y = e.y * h;
      if (e.k === 'boom') { const r = L * (e.big ? 0.9 : 0.5) * (0.35 + k); const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,246,208,' + (1 - k) + ')'); g.addColorStop(0.4, 'rgba(255,179,71,' + (0.9 * (1 - k)) + ')'); g.addColorStop(1, 'rgba(255,90,40,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
        c.fillStyle = 'rgba(255,210,122,' + (1 - k) + ')'; for (let i = 0; i < (e.big ? 9 : 5); i++) { const a = i * 1.4 + (e.big ? 0.4 : 0), d = r * (0.5 + k * 1.3); c.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1, 2, 2); } }
      else if (e.k === 'splash') { c.strokeStyle = 'rgba(235,248,255,' + (0.8 * (1 - k)) + ')'; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, L * (0.12 + k * 0.38), 0, 6.283); c.stroke(); }
      else { c.fillStyle = 'rgba(255,240,190,' + (1 - k) + ')'; c.beginPath(); c.arc(x, y, L * 0.22 * (0.6 + k), 0, 6.283); c.fill(); }
    }
  }
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastTick = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - lastTick < 33 || document.hidden) return;                 // 초당 30장이면 충분
    const dt = Math.min(0.1, (now - lastTick) / 1000); lastTick = now;
    for (const el of mounts) {
      const cv = el.querySelector('.war-map'), st = cv && cv._war;
      if (!st || !st.sum || !cv.offsetParent || !cv.clientWidth) continue;   // 보이는 지도만
      stepFleet(st, dt); drawFleet(cv, st);
    }
  }
  if (!calm) requestAnimationFrame(tick);

  // 카드 하나(제목 + 지도 + 세력별 누적 점수)를 el 안에 만든다
  const mounts = []; let last;
  WAR.mount = function (el) {
    el.innerHTML = '<div class="war-title"></div><canvas class="war-map"></canvas><div class="war-rows"></div><div class="note war-note"></div>';
    mounts.push(el); paint(el);
  };
  function paint(el) {
    if (!el.clientWidth) return;   // 숨겨진 탭은 건너뜀
    const m = LB.warMonth(), sum = last ? last.reduce((a, t) => a + t.w, 0) : 0, mine = (LB.profile() || {}).faction;
    const title = el.querySelector('.war-title'), rows = el.querySelector('.war-rows'), cv = el.querySelector('.war-map'), note = el.querySelector('.war-note');
    title.textContent = t('war.title', { ym: m.y + '.' + String(m.m).padStart(2, '0') });
    rows.innerHTML = WAR.FACTIONS.map(f => {
      const row = last ? last.find(x => x.f === f.id) || {} : {}, tt = row.total || 0, w = row.w || 0;
      return '<div class="war-row' + (mine === f.id ? ' mine' : '') + '" style="--fc:' + f.color + '"><img src="' + f.icon + '" alt=""><div class="wr-txt"><b style="color:' + f.color + '">' + t('f.' + f.key) + '</b><span class="pct">' + (sum ? Math.round(w / sum * 100) + '%' : '–') + '</span><span class="pts">' + (last ? I18N.num(tt) : '…') + '</span></div></div>';
    }).join('');
    note.textContent = last === null ? t('war.fail') : '';
    // 지도는 탭 안에 남는 높이에 맞춰 크기를 정한다 (스크롤 없이 한 화면)
    const cs = getComputedStyle(el), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = el.clientWidth - padX, availH = el.clientHeight - padY - title.offsetHeight - rows.offsetHeight - note.offsetHeight - 18;   // 지도와 범례 사이 여백 포함
    cv.style.width = availW + 'px';
    WAR.draw(cv, last || [], Math.max(90, Math.min(availH > 60 ? availH : availW * GH / GW, availW * 0.8)));
  }
  WAR.repaint = () => mounts.forEach(paint);
  // 시즌은 3등분에서 시작: 세력마다 기본 점수(BASE)를 깔고, 올라온 점수만큼 전선이 밀린다
  const BASE = (window.STO_CONFIG || {}).WAR_BASE || 30000;
  WAR.refresh = async function () { last = await LB.warTotals(); if (last) last.forEach(x => { x.w = x.total + BASE; }); WAR.repaint(); return last; };
  window.addEventListener('resize', () => WAR.repaint());
  WAR.assets.then(() => WAR.repaint());   // 문장 그림이 늦게 로드돼도 목록 아이콘이 바뀌도록
  window.WAR = WAR;
})();
