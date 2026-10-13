/* TANK RUMBLE — 새 규칙 시험판 v3 (2026-10-14, 홍균 설계 22개 항목)
   - 판 18×18 (예전보다 칸 두 배, 블록 작아짐). 손이 하는 일 = 블록 Drag & Drop 하나.
   - 전장에 적 벙커(2×2)가 임의로 생기고, 벙커마다 20초에 병력 1명 생산. 병력은 공격하지 않고 자유롭게 활보, 탱크를 피해 다님.
   - 병력·벙커·탱크가 있는 곳엔 블록을 못 놓음 → 병력이 늘수록 놓기 어려워짐.
   - 놓을 곳이 5초 넘게 없으면 5초 카운트다운 → 그때까지 못 놓으면 게임 오버.
   - 탱크는 스스로 움직이며 사냥: 사거리 3칸, 병력은 직선포(1방), 벙커는 곡사포(5방), 둘 다 1초에 1발. 플레이어는 블록으로 길을 막아 유도.
   - 줄 10개를 깰 때마다 멈추고 카드 3장 중 1장: 직선포 발사속도 +0.2배(최대 3배) / 곡사포 데미지 1→최대 5 / 이동속도 +0.2배(최대 2.6배). */
(function () {
  'use strict';
  var COLS = 24, ROWS = 40, TRAY_H = 112, BU = 2, UC = 11, UR = 19,   /* 블록 한 칸 = 2×2 작은 칸 (유닛 크기는 그대로) */   /* 칸 크기를 앞 버전의 3배로 (폰에서 한 칸 약 16px) */ RANGE = 3, BUNKER_HP = 5, SPAWN_MS = 20000, BUNKER_EVERY = 40000, BUNKER_MAX = 4, CARD_LINES = 3, STUCK_MS = 5000, COUNT_MS = 5000;
  var TANK_V = 3, UNIT_V = 4, SHOT_V = 7;   /* 직선포 탄 속도: 예전의 절반 */
  var SHAPES = [
    [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]],
    [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]]
  ];
  var TINT = ['#ffcf4a', '#4fd8ff', '#9be37a', '#ff8a5a', '#c58bff'];
  var FACCOL = { surge: '#4fd8ff', gale: '#c58bff', solar: '#ffd451' };
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'b_plain.png', 'm_up.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 'k_' + f + '_e2.png', 'k_' + f + '_e4.png', 's_' + f + '_frun1.png', 's_' + f + '_frun2.png', 's_' + f + '_fdead.png', 'f_' + f + '.png'); });
  for (var i = 1; i <= 8; i++) LIST.push('x_b' + i + '.png');
  LIST.forEach(function (n) { var im = new Image(); im.onload = function () { IM[n.replace(/\.(png|jpg)$/, '')] = im; }; im.src = 'assets/v2/' + n + '?v=6'; });

  // ---------- 화면 ----------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 0, H = 0, S = 20, OX = 0, BY = 0, HUD = 52, BOT = 54, TY = 0, TH = 0;
  function layout() {
    var dpr = Math.min(3, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var avail = H - HUD - BOT - TRAY_H - 8;
    if (!G || G.over) { S = W / COLS; ROWS = Math.max(24, Math.min(60, Math.floor(avail / S))); ROWS = 2 + 2 * Math.floor((ROWS - 2) / 2); UC = (COLS - 2) / 2; UR = (ROWS - 2) / 2; }   /* 새 판을 시작할 때 화면 높이에 맞춰 세로 줄 수를 정함 (빈 띠 없이) */
    S = Math.min(W / COLS, avail / ROWS);
    OX = Math.floor((W - S * COLS) / 2); BY = HUD + 4; TY = BY + ROWS * S + 4; TH = H - BOT - TY;
  }
  window.addEventListener('resize', layout); layout();
  function px(x) { return OX + x * S; } function py(y) { return BY + y * S; }

  // ---------- 상태 ----------
  var G = null, fac = 'solar', best = 0, last = performance.now();
  try { fac = localStorage.getItem('tank_fac') || 'solar'; best = +localStorage.getItem('tank_next_best') || 0; } catch (e) { }
  function newPiece() { return { cells: SHAPES[rnd(SHAPES.length)], tint: TINT[rnd(TINT.length)] }; }
  function start() {
    G = null; layout();
    var efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; });
    G = { t: 0, score: 0, combo: 0, lines: 0, cardLines: 0, fac: fac, efac: efs[rnd(2)], board: [], bunkers: [], units: [], shots: [], lobs: [], fx: [],
      tank: { x: 12.5, y: ROWS - 4.5, tx: 12, ty: ROWS - 5, lock: null, lostAt: null, path: [], ang: 0, plan: 0, fireT: 0, lobT: 0, target: null },
      up: { rate: 0, dmg: 0, move: 0 }, tray: [newPiece(), newPiece(), newPiece()], nextBunker: BUNKER_EVERY, noFit: null, count: null, paused: false, over: false, drag: null, banner: null, kills: 0 };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    G.ub = []; for (var uy = 0; uy < UR; uy++) { G.ub.push([]); for (var ux = 0; ux < UC; ux++) G.ub[uy].push(0); }
    addBunker(); setTimeout(showCards, 600);   /* 시작하자마자 첫 카드 */
  }
  function mins() { return G.t / 60000; }                        // 시간이 갈수록 빡빡해짐 (6분에 최대)
  function bunkerEvery() { return Math.max(16000, BUNKER_EVERY - mins() * 4000); }
  function bunkerMax() { return Math.min(10, BUNKER_MAX + Math.floor(mins())); }
  function spawnMs() { return Math.max(8000, SPAWN_MS - mins() * 2000); }
  function banner(t, col) { G.banner = { t: t, col: col || '#fff', at: G.t }; }
  function pop(t, x, y, col, big) { G.fx.push({ k: 'pop', t: t, x: x, y: y, col: col || '#fff', big: big, at: G.t }); }

  // ---------- 판 ----------
  function bunkerAt(x, y) { for (var i = 0; i < G.bunkers.length; i++) { var b = G.bunkers[i]; if (x >= b.x && x < b.x + 2 && y >= b.y && y < b.y + 2) return b; } return null; }
  function solid(x, y) { return x <= 0 || y <= 0 || x >= COLS - 1 || y >= ROWS - 1 || G.board[y][x] || bunkerAt(x, y); }   /* 4면 끝 줄은 배경 — 병력·탱크도 못 들어감 */   // 병력·탱크가 못 지나가는 칸
  var OCC = null;
  function buildOcc() {                                     // 블록을 못 놓는 칸 지도 (블록·벙커·탱크·병력) — 칸이 많아서 한 번에 계산해 둠
    var n = COLS * ROWS; if (!OCC || OCC.length !== n) OCC = new Uint8Array(n); else OCC.fill(0);
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) OCC[y * COLS + x] = 1;
    G.bunkers.forEach(function (b) { for (var y = b.y; y < b.y + 2; y++) for (var x = b.x; x < b.x + 2; x++) OCC[y * COLS + x] = 1; });
    function mark(cx, cy, r) { for (var y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) for (var x = Math.floor(cx - r); x <= Math.floor(cx + r); x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) OCC[y * COLS + x] = 1; }
    mark(G.tank.x, G.tank.y, 0.49); G.units.forEach(function (u) { mark(u.x, u.y, 0.42); });
  }
  function edge(x, y) { return x <= 0 || y <= 0 || x >= COLS - 1 || y >= ROWS - 1; }   // 전장 4면 맨 끝 줄 = 블록 못 놓음 (병력·탱크는 다닐 수 있음)
  function occupied(x, y) { if (edge(x, y)) return true; return OCC[y * COLS + x] === 1; }
  function uCell(u) { return 1 + u * BU; }                // 블록 칸 → 작은 칸 좌표
  function canPlace(p, gx, gy) { if (!OCC) buildOcc();     // gx, gy = 블록 칸(2×2) 좌표
    for (var i = 0; i < p.cells.length; i++) { var ux = gx + p.cells[i][0], uy = gy + p.cells[i][1]; if (ux < 0 || uy < 0 || ux >= UC || uy >= UR) return false;
      for (var dy = 0; dy < BU; dy++) for (var dx = 0; dx < BU; dx++) if (occupied(uCell(ux) + dx, uCell(uy) + dy)) return false; }
    return true; }
  function anyFit(p) { for (var y = 0; y < UR; y++) for (var x = 0; x < UC; x++) if (canPlace(p, x, y)) return true; return false; }
  function setU(ux, uy, v) { G.ub[uy][ux] = v; for (var dy = 0; dy < BU; dy++) for (var dx = 0; dx < BU; dx++) G.board[uCell(uy) + dy][uCell(ux) + dx] = v; }
  function place(i, gx, gy) {
    var p = G.tray[i]; p.cells.forEach(function (c) { setU(gx + c[0], gy + c[1], p.tint); });
    G.tray[i] = null; if (!G.tray.some(Boolean)) G.tray = [newPiece(), newPiece(), newPiece()];
    sfx('place'); G.score += p.cells.length * 2; G.noFit = null; G.count = null;
    if (!lineCheck()) G.combo = 0;
    G.tank.plan = 0;                                        // 길이 바뀌었으니 탱크가 다시 길을 찾음
  }
  function lineCheck() {
    var rows = [], cols = [], x, y, full;
    for (y = 0; y < UR; y++) { full = true; for (x = 0; x < UC; x++) if (!G.ub[y][x]) { full = false; break; } if (full) rows.push(y); }   /* 줄 = 블록 칸 기준 (가로 11칸) */
    for (x = 0; x < UC; x++) { full = true; for (y = 0; y < UR; y++) if (!G.ub[y][x]) { full = false; break; } if (full) cols.push(x); }
    var n = rows.length + cols.length; if (!n) return false;
    rows.forEach(function (y) { for (var x = 0; x < UC; x++) { if (G.ub[y][x]) G.fx.push({ k: 'cell', x: uCell(x), y: uCell(y), tint: G.ub[y][x], at: G.t }); setU(x, y, 0); } });
    cols.forEach(function (x) { for (var y = 0; y < UR; y++) { if (G.ub[y][x]) G.fx.push({ k: 'cell', x: uCell(x), y: uCell(y), tint: G.ub[y][x], at: G.t }); setU(x, y, 0); } });
    G.fx.push({ k: 'flash', rows: rows, cols: cols, at: G.t });
    G.combo++; var mult = Math.min(5, G.combo), pts = (n * 100 + (n - 1) * 100) * mult; G.score += pts;
    pop((mult > 1 ? 'COMBO ×' + mult + '  ' : '') + '+' + pts, px(COLS / 2), py(ROWS / 2), '#ffe066', true); sfx('clear', n + mult - 1);
    G.lines += n; G.cardLines += n;
    if (G.cardLines >= CARD_LINES) { G.cardLines -= CARD_LINES; setTimeout(showCards, 450); }
    return true;
  }

  // ---------- 적 ----------
  function addBunker() {
    if (G.bunkers.length >= bunkerMax()) return;
    var spots = [];
    for (var y = 0; y < ROWS - 1; y++) for (var x = 0; x < COLS - 1; x++) {
      if (solid(x, y) || solid(x + 1, y) || solid(x, y + 1) || solid(x + 1, y + 1)) continue;
      if (Math.hypot(x + 1 - G.tank.x, y + 1 - G.tank.y) < 7) continue;
      if (G.units.some(function (u) { return u.x > x - 0.5 && u.x < x + 2.5 && u.y > y - 0.5 && u.y < y + 2.5; })) continue;
      spots.push([x, y]); }
    if (!spots.length) return;
    var s = spots[rnd(spots.length)]; G.bunkers.push({ x: s[0], y: s[1], hp: BUNKER_HP, spawn: G.t + 3000 });
    G.fx.push({ k: 'ring', x: s[0] + 1, y: s[1] + 1, at: G.t }); banner('적 벙커 출현!', '#ff8a7a'); sfx('warn');
  }
  function spawnUnit(b) {
    var opts = []; for (var y = b.y - 1; y <= b.y + 2; y++) for (var x = b.x - 1; x <= b.x + 2; x++) if (!solid(x, y)) opts.push([x, y]);
    if (!opts.length) return; var o = opts[rnd(opts.length)], a = Math.random() * 6.28;
    G.units.push({ x: o[0] + 0.5, y: o[1] + 0.5, a: a, turn: G.t + 600 + Math.random() * 900, ph: Math.random() * 6 });
  }
  function moveUnits(dt) {
    var t = G.tank;
    G.units.forEach(function (u) {
      var dx = u.x - t.x, dy = u.y - t.y, d = Math.hypot(dx, dy);
      if (d < 4.5) u.a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;            // 탱크를 피해 달아남
      else if (G.t > u.turn) { u.a += (Math.random() - 0.5) * 2.4; u.turn = G.t + 500 + Math.random() * 1100; }
      var step = UNIT_V * dt, nx = u.x + Math.cos(u.a) * step, ny = u.y + Math.sin(u.a) * step, r = 0.36;
      function free(x, y) { return !solid(Math.floor(x - r), Math.floor(y - r)) && !solid(Math.floor(x + r), Math.floor(y - r)) && !solid(Math.floor(x - r), Math.floor(y + r)) && !solid(Math.floor(x + r), Math.floor(y + r)); }
      var stuck = !free(u.x, u.y);                                       /* 순간이동 없음: 막히면 방향만 바꿈 (혹시 끼어 있으면 걸어서 빠져나옴) */
      if (stuck || free(nx, u.y)) u.x = Math.max(1.4, Math.min(COLS - 1.4, nx)); else u.a = Math.PI - u.a + (Math.random() - 0.5) * 0.6;
      if (stuck || free(u.x, ny)) u.y = Math.max(1.4, Math.min(ROWS - 1.4, ny)); else u.a = -u.a + (Math.random() - 0.5) * 0.6;
      u.ph += dt * 12;
    });
  }
  function nearestFree(cx, cy) { for (var r = 1; r < 6; r++) for (var y = cy - r; y <= cy + r; y++) for (var x = cx - r; x <= cx + r; x++) if (!solid(x, y)) return [x, y]; return null; }

  // ---------- 탱크 (스스로 사냥) ----------
  var DIST = null, PREV = null;
  function bfs(sx, sy) {                                   // 탱크가 갈 수 있는 칸 전부 (블록·벙커는 못 지나감)
    var n = COLS * ROWS; if (!DIST || DIST.length !== n) { DIST = new Int32Array(n); PREV = new Int32Array(n); }
    DIST.fill(-1); var q = new Int32Array(n), h = 0, tl = 0, s0 = sy * COLS + sx; if (solid(sx, sy)) return; DIST[s0] = 0; PREV[s0] = -1; q[tl++] = s0;
    while (h < tl) { var c = q[h++], cx = c % COLS, cy = (c / COLS) | 0, d = DIST[c];
      if (cx > 0 && DIST[c - 1] < 0 && !solid(cx - 1, cy)) { DIST[c - 1] = d + 1; PREV[c - 1] = c; q[tl++] = c - 1; }
      if (cx < COLS - 1 && DIST[c + 1] < 0 && !solid(cx + 1, cy)) { DIST[c + 1] = d + 1; PREV[c + 1] = c; q[tl++] = c + 1; }
      if (cy > 0 && DIST[c - COLS] < 0 && !solid(cx, cy - 1)) { DIST[c - COLS] = d + 1; PREV[c - COLS] = c; q[tl++] = c - COLS; }
      if (cy < ROWS - 1 && DIST[c + COLS] < 0 && !solid(cx, cy + 1)) { DIST[c + COLS] = d + 1; PREV[c + COLS] = c; q[tl++] = c + COLS; } }
  }
  function goalCell(tg) {                                  // 목표가 지금 '갈 수 있는' 칸 (병력: 그 칸 / 벙커: 둘레 칸 중 가장 가까운 곳). 못 가면 -1
    if (tg.kind === 'u') { var k = Math.floor(tg.ref.y) * COLS + Math.floor(tg.ref.x); return DIST[k] >= 0 ? k : -1; }
    var b = tg.ref, best = -1; for (var y = b.y - 1; y <= b.y + 2; y++) for (var x = b.x - 1; x <= b.x + 2; x++) { if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue; var k2 = y * COLS + x; if (DIST[k2] >= 0 && (best < 0 || DIST[k2] < DIST[best])) best = k2; }
    return best;
  }
  function alive(tg) { return tg && (tg.kind === 'u' ? G.units.indexOf(tg.ref) >= 0 : G.bunkers.indexOf(tg.ref) >= 0); }
  function pickTarget() {                                  // 갈 수 있는 가장 가까운 병력, 없으면 벙커
    var best = null, bd = 1e9;
    G.units.forEach(function (u) { var k = Math.floor(u.y) * COLS + Math.floor(u.x); if (DIST[k] >= 0 && DIST[k] < bd) { bd = DIST[k]; best = { kind: 'u', ref: u }; } });
    if (!best) G.bunkers.forEach(function (b) { var g = goalCell({ kind: 'b', ref: b }); if (g >= 0 && DIST[g] < bd) { bd = DIST[g]; best = { kind: 'b', ref: b }; } });
    return best;
  }
  function planTank() {                                    // 한 번 노린 목표는 죽일 때까지 쫓아감. 길이 막히면 3초 기다렸다가 다른 목표로
    var t = G.tank, cx = Math.floor(t.x), cy = Math.floor(t.y); bfs(cx, cy); t.path = [];
    if (!alive(t.lock)) { t.lock = pickTarget(); t.lostAt = null; }
    if (!t.lock) return;
    var g = goalCell(t.lock);
    if (g < 0) { if (t.lostAt == null) t.lostAt = G.t; if (G.t - t.lostAt >= 3000) { var nt = pickTarget(); if (nt) { t.lock = nt; t.lostAt = null; g = goalCell(nt); } } if (g < 0) return; }
    else t.lostAt = null;
    var cur = g, s0 = cy * COLS + cx; while (cur >= 0 && cur !== s0) { t.path.unshift([cur % COLS, (cur / COLS) | 0]); cur = PREV[cur]; }
  }
  function moveTank(dt) {
    var t = G.tank; if (G.t > t.plan) { planTank(); t.plan = G.t + 300; }
    var v = TANK_V * (1 + 0.2 * G.up.move) * dt;
    if (t.path.length) { var n = t.path[0], gx = n[0] + 0.5, gy = n[1] + 0.5, dx = gx - t.x, dy = gy - t.y, d = Math.hypot(dx, dy);
      if (d < 0.05) { t.path.shift(); } else { var s = Math.min(v, d); t.x += dx / d * s; t.y += dy / d * s; t.ang = Math.atan2(dy, dx); } }
  }
  function los(x0, y0, x1, y1) { var d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 4); for (var i = 1; i < n; i++) { var x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (G.board[Math.floor(y)] && G.board[Math.floor(y)][Math.floor(x)]) return false; } return true; }
  function fire() {
    var t = G.tank, rate = 1 + 0.2 * G.up.rate;
    if (G.t > t.fireT) { var tgt = null, bd = 99;
      G.units.forEach(function (u) { var d = Math.hypot(u.x - t.x, u.y - t.y); if (d <= RANGE && d < bd && los(t.x, t.y, u.x, u.y)) { bd = d; tgt = u; } });
      if (tgt) { if (!t.lock || t.lock.ref !== tgt) { t.lock = { kind: 'u', ref: tgt }; t.lostAt = null; t.plan = 0; }   /* 지나가다 바로 맞출 수 있는 병력이 있으면 즉시 그쪽으로 록온 변경 */
        var a = Math.atan2(tgt.y - t.y, tgt.x - t.x); G.shots.push({ x: t.x, y: t.y, sx: t.x, sy: t.y, vx: Math.cos(a) * SHOT_V, vy: Math.sin(a) * SHOT_V, life: RANGE / SHOT_V + 0.1 }); G.fx.push({ k: 'muzzle', x: t.x + Math.cos(a) * 0.9, y: t.y + Math.sin(a) * 0.9, at: G.t }); t.fireT = G.t + 1000 / rate; t.aim = a; sfx('launch'); } }
    if (G.t > t.lobT) { var bt = null, bb = 99;
      G.bunkers.forEach(function (b) { var cx = Math.max(b.x, Math.min(b.x + 2, t.x)), cy = Math.max(b.y, Math.min(b.y + 2, t.y)), d = Math.hypot(cx - t.x, cy - t.y); if (d <= RANGE && d < bb) { bb = d; bt = b; } });
      if (bt) { G.lobs.push({ sx: t.x, sy: t.y, b: bt, t0: G.t, dur: 600 }); t.lobT = G.t + 1000; sfx('launch'); } }
  }
  function shotsStep(dt) {
    G.shots = G.shots.filter(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || solid(Math.floor(s.x), Math.floor(s.y))) return false;          // 블록에 막힘
      for (var i = 0; i < G.units.length; i++) { var u = G.units[i]; if (Math.hypot(u.x - s.x, u.y - s.y) < 0.5) { G.units.splice(i, 1); G.kills++; G.score += 50; G.fx.push({ k: 'dead', x: u.x, y: u.y, at: G.t }); G.fx.push({ k: 'boom', x: u.x, y: u.y, at: G.t }); G.fx.push({ k: 'hit', x: u.x, y: u.y, at: G.t }); pop('처치 +50', px(u.x), py(u.y) - S * 1.2, '#ffb13d', true); sfx('boom', true); return false; } }
      return true; });
    G.lobs = G.lobs.filter(function (l) { if (G.t - l.t0 < l.dur) return true; var b = l.b; if (G.bunkers.indexOf(b) < 0) return false;
      b.hp -= 1 + G.up.dmg; G.fx.push({ k: 'boom', x: b.x + 1, y: b.y + 1, at: G.t }); sfx('boom', true);
      if (b.hp <= 0) { G.bunkers.splice(G.bunkers.indexOf(b), 1); G.score += 500; G.fx.push({ k: 'ruin', x: b.x, y: b.y, at: G.t }); pop('벙커 파괴 +500', px(b.x + 1), py(b.y), '#9be37a', true); banner('적 벙커 파괴!', '#9be37a'); G.tank.plan = 0; }
      return false; });
  }

  // ---------- 진행 ----------
  function update(dt) {
    if (!G || G.over || G.paused) return;
    G.t += dt * 1000;
    if (G.t >= G.nextBunker) { G.nextBunker = G.t + bunkerEvery(); addBunker(); }
    if (!G.bunkers.length && G.t > G.nextBunker - bunkerEvery() + 4000) { G.nextBunker = G.t + bunkerEvery(); addBunker(); }
       /* 벙커가 다 없어지면 곧 새 벙커 */
    G.bunkers.forEach(function (b) { if (G.t >= b.spawn) { b.spawn = G.t + spawnMs(); spawnUnit(b); } });
    moveUnits(dt); moveTank(dt); fire(); shotsStep(dt); buildOcc();
    // 놓을 곳 검사 (0.2초마다)
    if (!G.fitCheck || G.t > G.fitCheck) { G.fitCheck = G.t + 200; var ok = G.tray.filter(Boolean).some(anyFit);
      if (ok) { if (!G.count) G.noFit = null; } else if (G.noFit == null) G.noFit = G.t;
      if (!G.count && G.noFit != null && G.t - G.noFit >= STUCK_MS) { G.count = G.t; banner('놓을 곳이 없다! 5초 안에 놓아라', '#ff6a5a'); } }
    if (G.count) { var sec = Math.ceil((COUNT_MS - (G.t - G.count)) / 1000); if (sec !== G.cdSec) { G.cdSec = sec; if (sec > 0) sfx('warn'); } if (G.t - G.count >= COUNT_MS) gameOver(); }
  }
  function gameOver() { G.over = true; sfx('over'); var nb = G.score > best; if (nb) { best = G.score; try { localStorage.setItem('tank_next_best', best); } catch (e) { } } setTimeout(function () { showEnd(nb); }, 900); }

  // ---------- 카드 ----------
  var CARDS = [{ k: 'rate', name: '직선포 연사', desc: '발사 속도 +0.2배', max: 10, fmt: function (n) { return (1 + 0.2 * n).toFixed(1) + '배'; } },
    { k: 'dmg', name: '곡사포 화력', desc: '벙커 데미지 +1', max: 4, fmt: function (n) { return '데미지 ' + (1 + n); } },   /* 데미지 1 → 최대 5 (벙커 5방 → 한 방) */
    { k: 'move', name: '엔진 강화', desc: '이동 속도 +0.2배', max: 8, fmt: function (n) { return (1 + 0.2 * n).toFixed(1) + '배'; } }];
  function showCards() {
    if (!G || G.over) return; G.paused = true; G.drag = null; sfx('ultReady');
    var box = document.getElementById('cards'), list = document.getElementById('cardList'); list.innerHTML = '';
    CARDS.forEach(function (c) { var n = G.up[c.k], full = n >= c.max, el = document.createElement('button'); el.className = 'card' + (full ? ' full' : '');
      el.innerHTML = '<b>' + (full ? '최대 달성' : c.name) + '</b><span>' + (full ? '점수 +1000' : c.desc) + '</span><i>' + (full ? c.fmt(n) : c.fmt(n) + ' → ' + c.fmt(n + 1)) + '</i>';
      el.onclick = function () { if (full) G.score += 1000; else G.up[c.k]++; box.classList.add('hidden'); G.paused = false; sfx('ding'); banner(full ? '+1000' : c.name + ' ' + c.fmt(G.up[c.k]), '#9be37a'); };
      list.appendChild(el); });
    box.classList.remove('hidden');
  }

  // ---------- 입력 (블록 놓기만) ----------
  function slotRect(i) { var w = S * COLS / 3; return { x: OX + i * w, y: TY + 4, w: w, h: TH - 8 }; }
  function inR(r, p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function pieceWH(pc) { var w = 0, h = 0; pc.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); }); return [w, h]; }
  function dropCell(p) { var U = S * BU, wh = pieceWH(G.tray[G.drag.i]), cx = p.x - wh[0] * U / 2, cy = p.y - 64 - wh[1] * U / 2; return { gx: Math.round((cx - px(1)) / U), gy: Math.round((cy - py(1)) / U) }; }
  cv.addEventListener('pointerdown', function (e) { if (!G || G.over || G.paused) return; var p = { x: e.clientX, y: e.clientY }; for (var i = 0; i < 3; i++) if (G.tray[i] && inR(slotRect(i), p)) { G.drag = { i: i, p: p }; sfx('pick'); return; } });
  cv.addEventListener('pointermove', function (e) { if (G && G.drag) G.drag.p = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', function (e) { if (!G || !G.drag) return; var p = { x: e.clientX, y: e.clientY }, d = dropCell(p), i = G.drag.i; G.drag = null; if (!G.over && !G.paused && canPlace(G.tray[i], d.gx, d.gy)) place(i, d.gx, d.gy); else if (p.y < TY) sfx('bad'); });

  // ---------- 그리기 ----------
  function cover(im, x, y, w, h) { if (!im) return; var r = Math.max(w / im.width, h / im.height), dw = im.width * r, dh = im.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore(); }
  function fit(im, cx, cy, w, h, a) { if (!im) return; var r = Math.min(w / im.width, h / im.height); ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.drawImage(im, cx - im.width * r / 2, cy - im.height * r / 2, im.width * r, im.height * r); ctx.restore(); }
  function text(t, x, y, size, col, align) { ctx.save(); ctx.font = size + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); ctx.restore(); }
  function block(x, y, s, tint, a) { ctx.save(); if (a != null) ctx.globalAlpha = a; if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#7a6a4a'; ctx.fillRect(x, y, s, s); } ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tint; ctx.globalAlpha = (a == null ? 1 : a) * 0.34; ctx.fillRect(x, y, s, s); ctx.restore(); }
  function draw(now) {
    ctx.clearRect(0, 0, W, H); cover(IM.bg_mine, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(OX, BY, S * COLS, S * ROWS);
    if (!G) return;
    ctx.strokeStyle = 'rgba(255,230,170,.05)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (var gx = 1; gx <= COLS - 1; gx += BU) { ctx.moveTo(px(gx), py(1)); ctx.lineTo(px(gx), py(ROWS - 1)); } for (var gy = 1; gy <= ROWS - 1; gy += BU) { ctx.moveTo(px(1), py(gy)); ctx.lineTo(px(COLS - 1), py(gy)); } ctx.stroke();   /* 격자 */
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(OX, BY, S * COLS, S); ctx.fillRect(OX, py(ROWS - 1), S * COLS, S); ctx.fillRect(OX, py(1), S, S * (ROWS - 2)); ctx.fillRect(px(COLS - 1), py(1), S, S * (ROWS - 2));   /* 끝 줄 = 블록 못 놓는 곳 */
    ctx.strokeStyle = 'rgba(214,170,70,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(px(1), py(1), S * (COLS - 2), S * (ROWS - 2)); ctx.restore();
    for (var y = 0; y < UR; y++) for (var x = 0; x < UC; x++) if (G.ub[y][x]) block(px(uCell(x)), py(uCell(y)), S * BU, G.ub[y][x]);
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = canPlace(pc, d.gx, d.gy); pc.cells.forEach(function (c) { var X = d.gx + c[0], Y = d.gy + c[1]; if (X < 0 || X >= UC || Y < 0 || Y >= UR) return; ctx.fillStyle = ok ? 'rgba(155,227,122,.45)' : 'rgba(255,90,70,.4)'; ctx.fillRect(px(uCell(X)) + 1, py(uCell(Y)) + 1, S * BU - 2, S * BU - 2); }); }
    // 벙커
    var eb = IM['k_' + G.efac + '_e2'];
    G.bunkers.forEach(function (b) { fit(eb, px(b.x + 1), py(b.y + 1), S * 2.1, S * 2.2);
      var w = S * 1.8, hp = Math.max(0, b.hp) / BUNKER_HP; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(px(b.x + 1) - w / 2, py(b.y) - 4, w, 3); ctx.fillStyle = '#ff5a4a'; ctx.fillRect(px(b.x + 1) - w / 2, py(b.y) - 4, w * hp, 3);
      var left = Math.max(0, b.spawn - G.t) / spawnMs(); ctx.strokeStyle = 'rgba(255,170,120,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px(b.x + 2) - 2, py(b.y + 2) - 2, 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left)); ctx.stroke(); });
    // 병력
    G.units.forEach(function (u) { var f = Math.floor(u.ph) % 2 ? '_frun2' : '_frun1'; ctx.fillStyle = 'rgba(255,60,40,.35)'; ctx.beginPath(); ctx.ellipse(px(u.x), py(u.y) + S * 0.4, S * 0.42, S * 0.2, 0, 0, 7); ctx.fill(); fit(IM['s_' + G.efac + f], px(u.x), py(u.y) - S * 0.1, S * 1.0, S * 1.2); });   /* 보병 = 1칸 */   /* 병력: 발밑 붉은 표시 + 조금 크게(판정은 1칸) */
    // 탱크 + 사거리
    var t = G.tank;
    if (alive(t.lock)) { var lx = t.lock.kind === 'u' ? t.lock.ref.x : t.lock.ref.x + 1, ly = t.lock.kind === 'u' ? t.lock.ref.y : t.lock.ref.y + 1, lr = (t.lock.kind === 'u' ? 1.1 : 2) * S + 2, lost = t.lostAt != null;   /* 록온 표시 */
      ctx.strokeStyle = lost ? 'rgba(255,200,80,.9)' : 'rgba(255,60,40,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(lx), py(ly), lr, 0, 7); ctx.moveTo(px(lx) - lr - 3, py(ly)); ctx.lineTo(px(lx) - lr + 3, py(ly)); ctx.moveTo(px(lx) + lr - 3, py(ly)); ctx.lineTo(px(lx) + lr + 3, py(ly)); ctx.stroke();
      if (lost) text('길 막힘 ' + Math.max(0, 3 - (G.t - t.lostAt) / 1000).toFixed(1), px(lx), py(ly) - lr - 8, 12, '#ffd451'); }
    ctx.strokeStyle = 'rgba(255,230,120,.22)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(t.x), py(t.y), RANGE * S, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(px(t.x), py(t.y)); ctx.rotate(t.ang + Math.PI / 2); ctx.shadowColor = FACCOL[G.fac]; ctx.shadowBlur = 10; fit(IM['t_' + G.fac], 0, 0, S * 1.05, S * 1.2); ctx.restore();   /* 탱크 = 1칸 */
    // 포탄
    G.shots.forEach(function (s) { var tl = 1.4, tx0 = s.x - s.vx / SHOT_V * tl, ty0 = s.y - s.vy / SHOT_V * tl; ctx.save(); var gr = ctx.createLinearGradient(px(tx0), py(ty0), px(s.x), py(s.y)); gr.addColorStop(0, 'rgba(255,200,80,0)'); gr.addColorStop(1, 'rgba(255,230,120,.95)'); ctx.strokeStyle = gr; ctx.lineWidth = Math.max(2, S * 0.22); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px(tx0), py(ty0)); ctx.lineTo(px(s.x), py(s.y)); ctx.stroke();
      ctx.fillStyle = '#fff6c0'; ctx.shadowColor = '#ffb13d'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(px(s.x), py(s.y), Math.max(2, S * 0.24), 0, 7); ctx.fill(); ctx.restore(); });   /* 직선포: 꼬리 달린 밝은 탄 */
    G.lobs.forEach(function (l) { var p = (G.t - l.t0) / l.dur, tx = l.b.x + 1, ty = l.b.y + 1, x = l.sx + (tx - l.sx) * p, yy = l.sy + (ty - l.sy) * p - Math.sin(p * Math.PI) * 2.2; fit(IM.m_up, px(x), py(yy), S * 0.8, S * 1.2); });
    // 효과
    G.fx = G.fx.filter(function (f) { var a = G.t - f.at;
      if (f.k === 'cell') { if (a > 360) return false; var sc = 1 + a / 600, U3 = S * BU * sc; block(px(f.x) + S * BU / 2 - U3 / 2, py(f.y) + S * BU / 2 - U3 / 2, U3, '#fff', 1 - a / 360); return true; }
      if (f.k === 'flash') { if (a > 280) return false; ctx.fillStyle = 'rgba(255,240,180,' + (0.5 * (1 - a / 280)) + ')'; f.rows.forEach(function (y) { ctx.fillRect(px(1), py(uCell(y)), S * (COLS - 2), S * BU); }); f.cols.forEach(function (x) { ctx.fillRect(px(uCell(x)), py(1), S * BU, S * (ROWS - 2)); }); return true; }
      if (f.k === 'boom') { var life = 500; if (a > life) return false; var fr = Math.min(8, 1 + Math.floor(a / life * 8)), sz = S * (f.small ? 1.4 : 2.2); fit(IM['x_b' + fr], px(f.x), py(f.y) - sz * 0.15, sz, sz); return true; }
      if (f.k === 'dead') { if (a > 700) return false; fit(IM['s_' + G.efac + '_fdead'], px(f.x), py(f.y), S * 1.0, S * 1.0, 1 - a / 700); return true; }
      if (f.k === 'ruin') { if (a > 1200) return false; fit(IM['k_' + G.efac + '_e4'], px(f.x + 1), py(f.y + 1), S * 2.1, S * 2.1, 1 - a / 1200); return true; }
      if (f.k === 'muzzle') { if (a > 120) return false; ctx.fillStyle = 'rgba(255,240,170,' + (1 - a / 120) + ')'; ctx.beginPath(); ctx.arc(px(f.x), py(f.y), S * 0.5, 0, 7); ctx.fill(); return true; }
      if (f.k === 'hit') { if (a > 260) return false; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - a / 260) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px(f.x), py(f.y), S * (0.4 + a / 130), 0, 7); ctx.stroke(); return true; }
      if (f.k === 'ring') { if (a > 900) return false; ctx.strokeStyle = 'rgba(255,90,70,' + (1 - a / 900) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(f.x), py(f.y), S * (1 + a / 300), 0, 7); ctx.stroke(); return true; }
      if (f.k === 'pop') { if (a > 1100) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1100 - a) / 300); text(f.t, f.x, f.y - a * 0.03, f.big ? 24 : 17, f.col); ctx.restore(); return true; }
      return false; });
    // 위 HUD
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, HUD);
    var left3 = CARD_LINES - G.cardLines; text('카드까지 ' + left3 + '줄', 10, HUD / 2, 19, '#9be37a', 'left'); for (var cd = 0; cd < CARD_LINES; cd++) { ctx.fillStyle = cd < G.cardLines ? '#9be37a' : 'rgba(255,255,255,.2)'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(138 + cd * 15, HUD / 2, 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
    text(G.score.toLocaleString(), W * 0.62, HUD / 2, 24, '#fff');
    text('최고 ' + Math.max(best, G.score).toLocaleString(), W - 10, HUD / 2, 16, '#ffd451', 'right');
    // 트레이
    for (var i = 0; i < 3; i++) { var rc = slotRect(i); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(rc.x + 4, rc.y, rc.w - 8, rc.h); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.strokeRect(rc.x + 4, rc.y, rc.w - 8, rc.h);
      var pc2 = G.tray[i]; if (!pc2 || (G.drag && G.drag.i === i)) continue; var wh = pieceWH(pc2), cs = Math.min(26, (rc.w - 16) / wh[0], (rc.h - 12) / wh[1]), ox = rc.x + (rc.w - wh[0] * cs) / 2, oy = rc.y + (rc.h - wh[1] * cs) / 2;
      pc2.cells.forEach(function (c) { block(ox + c[0] * cs, oy + c[1] * cs, cs, pc2.tint); }); }
    if (G.drag && G.tray[G.drag.i]) { var pd = G.tray[G.drag.i], wh2 = pieceWH(pd), U2 = S * BU, gx0 = G.drag.p.x - wh2[0] * U2 / 2, gy0 = G.drag.p.y - 64 - wh2[1] * U2 / 2; pd.cells.forEach(function (c) { block(gx0 + c[0] * U2, gy0 + c[1] * U2, U2, pd.tint, 0.9); }); }
    // 아래: 카드까지 · 강화 상태
    var by0 = H - BOT; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, by0, W, BOT);
    text('병력 ' + G.units.length + ' · 벙커 ' + G.bunkers.length, 12, by0 + BOT / 2, 15, '#ff9a8a', 'left');
    text('연사 ' + (1 + 0.2 * G.up.rate).toFixed(1) + ' · 화력 ' + (1 + G.up.dmg) + ' · 속도 ' + (1 + 0.2 * G.up.move).toFixed(1), W - 12, by0 + BOT / 2, 15, '#ffe9a8', 'right');
    // 카운트다운
    if (G.count && !G.over) { var left = Math.max(0, COUNT_MS - (G.t - G.count)); ctx.fillStyle = 'rgba(120,0,0,' + (0.15 + 0.1 * Math.sin(now / 90)) + ')'; ctx.fillRect(OX, BY, S * COLS, S * ROWS); text(Math.ceil(left / 1000) + '', W / 2, BY + S * ROWS / 2, Math.round(S * 6), '#ff5a4a'); text('블록을 놓아라!', W / 2, BY + S * ROWS / 2 + S * 3.6, 22, '#fff'); }
    else if (G.noFit != null && !G.over) text('놓을 곳이 없다…', W / 2, BY + S * ROWS - S, 18, '#ffb3a8');
    // 배너
    if (G.banner) { var ba = G.t - G.banner.at; if (ba > 1600) G.banner = null; else { ctx.save(); ctx.globalAlpha = Math.min(1, ba / 120) * Math.min(1, (1600 - ba) / 300); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, BY + S * 2 - 18, W, 36); text(G.banner.t, W / 2, BY + S * 2, 22, G.banner.col); ctx.restore(); } }
  }
  function loop() { var n = performance.now(), dt = Math.min(0.05, (n - last) / 1000); last = n; update(dt); draw(n); requestAnimationFrame(loop); }
  loop();

  // ---------- 시작/끝 화면 ----------
  var $ = function (id) { return document.getElementById(id); };
  function selFac(f) { fac = f; try { localStorage.setItem('tank_fac', f); } catch (e) { } document.querySelectorAll('.fac').forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); }); }
  document.querySelectorAll('.fac').forEach(function (b) { b.addEventListener('click', function () { selFac(b.dataset.f); sfx('click'); }); }); selFac(fac);
  $('go').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  function showEnd(nb) { var e = $('end'); e.classList.add('lose'); $('endT').textContent = 'GAME OVER'; $('endS').textContent = '블록을 놓을 곳이 없다'; $('endB').textContent = '최고 기록!'; $('endB').style.display = nb ? 'block' : 'none';
    $('endScore').textContent = '점수 ' + G.score.toLocaleString() + ' · 처치 ' + G.kills + ' · ' + G.lines + '줄'; $('endBtn').textContent = '다시 하기'; e.classList.remove('hidden'); }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  window.__next = { get: function () { return G; }, start: start, place: place, canPlace: canPlace, addBunker: addBunker, spawn: spawnUnit, cards: showCards, cell: function (x, y) { return { x: px(x + 0.5), y: py(y + 0.5) }; }, slot: slotRect };
})();
