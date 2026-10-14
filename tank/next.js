/* TANK RUMBLE — 쉬운 탱크 시험판 v7 (2026-10-14)
   ① 내려오는 적은 탱크뿐(생명 1). 블록을 놓을 때마다 한 칸씩 내려옴, 나오는 열은 랜덤
   ② 끝줄에 도착한 적 탱크는 정차 → 내 판에 한 칸짜리 블록을 쏨 → 20초 리로드(작은 바) → 다시 쏨
   ③ 정차한 탱크가 있는 열로는 새 탱크가 안 내려옴
   ④ 줄을 깨면 내 탱크가 자기 세로줄로 미사일 → 그 열 맨 앞 적 탱크 격파 (여러 줄이면 옆 열까지)
   ⑤ 한 칸만 비어 있는 줄은 빨갛게 깜빡여 내 탱크를 부름. 내 탱크도 블록 한 칸
   ⑥ 내 탱크가 채워서 줄을 깨면 6초 동안 1.5배 빨라짐(잔상) + 특별 연출
   ⑦ 무한 점수. 블록 놓을 곳이 없으면 끝 */
(function () {
  'use strict';
  var COLS = 9, ROWS = 10, EROWS = 4, RELOAD = 20000, BOOST = 6000, STEP = 110, ROW_MS = 3200;   // 적 탱크: 한 칸 내려오는 데 3.2초, 멈추지 않고 계속
  var FAC = { surge: { col: '#4fd8ff' }, gale: { col: '#c58bff' }, solar: { col: '#ffd451' } };
  var SHAPES = [
    [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]]
  ];
  var TINT = ['#ffcf4a', '#4fd8ff', '#9be37a', '#ff8a5a', '#c58bff'];
  var ROCK = 'rock';
  function now() { return performance.now(); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function rr(a, b) { return a + Math.random() * (b - a); }
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'bg_enemy.jpg', 'b_plain.png', 'b_scout.png', 'm_up.png', 'm_drill.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 'f_' + f + '.png', 'p_' + f + '.png'); });
  for (var i = 1; i <= 8; i++) LIST.push('x_b' + i + '.png');
  LIST.forEach(function (n) { var im = new Image(); im.onload = function () { IM[n.replace(/\.(png|jpg)$/, '')] = im; }; im.src = 'assets/v2/' + n + '?v=6'; });

  // ---------- 화면 ----------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 0, H = 0, S = 40, OX = 0, HUD = 54, BOT = 14, EY = 0, BY = 0, TY = 0, TH = 0, ER = 36;
  function layout() {
    var dpr = Math.min(3, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.floor(Math.min(W / COLS, (H - HUD - BOT - 8) / (ROWS + EROWS * 0.9 + 2.8)));
    OX = Math.floor((W - S * COLS) / 2); ER = S * 0.9; TH = S * 2.8;
    TY = H - BOT - TH; BY = TY - ROWS * S; EY = BY - EROWS * ER;
  }
  window.addEventListener('resize', layout); layout();
  function bx(x) { return OX + x * S; } function by(y) { return BY + y * S; }
  function ey(r) { return EY + r * ER; }

  // ---------- 상태 ----------
  var G = null, fac = 'solar', best = 0;
  try { fac = localStorage.getItem('tank_fac') || 'solar'; best = +localStorage.getItem('tank_easy_best') || 0; } catch (e) { }
  function newPiece() { var sh = SHAPES[rnd(SHAPES.length)], pc = { cells: sh, tint: TINT[rnd(TINT.length)] };
    if (Math.random() < 0.2) pc.item = { i: rnd(sh.length), kind: Math.random() < 0.55 ? 'plane' : 'mark' };   // 아이템 블록: 비행기 / 내 세력 마크
    return pc; }
  function start() {
    var efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; });
    G = { score: 0, combo: 0, moves: 0, kills: 0, fac: fac, efac: efs[rnd(2)], board: [], tank: { x: 4, y: 9, fx: 4, fy: 9, path: [], at: 0, trail: [] },
      tray: [newPiece(), newPiece(), newPiece()], en: [], dying: [], items: {}, loot: {}, planes: [], fx: [], parts: [], shots: [], shells: [], drag: null, over: false, banner: null, shake: 0, boostUntil: 0 };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    G.t0 = now(); spawn(0.5); G.spawnAt = now() + 9000;
    banner('줄을 깨면 미사일 발사!', '#ffe066');
  }
  function banner(t, col) { G.banner = { t: t, col: col || '#fff', at: now() }; }
  function pop(t, x, y, col, big) { G.fx.push({ k: 'pop', t: t, x: x, y: y, col: col || '#fff', big: big, at: now() }); }
  function shake(n) { G.shake = Math.max(G.shake, n); }
  function burst(x, y, n, cols, sp, sz, grav, life) {   // 파편·불꽃 입자
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = rr(0.3, 1) * sp;
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, g: grav == null ? 0.25 : grav, s: rr(0.5, 1) * sz, c: cols[rnd(cols.length)], at: now(), life: life || rr(450, 800), sq: Math.random() < 0.5 }); }
  }
  function ring(x, y, r0, r1, col, life, w) { G.fx.push({ k: 'ring', x: x, y: y, r0: r0, r1: r1, col: col, life: life || 450, w: w || 4, at: now() }); }

  // ---------- 적 탱크 ----------
  function colEnemies(x) { return G.en.filter(function (e) { return e.x === x; }); }
  function parkedCol(x) { return G.en.some(function (e) { return e.x === x && e.parked; }); }
  function spawn(r) {
    var free = []; for (var x = 0; x < COLS; x++) if (!G.en.concat(G.dying.map(function (d) { return d.e; })).some(function (e) { return e.x === x && e.r < r + 1.05; })) free.push(x);   // 줄 서기: 위 입구가 비어 있는 세로줄이면 OK (한도 없음, 겹치지 않음)
    if (!free.length) return;
    var x2 = free[rnd(free.length)];
    G.en.push({ x: x2, r: r, hp: 1, parked: false, queued: false, ang: Math.PI, aimAng: Math.PI, reloadAt: 0, recoil: 0 });
  }
  function moveEnemies(t, dt) {                             // 멈추지 않고 천천히 계속 내려옴
    G.en.sort(function (a, b) { return b.r - a.r; });
    G.en.forEach(function (e) {
      if (e.parked) return;
      var nr = e.r + dt / ROW_MS, ahead = null;
      G.en.forEach(function (o) { if (o !== e && o.x === e.x && o.r > e.r && (!ahead || o.r < ahead.r)) ahead = o; });
      e.queued = false;
      if (ahead && nr > ahead.r - 1) { nr = Math.max(e.r, ahead.r - 1); e.queued = true; }   // 앞 탱크 뒤에 붙으면 대기
      e.r = nr;
      if (e.r >= EROWS - 1) { e.r = EROWS - 1; e.parked = true; e.reloadAt = t + 450; }   // 끝줄 도착 → 정차, 곧 첫 발사
    });
    G.dying.forEach(function (d) { if (!d.e.parked) d.e.r = Math.min(EROWS - 1, d.e.r + dt / ROW_MS); });
    if (t >= G.spawnAt) { spawn(-1); G.spawnAt = t + spawnGap(t); }     // 랜덤 열에 새 탱크
  }
  // 난이도 = 탱크가 나오는 간격: 처음 12초 → 5분 동안 서서히 4.5초까지 (±20% 랜덤)
  function spawnGap(t) { var sec = (t - G.t0) / 1000, base = Math.max(4500, 12000 - sec * 25); return base * rr(0.8, 1.2); }
  function advance() { var t = now(); moveEnemies(t, ROW_MS); }   // 시험용: 한 칸 빨리 감기
  function emptyCells() { var a = []; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (!G.board[y][x] && !G.loot[x + ',' + y] && !(G.tank.x === x && G.tank.y === y) && !G.shells.some(function (s) { return s.tx === x && s.ty === y; })) a.push([x, y]); return a; }
  function enemyFire(e, t) {                                // 정차한 적 탱크가 한 칸짜리 블록을 쏨
    var cells = emptyCells(); if (!cells.length) { e.reloadAt = t + 2000; return; }
    var c = cells[rnd(cells.length)], sx = bx(e.x) + S / 2, sy = ey(e.r) + ER / 2, tx = bx(c[0]) + S / 2, ty = by(c[1]) + S / 2;
    e.aimAng = Math.atan2(tx - sx, -(ty - sy));
    e.fireAt = t + 260; e.target = c; e.reloadAt = Infinity;
  }
  function enemyShoot(e, t) {
    var c = e.target, sx = bx(e.x) + S / 2, sy = ey(e.r) + ER / 2, mx = sx + Math.sin(e.ang) * S * 0.5, my = sy - Math.cos(e.ang) * S * 0.5;
    var tx = bx(c[0]) + S / 2, ty = by(c[1]) + S / 2, dist = Math.hypot(tx - mx, ty - my);
    G.shells.push({ tx: c[0], ty: c[1], x0: mx, y0: my, x1: tx, y1: ty, at: t, dur: 420 + dist * 0.9, arc: S * 1.2 + dist * 0.25, last: [] });
    e.recoil = 1; e.reloadAt = t + RELOAD; e.fireAt = 0;
    G.fx.push({ k: 'muzzle', x: mx, y: my, ang: e.ang, at: t });
    burst(mx, my, 10, ['#fff3c0', '#ffb13d', '#ff6a2a'], 4, 4, 0.05, 350);
    shake(4); sfx('launch');
  }
  function shellLand(s) {
    var x = s.tx, y = s.ty, t = now();
    if (G.board[y][x] || (G.tank.x === x && G.tank.y === y)) {          // 그새 막혔으면 가까운 빈칸
      var best2 = null, bd = 1e9; emptyCells().forEach(function (c) { var d = Math.abs(c[0] - x) + Math.abs(c[1] - y); if (d < bd) { bd = d; best2 = c; } }); if (!best2) return; x = best2[0]; y = best2[1];
    }
    G.board[y][x] = ROCK; var px = bx(x) + S / 2, py = by(y) + S / 2;
    G.fx.push({ k: 'thud', x: x, y: y, at: t });
    ring(px, py, S * 0.3, S * 1.6, 'rgba(255,170,90,', 420, 5);
    burst(px, py, 16, ['#8a7a66', '#b7a07a', '#5b4d3d', '#ffcf8a'], 4.5, 5, 0.3, 700);
    shake(7); sfx('boom', false);
    lineCheck(); checkFit();
  }

  // ---------- 판 규칙 ----------
  function tankAt(x, y) { var t = G.tank; return !t.path.length && t.x === x && t.y === y; }
  function filled(x, y) { return G.board[y][x] || tankAt(x, y); }
  function canPlace(p, gx, gy, noTank) { for (var i = 0; i < p.cells.length; i++) { var x = gx + p.cells[i][0], y = gy + p.cells[i][1]; if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false; if (G.board[y][x] || (!noTank && G.tank.x === x && G.tank.y === y)) return false; } return true; }
  function anyFit(p, noTank) { for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (canPlace(p, x, y, noTank)) return true; return false; }
  function place(i, gx, gy) {
    var p = G.tray[i], t = now(); p.cells.forEach(function (c, ci) { var X = gx + c[0], Y = gy + c[1]; G.board[Y][X] = p.tint; delete G.loot[X + ',' + Y]; if (p.item && p.item.i === ci) G.items[X + ',' + Y] = p.item.kind; G.fx.push({ k: 'land', x: X, y: Y, at: t }); });
    G.tray[i] = null; if (!G.tray.some(Boolean)) G.tray = [newPiece(), newPiece(), newPiece()];
    sfx('place'); G.score += p.cells.length * 5; G.moves++;
    if (!lineCheck()) G.combo = 0;
    checkFit();
  }
  function lineCheck() {
    var rows = [], cols = [], x, y, full, tk = G.tank, tankUsed = false;
    for (y = 0; y < ROWS; y++) { full = true; for (x = 0; x < COLS; x++) if (!filled(x, y)) { full = false; break; } if (full) { rows.push(y); if (tankAt(tk.x, y)) tankUsed = true; } }
    for (x = 0; x < COLS; x++) { full = true; for (y = 0; y < ROWS; y++) if (!filled(x, y)) { full = false; break; } if (full) { cols.push(x); if (tankAt(x, tk.y)) tankUsed = true; } }
    var n = rows.length + cols.length; if (!n) return false;
    var t = now(), gold = tankUsed;
    function clr(x, y) { var v = G.board[y][x]; if (!v) return; G.board[y][x] = 0; dropItem(x, y, t);
      var d = rows.indexOf(y) >= 0 ? Math.abs(x - tk.x) : Math.abs(y - tk.y);
      G.fx.push({ k: 'cell', x: x, y: y, at: t + d * 35, tint: v, gold: gold });
      setTimeout(function () { if (!G) return; burst(bx(x) + S / 2, by(y) + S / 2, gold ? 9 : 6, gold ? ['#fff6c0', '#ffd451', '#ffb13d'] : (v === ROCK ? ['#8a7a66', '#5b4d3d', '#cdbb9a'] : [v, '#fff', '#ffe9a8']), gold ? 6 : 4.5, gold ? 5 : 4, 0.22, 650); }, d * 35); }
    rows.forEach(function (y) { for (var x = 0; x < COLS; x++) clr(x, y); });
    cols.forEach(function (x) { for (var y = 0; y < ROWS; y++) clr(x, y); });
    G.fx.push({ k: 'beam', rows: rows, cols: cols, at: t, gold: gold, ox: tk.x, oy: tk.y });
    G.combo++; var mult = Math.min(5, G.combo), pts = (n * 100 + (n - 1) * 100) * mult * (gold ? 2 : 1);
    G.score += pts; pop((mult > 1 ? 'COMBO ×' + mult + '  ' : '') + '+' + pts, OX + S * COLS / 2, BY + S * 2.6, '#ffe066', true);
    sfx('clear', n + mult - 1);
    if (gold) {                                               // 내 탱크로 채워 깸 → 1.5배 빨라짐
      G.boostUntil = t + BOOST; var px = bx(tk.x) + S / 2, py = by(tk.y) + S / 2;
      ring(px, py, S * 0.4, S * 4, 'rgba(255,214,80,', 600, 7); ring(px, py, S * 0.2, S * 2.4, 'rgba(255,255,255,', 380, 4);
      G.fx.push({ k: 'flashAll', at: t, col: '255,214,80' });
      G.banner = null; G.fx.push({ k: 'bigtext', t: 'TANK STRIKE!', sub: '관통 드릴탄 + 속도 ×1.5', at: t });
      sfx('ultReady');
    }
    fire(n, gold); shake(5 + n * 3); return true;
  }
  function fire(n, pierce) {                                // 내 탱크 세로줄로 미사일 (내 탱크로 채워 깨면 가운데 줄은 관통 드릴탄)
    var tx = G.tank.x, w = n >= 3 ? 2 : n >= 2 ? 1 : 0, t = now(), k = 0, y0 = by(G.tank.y) + S * 0.2;
    sfx('launch');
    G.fx.push({ k: 'muzzle', x: bx(tx) + S / 2, y: y0, ang: 0, at: t + 120, big: true });
    for (var d = -w; d <= w; d++) { var c = tx + d; if (c < 0 || c >= COLS) continue;
      if (pierce && c === tx) {                                // 관통탄: 그 세로줄에 줄 선 적 탱크 전부
        var all = G.en.filter(function (e) { return e.x === c; }).sort(function (a, b) { return b.r - a.r; }), ps = { x: c, at: t + 120, y0: y0, ty: EY - S * 3, dur: 820, pierce: true, tgts: [], hits: 0 };
        all.forEach(function (e) { G.en.splice(G.en.indexOf(e), 1); var dd = { e: e, until: ps.at + ps.dur + 200 }; G.dying.push(dd); ps.tgts.push(dd); G.kills++; });
        G.shots.push(ps); k++; sfx('ultReady'); continue; }
      var tgt = null; G.en.forEach(function (e) { if (e.x === c && (!tgt || e.r > tgt.r)) tgt = e; });
      var s = { x: c, at: t + 120 + k * 90, y0: y0, ty: tgt ? enemyY(tgt, t + 640 + k * 90) : EY - S * 2, dur: 520, tgt: tgt };
      if (tgt) { G.en.splice(G.en.indexOf(tgt), 1); G.dying.push({ e: tgt, until: s.at + s.dur }); G.score += 300; G.kills++; }
      G.shots.push(s); k++; }
  }
  function shotLand(s) { if (s.tgt) explode(s.x, s.ty, s.tgt.ang, 300); }
  function explode(x, py, ang, pts, label) {
    var px = bx(x) + S / 2, t = now(); G.score += 0;
    G.fx.push({ k: 'boom', px: px, py: py, at: t, big: true });
    G.fx.push({ k: 'wreck', x: x, py: py, ang: ang, at: t });
    G.fx.push({ k: 'flashAll', at: t, col: '255,150,60', a: 0.22 });
    ring(px, py, S * 0.3, S * 2.2, 'rgba(255,190,90,', 500, 6); ring(px, py, S * 0.2, S * 1.3, 'rgba(255,255,255,', 280, 3);
    burst(px, py, 22, ['#fff3c0', '#ffb13d', '#ff6a2a', '#3a3530', '#6b6055'], 7, 6, 0.2, 900);
    pop(label || '+' + pts, px, py - ER * 0.6, label ? '#ffe066' : '#ffb13d', true);
    shake(12); sfx('boom', true);
  }
  // ---------- 아이템 ----------
  function dropItem(x, y, t) { var k = x + ',' + y, kind = G.items[k]; if (!kind) return; delete G.items[k]; G.loot[k] = { kind: kind, at: t };
    pop('아이템!', bx(x) + S / 2, by(y) - S * 0.2, '#9be37a'); }
  function pickup(x, y, t) { var k = x + ',' + y, L = G.loot[k]; if (!L) return; delete G.loot[k];
    var px = bx(x) + S / 2, py = by(y) + S / 2; ring(px, py, S * 0.3, S * 1.8, 'rgba(160,255,140,', 420, 5); burst(px, py, 14, ['#fff', '#9be37a', '#ffe066'], 4, 4, 0.1, 500); sfx('gain');
    if (L.kind === 'plane') callPlane(t); else useMark(t); }
  function callPlane(t) {                                   // 비행기: 적진을 돌며 랜덤으로 최대 3대 폭격
    var pool = G.en.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
    var pl = { at: t, dur: 3200, drops: pool.map(function (e, i) { return { e: e, at: t + 900 + i * 650, done: false }; }) };
    G.planes.push(pl); G.fx.push({ k: 'bigtext', t: '공습!', sub: '적 탱크 ' + pool.length + '대 폭격', at: t }); G.banner = null; sfx('scout');
  }
  function planePos(pl, t) { var q = Math.min(1, (t - pl.at) / pl.dur), cx = OX + S * COLS / 2, cy = EY + EROWS * ER * 0.5, rx = S * COLS * 0.38, ry = EROWS * ER * 0.42;
    if (q < 0.18) { var a = q / 0.18; return { x: cx + (1 - a) * W * 0.1, y: H + S * 2 - (H + S * 2 - (cy + ry)) * a, h: -Math.PI / 2 }; }      // 아래에서 날아 올라옴
    if (q < 0.85) { var b = (q - 0.18) / 0.67, ang = Math.PI / 2 - b * Math.PI * 2.2; return { x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry, h: ang - Math.PI / 2 }; }   // 적진을 돌며
    var c = (q - 0.85) / 0.15, endA = Math.PI / 2 - Math.PI * 2.2, ex = cx + Math.cos(endA) * rx, ey0 = cy + Math.sin(endA) * ry; return { x: ex + c * W * 0.6, y: ey0 - c * S * 6, h: -0.6 }; }
  function useMark(t) {                                      // 세력 마크: 기술 바로 발동
    var f = G.fac;
    if (f === 'surge') {                                     // 서지: 적이 쏜 블록 전부 사라짐
      var n = 0; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x] === ROCK) { G.board[y][x] = 0; n++; var d = y; G.fx.push({ k: 'cell', x: x, y: y, at: t + d * 45, tint: ROCK }); (function (x, y, d) { setTimeout(function () { if (G) burst(bx(x) + S / 2, by(y) + S / 2, 8, ['#bff4ff', '#4fd8ff', '#ffffff'], 4, 4, 0.15, 600); }, d * 45); })(x, y, d); }
      G.fx.push({ k: 'wave', at: t }); G.fx.push({ k: 'bigtext', t: '서지 해일!', sub: '적 블록 ' + n + '개 쓸어버림', at: t }); G.score += n * 30;
    } else if (f === 'gale') {                               // 게일: 맨 앞 한 줄 적 탱크 번개로 괴멸
      var front = -9; G.en.forEach(function (e) { front = Math.max(front, e.r); });
      var hit = G.en.filter(function (e) { return e.r >= front - 0.5; });
      hit.forEach(function (e, i) { G.en.splice(G.en.indexOf(e), 1); var dd = { e: e, until: t + 2000 }; G.dying.push(dd); G.kills++;
        setTimeout(function () { if (!G) return; var py = enemyY(e); dd.until = 0; G.fx.push({ k: 'bolt', x: e.x, py: py, at: now() }); explode(e.x, py, e.ang, 300); G.score += 300; }, 120 + i * 110); });
      G.fx.push({ k: 'bigtext', t: '게일 낙뢰!', sub: hit.length ? '맨 앞줄 ' + hit.length + '대 괴멸' : '적이 없다', at: t });
    } else {                                                 // 솔라: 내가 놓은 블록 전부 사라짐
      var m = 0; for (var y2 = 0; y2 < ROWS; y2++) for (var x2 = 0; x2 < COLS; x2++) { var v = G.board[y2][x2]; if (v && v !== ROCK) { G.board[y2][x2] = 0; dropItem(x2, y2, t); m++; var d2 = Math.abs(x2 - G.tank.x) + Math.abs(y2 - G.tank.y); G.fx.push({ k: 'cell', x: x2, y: y2, at: t + d2 * 30, tint: v, gold: true }); } }
      G.fx.push({ k: 'flashAll', at: t, col: '255,220,120', a: 0.45 }); G.fx.push({ k: 'sun', at: t }); G.fx.push({ k: 'bigtext', t: '솔라 플레어!', sub: '블록 ' + m + '개 정리', at: t }); G.score += m * 10;
    }
    G.banner = null; shake(10); sfx('ultReady'); checkFit();
  }
  function checkFit() {
    if (G.over) return;
    var live = G.tray.filter(Boolean); if (live.some(function (p) { return anyFit(p); })) return;
    if (live.some(function (p) { return anyFit(p, true); }) && canTankMove()) { banner('탱크를 옮겨 자리를 만드세요!', '#ffe066'); return; }
    over();
  }
  function canTankMove() { var t = G.tank; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var x = t.x + d[0], y = t.y + d[1]; return x >= 0 && x < COLS && y >= 0 && y < ROWS && !G.board[y][x]; }); }
  function over() {
    G.over = true; sfx('over');
    var nb = G.score > best; if (nb) { best = G.score; try { localStorage.setItem('tank_easy_best', best); } catch (e) { } }
    banner('놓을 곳이 없다!', '#ff6a5a');
    setTimeout(function () { showEnd(nb); }, 1100);
  }
  // 한 칸만 비어 있는 줄 (내 탱크가 가서 채우면 깨짐)
  function lureLines() {
    var out = [], tk = G.tank; if (tk.path.length) return out;
    function chk(cells, isRow, idx) { var emp = [], hasT = false; cells.forEach(function (c) { if (c[0] === tk.x && c[1] === tk.y) hasT = true; else if (!G.board[c[1]][c[0]]) emp.push(c); });
      if (emp.length === 1 && !hasT && pathTo(emp[0][0], emp[0][1])) out.push({ row: isRow, i: idx, c: emp[0] }); }
    for (var y = 0; y < ROWS; y++) { var a = []; for (var x = 0; x < COLS; x++) a.push([x, y]); chk(a, true, y); }
    for (var x2 = 0; x2 < COLS; x2++) { var b = []; for (var y2 = 0; y2 < ROWS; y2++) b.push([x2, y2]); chk(b, false, x2); }
    return out;
  }

  // ---------- 탱크 이동 ----------
  function pathTo(tx, ty) {
    var sx = G.tank.x, sy = G.tank.y, prev = {}, q = [[sx, sy]], k0 = sx + ',' + sy; prev[k0] = null;
    while (q.length) { var c = q.shift(); if (c[0] === tx && c[1] === ty) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], y = c[1] + d[1], k = x + ',' + y; if (x < 0 || x >= COLS || y < 0 || y >= ROWS || G.board[y][x] || k in prev) return; prev[k] = c; q.push([x, y]); }); }
    var key = tx + ',' + ty; if (!(key in prev)) return null;
    var path = [], cur = [tx, ty]; while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev[cur[0] + ',' + cur[1]]; }
    return path;
  }
  function stepMs(t) { return t < G.boostUntil ? STEP / 1.5 : STEP; }

  // ---------- 입력 ----------
  function slotRect(i) { var w = S * COLS / 3; return { x: OX + i * w, y: TY + 6, w: w, h: TH - 12 }; }
  function inR(r, p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function pcSize(pc) { var w = 0, h = 0; pc.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); }); return { w: w, h: h }; }
  function dropCell(p) { var z = pcSize(G.tray[G.drag.i]); var cx = p.x - z.w * S / 2, cy = p.y - S * 1.7 - z.h * S / 2; return { gx: Math.round((cx - OX) / S), gy: Math.round((cy - BY) / S) }; }
  var down = null;
  cv.addEventListener('pointerdown', function (e) {
    if (!G || G.over) return; var p = { x: e.clientX, y: e.clientY };
    for (var i = 0; i < 3; i++) if (G.tray[i] && inR(slotRect(i), p)) { G.drag = { i: i, p: p }; sfx('pick'); return; }
    down = p;
  });
  cv.addEventListener('pointermove', function (e) { if (G && G.drag) G.drag.p = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', function (e) {
    if (!G) return; var p = { x: e.clientX, y: e.clientY };
    if (G.drag) { var d = dropCell(p), i = G.drag.i; G.drag = null; if (!G.over && canPlace(G.tray[i], d.gx, d.gy)) place(i, d.gx, d.gy); else if (p.y < TY) sfx('bad'); return; }
    if (down && !G.over) { var gx = Math.floor((p.x - OX) / S), gy = Math.floor((p.y - BY) / S); down = null;
      if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS && !G.board[gy][gx] && !G.tank.path.length) { var path = pathTo(gx, gy); if (path && path.length) { G.tank.path = path; G.tank.at = now(); sfx('step'); } else if (!path) { sfx('bad'); pop('길이 막혔다', bx(gx) + S / 2, by(gy), '#ff8a7a'); } } }
  });

  // ---------- 진행 ----------
  var lastT = 0;
  function update(t) {
    if (!G) return;
    var dt = Math.min(50, t - (lastT || t)); lastT = t;
    var tk = G.tank, sm = stepMs(t);
    if (!G.over && tk.path.length && t - tk.at >= sm) { var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.at = t; pickup(tk.x, tk.y, t); if (!tk.path.length) { lineCheck(); checkFit(); } }
    if (tk.path.length) { var q = Math.min(1, (t - tk.at) / sm); tk.fx = tk.x + (tk.path[0][0] - tk.x) * q; tk.fy = tk.y + (tk.path[0][1] - tk.y) * q; } else { tk.fx = tk.x; tk.fy = tk.y; }
    if (t < G.boostUntil && tk.path.length) { tk.trail.push({ x: tk.fx, y: tk.fy, at: t }); }
    tk.trail = tk.trail.filter(function (p) { return t - p.at < 260; });
    if (!G.over) moveEnemies(t, dt);
    // 적 탱크: 조준 회전, 발사, 리로드
    G.en.forEach(function (e) {
      var da = e.aimAng - e.ang; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; e.ang += da * Math.min(1, dt / 90);
      e.recoil = Math.max(0, e.recoil - dt / 260);
      if (driving(e) && e.r > -0.5 && Math.random() < dt / 70) { var dy0 = enemyY(e, t) - ER * 0.45, side = Math.random() < 0.5 ? -1 : 1;
        G.parts.push({ x: bx(e.x) + S / 2 + side * S * 0.3 + rr(-2, 2), y: dy0, vx: side * rr(0.1, 0.5), vy: rr(-0.6, -0.1), g: 0, s: rr(3, 6), c: 'rgba(170,150,120,.55)', at: t, life: 600, smoke: true }); }
      if (G.over || !e.parked) return;
      if (e.fireAt && t >= e.fireAt) { enemyShoot(e, t); return; }
      if (!e.fireAt && t >= e.reloadAt) enemyFire(e, t);
      if (!e.fireAt && t > e.reloadAt - RELOAD + 900) e.aimAng = Math.PI;     // 쏘고 나면 다시 정면
    });
    G.shells = G.shells.filter(function (s) { if (t - s.at >= s.dur) { if (!G.over) shellLand(s); return false; } return true; });
    G.planes = G.planes.filter(function (pl) {
      pl.drops.forEach(function (d) { if (d.done || t < d.at) return; d.done = true; var e = d.e; if (G.en.indexOf(e) < 0) return;   // 그새 다른 걸로 죽었으면 패스
        var pp = planePos(pl, t); G.en.splice(G.en.indexOf(e), 1); var dd = { e: e, until: t + 420 }; G.dying.push(dd); G.kills++; G.score += 300;
        G.bombs = G.bombs || []; G.bombs.push({ x0: pp.x, y0: pp.y, e: e, at: t, dur: 420 }); });
      return t - pl.at < pl.dur; });
    G.bombs = (G.bombs || []).filter(function (b) { if (t - b.at < b.dur) return true; explode(b.e.x, enemyY(b.e), b.e.ang, 300); return false; });
    G.shots = G.shots.filter(function (s) { if (t < s.at) return true;
      if (s.pierce) { var pp = Math.min(1, (t - s.at) / s.dur), py2 = s.y0 + (s.ty - s.y0) * pp * pp * (0.6 + 0.4 * pp) / 1, xx2 = bx(s.x) + S / 2;
        s.tgts.forEach(function (dd) { if (dd.done) return; var ty2 = enemyY(dd.e); if (py2 - S * 0.5 <= ty2) { dd.done = true; dd.until = 0; s.hits++; var pts = 300 * s.hits; G.score += pts; explode(s.x, ty2, dd.e.ang, pts, s.hits > 1 ? '관통 ×' + s.hits + '  +' + pts : null); } });
        for (var q = 0; q < 3; q++) G.parts.push({ x: xx2 + rr(-S * 0.25, S * 0.25), y: py2 + S * 0.5, vx: rr(-2.5, 2.5), vy: rr(0.5, 3), g: 0.15, s: rr(2, 4), c: ['#fff6c0', '#ffd451', '#ff9a1f'][rnd(3)], at: t, life: 380 });
        if (t - s.at >= s.dur) return false; return true; }
      if (t - s.at >= s.dur) { shotLand(s); return false; }
      var p = (t - s.at) / s.dur, yy = s.y0 + (s.ty - s.y0) * ease(p);
      if (Math.random() < 0.9) G.parts.push({ x: bx(s.x) + S / 2 + rr(-3, 3), y: yy + S * 0.45, vx: rr(-0.4, 0.4), vy: rr(0.5, 1.4), g: 0, s: rr(4, 8), c: Math.random() < 0.4 ? '#ffb13d' : 'rgba(200,190,180,.7)', at: t, life: 420, smoke: true });
      return true; });
    G.dying = G.dying.filter(function (d) { return t < d.until; });
    G.parts = G.parts.filter(function (p) { var a = t - p.at; if (a > p.life) return false; p.vy += p.g * dt / 16; p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; return true; });
  }
  function ease(p) { return p * p * (1.6 - 0.6 * p); }

  // ---------- 그리기 ----------
  function cover(im, x, y, w, h) { if (!im) return; var r = Math.max(w / im.width, h / im.height), dw = im.width * r, dh = im.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore(); }
  function fit(im, cx, cy, w, h, a, rot) { if (!im) return; var r = Math.min(w / im.width, h / im.height); ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.drawImage(im, -im.width * r / 2, -im.height * r / 2, im.width * r, im.height * r); ctx.restore(); }
  function text(t, x, y, size, col, align, stroke) { ctx.save(); ctx.font = size + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = stroke == null ? Math.max(3, size * 0.22) : stroke; ctx.strokeStyle = '#000'; if (ctx.lineWidth) ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); ctx.restore(); }
  function block(x, y, s, tint, a) {
    ctx.save(); if (a != null) ctx.globalAlpha = a;
    if (tint === ROCK) {                                    // 적이 쏜 블록: 어두운 쇳덩이 + 금
      if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#555'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#2a2a2e'; ctx.globalAlpha = (a == null ? 1 : a) * 0.72; ctx.fillRect(x, y, s, s);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a == null ? 1 : a; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath(); ctx.moveTo(x + s * 0.25, y + s * 0.2); ctx.lineTo(x + s * 0.45, y + s * 0.5); ctx.lineTo(x + s * 0.35, y + s * 0.8); ctx.moveTo(x + s * 0.45, y + s * 0.5); ctx.lineTo(x + s * 0.75, y + s * 0.6); ctx.stroke();
      ctx.restore(); return;
    }
    if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#7a6a4a'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tint; ctx.globalAlpha = (a == null ? 1 : a) * 0.32; ctx.fillRect(x, y, s, s); ctx.restore();
  }
  function driving(e) { return !e.parked && !e.queued; }
  function enemyY(e, t) { var r = e.r; if (t != null && driving(e)) r = Math.min(EROWS - 1, r + Math.max(0, t - now()) / ROW_MS); return ey(r) + ER / 2; }
  function itemIcon(x, y, s, kind, t, a) {                   // 블록 안 아이템: 비행기 상자 / 세력 마크
    ctx.save(); if (a != null) ctx.globalAlpha = a;
    if (kind === 'plane') { if (IM.b_scout) ctx.drawImage(IM.b_scout, x, y, s, s); }
    else { ctx.shadowColor = FAC[G.fac].col; ctx.shadowBlur = 8 + 6 * Math.sin(t / 200); fit(IM['f_' + G.fac], x + s / 2, y + s / 2, s * 0.74, s * 0.74, a); }
    ctx.restore(); }
  function drawEnemy(e, t, cy, dark) {
    var mvg = !dark && driving(e), cx = bx(e.x) + S / 2 + (mvg ? Math.sin(t / 23 + e.x) * 0.9 : 0), rc = e.recoil * S * 0.18, ox = -Math.sin(e.ang) * rc, oy = Math.cos(e.ang) * rc;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + ER * 0.36, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill(); ctx.restore();
    if (e.parked && !dark && !mvg) { ctx.save(); ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t / 200); ctx.fillStyle = '#ff3b2a'; ctx.beginPath(); ctx.arc(cx, cy, S * 0.55, 0, 7); ctx.fill(); ctx.restore(); }
    fit(IM['t_' + G.efac], cx + ox, cy + oy + (mvg ? Math.sin(t / 31) * 0.8 : 0), S * 0.95, ER * 1.1, 1, e.ang);
    if (e.parked && !dark && !mvg && isFinite(e.reloadAt)) {           // 리로드 바
      var f = Math.max(0, Math.min(1, 1 - (e.reloadAt - t) / RELOAD)), bw = S * 0.8, bh = Math.max(5, S * 0.12), x0 = cx - bw / 2, y0 = cy - ER * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x0 - 1, y0 - 1, bw + 2, bh + 2);
      ctx.fillStyle = f > 0.85 ? (Math.floor(t / 120) % 2 ? '#ff3b2a' : '#ffd451') : '#ff8a3a'; ctx.fillRect(x0, y0, bw * f, bh);
    }
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var sh = G && G.shake > 0.3 ? (G.shake *= 0.88, G.shake) : 0; ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    cover(IM.bg_enemy, -12, -12, W + 24, BY + 14); cover(IM.bg_mine, -12, BY, W + 24, H - BY + 12);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-12, TY, W + 24, H - TY + 12);
    if (!G) { ctx.restore(); return; }
    // 적 지역
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(OX, EY, S * COLS, EROWS * ER);
    ctx.fillStyle = 'rgba(255,60,40,.12)'; ctx.fillRect(OX, ey(EROWS - 1), S * COLS, ER);
    for (var cx0 = 0; cx0 < COLS; cx0++) if (parkedCol(cx0)) { ctx.fillStyle = 'rgba(255,40,30,.08)'; ctx.fillRect(bx(cx0), EY, S, (EROWS - 1) * ER); }
    // 격자
    ctx.strokeStyle = 'rgba(255,230,170,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(bx(gx), BY); ctx.lineTo(bx(gx), TY); } for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(OX, by(gy)); ctx.lineTo(OX + S * COLS, by(gy)); } ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,70,.7)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(OX, BY); ctx.lineTo(OX + S * COLS, BY); ctx.stroke(); ctx.setLineDash([]);
    // 한 칸 남은 줄 → 빨갛게 깜빡 (내 탱크 부르기)
    if (!G.over) { var lp = 0.5 + 0.5 * Math.sin(t / 140);
      var seen = {};
      lureLines().forEach(function (L) { ctx.fillStyle = 'rgba(255,40,40,' + (0.10 + 0.14 * lp) + ')';
        if (L.row) ctx.fillRect(OX, by(L.i), S * COLS, S); else ctx.fillRect(bx(L.i), BY, S, S * ROWS);
        var key = L.c[0] + ',' + L.c[1]; if (seen[key]) return; seen[key] = 1;
        var cx1 = bx(L.c[0]), cy1 = by(L.c[1]), fp = 0.5 + 0.5 * Math.sin(t / 90);           // 주차 칸: 더 빠르게 깜빡
        ctx.fillStyle = 'rgba(255,60,50,' + (0.3 + 0.35 * lp) + ')'; ctx.fillRect(cx1 + 2, cy1 + 2, S - 4, S - 4);
        fit(IM['t_' + G.fac], cx1 + S / 2, cy1 + S / 2, S * 0.95, S * 1.05, 0.2 + 0.5 * fp);     // 탱크 그림자 깜빡
        ctx.save(); ctx.strokeStyle = 'rgba(255,224,80,' + (0.55 + 0.45 * fp) + ')'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t / 40;
        ctx.shadowColor = '#ffd451'; ctx.shadowBlur = 10 * fp; ctx.strokeRect(cx1 + 3, cy1 + 3, S - 6, S - 6); ctx.restore(); }); }
    // 블록
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) {
      var lf = null; for (var q = 0; q < G.fx.length; q++) { var f0 = G.fx[q]; if ((f0.k === 'land' || f0.k === 'thud') && f0.x === x && f0.y === y && t - f0.at < 220) { lf = f0; break; } }
      if (lf) { var la = (t - lf.at) / 220, sc = lf.k === 'thud' ? 1 + 0.35 * (1 - la) : 1 + 0.12 * Math.sin(la * Math.PI); var ss = S * sc; block(bx(x) + (S - ss) / 2, by(y) + (S - ss) / 2, ss, G.board[y][x]); }
      else block(bx(x), by(y), S, G.board[y][x]); }
    for (var ik in G.items) { var ip = ik.split(','); if (G.board[+ip[1]][+ip[0]]) itemIcon(bx(+ip[0]), by(+ip[1]), S, G.items[ik], t); }
    // 떨어진 아이템 (둥둥 + 빛)
    for (var lk in G.loot) { var lp2 = lk.split(','), lx = +lp2[0], ly = +lp2[1], L = G.loot[lk], bob = Math.sin(t / 260 + lx * 1.7 + ly) * S * 0.08, lcx = bx(lx) + S / 2, lcy = by(ly) + S * 0.45 + bob, pul = 0.75 + 0.25 * Math.sin(t / 180 + lx), lc = L.kind === 'plane' ? '#9be37a' : FAC[G.fac].col;
      var spawnA = Math.min(1, (t - L.at) / 300); ctx.save(); ctx.globalAlpha = spawnA;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(lcx, by(ly) + S * 0.88, S * 0.28, S * 0.08, 0, 0, 7); ctx.fill();
      var gr = ctx.createRadialGradient(lcx, lcy, S * 0.15, lcx, lcy, S * 0.8); gr.addColorStop(0, lc + 'cc'); gr.addColorStop(0.5, lc + '55'); gr.addColorStop(1, lc + '00'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * pul * spawnA; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lcx, lcy, S * 0.8, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = spawnA; ctx.strokeStyle = lc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(lcx, lcy, S * (0.48 + 0.05 * Math.sin(t / 150 + lx)), 0, 7); ctx.stroke();
      for (var sp = 0; sp < 3; sp++) { var sa = t / 500 + sp * 2.1 + lx; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lcx + Math.cos(sa) * S * 0.42, lcy + Math.sin(sa) * S * 0.42, 2.2, 0, 7); ctx.fill(); }
      if (L.kind === 'plane') fit(IM['p_' + G.fac], lcx, lcy, S * 0.72, S * 0.72); else fit(IM['f_' + G.fac], lcx, lcy, S * 0.7, S * 0.7);
      ctx.restore(); }
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = canPlace(pc, d.gx, d.gy);
      pc.cells.forEach(function (c) { var X = d.gx + c[0], Y = d.gy + c[1]; if (X < 0 || X >= COLS || Y < 0 || Y >= ROWS) return; ctx.fillStyle = ok ? 'rgba(155,227,122,.35)' : 'rgba(255,90,70,.3)'; ctx.fillRect(bx(X) + 2, by(Y) + 2, S - 4, S - 4); }); }
    var tk = G.tank, boosted = t < G.boostUntil;
    // 조준선
    if (!G.over) { var aim = null; G.en.forEach(function (e) { if (e.x === tk.x && (!aim || e.r > aim.r)) aim = e; });
      var ax = bx(tk.fx) + S / 2; ctx.strokeStyle = aim ? 'rgba(255,90,60,.25)' : 'rgba(255,230,120,.14)'; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.moveTo(ax, by(tk.fy)); ctx.lineTo(ax, aim ? enemyY(aim) : EY); ctx.stroke();
      if (aim && !tk.path.length) { var ay = enemyY(aim), r0 = S * 0.55 + Math.sin(t / 120) * 2; ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(ax, ay, r0, 0, 7); ctx.moveTo(ax - r0 - 5, ay); ctx.lineTo(ax - r0 + 5, ay); ctx.moveTo(ax + r0 - 5, ay); ctx.lineTo(ax + r0 + 5, ay); ctx.stroke(); } }
    // 적 탱크
    G.en.forEach(function (e) { drawEnemy(e, t, enemyY(e)); });
    G.dying.forEach(function (dd) { drawEnemy(dd.e, t, enemyY(dd.e), true); });
    // 내 탱크 잔상 (빨라졌을 때)
    var timg = IM['t_' + G.fac];
    if (boosted) { tk.trail.forEach(function (p, i) { var a = 1 - (t - p.at) / 260; fit(timg, bx(p.x) + S / 2, by(p.y) + S / 2, S * 0.95, S * 1.05, a * 0.35);
        ctx.save(); ctx.globalAlpha = a * 0.5; ctx.fillStyle = FAC[G.fac].col; ctx.fillRect(bx(p.x) + S * 0.15, by(p.y) + S / 2 - 1, S * 0.7, 2); ctx.restore(); });
      if (tk.path.length) { var dx = tk.path[0][0] - tk.x, dy = tk.path[0][1] - tk.y; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
        for (var wl = 0; wl < 4; wl++) { var off = (wl - 1.5) * S * 0.2, px0 = bx(tk.fx) + S / 2 - dy * off, py0 = by(tk.fy) + S / 2 + dx * off, len = S * rr(0.6, 1.2);
          ctx.beginPath(); ctx.moveTo(px0 - dx * S * 0.5, py0 - dy * S * 0.5); ctx.lineTo(px0 - dx * (S * 0.5 + len), py0 - dy * (S * 0.5 + len)); ctx.stroke(); } ctx.restore(); } }
    // 내 탱크
    var mv = tk.path.length ? 1 : 0; ctx.save(); ctx.translate(bx(tk.fx) + S / 2, by(tk.fy) + S / 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, S * 0.36, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill();
    if (boosted) { ctx.fillStyle = 'rgba(255,214,80,' + (0.25 + 0.15 * Math.sin(t / 70)) + ')'; ctx.beginPath(); ctx.arc(0, 0, S * 0.62, 0, 7); ctx.fill(); }
    ctx.shadowColor = boosted ? '#ffd451' : FAC[G.fac].col; ctx.shadowBlur = boosted ? 22 : 10; fit(timg, 0, mv ? Math.sin(t / 40) * 1.5 : 0, S * 0.95, S * 1.05); ctx.restore();
    // 내 미사일
    G.shots.forEach(function (s) { if (t < s.at) return;
      if (s.pierce) { var pp = Math.min(1, (t - s.at) / s.dur), py2 = s.y0 + (s.ty - s.y0) * pp * pp * (0.6 + 0.4 * pp), xx2 = bx(s.x) + S / 2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; var gl = ctx.createLinearGradient(0, py2, 0, s.y0); gl.addColorStop(0, 'rgba(255,220,100,.55)'); gl.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = gl; ctx.fillRect(xx2 - S * 0.3, py2, S * 0.6, s.y0 - py2); ctx.restore();
        var im = IM.m_drill; if (im) { var dw = S * 0.62, dh = dw * im.height / im.width; ctx.save(); ctx.translate(xx2, py2); ctx.rotate(Math.PI); ctx.scale(1 + 0.08 * Math.sin(t / 18), 1); ctx.shadowColor = '#ffb13d'; ctx.shadowBlur = 18; ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh); ctx.restore(); }
        return; }
      var p = (t - s.at) / s.dur, yy = s.y0 + (s.ty - s.y0) * ease(p), xx = bx(s.x) + S / 2;
      ctx.save(); var gr = ctx.createRadialGradient(xx, yy + S * 0.4, 0, xx, yy + S * 0.4, S * 0.5); gr.addColorStop(0, 'rgba(255,240,180,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(xx, yy + S * 0.4, S * 0.5, 0, 7); ctx.fill(); ctx.restore();
      fit(IM.m_up, xx, yy, S * 0.55, S * 1.0); });
    // 적이 쏜 블록 (포물선 + 꼬리)
    G.shells.forEach(function (s) { var p = Math.min(1, (t - s.at) / s.dur), x1 = s.x0 + (s.x1 - s.x0) * p, y1 = s.y0 + (s.y1 - s.y0) * p - Math.sin(p * Math.PI) * s.arc, sz = S * (0.55 + 0.35 * Math.sin(p * Math.PI));
      s.last.push([x1, y1]); if (s.last.length > 10) s.last.shift();
      ctx.save(); ctx.lineCap = 'round'; for (var k = 1; k < s.last.length; k++) { ctx.strokeStyle = 'rgba(255,150,70,' + (k / s.last.length * 0.6) + ')'; ctx.lineWidth = sz * 0.35 * k / s.last.length; ctx.beginPath(); ctx.moveTo(s.last[k - 1][0], s.last[k - 1][1]); ctx.lineTo(s.last[k][0], s.last[k][1]); ctx.stroke(); } ctx.restore();
      // 떨어질 자리 표시
      ctx.save(); ctx.strokeStyle = 'rgba(255,90,60,' + (0.4 + 0.4 * Math.sin(t / 60)) + ')'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.strokeRect(bx(s.tx) + 3, by(s.ty) + 3, S - 6, S - 6); ctx.restore();
      ctx.save(); ctx.translate(x1, y1); ctx.rotate(p * 7); block(-sz / 2, -sz / 2, sz, ROCK); ctx.restore(); });
    // 효과
    G.fx = G.fx.filter(function (f) { var a = t - f.at; if (a < 0) { if (f.k === 'cell') block(bx(f.x), by(f.y), S, f.tint); return true; }
      if (f.k === 'land' || f.k === 'thud') return a < 240;
      if (f.k === 'cell') { if (a > 380) return false; var p = a / 380, s2 = S * (1 + 0.3 * p);
        ctx.save(); ctx.globalAlpha = 1 - p; block(bx(f.x) + (S - s2) / 2, by(f.y) + (S - s2) / 2, s2, f.gold ? '#ffd451' : '#fff'); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.gold ? 'rgba(255,214,80,.8)' : 'rgba(255,255,255,.7)'; ctx.fillRect(bx(f.x) + (S - s2) / 2, by(f.y) + (S - s2) / 2, s2, s2); ctx.restore(); return true; }
      if (f.k === 'beam') { if (a > 520) return false; var p2 = a / 520, th = S * (1 - p2) * (f.gold ? 1.3 : 1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        f.rows.forEach(function (y) { var cyy = by(y) + S / 2, g2 = ctx.createLinearGradient(0, cyy - th, 0, cyy + th); g2.addColorStop(0, 'rgba(255,200,80,0)'); g2.addColorStop(0.5, f.gold ? 'rgba(255,230,120,.95)' : 'rgba(255,255,230,.85)'); g2.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = g2; ctx.fillRect(OX - S, cyy - th, S * (COLS + 2), th * 2); });
        f.cols.forEach(function (x) { var cxx = bx(x) + S / 2, g3 = ctx.createLinearGradient(cxx - th, 0, cxx + th, 0); g3.addColorStop(0, 'rgba(255,200,80,0)'); g3.addColorStop(0.5, f.gold ? 'rgba(255,230,120,.95)' : 'rgba(255,255,230,.85)'); g3.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = g3; ctx.fillRect(cxx - th, BY - S, th * 2, S * (ROWS + 2)); });
        if (f.gold) { ctx.strokeStyle = 'rgba(255,250,200,' + (1 - p2) + ')'; ctx.lineWidth = 3; f.rows.forEach(function (y) { var cyy = by(y) + S / 2; ctx.beginPath(); ctx.moveTo(OX, cyy); for (var k = 1; k <= 12; k++) ctx.lineTo(OX + S * COLS * k / 12, cyy + rr(-S * 0.3, S * 0.3)); ctx.stroke(); });
          f.cols.forEach(function (x) { var cxx = bx(x) + S / 2; ctx.beginPath(); ctx.moveTo(cxx, BY); for (var k = 1; k <= 12; k++) ctx.lineTo(cxx + rr(-S * 0.3, S * 0.3), BY + S * ROWS * k / 12); ctx.stroke(); }); }
        ctx.restore(); return true; }
      if (f.k === 'ring') { if (a > f.life) return false; var p3 = a / f.life, rad = f.r0 + (f.r1 - f.r0) * (1 - (1 - p3) * (1 - p3)); ctx.save(); ctx.strokeStyle = f.col + (1 - p3) + ')'; ctx.lineWidth = f.w * (1 - p3) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, 7); ctx.stroke(); ctx.restore(); return true; }
      if (f.k === 'muzzle') { var life = f.big ? 200 : 160; if (a > life) return false; var p4 = a / life, ml = S * (f.big ? 1.1 : 0.9) * (1 - p4 * 0.5);
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.globalCompositeOperation = 'lighter'; var g4 = ctx.createRadialGradient(0, -ml * 0.3, 0, 0, -ml * 0.3, ml); g4.addColorStop(0, 'rgba(255,255,220,' + (1 - p4) + ')'); g4.addColorStop(0.4, 'rgba(255,190,60,' + (0.8 * (1 - p4)) + ')'); g4.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-ml * 0.35, -ml * 0.5); ctx.lineTo(0, -ml * 1.2); ctx.lineTo(ml * 0.35, -ml * 0.5); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(0, -ml * 0.2, ml * 0.45, 0, 7); ctx.fill(); ctx.restore(); return true; }
      if (f.k === 'boom') { var life2 = f.big ? 900 : 520; if (a > life2) return false; var fr = Math.min(8, 1 + Math.floor(a / life2 * 8)), sz = S * (f.big ? 2.4 : f.small ? 0.9 : 1.4); fit(IM['x_b' + fr], f.px, f.py - sz * 0.15, sz, sz); return true; }
      if (f.k === 'wreck') { if (a > 1200) return false; ctx.save(); ctx.globalAlpha = 1 - a / 1200; ctx.filter = 'brightness(.25)'; fit(IM['t_' + G.efac], bx(f.x) + S / 2, f.py, S * 0.95, ER * 1.1, null, f.ang + a / 900); ctx.restore(); return true; }
      if (f.k === 'flashAll') { if (a > 180) return false; ctx.fillStyle = 'rgba(' + f.col + ',' + ((f.a || 0.3) * (1 - a / 180)) + ')'; ctx.fillRect(-12, -12, W + 24, H + 24); return true; }
      if (f.k === 'bigtext') { if (a > 1300) return false; var sc2 = a < 160 ? 1.6 - 0.6 * a / 160 : 1, al = Math.min(1, (1300 - a) / 300); ctx.save(); ctx.globalAlpha = al; ctx.translate(W / 2, BY + S * 4.2); ctx.scale(sc2, sc2); ctx.shadowColor = '#ff9a1f'; ctx.shadowBlur = 24; text(f.t, 0, 0, Math.round(S * 0.95), '#ffe066'); ctx.shadowBlur = 0; text(f.sub, 0, S * 0.85, Math.round(S * 0.55), '#fff'); ctx.restore(); return true; }
      if (f.k === 'wave') { if (a > 900) return false; var wq = a / 900, wy = TY - (TY - BY + S * 2) * wq; ctx.save(); var wg = ctx.createLinearGradient(0, wy - S * 2, 0, wy + S); wg.addColorStop(0, 'rgba(79,216,255,0)'); wg.addColorStop(0.7, 'rgba(120,230,255,.55)'); wg.addColorStop(1, 'rgba(255,255,255,.8)'); ctx.fillStyle = wg; ctx.fillRect(OX - S, wy - S * 2, S * (COLS + 2), S * 3); ctx.restore(); return true; }
      if (f.k === 'sun') { if (a > 1000) return false; var sq = a / 1000, sx0 = bx(G.tank.x) + S / 2, sy0 = by(G.tank.y) + S / 2; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - sq; ctx.translate(sx0, sy0); ctx.rotate(sq * 1.2); ctx.fillStyle = 'rgba(255,220,120,.45)'; for (var ri = 0; ri < 12; ri++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-S * 0.25, -H); ctx.lineTo(S * 0.25, -H); ctx.closePath(); ctx.fill(); } ctx.restore(); return true; }
      if (f.k === 'bolt') { if (a > 450) return false; var bxp = bx(f.x) + S / 2; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(220,190,255,' + (1 - a / 450) + ')'; ctx.shadowColor = '#c58bff'; ctx.shadowBlur = 20; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bxp + rr(-8, 8), 0); for (var k2 = 1; k2 <= 7; k2++) ctx.lineTo(bxp + rr(-S * 0.35, S * 0.35), f.py * k2 / 7); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - a / 450) + ')'; ctx.stroke(); ctx.restore(); if (a < 60) { ctx.fillStyle = 'rgba(200,170,255,.25)'; ctx.fillRect(-12, -12, W + 24, H + 24); } return true; }
      if (f.k === 'pop') { if (a > 1100) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1100 - a) / 300); text(f.t, f.x, f.y - a * 0.03, Math.round(S * (f.big ? 0.62 : 0.46)), f.col); ctx.restore(); return true; }
      return false; });
    // 입자
    G.parts.forEach(function (p) { var a = 1 - (t - p.at) / p.life; ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.c;
      if (p.smoke) { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1.6 - a), 0, 7); ctx.fill(); } else if (p.sq) ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, 7); ctx.fill(); } ctx.restore(); });
    // 공습 비행기 + 폭탄
    (G.bombs || []).forEach(function (b) { var q = (t - b.at) / b.dur, tx = bx(b.e.x) + S / 2, ty = enemyY(b.e), xx = b.x0 + (tx - b.x0) * q, yy = b.y0 + (ty - b.y0) * q, sz = S * (0.5 - 0.2 * q);
      ctx.save(); ctx.fillStyle = '#2a2622'; ctx.strokeStyle = '#ffb13d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(xx, yy, sz * 0.32, sz * 0.5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); });
    G.planes.forEach(function (pl) { var pp = planePos(pl, t), im = IM['p_' + G.fac]; if (!im) return; var q = (t - pl.at) / pl.dur, sc = 1.25 - 0.25 * Math.sin(Math.min(1, q) * Math.PI);
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(pp.x + S * 0.6, pp.y + S * 1.4, S * 0.7 * sc, S * 0.25 * sc, 0, 0, 7); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(pp.x, pp.y); ctx.rotate(pp.h + Math.PI / 2); var bank = Math.cos(q * Math.PI * 4) * 0.25; ctx.scale(1 - Math.abs(bank), 1); var pw = S * 1.9 * sc, ph = pw * im.height / im.width; ctx.drawImage(im, -pw / 2, -ph / 2, pw, ph); ctx.restore(); });
    // HUD
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-12, -12, W + 24, HUD + 12);
    text('최고 ' + Math.max(best, G.score).toLocaleString(), 12, HUD / 2, 20, '#ffd451', 'left');
    text(G.score.toLocaleString(), W / 2, HUD / 2, 30, '#fff');
    text('격파 ' + G.kills, W - 12, HUD / 2, 20, '#ff9a8a', 'right');
    if (boosted) { var bl = (G.boostUntil - t) / BOOST; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(OX, HUD + 2, S * COLS, 6); ctx.fillStyle = '#ffd451'; ctx.fillRect(OX, HUD + 2, S * COLS * bl, 6); }
    // 트레이
    for (var i = 0; i < 3; i++) { var rc = slotRect(i); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(rc.x + 4, rc.y, rc.w - 8, rc.h); ctx.strokeStyle = 'rgba(214,170,70,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(rc.x + 4, rc.y, rc.w - 8, rc.h);
      var pc2 = G.tray[i]; if (!pc2 || (G.drag && G.drag.i === i)) continue; var z = pcSize(pc2);
      var cs = Math.min(S * 0.62, (rc.w - 20) / z.w, (rc.h - 14) / z.h), ox = rc.x + (rc.w - z.w * cs) / 2, oy = rc.y + (rc.h - z.h * cs) / 2, fitAny = anyFit(pc2);
      pc2.cells.forEach(function (c, ci) { block(ox + c[0] * cs, oy + c[1] * cs, cs, pc2.tint, fitAny ? 1 : 0.35); if (pc2.item && pc2.item.i === ci) itemIcon(ox + c[0] * cs, oy + c[1] * cs, cs, pc2.item.kind, t, fitAny ? 1 : 0.35); }); }
    if (G.drag && G.tray[G.drag.i]) { var pd = G.tray[G.drag.i], z2 = pcSize(pd);
      var gx0 = G.drag.p.x - z2.w * S / 2, gy0 = G.drag.p.y - S * 1.7 - z2.h * S / 2; pd.cells.forEach(function (c, ci) { block(gx0 + c[0] * S, gy0 + c[1] * S, S, pd.tint, 0.9); if (pd.item && pd.item.i === ci) itemIcon(gx0 + c[0] * S, gy0 + c[1] * S, S, pd.item.kind, t, 0.9); }); }
    // 배너
    if (G.banner) { var ba = t - G.banner.at; if (ba > 1800) G.banner = null; else { ctx.save(); ctx.globalAlpha = Math.min(1, ba / 120) * Math.min(1, (1800 - ba) / 300); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-12, BY + S * 3.4, W + 24, S * 1.3); text(G.banner.t, W / 2, BY + S * 4.05, Math.round(S * 0.62), G.banner.col); ctx.restore(); } }
    ctx.restore();
  }
  function loop() { var t = now(); update(t); draw(t); requestAnimationFrame(loop); }
  loop();

  // ---------- 시작/끝 화면 ----------
  var $ = function (id) { return document.getElementById(id); };
  function selFac(f) { fac = f; try { localStorage.setItem('tank_fac', f); } catch (e) { } document.querySelectorAll('.fac').forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); }); }
  document.querySelectorAll('.fac').forEach(function (b) { b.addEventListener('click', function () { selFac(b.dataset.f); sfx('click'); }); }); selFac(fac);
  $('go').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  function showEnd(nb) {
    var e = $('end'); e.classList.toggle('lose', !nb);
    $('endT').textContent = nb ? 'NEW BEST!' : 'GAME OVER';
    $('endS').textContent = '적 탱크 ' + G.kills + '대 격파';
    $('endB').textContent = '최고 기록!';
    $('endScore').textContent = '점수 ' + G.score.toLocaleString();
    $('endBtn').textContent = '다시 하기';
    if (nb) sfx('win');
    e.classList.remove('hidden');
  }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  window.__next = { cell: function (x, y) { return { x: bx(x) + S / 2, y: by(y) + S / 2 }; }, slot: slotRect, get: function () { return G; }, start: start, place: place, canPlace: canPlace, advance: advance, lineCheck: lineCheck, lure: lureLines, pickup: pickup, useMark: useMark, callPlane: callPlane };
})();
