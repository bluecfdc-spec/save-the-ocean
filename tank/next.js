/* TANK RUMBLE — 시험판 v5 '전진하는 전장' (2026-10-14)
   - 무한 플레이. 전장이 천천히 위로 밀려 올라가고, 아래에서 병사·벙커가 있는 새 땅이 계속 들어옴.
   - 손이 하는 일 = 울타리 조각(선 모양) Drag & Drop. 울타리는 병사 크기만큼 얇음(모래주머니).
   - 울타리로 둘러싸 '아래쪽 새 땅과 끊긴' 구역은 전부 점령 → 갇힌 병사 항복, 벙커 함락.
   - 놓은 울타리는 1.5초 동안 굳는 중 — 그새 병사가 닿으면 그 조각이 무너지고 ♥-1. ♥ 3개 다 잃으면 게임 오버.
   - 점수: 진군 거리 + 점령 땅 + 항복 병사 + 함락 벙커. 오래 갈수록 전장이 빨라지고 적이 많아짐.
   - 탱크는 스스로 다니며 울타리 밖 병사·벙커를 처리하는 도우미. 카드: 시작 + 점령 3번마다. */
(function () {
  'use strict';
  var COLS = 24, ROWS = 40, TRAY_H = 112;
  var RANGE = 3, BUNKER_HP = 5, SPAWN_MS = 12000, CARD_EVERY = 3, HARDEN_MS = 1500, LIVES = 3;
  var TANK_V = 3, UNIT_V = 4, SHOT_V = 7;
  var SHAPES = [   /* 울타리 조각: 선 모양만 (일자 · ㄱ자 · ㄷ자) */
    [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]],
    [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3]], [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]], [[3, 0], [3, 1], [3, 2], [3, 3], [0, 3], [1, 3], [2, 3]],
    [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [3, 1], [3, 0]], [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [3, 1], [3, 2]], [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [2, 2]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]]
  ];
  var FACCOL = { surge: '#4fd8ff', gale: '#c58bff', solar: '#ffd451' };
  function rnd(n) { return Math.floor(Math.random() * n); }
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'd_sandbag.png', 'm_up.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 'k_' + f + '_e2.png', 'k_' + f + '_e4.png', 's_' + f + '_frun1.png', 's_' + f + '_frun2.png', 's_' + f + '_fdead.png'); });
  for (var i = 1; i <= 8; i++) LIST.push('x_b' + i + '.png');
  LIST.forEach(function (n) { var im = new Image(); im.onload = function () { IM[n.replace(/\.(png|jpg)$/, '')] = im; }; im.src = 'assets/v2/' + n + '?v=6'; });

  // ---------- 화면 ----------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 0, H = 0, S = 16, OX = 0, BY = 0, HUD = 52, BOT = 54, TY = 0, TH = 0;
  var G = null, fac = 'solar', best = 0, last = performance.now();
  function layout() {
    var dpr = Math.min(3, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var avail = H - HUD - BOT - TRAY_H - 8;
    if (!G || G.over) { S = W / COLS; ROWS = Math.max(24, Math.min(60, Math.floor(avail / S))); }
    S = Math.min(W / COLS, avail / ROWS);
    OX = Math.floor((W - S * COLS) / 2); BY = HUD + 4; TY = BY + ROWS * S + 4; TH = H - BOT - TY;
  }
  window.addEventListener('resize', layout); layout();
  function px(x) { return OX + x * S; } function py(y) { return BY + (y - G.off) * S; }   // 전장이 위로 흐름 (off = 0~1)
  try { fac = localStorage.getItem('tank_fac') || 'solar'; best = +localStorage.getItem('tank_next_best') || 0; } catch (e) { }

  // ---------- 상태 ----------
  function newPiece() { return { cells: SHAPES[rnd(SHAPES.length)] }; }
  function row(v) { var r = []; for (var x = 0; x < COLS; x++) r.push(v); return r; }
  function start() {
    G = null; layout();
    var efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; });
    G = { t: 0, off: 0, dist: 0, score: 0, lives: LIVES, caps: 0, cardCaps: 0, kills: 0, fac: fac, efac: efs[rnd(2)], up: { rate: 0, dmg: 0, move: 0 },
      wall: [], build: [], pid: [], claim: [], pieceN: 0, bunkers: [], units: [], shots: [], lobs: [], fx: [],
      tank: { x: 12, y: Math.floor(ROWS * 0.45), path: [], ang: -Math.PI / 2, plan: 0, fireT: 0, lobT: 0, lock: null, lostAt: null },
      tray: [newPiece(), newPiece(), newPiece()], paused: false, over: false, drag: null, banner: null };
    for (var y = 0; y < ROWS; y++) { G.wall.push(row(0)); G.build.push(row(0)); G.pid.push(row(0)); G.claim.push(row(0)); }
    for (var b = 0; b < 2; b++) addBunker(Math.floor(ROWS * 0.55), ROWS - 4);
    G.bunkers.forEach(function (bk) { for (var k = 0; k < 3; k++) spawnUnit(bk); });
    G.nextBunkerRows = 9;
    setTimeout(showCards, 600);
  }
  function speed() { return Math.min(0.75, 0.22 + G.dist / 600); }   // 초당 몇 줄 흐르는지 (오래 갈수록 빨라짐)
  function spawnMs() { return Math.max(5000, SPAWN_MS - G.dist * 20); }
  function banner(t, col) { G.banner = { t: t, col: col || '#fff', at: G.t }; }
  function pop(t, x, y, col, big) { G.fx.push({ k: 'pop', t: t, x: x, y: y, col: col || '#fff', big: big, at: G.t }); }
  function inner(x, y) { return x >= 1 && x <= COLS - 2 && y >= 0 && y <= ROWS - 1; }
  function bunkerAt(x, y) { for (var i = 0; i < G.bunkers.length; i++) { var b = G.bunkers[i]; if (x >= b.x && x < b.x + 2 && y >= b.y && y < b.y + 2) return b; } return null; }
  function hard(x, y) { return G.wall[y][x] && !G.build[y][x]; }
  function solidU(x, y) { return !inner(x, y) || hard(x, y) || G.claim[y][x] || !!bunkerAt(x, y); }      // 병사: 굳은 울타리·내 땅·벙커는 못 지나감 (굳는 중 울타리는 지나감 = 위험)
  function solidT(x, y) { return !inner(x, y) || G.wall[y][x] || !!bunkerAt(x, y); }                    // 탱크: 울타리·벙커만 막힘

  // ---------- 놓기 ----------
  function cellBusy(x, y) {
    if (!inner(x, y) || y < 1 || y > ROWS - 2) return true;
    if (G.wall[y][x] || G.claim[y][x] || bunkerAt(x, y)) return true;
    var t = G.tank; if (Math.abs(t.x - (x + 0.5)) < 0.95 && Math.abs(t.y - (y + 0.5)) < 0.95) return true;
    for (var k = 0; k < G.units.length; k++) { var u = G.units[k]; if (Math.abs(u.x - (x + 0.5)) < 0.9 && Math.abs(u.y - (y + 0.5)) < 0.9) return true; }
    return false;
  }
  function canPlace(p, gx, gy) { for (var i = 0; i < p.cells.length; i++) if (cellBusy(gx + p.cells[i][0], gy + p.cells[i][1])) return false; return true; }
  function anyFit(p) { for (var y = 1; y < ROWS - 1; y++) for (var x = 1; x < COLS - 1; x++) if (canPlace(p, x, y)) return true; return false; }
  function place(i, gx, gy) {
    var p = G.tray[i], id = ++G.pieceN;
    p.cells.forEach(function (c) { var x = gx + c[0], y = gy + c[1]; G.wall[y][x] = 1; G.build[y][x] = G.t + HARDEN_MS; G.pid[y][x] = id; });
    G.tray[i] = null; if (!G.tray.some(Boolean)) G.tray = [newPiece(), newPiece(), newPiece()];
    sfx('place'); G.tank.plan = 0;
  }
  function collapse(id, x0, y0) {
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.pid[y][x] === id && G.build[y][x]) { G.wall[y][x] = 0; G.build[y][x] = 0; G.pid[y][x] = 0; G.fx.push({ k: 'crumble', x: x, y: y, at: G.t }); }
    G.lives--; G.shake = 12; sfx('boom', true); sfx('bad');
    pop('울타리 붕괴!', px(x0), py(y0), '#ff6a5a', true);
    if (G.lives <= 0) gameOver(); else banner('♥ ' + G.lives + '개 남음 — 병사가 없을 때 놓아라', '#ff8a7a');
  }
  function hardenTick() { var done = false; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.build[y][x] && G.t >= G.build[y][x]) { G.build[y][x] = 0; done = true; } if (done) { sfx('ding'); capture(); } }
  function capture() {                                     // 아래쪽 새 땅(맨 아랫줄)과 이어지지 않은 빈 땅 = 점령
    var open = [], q = []; for (var y = 0; y < ROWS; y++) open.push(row(0));
    for (var x = 1; x < COLS - 1; x++) if (!G.wall[ROWS - 1][x] && !G.claim[ROWS - 1][x]) { open[ROWS - 1][x] = 1; q.push([x, ROWS - 1]); }
    while (q.length) { var c = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var a = c[0] + d[0], b = c[1] + d[1]; if (a < 1 || a > COLS - 2 || b < 0 || b >= ROWS || open[b][a] || G.wall[b][a] || G.claim[b][a]) return; open[b][a] = 1; q.push([a, b]); }); }
    var got = 0, units = 0, bunk = 0, cx = 0, cy = 0;
    for (var y2 = 0; y2 < ROWS; y2++) for (var x2 = 1; x2 < COLS - 1; x2++) if (!open[y2][x2] && !G.wall[y2][x2] && !G.claim[y2][x2]) { G.claim[y2][x2] = 1; got++; cx += x2; cy += y2; G.fx.push({ k: 'claim', x: x2, y: y2, at: G.t + Math.random() * 250 }); }
    if (!got) return;
    G.units = G.units.filter(function (u) { var ux = Math.floor(u.x), uy = Math.floor(u.y); if (uy >= 0 && uy < ROWS && G.claim[uy][ux]) { units++; G.fx.push({ k: 'dead', x: u.x, y: u.y, at: G.t }); G.fx.push({ k: 'boom', x: u.x, y: u.y, at: G.t + Math.random() * 300, small: true }); return false; } return true; });
    G.bunkers = G.bunkers.filter(function (b) { if (G.claim[b.y] && (G.claim[b.y][b.x] || !open[b.y][b.x] && !G.wall[b.y][b.x])) { bunk++; G.fx.push({ k: 'ruin', x: b.x, y: b.y, at: G.t }); G.fx.push({ k: 'boom', x: b.x + 1, y: b.y + 1, at: G.t }); return false; } return true; });
    var pts = got * 5 + units * 150 + bunk * 600; G.score += pts; G.kills += units; G.caps++; G.cardCaps++;
    pop('점령! +' + pts + (units ? '  병사 ' + units + '명 항복' : '') + (bunk ? ' · 벙커 함락' : ''), W / 2, py(cy / got), units >= 3 ? '#ffe066' : '#9be37a', true);
    if (units >= 5) banner('대량 항복! ' + units + '명', '#ffe066');
    sfx('clear', 1 + Math.min(5, units)); if (units) setTimeout(function () { sfx('gain', 5); }, 300); G.shake = 4 + Math.min(10, units * 2); G.tank.plan = 0;
    if (G.cardCaps >= CARD_EVERY) { G.cardCaps -= CARD_EVERY; setTimeout(showCards, 500); }
  }

  // ---------- 전장 흐름 ----------
  function scrollRow() {                                    // 맨 윗줄이 빠져나가고 맨 아래에 새 땅
    ['wall', 'build', 'pid', 'claim'].forEach(function (k) { G[k].shift(); G[k].push(row(0)); });
    G.units.forEach(function (u) { u.y -= 1; }); G.units = G.units.filter(function (u) { return u.y > 0.5; });
    G.bunkers.forEach(function (b) { b.y -= 1; }); G.bunkers = G.bunkers.filter(function (b) { return b.y >= 0; });
    G.shots.forEach(function (s) { s.y -= 1; }); G.lobs.forEach(function (l) { l.sy -= 1; });
    G.fx.forEach(function (f) { if (f.y != null && f.k !== 'pop') f.y -= 1; });
    var t = G.tank; t.y -= 1; t.path.forEach(function (p) { p[1] -= 1; }); t.plan = 0;
    if (t.y < 1.5) { t.y = 1.5; if (G.wall[1][Math.floor(t.x)]) G.wall[1][Math.floor(t.x)] = 0; }   /* 탱크는 화면 밖으로 안 밀려남 */
    G.dist++; G.score += 10;
    if (--G.nextBunkerRows <= 0) { addBunker(ROWS - 4, ROWS - 3); G.nextBunkerRows = Math.max(4, 9 - Math.floor(G.dist / 40)); }   /* 새 땅에 벙커 (멀리 갈수록 자주) */
    if (Math.random() < Math.min(0.5, 0.12 + G.dist / 800)) spawnLoose();
  }
  function spawnLoose() { var x = 1 + rnd(COLS - 2), y = ROWS - 1; if (!solidU(x, y)) G.units.push({ x: x + 0.5, y: y + 0.5, a: -Math.PI / 2 + (Math.random() - 0.5), turn: G.t + 800, ph: Math.random() * 6 }); }

  // ---------- 적 ----------
  function addBunker(y0, y1) {
    var spots = [];
    for (var y = y0; y <= y1; y++) for (var x = 1; x < COLS - 2; x++) {
      if (solidU(x, y) || solidU(x + 1, y) || solidU(x, y + 1) || solidU(x + 1, y + 1) || G.wall[y][x] || G.wall[y][x + 1] || G.wall[y + 1][x] || G.wall[y + 1][x + 1]) continue;
      if (G.bunkers.some(function (b) { return Math.abs(b.x - x) < 4 && Math.abs(b.y - y) < 4; })) continue;
      spots.push([x, y]); }
    if (!spots.length) return; var s = spots[rnd(spots.length)]; G.bunkers.push({ x: s[0], y: s[1], hp: BUNKER_HP, spawn: G.t + 1500 + rnd(3000) });
  }
  function spawnUnit(b) {
    var opts = []; for (var y = b.y - 1; y <= b.y + 2; y++) for (var x = b.x - 1; x <= b.x + 2; x++) if (y >= 0 && y < ROWS && !solidU(x, y)) opts.push([x, y]);
    if (!opts.length) return; var o = opts[rnd(opts.length)];
    G.units.push({ x: o[0] + 0.5, y: o[1] + 0.5, a: Math.random() * 6.28, turn: G.t + 600 + Math.random() * 900, ph: Math.random() * 6 });
  }
  function moveUnits(dt) {
    var t = G.tank;
    for (var k = 0; k < G.units.length; k++) { var u = G.units[k];
      var dx = u.x - t.x, dy = u.y - t.y, d = Math.hypot(dx, dy);
      if (d < 4.5) u.a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
      else if (G.t > u.turn) { u.a += (Math.random() - 0.5) * 2.4; u.turn = G.t + 500 + Math.random() * 1100; }
      var step = UNIT_V * dt, nx = u.x + Math.cos(u.a) * step, ny = u.y + Math.sin(u.a) * step, r = 0.32;
      function free(x, y) { return !solidU(Math.floor(x - r), Math.floor(y - r)) && !solidU(Math.floor(x + r), Math.floor(y - r)) && !solidU(Math.floor(x - r), Math.floor(y + r)) && !solidU(Math.floor(x + r), Math.floor(y + r)); }
      var stuck = !free(u.x, u.y);
      if (stuck || free(nx, u.y)) u.x = Math.max(1.4, Math.min(COLS - 1.4, nx)); else u.a = Math.PI - u.a + (Math.random() - 0.5) * 0.6;
      if (stuck || free(u.x, ny)) u.y = Math.max(0.6, Math.min(ROWS - 0.4, ny)); else u.a = -u.a + (Math.random() - 0.5) * 0.6;
      u.ph += dt * 12;
      var ux = Math.floor(u.x), uy = Math.floor(u.y);
      if (uy >= 0 && uy < ROWS && G.wall[uy][ux] && G.build[uy][ux]) { collapse(G.pid[uy][ux], ux, uy); if (G.over) return; }
    }
  }

  // ---------- 탱크 ----------
  var DIST = null, PREV = null;
  function bfs(sx, sy) {
    var n = COLS * ROWS; if (!DIST || DIST.length !== n) { DIST = new Int32Array(n); PREV = new Int32Array(n); }
    DIST.fill(-1); if (sx < 0 || sy < 0 || sx >= COLS || sy >= ROWS) return; var q = new Int32Array(n), h = 0, tl = 0, s0 = sy * COLS + sx; DIST[s0] = 0; PREV[s0] = -1; q[tl++] = s0;
    while (h < tl) { var c = q[h++], cx = c % COLS, cy = (c / COLS) | 0, d = DIST[c];
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (v) { var x = cx + v[0], y = cy + v[1]; if (y < 1 || x < 0 || y >= ROWS || x >= COLS) return; var k = y * COLS + x; if (DIST[k] >= 0 || solidT(x, y)) return; DIST[k] = d + 1; PREV[k] = c; q[tl++] = k; }); }
  }
  function goalCell(tg) {
    if (tg.kind === 'u') { var ux = Math.floor(tg.ref.x), uy = Math.floor(tg.ref.y); if (uy < 0 || uy >= ROWS) return -1; var k = uy * COLS + ux; return DIST[k] >= 0 ? k : -1; }
    var b = tg.ref, best = -1; for (var y = b.y - 1; y <= b.y + 2; y++) for (var x = b.x - 1; x <= b.x + 2; x++) { if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue; var k2 = y * COLS + x; if (DIST[k2] >= 0 && (best < 0 || DIST[k2] < DIST[best])) best = k2; }
    return best;
  }
  function alive(tg) { return tg && (tg.kind === 'u' ? G.units.indexOf(tg.ref) >= 0 : G.bunkers.indexOf(tg.ref) >= 0); }
  function pickTarget() { var best = null, bd = 1e9;
    G.units.forEach(function (u) { var g = goalCell({ kind: 'u', ref: u }); if (g >= 0 && DIST[g] < bd) { bd = DIST[g]; best = { kind: 'u', ref: u }; } });
    if (!best) G.bunkers.forEach(function (b) { var g = goalCell({ kind: 'b', ref: b }); if (g >= 0 && DIST[g] < bd) { bd = DIST[g]; best = { kind: 'b', ref: b }; } });
    return best; }
  function planTank() {
    var t = G.tank, cx = Math.floor(t.x), cy = Math.floor(t.y); bfs(cx, cy); t.path = [];
    if (!alive(t.lock)) { t.lock = pickTarget(); t.lostAt = null; }
    if (!t.lock) return;
    var g = goalCell(t.lock);
    if (g < 0) { if (t.lostAt == null) t.lostAt = G.t; if (G.t - t.lostAt >= 3000) { var nt = pickTarget(); if (nt) { t.lock = nt; t.lostAt = null; g = goalCell(nt); } } if (g < 0) return; } else t.lostAt = null;
    var cur = g, s0 = cy * COLS + cx; while (cur >= 0 && cur !== s0) { t.path.unshift([cur % COLS, (cur / COLS) | 0]); cur = PREV[cur]; }
  }
  function moveTank(dt) {
    var t = G.tank; if (G.t > t.plan) { planTank(); t.plan = G.t + 300; }
    var v = TANK_V * (1 + 0.2 * G.up.move) * dt;
    if (t.path.length) { var n = t.path[0], gx = n[0] + 0.5, gy = n[1] + 0.5, dx = gx - t.x, dy = gy - t.y, d = Math.hypot(dx, dy);
      if (d < 0.05) t.path.shift(); else { var s = Math.min(v, d); t.x += dx / d * s; t.y += dy / d * s; t.ang = Math.atan2(dy, dx); } }
  }
  function los(x0, y0, x1, y1) { var d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 4); for (var i = 1; i < n; i++) { var x = Math.floor(x0 + (x1 - x0) * i / n), y = Math.floor(y0 + (y1 - y0) * i / n); if (y >= 0 && y < ROWS && G.wall[y][x]) return false; } return true; }
  function fire() {
    var t = G.tank, rate = 1 + 0.2 * G.up.rate;
    if (G.t > t.fireT) { var tgt = null, bd = 99;
      G.units.forEach(function (u) { var d = Math.hypot(u.x - t.x, u.y - t.y); if (d <= RANGE && d < bd && los(t.x, t.y, u.x, u.y)) { bd = d; tgt = u; } });
      if (tgt) { if (!t.lock || t.lock.ref !== tgt) { t.lock = { kind: 'u', ref: tgt }; t.lostAt = null; t.plan = 0; }
        var a = Math.atan2(tgt.y - t.y, tgt.x - t.x); G.shots.push({ x: t.x, y: t.y, vx: Math.cos(a) * SHOT_V, vy: Math.sin(a) * SHOT_V, life: RANGE / SHOT_V + 0.1 }); G.fx.push({ k: 'muzzle', x: t.x + Math.cos(a) * 0.9, y: t.y + Math.sin(a) * 0.9, at: G.t }); t.fireT = G.t + 1000 / rate; sfx('launch'); } }
    if (G.t > t.lobT) { var bt = null, bb = 99;
      G.bunkers.forEach(function (b) { var cx = Math.max(b.x, Math.min(b.x + 2, t.x)), cy = Math.max(b.y, Math.min(b.y + 2, t.y)), d = Math.hypot(cx - t.x, cy - t.y); if (d <= RANGE && d < bb) { bb = d; bt = b; } });
      if (bt) { G.lobs.push({ sx: t.x, sy: t.y, b: bt, t0: G.t, dur: 600 }); t.lobT = G.t + 1000; sfx('launch'); } }
  }
  function shotsStep(dt) {
    G.shots = G.shots.filter(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      var fx = Math.floor(s.x), fy = Math.floor(s.y); if (s.life <= 0 || !inner(fx, fy) || G.wall[fy][fx]) return false;
      for (var i = 0; i < G.units.length; i++) { var u = G.units[i]; if (Math.hypot(u.x - s.x, u.y - s.y) < 0.5) { G.units.splice(i, 1); G.kills++; G.score += 50; G.fx.push({ k: 'dead', x: u.x, y: u.y, at: G.t }); G.fx.push({ k: 'boom', x: u.x, y: u.y, at: G.t }); pop('+50', px(u.x), py(u.y) - S, '#ffb13d'); sfx('boom', false); return false; } }
      return true; });
    G.lobs = G.lobs.filter(function (l) { if (G.t - l.t0 < l.dur) return true; var b = l.b; if (G.bunkers.indexOf(b) < 0) return false;
      b.hp -= 1 + G.up.dmg; G.fx.push({ k: 'boom', x: b.x + 1, y: b.y + 1, at: G.t }); sfx('boom', true);
      if (b.hp <= 0) { G.bunkers.splice(G.bunkers.indexOf(b), 1); G.score += 500; G.fx.push({ k: 'ruin', x: b.x, y: b.y, at: G.t }); pop('벙커 파괴 +500', px(b.x + 1), py(b.y), '#9be37a', true); G.tank.plan = 0; }
      return false; });
  }

  // ---------- 진행 ----------
  function update(dt) {
    if (!G || G.over || G.paused) return;
    G.t += dt * 1000;
    G.off += speed() * dt; while (G.off >= 1) { G.off -= 1; scrollRow(); }
    G.bunkers.forEach(function (b) { if (G.t >= b.spawn) { b.spawn = G.t + spawnMs(); spawnUnit(b); } });
    moveUnits(dt); if (G.over) return; hardenTick(); moveTank(dt); fire(); shotsStep(dt);
    if (!G.fitAt || G.t > G.fitAt) { G.fitAt = G.t + 400; if (!G.tray.filter(Boolean).some(anyFit)) { G.noFit = (G.noFit || 0) + 1; if (G.noFit >= 5) { G.tray = [newPiece(), newPiece(), newPiece()]; G.noFit = 0; } } else G.noFit = 0; }
  }
  function gameOver() { G.over = true; sfx('over'); var nb = G.score > best; if (nb) { best = G.score; try { localStorage.setItem('tank_next_best', best); } catch (e) { } } setTimeout(function () { showEnd(nb); }, 1000); }

  // ---------- 카드 ----------
  var CARDS = [{ k: 'rate', name: '직선포 연사', desc: '발사 속도 +0.2배', max: 10, fmt: function (n) { return (1 + 0.2 * n).toFixed(1) + '배'; } },
    { k: 'dmg', name: '곡사포 화력', desc: '벙커 데미지 +1', max: 4, fmt: function (n) { return '데미지 ' + (1 + n); } },
    { k: 'move', name: '엔진 강화', desc: '이동 속도 +0.2배', max: 8, fmt: function (n) { return (1 + 0.2 * n).toFixed(1) + '배'; } }];
  function showCards() {
    if (!G || G.over) return; G.paused = true; G.drag = null; sfx('ultReady');
    var box = document.getElementById('cards'), list = document.getElementById('cardList'); list.innerHTML = '';
    CARDS.forEach(function (c) { var n = G.up[c.k], full = n >= c.max, el = document.createElement('button'); el.className = 'card' + (full ? ' full' : '');
      el.innerHTML = '<b>' + (full ? '최대 달성' : c.name) + '</b><span>' + (full ? '점수 +1000' : c.desc) + '</span><i>' + (full ? c.fmt(n) : c.fmt(n) + ' → ' + c.fmt(n + 1)) + '</i>';
      el.onclick = function () { if (full) G.score += 1000; else G.up[c.k]++; box.classList.add('hidden'); G.paused = false; sfx('ding'); if (!G.hinted) { G.hinted = true; banner('울타리로 병사를 둘러 가둬라!', '#ffe066'); } };
      list.appendChild(el); });
    box.classList.remove('hidden');
  }

  // ---------- 입력 ----------
  function slotRect(i) { var w = S * COLS / 3; return { x: OX + i * w, y: TY + 4, w: w, h: TH - 8 }; }
  function inR(r, p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function pieceWH(pc) { var w = 0, h = 0; pc.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); }); return [w, h]; }
  function dropCell(p) { var wh = pieceWH(G.tray[G.drag.i]), cx = p.x - wh[0] * S / 2, cy = p.y - 70 - wh[1] * S / 2; return { gx: Math.round((cx - OX) / S), gy: Math.round((cy - BY) / S + G.off) }; }
  cv.addEventListener('pointerdown', function (e) { if (!G || G.over || G.paused) return; var p = { x: e.clientX, y: e.clientY }; for (var i = 0; i < 3; i++) if (G.tray[i] && inR(slotRect(i), p)) { G.drag = { i: i, p: p }; sfx('pick'); return; } });
  cv.addEventListener('pointermove', function (e) { if (G && G.drag) G.drag.p = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', function (e) { if (!G || !G.drag) return; var p = { x: e.clientX, y: e.clientY }, d = dropCell(p), i = G.drag.i; G.drag = null; if (!G.over && !G.paused && canPlace(G.tray[i], d.gx, d.gy)) place(i, d.gx, d.gy); else if (p.y < TY) sfx('bad'); });

  // ---------- 그리기 ----------
  function cover(im, x, y, w, h, oy) { if (!im) return; var r = Math.max(w / im.width, h / im.height), dw = im.width * r, dh = im.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); var y0 = y + (h - dh) / 2 - (oy || 0) % dh; ctx.drawImage(im, x + (w - dw) / 2, y0, dw, dh); ctx.drawImage(im, x + (w - dw) / 2, y0 + dh, dw, dh); ctx.restore(); }
  function fit(im, cx, cy, w, h, a) { if (!im) return; var r = Math.min(w / im.width, h / im.height); ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.drawImage(im, cx - im.width * r / 2, cy - im.height * r / 2, im.width * r, im.height * r); ctx.restore(); }
  function text(t, x, y, size, col, align) { ctx.save(); ctx.font = size + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); ctx.restore(); }
  function fence(x, y, a, ghost) {                          // 모래주머니 울타리 한 칸
    var X = px(x), Y = py(y); ctx.save(); if (a != null) ctx.globalAlpha = a;
    ctx.fillStyle = ghost ? 'rgba(255,230,150,.35)' : '#6b5838'; ctx.fillRect(X + 0.5, Y + 0.5, S - 1, S - 1);
    if (IM.d_sandbag) ctx.drawImage(IM.d_sandbag, X - S * 0.1, Y - S * 0.05, S * 1.2, S * 1.1);
    ctx.restore();
  }
  function draw(now) {
    ctx.clearRect(0, 0, W, H); cover(IM.bg_mine, 0, 0, W, H, G ? (G.dist + G.off) * S * 0.5 : 0);
    if (!G) return;
    var col = FACCOL[G.fac];
    ctx.save(); ctx.beginPath(); ctx.rect(OX, BY, S * COLS, S * ROWS); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(OX, BY, S, S * ROWS); ctx.fillRect(px(COLS - 1), BY, S, S * ROWS);
    // 내 땅
    ctx.fillStyle = col; ctx.globalAlpha = 0.3; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.claim[y][x]) ctx.fillRect(px(x), py(y), S + 0.5, S + 0.5); ctx.globalAlpha = 1;
    // 격자
    ctx.strokeStyle = 'rgba(255,230,170,.05)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (var gx = 1; gx <= COLS - 1; gx++) { ctx.moveTo(px(gx), BY); ctx.lineTo(px(gx), BY + S * ROWS); } for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(px(1), py(gy)); ctx.lineTo(px(COLS - 1), py(gy)); } ctx.stroke();
    ctx.strokeStyle = 'rgba(214,170,70,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px(1), BY); ctx.lineTo(px(1), BY + S * ROWS); ctx.moveTo(px(COLS - 1), BY); ctx.lineTo(px(COLS - 1), BY + S * ROWS); ctx.stroke();
    // 울타리
    for (var y3 = 0; y3 < ROWS; y3++) for (var x3 = 0; x3 < COLS; x3++) if (G.wall[y3][x3]) {
      if (G.build[y3][x3]) { var pr = 1 - (G.build[y3][x3] - G.t) / HARDEN_MS; fence(x3, y3, 0.35 + 0.3 * pr + 0.12 * Math.sin(now / 70)); ctx.strokeStyle = 'rgba(255,240,170,.95)'; ctx.lineWidth = 1; ctx.strokeRect(px(x3) + 0.5, py(y3) + 0.5, S - 1, S - 1); ctx.fillStyle = '#ffe066'; ctx.fillRect(px(x3) + 1, py(y3) + S - 3, (S - 2) * pr, 2); }
      else fence(x3, y3); }
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = canPlace(pc, d.gx, d.gy); pc.cells.forEach(function (c) { var X = d.gx + c[0], Y = d.gy + c[1]; if (X < 0 || X >= COLS || Y < 0 || Y >= ROWS) return; ctx.fillStyle = ok ? 'rgba(155,227,122,.55)' : 'rgba(255,90,70,.45)'; ctx.fillRect(px(X), py(Y), S, S); }); }
    // 벙커 · 병사 · 탱크
    var eb = IM['k_' + G.efac + '_e2'];
    G.bunkers.forEach(function (b) { fit(eb, px(b.x + 1), py(b.y + 1), S * 2.1, S * 2.2); var w = S * 1.8, hp = Math.max(0, b.hp) / BUNKER_HP; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(px(b.x + 1) - w / 2, py(b.y) - 4, w, 3); ctx.fillStyle = '#ff5a4a'; ctx.fillRect(px(b.x + 1) - w / 2, py(b.y) - 4, w * hp, 3); });
    G.units.forEach(function (u) { var f = Math.floor(u.ph) % 2 ? '_frun2' : '_frun1'; ctx.fillStyle = 'rgba(255,60,40,.35)'; ctx.beginPath(); ctx.ellipse(px(u.x), py(u.y) + S * 0.4, S * 0.42, S * 0.2, 0, 0, 7); ctx.fill(); fit(IM['s_' + G.efac + f], px(u.x), py(u.y) - S * 0.1, S, S * 1.2); });
    var t = G.tank; ctx.strokeStyle = 'rgba(255,230,120,.2)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(t.x), py(t.y), RANGE * S, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(px(t.x), py(t.y)); ctx.rotate(t.ang + Math.PI / 2); ctx.shadowColor = col; ctx.shadowBlur = 10; fit(IM['t_' + G.fac], 0, 0, S * 1.05, S * 1.2); ctx.restore();
    G.shots.forEach(function (s) { var tl = 1.4, tx0 = s.x - s.vx / SHOT_V * tl, ty0 = s.y - s.vy / SHOT_V * tl; var gr = ctx.createLinearGradient(px(tx0), py(ty0), px(s.x), py(s.y)); gr.addColorStop(0, 'rgba(255,200,80,0)'); gr.addColorStop(1, 'rgba(255,230,120,.95)'); ctx.strokeStyle = gr; ctx.lineWidth = Math.max(2, S * 0.22); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px(tx0), py(ty0)); ctx.lineTo(px(s.x), py(s.y)); ctx.stroke(); ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(px(s.x), py(s.y), Math.max(2, S * 0.24), 0, 7); ctx.fill(); });
    G.lobs.forEach(function (l) { var p = (G.t - l.t0) / l.dur, tx = l.b.x + 1, ty = l.b.y + 1, x = l.sx + (tx - l.sx) * p, yy = l.sy + (ty - l.sy) * p - Math.sin(p * Math.PI) * 2.2; fit(IM.m_up, px(x), py(yy), S * 0.8, S * 1.2); });
    G.fx = G.fx.filter(function (f) { var a = G.t - f.at; if (a < 0) return true;
      if (f.k === 'claim') { if (a > 500) return false; ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - a / 500)) + ')'; ctx.fillRect(px(f.x), py(f.y), S, S); return true; }
      if (f.k === 'crumble') { if (a > 600) return false; ctx.save(); ctx.globalAlpha = 1 - a / 600; ctx.fillStyle = '#ff6a5a'; ctx.fillRect(px(f.x) + 2, py(f.y) + 2 + a * a * 0.0001, S - 4, S - 4); ctx.restore(); return true; }
      if (f.k === 'boom') { if (a > 500) return false; var fr = Math.min(8, 1 + Math.floor(a / 500 * 8)), sz = S * (f.small ? 1.4 : 2.2); fit(IM['x_b' + fr], px(f.x), py(f.y) - sz * 0.15, sz, sz); return true; }
      if (f.k === 'dead') { if (a > 700) return false; fit(IM['s_' + G.efac + '_fdead'], px(f.x), py(f.y), S, S, 1 - a / 700); return true; }
      if (f.k === 'ruin') { if (a > 1200) return false; fit(IM['k_' + G.efac + '_e4'], px(f.x + 1), py(f.y + 1), S * 2.1, S * 2.1, 1 - a / 1200); return true; }
      if (f.k === 'muzzle') { if (a > 120) return false; ctx.fillStyle = 'rgba(255,240,170,' + (1 - a / 120) + ')'; ctx.beginPath(); ctx.arc(px(f.x), py(f.y), S * 0.5, 0, 7); ctx.fill(); return true; }
      if (f.k === 'pop') { if (a > 1300) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1300 - a) / 300); text(f.t, f.x, f.y - a * 0.03, f.big ? 21 : 16, f.col); ctx.restore(); return true; }
      return false; });
    // 위아래 가장자리 어둡게(흐르는 느낌)
    var gt = ctx.createLinearGradient(0, BY, 0, BY + S * 3); gt.addColorStop(0, 'rgba(0,0,0,.55)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gt; ctx.fillRect(OX, BY, S * COLS, S * 3);
    var gb = ctx.createLinearGradient(0, BY + S * (ROWS - 3), 0, BY + S * ROWS); gb.addColorStop(0, 'rgba(255,60,40,0)'); gb.addColorStop(1, 'rgba(255,60,40,.18)'); ctx.fillStyle = gb; ctx.fillRect(OX, BY + S * (ROWS - 3), S * COLS, S * 3);
    ctx.restore();
    // 위 HUD
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, HUD);
    for (var hI = 0; hI < LIVES; hI++) text(hI < G.lives ? '♥' : '♡', 16 + hI * 22, HUD / 2, 22, hI < G.lives ? '#ff5a4a' : '#665');
    text(G.score.toLocaleString(), W * 0.5, HUD / 2, 24, '#fff');
    text('진군 ' + G.dist + 'm', W - 10, HUD / 2 - 8, 15, col, 'right'); text('최고 ' + Math.max(best, G.score).toLocaleString(), W - 10, HUD / 2 + 10, 13, '#ffd451', 'right');
    // 트레이
    for (var i = 0; i < 3; i++) { var rc = slotRect(i); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(rc.x + 4, rc.y, rc.w - 8, rc.h); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.strokeRect(rc.x + 4, rc.y, rc.w - 8, rc.h);
      var pt = G.tray[i]; if (!pt || (G.drag && G.drag.i === i)) continue; var wh = pieceWH(pt), cs = Math.min(16, (rc.w - 16) / wh[0], (rc.h - 12) / wh[1]), ox = rc.x + (rc.w - wh[0] * cs) / 2, oy = rc.y + (rc.h - wh[1] * cs) / 2;
      pt.cells.forEach(function (c) { ctx.fillStyle = '#6b5838'; ctx.fillRect(ox + c[0] * cs, oy + c[1] * cs, cs - 1, cs - 1); if (IM.d_sandbag) ctx.drawImage(IM.d_sandbag, ox + c[0] * cs - cs * 0.1, oy + c[1] * cs, cs * 1.2, cs * 1.05); }); }
    if (G.drag && G.tray[G.drag.i]) { var pd = G.tray[G.drag.i], wh2 = pieceWH(pd), gx0 = G.drag.p.x - wh2[0] * S / 2, gy0 = G.drag.p.y - 70 - wh2[1] * S / 2; pd.cells.forEach(function (c) { ctx.fillStyle = 'rgba(107,88,56,.9)'; ctx.fillRect(gx0 + c[0] * S, gy0 + c[1] * S, S - 1, S - 1); if (IM.d_sandbag) ctx.drawImage(IM.d_sandbag, gx0 + c[0] * S - S * 0.1, gy0 + c[1] * S, S * 1.2, S * 1.05); }); }
    // 아래
    var by1 = H - BOT; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, by1, W, BOT);
    text('병사 ' + G.units.length + ' · 벙커 ' + G.bunkers.length + ' · 항복·처치 ' + G.kills, 12, by1 + BOT / 2 - 9, 15, '#ff9a8a', 'left');
    text('카드까지 점령 ' + (CARD_EVERY - G.cardCaps) + '번', 12, by1 + BOT / 2 + 10, 14, '#9be37a', 'left');
    text('연사 ' + (1 + 0.2 * G.up.rate).toFixed(1) + ' · 화력 ' + (1 + G.up.dmg) + ' · 속도 ' + (1 + 0.2 * G.up.move).toFixed(1), W - 12, by1 + BOT / 2, 14, '#ffe9a8', 'right');
    if (G.banner) { var ba = G.t - G.banner.at; if (ba > 1800) G.banner = null; else { ctx.save(); ctx.globalAlpha = Math.min(1, ba / 120) * Math.min(1, (1800 - ba) / 300); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, BY + S * 2 - 18, W, 36); text(G.banner.t, W / 2, BY + S * 2, 21, G.banner.col); ctx.restore(); } }
  }
  function loop() { var n = performance.now(), dt = Math.min(0.05, (n - last) / 1000); last = n; update(dt); if (G && G.shake > 0.3) { G.shake *= 0.9; ctx.save(); ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake); draw(n); ctx.restore(); } else draw(n); requestAnimationFrame(loop); }
  loop();

  // ---------- 시작/끝 화면 ----------
  var $ = function (id) { return document.getElementById(id); };
  function selFac(f) { fac = f; try { localStorage.setItem('tank_fac', f); } catch (e) { } document.querySelectorAll('.fac').forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); }); }
  document.querySelectorAll('.fac').forEach(function (b) { b.addEventListener('click', function () { selFac(b.dataset.f); sfx('click'); }); }); selFac(fac);
  $('go').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  function showEnd(nb) { var e = $('end'); e.classList.add('lose'); $('endT').textContent = 'GAME OVER'; $('endS').textContent = '진군 ' + G.dist + 'm'; $('endB').textContent = '최고 기록!'; $('endB').style.display = nb ? 'block' : 'none';
    $('endScore').textContent = '점수 ' + G.score.toLocaleString() + ' · 항복·처치 ' + G.kills; $('endBtn').textContent = '다시 하기'; e.classList.remove('hidden'); }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  window.__next = { get: function () { return G; }, start: start, place: place, canPlace: canPlace, capture: capture, spawn: spawnUnit, cards: showCards, scroll: scrollRow };
})();
