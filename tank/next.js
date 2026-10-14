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
  var COLS = 9, ROWS = 10, EROWS = 4, RELOAD = 18000, BOOST = 6000, STEP = 110, ROW_MS = 3200;   // 적 탱크: 한 칸 내려오는 데 3.2초, 멈추지 않고 계속
  var FAC = { surge: { col: '#4fd8ff' }, gale: { col: '#c58bff' }, solar: { col: '#ffd451' } };
  var SHAPES = [
    [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]]
  ];
  var TINT = ['#ffcf4a', '#4fd8ff', '#9be37a', '#ff8a5a', '#c58bff'];
  var ROCK = 'rock';
  var CLK = { off: 0, paused: false, pAt: 0 };                       // 튜토리얼에서 '잠깐 멈춤'을 위한 게임 시계
  function now() { return (CLK.paused ? CLK.pAt : performance.now()) - CLK.off; }
  function clockPause() { if (!CLK.paused) { CLK.paused = true; CLK.pAt = performance.now(); } }
  function clockResume() { if (CLK.paused) { CLK.off += performance.now() - CLK.pAt; CLK.paused = false; } }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function rr(a, b) { return a + Math.random() * (b - a); }
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'bg_enemy.jpg', 'b_plain.png', 'b_scout.png', 'm_up.png', 'm_down.png', 'm_drill.png', 'sera_full.png', 'ui_dialog.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 't_' + f + '_dead.png', 'f_' + f + '.png', 'p_' + f + '.png'); });
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
    if (Math.random() < itemRate()) pc.item = { i: rnd(sh.length), kind: Math.random() < planeRate() ? 'plane' : 'mark' };   // 아이템 블록: 비행기 / 내 세력 마크
    return pc; }
  function start() {
    var efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; });
    G = { score: 0, combo: 0, moves: 0, kills: 0, fac: fac, efac: efs[rnd(2)], board: [], tank: { x: 4, y: 9, fx: 4, fy: 9, path: [], at: 0, trail: [] },
      tray: [newPiece(), newPiece(), newPiece()], en: [], dying: [], items: {}, loot: {}, planes: [], fx: [], parts: [], shots: [], shells: [], drag: null, over: false, banner: null, shake: 0, boostUntil: 0 };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    G.t0 = now(); spawn(0.5); G.spawnAt = now() + 7500;
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
  // 난이도 = 탱크가 나오는 간격: 처음 7.5초 → 5분 동안 서서히 4초까지 (±20% 랜덤)
  function gsec() { return G && G.t0 != null ? (now() - G.t0) / 1000 : 0; }   // 이번 판 경과 초
  function spawnGap(t) { var sec = (t - G.t0) / 1000, base;          // 0~20초 여유 → 20~60초 빠르게 조임 → 이후 더 정신없게
    if (sec < 20) base = 7500; else if (sec < 60) base = 7500 - (sec - 20) * (4200 / 40); else base = Math.max(2400, 3300 - (sec - 60) * (900 / 90));
    return base * rr(0.85, 1.15); }
  function itemRate() { var sec = gsec(); return sec < 20 ? 0.36 : 0.40; }       // 아이템 블록 확률: 후반엔 돌덩이가 섞여 아이템이 덜 터지므로 확률을 올려 초반만큼 나오게
  function planeRate() { var sec = gsec(); return sec < 60 ? 0.55 : 0.65; }
  function advance() { var t = now(); moveEnemies(t, ROW_MS); }   // 시험용: 한 칸 빨리 감기
  function emptyCells() { var a = []; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (!G.board[y][x] && !G.loot[x + ',' + y] && !(G.tank.x === x && G.tank.y === y) && !G.shells.some(function (s) { return s.tx === x && s.ty === y; })) a.push([x, y]); return a; }
  function wouldClear(cx, cy, skip) {                      // 이 칸을 채우면 가로줄이나 세로줄이 완성되나 (탱크 칸·날아가는 포탄 자리도 찬 것으로 침)
    function f(x, y) { return (x === cx && y === cy) || filled(x, y) || G.shells.some(function (s) { return s !== skip && s.tx === x && s.ty === y; }); }
    var r = true, c = true, i; for (i = 0; i < COLS; i++) if (!f(i, cy)) { r = false; break; } for (i = 0; i < ROWS; i++) if (!f(cx, i)) { c = false; break; } return r || c; }
  function safeCells(skip) { return emptyCells().filter(function (c) { return !wouldClear(c[0], c[1], skip); }); }   // 적이 쏴도 되는 빈칸
  function enemyFire(e, t) {                                // 정차한 적 탱크가 한 칸짜리 블록을 쏨
    var cells = safeCells();
    if (!cells.length) { e.hold = true; e.reloadAt = t + 500; return; }   // 쏠 곳이 없으면 장전한 채 대기
    e.hold = false;
    var c = cells[rnd(cells.length)], sx = bx(e.x) + S / 2, sy = ey(e.r) + ER / 2, tx = bx(c[0]) + S / 2, ty = by(c[1]) + S / 2;
    e.aimAng = Math.atan2(tx - sx, -(ty - sy));
    e.fireAt = t + 260; e.target = c; e.reloadAt = Infinity;
  }
  function enemyShoot(e, t) {
    var c = e.target, sx = bx(e.x) + S / 2, sy = ey(e.r) + ER / 2, mx = sx + Math.sin(e.ang) * S * 0.5, my = sy - Math.cos(e.ang) * S * 0.5;
    var tx = bx(c[0]) + S / 2, ty = by(c[1]) + S / 2, dist = Math.hypot(tx - mx, ty - my);
    G.shells.push({ tx: c[0], ty: c[1], x0: mx, y0: my, x1: tx, y1: ty, at: t, dur: 420 + dist * 0.9, arc: S * 1.2 + dist * 0.25, last: [] });
    e.recoil = 1; e.reloadAt = G.tut ? Infinity : t + RELOAD; e.fireAt = 0;
    G.fx.push({ k: 'muzzle', x: mx, y: my, ang: e.ang, at: t });
    burst(mx, my, 10, ['#fff3c0', '#ffb13d', '#ff6a2a'], 4, 4, 0.05, 350);
    shake(4); sfx('launch');
  }
  function shellLand(s) {
    var x = s.tx, y = s.ty, t = now();
    if (G.board[y][x] || (G.tank.x === x && G.tank.y === y) || wouldClear(x, y, s)) {   // 그새 막혔거나 떨어지면 줄이 완성되면 → 가까운 안전한 빈칸 (없으면 불발)
      var best2 = null, bd = 1e9; safeCells(s).forEach(function (c) { var d = Math.abs(c[0] - x) + Math.abs(c[1] - y); if (d < bd) { bd = d; best2 = c; } }); if (!best2) return; x = best2[0]; y = best2[1];
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
    G.tray[i] = null; if (!G.tray.some(Boolean) && !G.tut) G.tray = [newPiece(), newPiece(), newPiece()];
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
      G.banner = null; if (!G.tut) G.fx.push({ k: 'bigtext', t: 'TANK STRIKE!', sub: '관통 드릴탄 + 속도 ×1.5', at: t });
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
    var px = bx(x) + S / 2, t = now(); if (G.tut) tutKill();
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
    if (L.kind === 'plane') callPlane(t); else useMark(t, L.fac); if (G.tut) tutPicked(L); }
  function callPlane(t) {                                   // 비행기: 적진을 돌며 랜덤으로 최대 3대 폭격
    var pl = { at: t, dur: 3800, left: 3, nextDrop: t + 850 };   // 상공을 도는 동안 그때 있는 적 탱크를 골라 투하 (나중에 나온 탱크도 맞음)
    G.planes.push(pl); if (!G.tut) G.fx.push({ k: 'bigtext', t: '공습!', sub: '적 탱크 최대 3대 폭격', at: t }); G.banner = null; sfx('scout');
  }
  function planePos(pl, t) { var q = Math.min(1, (t - pl.at) / pl.dur), cx = OX + S * COLS / 2, cy = EY + EROWS * ER * 0.5, rx = S * COLS * 0.38, ry = EROWS * ER * 0.42;
    if (q < 0.18) { var a = q / 0.18; return { x: cx + (1 - a) * W * 0.1, y: H + S * 2 - (H + S * 2 - (cy + ry)) * a, h: -Math.PI / 2 }; }      // 아래에서 날아 올라옴
    if (q < 0.85) { var b = (q - 0.18) / 0.67, ang = Math.PI / 2 - b * Math.PI * 2.2; return { x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry, h: ang - Math.PI / 2 }; }   // 적진을 돌며
    var c = (q - 0.85) / 0.15, endA = Math.PI / 2 - Math.PI * 2.2, ex = cx + Math.cos(endA) * rx, ey0 = cy + Math.sin(endA) * ry; return { x: ex + c * W * 0.6, y: ey0 - c * S * 6, h: -0.6 }; }
  function useMark(t, ff) {                                  // 세력 마크: 기술 바로 발동
    var f = ff || G.fac;
    if (f === 'surge') {                                     // 서지: 적이 쏜 블록 전부 사라짐
      var n = 0; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x] === ROCK) { G.board[y][x] = 0; n++; var d = y; G.fx.push({ k: 'cell', x: x, y: y, at: t + d * 45, tint: ROCK }); (function (x, y, d) { setTimeout(function () { if (G) burst(bx(x) + S / 2, by(y) + S / 2, 8, ['#bff4ff', '#4fd8ff', '#ffffff'], 4, 4, 0.15, 600); }, d * 45); })(x, y, d); }
      G.fx.push({ k: 'wave', at: t }); if (!G.tut) G.fx.push({ k: 'bigtext', t: '서지 해일!', sub: '적 블록 ' + n + '개 쓸어버림', at: t }); G.score += n * 30;
    } else if (f === 'gale') {                               // 게일: 맨 앞 한 줄 적 탱크 번개로 괴멸
      // 게일: 적 경계선(맨 앞 가로줄)에만 번개가 가로로 번쩍 → 그 줄에 있는 적 탱크만 전부 괴멸, 뒤에 있는 탱크는 그대로
      var lineR = EROWS - 1, hit = G.en.filter(function (e) { return e.r >= lineR - 0.5; });
      G.fx.push({ k: 'hbolt', y: ey(lineR) + ER / 2, at: t + 80 }); G.fx.push({ k: 'hbolt', y: ey(lineR) + ER / 2, at: t + 260 });
      hit.sort(function (a, b) { return a.x - b.x; }).forEach(function (e, i) { G.en.splice(G.en.indexOf(e), 1); var dd = { e: e, until: t + 2000 }; G.dying.push(dd); G.kills++;
        setTimeout(function () { if (!G) return; var py = enemyY(e); dd.until = 0; explode(e.x, py, e.ang, 300); G.score += 300; }, 180 + i * 70); });
      if (!G.tut) G.fx.push({ k: 'bigtext', t: '게일 낙뢰!', sub: hit.length ? '맨 앞줄 ' + hit.length + '대 괴멸' : '맨 앞줄에 적이 없다', at: t });
    } else {                                                 // 솔라: 내가 놓은 블록 전부 사라짐 (블록 속 아이템도 함께 사라짐, 이미 바닥에 나온 아이템은 그대로)
      var m = 0; for (var y2 = 0; y2 < ROWS; y2++) for (var x2 = 0; x2 < COLS; x2++) { var v = G.board[y2][x2]; if (v && v !== ROCK) { G.board[y2][x2] = 0; delete G.items[x2 + ',' + y2]; m++; var d2 = Math.abs(x2 - G.tank.x) + Math.abs(y2 - G.tank.y); G.fx.push({ k: 'cell', x: x2, y: y2, at: t + d2 * 30, tint: v, gold: true }); } }
      G.fx.push({ k: 'flashAll', at: t, col: '255,220,120', a: 0.45 }); G.fx.push({ k: 'sun', at: t }); if (!G.tut) G.fx.push({ k: 'bigtext', t: '솔라 플레어!', sub: '블록 ' + m + '개 정리', at: t }); G.score += m * 10;
    }
    G.banner = null; shake(10); sfx('ultReady'); checkFit();
  }
  function checkFit() {
    if (G.over || G.tut) return;
    var live = G.tray.filter(Boolean); if (live.some(function (p) { return anyFit(p); })) return;
    if (live.some(function (p) { return anyFit(p, true); }) && canTankMove()) { banner('탱크를 옮겨 자리를 만드세요!', '#ffe066'); return; }
    over();
  }
  function canTankMove() { var t = G.tank; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var x = t.x + d[0], y = t.y + d[1]; return x >= 0 && x < COLS && y >= 0 && y < ROWS && !G.board[y][x]; }); }
  function over() {
    G.over = true; sfx('bad');
    var nb = G.score > best; if (nb) { best = G.score; try { localStorage.setItem('tank_easy_best', best); } catch (e) { } }
    banner('놓을 곳이 없다!', '#ff6a5a');
    // 마지막 연출: 전장의 적 탱크가 일제히 나를 조준·발사 → 내 탱크 폭파 (적이 없으면 서너 대가 한꺼번에 몰려옴)
    var t = now(), tk = G.tank, enter = 0;
    if (!G.en.length) { var cols = []; for (var x = 0; x < COLS; x++) cols.push(x); cols.sort(function () { return Math.random() - 0.5; });
      cols.slice(0, 3 + rnd(2)).forEach(function (x) { G.en.push({ x: x, r: -1, enterTo: rr(0.8, 2.2), hp: 1, parked: false, queued: false, ang: Math.PI, aimAng: Math.PI, reloadAt: Infinity, recoil: 0 }); }); enter = 750; }
    var tx = bx(tk.x) + S / 2, ty = by(tk.y) + S / 2, n = G.en.length, gap = Math.min(150, 1500 / Math.max(1, n)), aimAt = t + enter + 350;
    G.fin = { at: t, aimAt: aimAt, shots: [], blowAt: 0, nb: nb };
    G.en.forEach(function (e) { e.fireAt = 0; e.target = null; });
    G.en.slice().sort(function () { return Math.random() - 0.5; }).forEach(function (e, i) { G.fin.shots.push({ e: e, at: aimAt + 380 + i * gap, fired: false }); });
    G.fin.blowAt = aimAt + 380 + (n - 1) * gap + 330;
    G.shells = [];
  }
  function finale(t, dt) {
    var F = G.fin, tk = G.tank, tx = bx(tk.x) + S / 2, ty = by(tk.y) + S / 2;
    G.en.forEach(function (e) { if (e.enterTo != null && e.r < e.enterTo) { e.r = Math.min(e.enterTo, e.r + dt / 750 * (e.enterTo + 1)); }
      if (t >= F.aimAt) { var cy = enemyY(e); e.aimAng = Math.atan2(tx - (bx(e.x) + S / 2), -(ty - cy)); } });
    F.shots.forEach(function (sh) { if (sh.fired || t < sh.at) return; sh.fired = true; var e = sh.e, cx = bx(e.x) + S / 2, cy = enemyY(e), mx = cx + Math.sin(e.ang) * S * 0.5, my = cy - Math.cos(e.ang) * S * 0.5;
      e.recoil = 1; G.fx.push({ k: 'muzzle', x: mx, y: my, ang: e.ang, at: t }); burst(mx, my, 6, ['#fff3c0', '#ffb13d'], 3, 3, 0.05, 300);
      G.fx.push({ k: 'tracer', x0: mx, y0: my, x1: tx + rr(-S * 0.25, S * 0.25), y1: ty + rr(-S * 0.25, S * 0.25), at: t, dur: 240 }); sfx('launch'); });
    if (!F.blown && t >= F.blowAt) { F.blown = true; tk.dead = true;
      G.fx.push({ k: 'boom', px: tx, py: ty, at: t, big: true }); G.fx.push({ k: 'boom', px: tx + S * 0.4, py: ty - S * 0.3, at: t + 120 }); G.fx.push({ k: 'boom', px: tx - S * 0.4, py: ty + S * 0.2, at: t + 240 });
      G.fx.push({ k: 'flashAll', at: t, col: '255,120,60', a: 0.5 }); ring(tx, ty, S * 0.4, S * 4, 'rgba(255,170,80,', 700, 8); ring(tx, ty, S * 0.2, S * 2.4, 'rgba(255,255,255,', 400, 4);
      burst(tx, ty, 40, ['#fff3c0', '#ffb13d', '#ff6a2a', '#3a3530', '#6b6055', FAC[G.fac].col], 9, 7, 0.22, 1100);
      shake(22); sfx('boom', true); sfx('over');
      setTimeout(function () { showEnd(F.nb); }, 1500); }
    if (tk.dead && Math.random() < dt / 60) G.parts.push({ x: tx + rr(-S * 0.2, S * 0.2), y: ty - S * 0.2, vx: rr(-0.3, 0.3), vy: rr(-1.4, -0.6), g: 0, s: rr(6, 11), c: 'rgba(40,36,32,.6)', at: t, life: 1200, smoke: true });
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
  function pathTo(tx, ty, sx, sy) {
    if (sx == null) { sx = G.tank.x; sy = G.tank.y; }
    var prev = {}, q = [[sx, sy]], k0 = sx + ',' + sy; prev[k0] = null;
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
  function dropRaw(p) { var z = pcSize(G.tray[G.drag.i]); var cx = p.x - z.w * S / 2, cy = p.y - S * 1.7 - z.h * S / 2; return { fx: (cx - OX) / S, fy: (cy - BY) / S }; }
  function dropCell(p) {                                    // 손가락 위치에서 가장 가까운 '놓을 수 있는' 자리로 살짝 맞춰 줌
    if (G.tut) { var tst = TUT[G.tut.i]; if (tst && tst.act === 'drag') return { gx: tst.tgt[0], gy: tst.tgt[1], ok: tutDropOk(p, G.drag && G.drag.p0) }; }   // 튜토리얼: 판 위 어디에 놓아도 정답 자리로
    var r = dropRaw(p), gx = Math.round(r.fx), gy = Math.round(r.fy), pc = G.tray[G.drag.i];
    if (canPlace(pc, gx, gy)) return { gx: gx, gy: gy, ok: true };
    var c = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(function (d) { return { gx: gx + d[0], gy: gy + d[1], dd: Math.hypot(gx + d[0] - r.fx, gy + d[1] - r.fy) }; })
      .filter(function (q) { return q.dd < 1.05 && canPlace(pc, q.gx, q.gy); }).sort(function (a, b) { return a.dd - b.dd; });
    return c.length ? { gx: c[0].gx, gy: c[0].gy, ok: true } : { gx: gx, gy: gy, ok: false };
  }
  function tankGoal(p) {                                    // 손가락 아래 칸: 탱크가 갈 수 있으면 초록, 아니면 빨강
    var gx = Math.floor((p.x - OX) / S), gy = Math.floor((p.y - BY) / S), tk = G.tank;
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return null;
    var from = tk.path.length ? tk.path[0] : [tk.x, tk.y];
    if (gx === from[0] && gy === from[1]) return { gx: gx, gy: gy, ok: true, path: tk.path.length ? [from] : [] };
    if (G.board[gy][gx]) return { gx: gx, gy: gy, ok: false };
    var path = pathTo(gx, gy, from[0], from[1]); if (!path) return { gx: gx, gy: gy, ok: false };
    return { gx: gx, gy: gy, ok: true, path: tk.path.length ? [from].concat(path) : path };
  }
  function tutDropOk(p, p0) {                                // 튜토리얼: 조금만 끌어 올려도(또는 판 위면) 정답 자리에 들어감
    if (p.y < TY) return true; if (!p0) return false; return p0.y - p.y > S * 0.5 || Math.hypot(p.x - p0.x, p.y - p0.y) > S * 1.1; }
  function trayHit(p) {                                     // 아래 조각 칸: 칸 사이·가장자리까지 넓게 잡힘
    if (p.y < TY) return -1; var i = Math.max(0, Math.min(2, Math.floor((p.x - OX) / (S * COLS / 3)))); return G.tray[i] ? i : -1;
  }
  cv.addEventListener('pointerdown', function (e) {
    if (!G || G.over) return; var p = { x: e.clientX, y: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch (er) { }
    if (G.tut) { if (!tutDown(p)) return; }
    var i = trayHit(p); if (i >= 0) { G.drag = { i: i, p: p }; G.touch = null; sfx('pick'); return; }
    G.touch = { p: p, g: tankGoal(p) };
  });
  cv.addEventListener('pointermove', function (e) { if (!G) return; var p = { x: e.clientX, y: e.clientY }; if (G.drag) G.drag.p = p; else if (G.touch) { G.touch.p = p; G.touch.g = tankGoal(p); } });
  function release(e, cancel) {
    if (!G) return; var p = { x: e.clientX, y: e.clientY };
    if (G.drag) { var r0p = G.drag.p0, d = dropCell(p), r0 = dropRaw(p), i = G.drag.i; G.drag = null; if (cancel) return;
      if (G.tut) { var st = TUT[G.tut.i]; if (st.act === 'drag' && tutDropOk(p, r0p)) { place(i, st.tgt[0], st.tgt[1]); G.tut.acted = true; } else sfx('bad'); return; }
      if (!G.over && d.ok) place(i, d.gx, d.gy); else if (p.y < TY) sfx('bad'); return; }
    if (G.touch && !G.over) { var g = cancel ? null : tankGoal(p); G.touch = null; if (cancel) return; if (!g && !G.tut) return;
      if (G.tut) { var st2 = TUT[G.tut.i]; if (!(st2.act === 'tap' || st2.act === 'mark')) return;    // 튜토리얼: 조준경 근처(2칸 안)만 눌러도 그 칸으로
        var tcx2 = bx(st2.tgt[0]) + S / 2, tcy2 = by(st2.tgt[1]) + S / 2;
        if (Math.hypot(p.x - tcx2, p.y - tcy2) > S * 2.2) { sfx('bad'); pop('조준경 칸을 눌러라!', tcx2, tcy2 - S, '#ffe066'); return; }
        g = tankGoal({ x: tcx2, y: tcy2 }); if (!g || !g.ok) return; G.tut.acted = true; }
      if (g.ok && g.path.length) { var tk = G.tank; if (!tk.path.length) tk.at = now(); tk.path = g.path; sfx('step'); G.fx.push({ k: 'goal', x: g.gx, y: g.gy, at: now() }); }
      else if (!g.ok) { sfx('bad'); pop('갈 수 없어요', bx(g.gx) + S / 2, by(g.gy), '#ff8a7a'); } }
  }
  cv.addEventListener('pointerup', function (e) { release(e, false); });
  cv.addEventListener('pointercancel', function (e) { release(e, true); });

  // ---------- 진행 ----------
  var lastT = 0;
  function update(t) {
    if (!G) return;
    var dt = Math.min(50, t - (lastT || t)); lastT = t;
    var tk = G.tank, sm = stepMs(t);
    if (!G.over && tk.path.length && tk.path.some(function (c) { return G.board[c[1]][c[0]]; })) {   // 가는 길에 블록(적 포탄·내가 놓은 블록)이 생기면 뚫고 가지 않음
      var dest = tk.path[tk.path.length - 1], nb = G.board[tk.path[0][1]][tk.path[0][0]];
      var np = null, ok = dest && !G.board[dest[1]][dest[0]], n0 = tk.path[0];
      if (nb) { tk.at = t; if (ok) np = pathTo(dest[0], dest[1]); }                             // 바로 앞 칸이 막힘 → 제자리에서 다시 길 찾기
      else if (ok) { var rest = (n0[0] === dest[0] && n0[1] === dest[1]) ? [] : pathTo(dest[0], dest[1], n0[0], n0[1]); if (rest) np = [n0].concat(rest); }   // 더 앞이 막힘 → 지금 가던 한 칸은 마저 가고 돌아감
      if (np && np.length) tk.path = np; else { tk.path = []; pop('길이 막혔다!', bx(tk.x) + S / 2, by(tk.y) - S * 0.2, '#ff8a7a'); sfx('bad'); lineCheck(); checkFit(); }
    }
    if (!G.over && tk.path.length && t - tk.at >= sm) { var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.at = t; pickup(tk.x, tk.y, t); if (!tk.path.length) { lineCheck(); checkFit(); } }
    // 탱크 머리 방향: 탱크대전처럼 가는 쪽으로 돌면서 이동, 멈추면 다시 정면(위)
    var angT = 0; if (tk.path.length) { var nx = tk.path[0][0] - tk.x, ny = tk.path[0][1] - tk.y; if (nx || ny) angT = Math.atan2(nx, -ny); }
    if (tk.ang == null) tk.ang = 0; var dA = angT - tk.ang; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2; var stepA = 0.22 * dt / 16.7; tk.ang += Math.max(-stepA, Math.min(stepA, dA)); if (Math.abs(dA) < 0.01) tk.ang = angT;
    if (tk.path.length) { var q = Math.min(1, (t - tk.at) / sm); tk.fx = tk.x + (tk.path[0][0] - tk.x) * q; tk.fy = tk.y + (tk.path[0][1] - tk.y) * q; } else { tk.fx = tk.x; tk.fy = tk.y; }
    if (t < G.boostUntil && tk.path.length) { tk.trail.push({ x: tk.fx, y: tk.fy, at: t }); }
    tk.trail = tk.trail.filter(function (p) { return t - p.at < 260; });
    if (G.tut) tutUpdate(t); else if (!G.over) moveEnemies(t, dt); else if (G.fin) finale(t, dt);
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
      var q = (t - pl.at) / pl.dur;
      if (!G.over && pl.left > 0 && q > 0.2 && q < 0.86 && t >= pl.nextDrop) { var live = G.en.filter(function (e) { return e.r > -0.6 && (!G.tut || e.tplane); });
        if (live.length) { var e = live[rnd(live.length)], pp = planePos(pl, t); pl.left--; pl.nextDrop = t + 520;
          G.en.splice(G.en.indexOf(e), 1); G.dying.push({ e: e, until: t + 460 }); G.kills++; G.score += 300;
          G.bombs = G.bombs || []; G.bombs.push({ x0: pp.x, y0: pp.y, e: e, at: t, dur: 460 }); sfx('launch'); } }
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
    for (var lk2 in G.loot) if (!G.tut && t - G.loot[lk2].at > 5000) { var lq = lk2.split(','); burst(bx(+lq[0]) + S / 2, by(+lq[1]) + S / 2, 8, ['#ffffff', '#cccccc'], 2.5, 3, 0, 400); delete G.loot[lk2]; }
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
    if (tint === '#fff' || tint === '#ffd451') { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tint; ctx.globalAlpha = (a == null ? 1 : a) * 0.32; ctx.fillRect(x, y, s, s); }   // 블록은 탱크대전 블록 그림 그대로 (깨질 때 번쩍임만 색)
    ctx.restore();
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
      var f = e.hold ? 1 : Math.max(0, Math.min(1, 1 - (e.reloadAt - t) / RELOAD)), bw = S * 0.8, bh = Math.max(5, S * 0.12), x0 = cx - bw / 2, y0 = cy - ER * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x0 - 1, y0 - 1, bw + 2, bh + 2);
      ctx.fillStyle = e.hold ? '#ff6a3a' : f > 0.85 ? (Math.floor(t / 120) % 2 ? '#ff3b2a' : '#ffd451') : '#ff8a3a'; ctx.fillRect(x0, y0, bw * f, bh);
      var rdy = f > 0.85 && !e.hold, rfs = Math.round(S * 0.38), ra = rdy ? (Math.floor(t / 120) % 2 ? 1 : 0.55) : 0.55 + 0.45 * Math.abs(Math.sin(t / 380 + e.x));
      ctx.save(); ctx.globalAlpha = ra; ctx.font = rfs + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(3, rfs * 0.22); ctx.strokeStyle = 'rgba(0,0,0,.85)'; var rt = e.hold ? '장전 완료' : rdy ? '발사!' : '리로드';
      ctx.strokeText(rt, cx, y0 - 2); ctx.fillStyle = rdy ? '#ff5a3a' : '#ffd451'; ctx.fillText(rt, cx, y0 - 2); ctx.restore();
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
    ctx.strokeStyle = 'rgba(255,230,170,.30)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(bx(gx), BY); ctx.lineTo(bx(gx), TY); } for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(OX, by(gy)); ctx.lineTo(OX + S * COLS, by(gy)); } ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,70,.7)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(OX, BY); ctx.lineTo(OX + S * COLS, BY); ctx.stroke(); ctx.setLineDash([]);
    // 한 칸 남은 줄 → 빨갛게 깜빡 (내 탱크 부르기)
    if (!G.over && (!G.tut || (G.tut.lure && !G.tut.paused && !G.tut.acted))) { var lp = 0.5 + 0.5 * Math.sin(t / 140);
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
    for (var lk in G.loot) { var lp2 = lk.split(','), lx = +lp2[0], ly = +lp2[1], L = G.loot[lk], bob = Math.sin(t / 260 + lx * 1.7 + ly) * S * 0.08, lcx = bx(lx) + S / 2, lcy = by(ly) + S * 0.45 + bob, pul = 0.75 + 0.25 * Math.sin(t / 180 + lx), lc = L.kind === 'plane' ? '#9be37a' : FAC[L.fac || G.fac].col;
      var age = t - L.at, spawnA = Math.min(1, age / 300); if (!G.tut && age > 3000 && Math.floor(age / (age > 4200 ? 70 : 150)) % 2) spawnA *= 0.15;   // 3초 뒤부터 깜빡, 5초에 사라짐
      ctx.save(); ctx.globalAlpha = spawnA;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(lcx, by(ly) + S * 0.88, S * 0.28, S * 0.08, 0, 0, 7); ctx.fill();
      var gr = ctx.createRadialGradient(lcx, lcy, S * 0.15, lcx, lcy, S * 0.8); gr.addColorStop(0, lc + 'cc'); gr.addColorStop(0.5, lc + '55'); gr.addColorStop(1, lc + '00'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * pul * spawnA; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lcx, lcy, S * 0.8, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = spawnA; ctx.strokeStyle = lc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(lcx, lcy, S * (0.48 + 0.05 * Math.sin(t / 150 + lx)), 0, 7); ctx.stroke();
      for (var sp = 0; sp < 3; sp++) { var sa = t / 500 + sp * 2.1 + lx; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lcx + Math.cos(sa) * S * 0.42, lcy + Math.sin(sa) * S * 0.42, 2.2, 0, 7); ctx.fill(); }
      if (L.kind === 'plane') fit(IM['p_' + G.fac], lcx, lcy, S * 0.72, S * 0.72); else fit(IM['f_' + (L.fac || G.fac)], lcx, lcy, S * 0.7, S * 0.7);
      ctx.restore(); }
    // 손가락이 닿은 칸 (탱크 이동): 초록 = 갈 수 있음 / 빨강 = 못 감
    if (G.touch && G.touch.g && !G.over) { var tg = G.touch.g, okc = tg.ok, tp = 0.6 + 0.4 * Math.sin(t / 70);
      if (okc && tg.path) { ctx.fillStyle = 'rgba(155,240,120,.75)'; tg.path.forEach(function (c, i) { if (i === tg.path.length - 1) return; ctx.beginPath(); ctx.arc(bx(c[0]) + S / 2, by(c[1]) + S / 2, S * 0.09, 0, 7); ctx.fill(); }); }
      ctx.fillStyle = okc ? 'rgba(120,255,100,' + (0.3 * tp) + ')' : 'rgba(255,60,50,' + (0.35 * tp) + ')'; ctx.fillRect(bx(tg.gx), by(tg.gy), S, S);
      ctx.strokeStyle = okc ? '#8dff6a' : '#ff4a3a'; ctx.lineWidth = 3.5; ctx.strokeRect(bx(tg.gx) + 2, by(tg.gy) + 2, S - 4, S - 4); }
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = d.ok;
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
    if (boosted) { tk.trail.forEach(function (p, i) { var a = 1 - (t - p.at) / 260; fit(timg, bx(p.x) + S / 2, by(p.y) + S / 2, S * 0.95, S * 1.05, a * 0.35, tk.ang || 0);
        ctx.save(); ctx.globalAlpha = a * 0.5; ctx.fillStyle = FAC[G.fac].col; ctx.fillRect(bx(p.x) + S * 0.15, by(p.y) + S / 2 - 1, S * 0.7, 2); ctx.restore(); });
      if (tk.path.length) { var dx = tk.path[0][0] - tk.x, dy = tk.path[0][1] - tk.y; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
        for (var wl = 0; wl < 4; wl++) { var off = (wl - 1.5) * S * 0.2, px0 = bx(tk.fx) + S / 2 - dy * off, py0 = by(tk.fy) + S / 2 + dx * off, len = S * rr(0.6, 1.2);
          ctx.beginPath(); ctx.moveTo(px0 - dx * S * 0.5, py0 - dy * S * 0.5); ctx.lineTo(px0 - dx * (S * 0.5 + len), py0 - dy * (S * 0.5 + len)); ctx.stroke(); } ctx.restore(); } }
    // 내 탱크
    var mv = tk.path.length ? 1 : 0; ctx.save(); ctx.translate(bx(tk.fx) + S / 2, by(tk.fy) + S / 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, S * 0.36, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill();
    if (boosted) { ctx.fillStyle = 'rgba(255,214,80,' + (0.25 + 0.15 * Math.sin(t / 70)) + ')'; ctx.beginPath(); ctx.arc(0, 0, S * 0.62, 0, 7); ctx.fill(); }
    if (tk.dead) { fit(IM['t_' + G.fac + '_dead'] || timg, 0, 0, S * 0.95, S * 1.05, 1, 0.25); } else { var hitShake = G.fin && t > G.fin.aimAt + 380 ? Math.sin(t / 17) * 2 : 0; ctx.shadowColor = G.fin ? '#ff3b2a' : boosted ? '#ffd451' : FAC[G.fac].col; ctx.shadowBlur = G.fin ? 20 : boosted ? 22 : 10; fit(timg, hitShake, mv ? Math.sin(t / 40) * 1.5 : 0, S * 0.95, S * 1.05, null, tk.ang || 0); } ctx.restore();
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
      if (f.k === 'tracer') { if (a > f.dur) { if (!f.hit) { f.hit = true; G.fx.push({ k: 'boom', px: f.x1, py: f.y1, at: t, small: true }); burst(f.x1, f.y1, 6, ['#fff3c0', '#ff6a2a'], 3, 3, 0.1, 400); shake(5); sfx('boom', false); } return false; }
        var q = a / f.dur, hx = f.x0 + (f.x1 - f.x0) * q, hy = f.y0 + (f.y1 - f.y0) * q, q0 = Math.max(0, q - 0.35), tx0 = f.x0 + (f.x1 - f.x0) * q0, ty0 = f.y0 + (f.y1 - f.y0) * q0;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,120,60,.8)'; ctx.lineWidth = S * 0.14; ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(hx, hy); ctx.stroke(); ctx.strokeStyle = 'rgba(255,240,200,.95)'; ctx.lineWidth = S * 0.05; ctx.stroke(); ctx.restore(); return true; }
      if (f.k === 'goal') { if (a > 350) return false; var gq = a / 350; ctx.save(); ctx.strokeStyle = 'rgba(141,255,106,' + (1 - gq) + ')'; ctx.lineWidth = 3; var gs = S * (0.6 + 0.6 * gq); ctx.strokeRect(bx(f.x) + S / 2 - gs / 2, by(f.y) + S / 2 - gs / 2, gs, gs); ctx.restore(); return true; }
      if (f.k === 'hbolt') { if (a > 520) return false; var hy = f.y, al = 1 - a / 520;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; var hg = ctx.createLinearGradient(0, hy - ER, 0, hy + ER); hg.addColorStop(0, 'rgba(197,139,255,0)'); hg.addColorStop(0.5, 'rgba(210,170,255,' + (0.55 * al) + ')'); hg.addColorStop(1, 'rgba(197,139,255,0)'); ctx.fillStyle = hg; ctx.fillRect(-12, hy - ER, W + 24, ER * 2);
        for (var bl = 0; bl < 3; bl++) { ctx.beginPath(); ctx.moveTo(-10, hy + rr(-ER * 0.3, ER * 0.3)); for (var bk = 1; bk <= 16; bk++) ctx.lineTo(W * bk / 16, hy + rr(-ER * 0.45, ER * 0.45));
          ctx.strokeStyle = 'rgba(200,160,255,' + al + ')'; ctx.shadowColor = '#c58bff'; ctx.shadowBlur = 22; ctx.lineWidth = bl ? 2.5 : 5; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,' + al + ')'; ctx.lineWidth = bl ? 1 : 2; ctx.stroke(); }
        for (var bv = 0; bv < 6; bv++) { var vx = rr(0, W); ctx.beginPath(); ctx.moveTo(vx, hy); for (var bk2 = 1; bk2 <= 4; bk2++) ctx.lineTo(vx + rr(-S * 0.3, S * 0.3), hy - ER * 0.9 * bk2 / 4 * (bv % 2 ? 1 : -1)); ctx.strokeStyle = 'rgba(220,190,255,' + (al * 0.7) + ')'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.restore(); if (a < 70) { ctx.fillStyle = 'rgba(200,170,255,.22)'; ctx.fillRect(-12, -12, W + 24, H + 24); } return true; }
      if (f.k === 'pop') { if (a > 1100) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1100 - a) / 300); text(f.t, f.x, f.y - a * 0.03, Math.round(S * (f.big ? 0.62 : 0.46)), f.col); ctx.restore(); return true; }
      return false; });
    // 입자
    G.parts.forEach(function (p) { var a = 1 - (t - p.at) / p.life; ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.c;
      if (p.smoke) { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1.6 - a), 0, 7); ctx.fill(); } else if (p.sq) ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, 7); ctx.fill(); } ctx.restore(); });
    // 공습 비행기 + 폭탄
    (G.bombs || []).forEach(function (b) { var q = (t - b.at) / b.dur, tx = bx(b.e.x) + S / 2, ty = enemyY(b.e), xx = b.x0 + (tx - b.x0) * q, yy = b.y0 + (ty - b.y0) * q, sz = S * (0.5 - 0.2 * q);
      var im = IM.m_down, ang = Math.atan2(-(tx - b.x0), ty - b.y0);   // 탱크대전 미사일(아래 향함)을 목표 쪽으로 돌려서
      if (Math.random() < 0.8) G.parts.push({ x: xx - Math.sin(-ang) * S * 0.3, y: yy - Math.cos(ang) * S * 0.3, vx: rr(-0.3, 0.3), vy: rr(-0.3, 0.3), g: 0, s: rr(3, 6), c: Math.random() < 0.4 ? '#ffb13d' : 'rgba(200,190,180,.6)', at: t, life: 360, smoke: true });
      if (im) { var mw = S * 0.5, mh = mw * im.height / im.width; ctx.save(); ctx.translate(xx, yy); ctx.rotate(ang); ctx.drawImage(im, -mw / 2, -mh / 2, mw, mh); ctx.restore(); } });
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
  // =================== 튜토리얼 ===================
  // 실제 게임판에서 상황을 만들어 두고, 해야 할 곳만 밝게 + 손가락이 움직이며 안내 → 플레이어가 직접 함 → 결과 순간에 잠깐 멈추고 설명
  var TUT = [
    { act: 'drag', piece: [[0, 0], [1, 0]], tgt: [6, 8], text: '제군들, 들어라!\n블록을 끌어다 가로줄을 채워라!', kills: 1, focus: [[4, 'col']],
      after: '줄을 지우면 탱크가 미사일을 쏜다!\n같은 세로줄 맨 앞 적을 부술 수 있다\n블록은 미사일을 막지 않는다' },
    { act: 'tap', tgt: [2, 8], text: '칸을 누르면 탱크가 그곳으로 간다\n아이템을 손에 넣어라!', kills: 3, after: '공습이다!\n비행기가 적 탱크 3대를 폭격한다' },
    { act: 'tap', tgt: [7, 7], lure: true, text: '한 칸 남은 줄이다!\n탱크로 직접 메워라!', kills: 3, focus: [[7, 'col']],
      after: '탱크로 줄을 메우면 관통 드릴탄!\n줄 선 적까지 한 번에 뚫을 수 있다\n잠시 속도도 1.5배다' },
    { act: 'drag', piece: [[0, 0], [0, 1]], tgt: [3, 5], text: '이번엔 두 줄을\n한 번에 지워라!', kills: 2, focus: [[6, 'col'], [7, 'col'], [8, 'col']],
      after: '두 줄 이상 지우면\n미사일이 세 갈래로 날아간다!' },
    { act: 'volley', after: '적은 돌덩이 블록을 쏘아 온다!\n줄을 지워 치워 버려라' },
    { act: 'mark', fac: 'surge', tgt: [4, 8], text: '세력 마크를 손에 넣어라!\n얻는 즉시 기술이 발동한다', after: '서지 해일!\n적의 돌덩이를 모두 쓸어버릴 수 있다' },
    { act: 'mark', fac: 'gale', tgt: [2, 8], text: '다음 마크도 손에 넣어라!', after: '게일 낙뢰!\n맨 앞줄 적 탱크를 모두 괴멸시킨다' },
    { act: 'mark', fac: 'solar', tgt: [6, 8], text: '마지막 마크다!', after: '솔라 플레어!\n판의 블록을 모두 정리할 수 있다\n실전에선 제군의 세력 마크만 나온다' },
    { act: 'end', after: '훈련 끝!\n제군들, 출격하라!' }
  ];
  var TUTC = null;
  function startTut() {
    clockResume(); start(); var t = now(); G.banner = null; G.spawnAt = Infinity; G.en = []; G.tray = [null, null, null];
    G.tut = { i: -1, kills: 0, acted: false, paused: false, pauseAt: 0, lure: false, shownAt: 0 };
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) G.board[y][x] = 0;
    [0, 1, 5, 6, 8].forEach(function (x) { G.board[9][x] = '#fff0'; });                       // 맨 아래줄 일부
    for (var x2 = 0; x2 < COLS; x2++) { if (x2 !== 6 && x2 !== 7) G.board[8][x2] = '#fff0'; if (x2 !== 7) G.board[7][x2] = '#fff0'; if (x2 !== 3) { G.board[6][x2] = '#fff0'; G.board[5][x2] = '#fff0'; } }
    G.items['2,8'] = 'plane';
    G.tank.x = 4; G.tank.y = 9; G.tank.fx = 4; G.tank.fy = 9; G.tank.path = [];
    function tank(x, r, extra) { var e = { x: x, r: r, hp: 1, parked: r >= EROWS - 1, queued: false, ang: Math.PI, aimAng: Math.PI, reloadAt: Infinity, recoil: 0 }; for (var k in extra) e[k] = extra[k]; G.en.push(e); }
    for (var c = 0; c < COLS; c++) tank(c, EROWS - 1);                                            // 경계선에 적 탱크 가득
    tank(7, EROWS - 2); tank(7, EROWS - 3);                                                       // 7번 줄: 3대 줄 서기 (드릴용)
    [0, 2, 5].forEach(function (c) { tank(c, EROWS - 3, { tplane: true }); });                    // 비행기 표적
    $('tutExit').classList.remove('hidden');
    tutNext();
  }
  function tutNext() {
    var T = G.tut; T.i++; T.kills = 0; T.acted = false; T.pauseAt = 0; var st = TUT[T.i]; T.lure = !!st.lure; T.shownAt = performance.now();
    if (st.piece) G.tray = [null, { cells: st.piece, tint: '#fff0' }, null];
    if (st.act === 'mark') G.loot[st.tgt[0] + ',' + st.tgt[1]] = { kind: 'mark', fac: st.fac, at: now() };
    if (st.act === 'volley') {                                                                      // 남은 적 탱크 일제 사격 → 돌덩이
      var cells = []; for (var y = 1; y <= 4; y++) for (var x = 0; x < COLS; x++) cells.push([x, y]); cells.sort(function () { return Math.random() - 0.5; });
      var t = now(); G.en.filter(function (e) { return e.parked; }).forEach(function (e, i) { var c = cells[i], sx = bx(e.x) + S / 2, sy = ey(e.r) + ER / 2;
        e.aimAng = Math.atan2(bx(c[0]) + S / 2 - sx, -(by(c[1]) + S / 2 - sy)); e.target = c; e.fireAt = t + 500 + i * 160; });
      T.volley = true; }
    if (st.act === 'end') { tutPause(); }
  }
  function tutKill() { var T = G.tut, st = TUT[T.i]; T.kills++; if (st.kills && T.kills >= st.kills && !T.pauseAt) T.pauseAt = now() + 170; }
  function tutPicked(L) { var T = G.tut, st = TUT[T.i]; if (st.act === 'mark') T.pauseAt = now() + 1300; }
  function tutPause() { G.tut.paused = true; G.tut.shownAt = performance.now(); clockPause(); sfx('ding'); }
  function tutUpdate(t) { var T = G.tut, st = TUT[T.i]; if (T.paused) return;
    if (T.pauseAt && t >= T.pauseAt) { T.pauseAt = 0; tutPause(); return; }
    if (st.act === 'volley' && T.volley && !T.pauseAt && !G.shells.length && !G.en.some(function (e) { return e.fireAt; }) && t > 0) { T.volley = false; T.pauseAt = t + 500; } }
  function tutDown(p) {                                         // true = 이 터치를 게임에 넘김
    var T = G.tut, st = TUT[T.i];
    if (T.paused) { if (performance.now() - T.shownAt < 450) return false; T.paused = false; clockResume();
      if (st.act === 'end') { tutFinish(); return false; } tutNext(); return false; }
    if (T.acted || T.pauseAt) return false;
    if (st.act === 'drag') { if (p.y >= TY - S * 0.3) { G.drag = { i: 1, p: p, p0: p }; G.touch = null; sfx('pick'); } return false; }   // 아래 조각 칸 어디를 눌러도 집힘
    if (st.act === 'tap' || st.act === 'mark') return true;
    return false;
  }
  function tutFinish() { try { localStorage.setItem('tank_tut_done', '1'); } catch (e) { } $('tutExit').classList.add('hidden'); clockResume(); sfx('go'); start(); }
  function tutExit() { $('tutExit').classList.add('hidden'); clockResume(); G = null; $('end').classList.add('hidden'); $('title').classList.remove('hidden'); }
  function finger(x, y, t, press) { ctx.save(); ctx.translate(x, y); var sc = press ? 1 - 0.12 * Math.max(0, Math.sin(t / 160)) : 1; ctx.scale(sc, sc);
    ctx.font = Math.round(S * 1.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 10; ctx.fillText('👆', 0, -S * 0.05); ctx.restore();
    if (press) { var rp = (t % 900) / 900; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,' + (1 - rp) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, S * (0.2 + 0.5 * rp), 0, 7); ctx.stroke(); ctx.restore(); } }
  function reticle(x, y, rt) {                               // 누를 칸: 조준경이 조여들며 고정(좌표 찍는 느낌)
    var q = (rt % 1400) / 1400, lock = Math.min(1, q / 0.45), e = 1 - Math.pow(1 - lock, 3), r = S * (1.25 - 0.62 * e), arm = S * 0.28, col = '#ffffff';
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; var gg = ctx.createRadialGradient(x, y, S * 0.1, x, y, S * 0.9); gg.addColorStop(0, 'rgba(255,255,255,' + (0.18 + 0.2 * e) + ')'); gg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gg; ctx.fillRect(x - S, y - S, S * 2, S * 2); ctx.restore();
    ctx.save(); ctx.strokeStyle = col; ctx.shadowColor = '#9fe8ff'; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(3, S * 0.07); ctx.lineCap = 'round';
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (k) { var cx = x + k[0] * r, cy = y + k[1] * r; ctx.beginPath(); ctx.moveTo(cx, cy - k[1] * arm); ctx.lineTo(cx, cy); ctx.lineTo(cx - k[0] * arm, cy); ctx.stroke(); });   // 네 모서리 꺾쇠
    ctx.lineWidth = Math.max(2, S * 0.045); ctx.globalAlpha = 0.85; var g0 = S * 0.18, g1 = S * 0.42;                    // 가운데 십자선
    ctx.beginPath(); ctx.moveTo(x - g1, y); ctx.lineTo(x - g0, y); ctx.moveTo(x + g0, y); ctx.lineTo(x + g1, y); ctx.moveTo(x, y - g1); ctx.lineTo(x, y - g0); ctx.moveTo(x, y + g0); ctx.lineTo(x, y + g1); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = lock >= 1 ? '#ff4a3a' : col; ctx.beginPath(); ctx.arc(x, y, S * 0.07, 0, 7); ctx.fill();
    if (lock >= 1) { var rp = (q - 0.45) / 0.55; ctx.globalAlpha = 1 - rp; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, S * (0.3 + 0.55 * rp), 0, 7); ctx.stroke(); }
    ctx.restore(); }
  function dialogBox(x, y, w, h) {                            // 대화 상자 테두리(9칸 늘이기: 네 모서리 고정, 위 가운데 장식 고정, 나머지 늘림)
    var im = IM.ui_dialog; if (!im) { ctx.save(); ctx.fillStyle = 'rgba(10,8,4,.88)'; ctx.strokeStyle = '#d6aa46'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 12) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke(); ctx.restore(); return 10; }
    var iw = im.width, ih = im.height, cs = 82, k = Math.min(S * 0.34 / 29, h / (cs * 2), w / (cs * 2.4)), d = cs * k, cm = 30, dm = cm * k;
    function p(sx, sy, sw, sh, dx, dy, dw, dh) { if (dw > 0 && dh > 0) ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh); }
    var sw2 = (iw - cs * 2 - cm) / 2, dw2 = (w - d * 2 - dm) / 2;
    p(0, 0, cs, cs, x, y, d, d); p(iw - cs, 0, cs, cs, x + w - d, y, d, d); p(0, ih - cs, cs, cs, x, y + h - d, d, d); p(iw - cs, ih - cs, cs, cs, x + w - d, y + h - d, d, d);
    p(cs, 0, sw2, cs, x + d, y, dw2, d); p(cs + sw2, 0, cm, cs, x + d + dw2, y, dm, d); p(cs + sw2 + cm, 0, sw2, cs, x + d + dw2 + dm, y, dw2, d);   // 위 (가운데 장식 고정)
    p(cs, ih - cs, iw - cs * 2, cs, x + d, y + h - d, w - d * 2, d);
    p(0, cs, cs, ih - cs * 2, x, y + d, d, h - d * 2); p(iw - cs, cs, cs, ih - cs * 2, x + w - d, y + d, d, h - d * 2);
    p(cs, cs, iw - cs * 2, ih - cs * 2, x + d, y + d, w - d * 2, h - d * 2);
    return 34 * k + 4; }
  function caption(txt, cy, big, shownAt) {                     // 설명 상자 + 왼쪽에 전신 지휘관 세라(뻗은 손이 상자 위에서 상자를 가리킴)
    var im = IM.sera_full, fs = Math.round(S * (big ? 0.52 : 0.5)), font = fs + 'px "Black Han Sans", "Do Hyeon", sans-serif';
    var sh = Math.min(H * 0.33, S * 6.8), sw = im ? sh * im.width / im.height : 0, x0 = im ? 4 + sw * 0.6 : 8, w = W - x0 - 8;
    ctx.save(); ctx.font = font; var lines = [];                  // 상자 폭에 맞게 줄바꿈 (글씨는 줄이지 않음)
    txt.split('\n').forEach(function (para, pi) { var cur = ''; para.split(' ').forEach(function (wd) { var tr = cur ? cur + ' ' + wd : wd; if (ctx.measureText(tr).width > w - S * 1.2 && cur) { lines.push([cur, pi]); cur = wd; } else cur = tr; }); lines.push([cur, pi]); });
    ctx.restore();
    var bpad = S * 0.34 / 29 * 34 + 4, lh = fs * 1.3, h = lines.length * lh + fs * 0.6 + bpad * 2, top = cy - h / 2, sTop = top - sh * 0.275 - S * 0.4;
    if (sTop < HUD + 4) { top += HUD + 4 - sTop; sTop = HUD + 4; }
    var ap = shownAt ? Math.min(1, (performance.now() - shownAt) / 260) : 1, slide = (1 - ap) * -sw * 0.35;
    if (im) { ctx.save(); ctx.globalAlpha = ap; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14; ctx.drawImage(im, 2 + slide, sTop, sw, sh); ctx.restore(); }
    dialogBox(x0, top, w, h);
    var nh = S * 0.78, nfs = Math.round(S * 0.46), sfs = Math.round(S * 0.4);          // 이름표: 세라 · 소속 불명
    ctx.save(); ctx.font = nfs + 'px "Black Han Sans", "Do Hyeon", sans-serif'; var nw1 = ctx.measureText('세라').width; ctx.font = sfs + 'px "Black Han Sans", "Do Hyeon", sans-serif'; var nw2 = ctx.measureText('소속 불명').width; ctx.restore();
    var nw = nw1 + nw2 + S * 1.1, nx = x0 + S * 0.35, ny = top - nh * 0.62;
    ctx.save(); var ng = ctx.createLinearGradient(0, ny, 0, ny + nh); ng.addColorStop(0, '#24365a'); ng.addColorStop(1, '#0f1a30'); ctx.fillStyle = ng; ctx.strokeStyle = '#dfe8f5'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(nx, ny, nw, nh, 8) : ctx.rect(nx, ny, nw, nh); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke(); ctx.restore();
    text('세라', nx + S * 0.4 + nw1 / 2, ny + nh / 2, nfs, '#ffffff', 'center', Math.max(2, nfs * 0.14));
    text('소속 불명', nx + S * 0.7 + nw1 + nw2 / 2, ny + nh / 2 + 1, sfs, '#9fb3cc', 'center', Math.max(2, sfs * 0.14));
    lines.forEach(function (l, i) { ctx.save(); if (l[1] === 0) { ctx.shadowColor = 'rgba(160,210,255,.85)'; ctx.shadowBlur = 10; } text(l[0], x0 + w / 2, top + bpad + fs * 0.3 + lh * (i + 0.5), fs, l[1] === 0 ? '#eaf4ff' : '#ffffff', 'center', Math.max(3, fs * 0.16)); ctx.restore(); });
    return h; }
  function drawTut(t) {
    var T = G && G.tut; if (!T || T.i < 0) return; var st = TUT[T.i], rt = performance.now(), holes = [], lanes = [];
    function cellR(x, y, pad) { pad = pad || 4; return [bx(x) - pad, by(y) - pad, S + pad * 2, S + pad * 2]; }
    if (T.paused) {
      (st.focus || []).forEach(function (f) { if (f[1] === 'col') holes.push([bx(f[0]) - 3, EY, S + 6, by(G.tank.y) + S - EY + 3]); });
      if (st.act === 'end') holes = [];
    } else if (!T.acted && !T.pauseAt) {
      if (st.act === 'drag') { var sr = slotRect(1); holes.push([sr.x, sr.y - 4, sr.w, sr.h + 8]); st.piece.forEach(function (c) { holes.push(cellR(st.tgt[0] + c[0], st.tgt[1] + c[1])); });
        var pz = { w: 0, h: 0 }; st.piece.forEach(function (c) { pz.w = Math.max(pz.w, c[0] + 1); pz.h = Math.max(pz.h, c[1] + 1); });
        lanes.push([sr.x + sr.w / 2, sr.y + sr.h / 2, bx(st.tgt[0]) + pz.w * S / 2, by(st.tgt[1]) + pz.h * S / 2, S * 1.25]); }   // 손가락이 지나가는 길
      if (st.act === 'tap' || st.act === 'mark') { holes.push(cellR(st.tgt[0], st.tgt[1], 6)); T.tapHole = true; } else T.tapHole = false;   // 누를 칸만 밝게
    }
    var dim = T.paused || (!T.acted && !T.pauseAt && st.act !== 'volley');
    if (dim) {                                                   // 어둡게 깔고 구멍(할 곳 + 지나가는 길)만 지움 — 겹쳐도 다시 어두워지지 않게 따로 그림
      var oc = TUTC || (TUTC = document.createElement('canvas')); if (oc.width !== cv.width || oc.height !== cv.height) { oc.width = cv.width; oc.height = cv.height; }
      var g = oc.getContext('2d'), dpr = cv.width / W; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, oc.width, oc.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = T.paused ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.58)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      holes.forEach(function (h) { g.fillRect(h[0], h[1], h[2], h[3]); });
      lanes.forEach(function (l) { g.globalAlpha = 0.85; g.lineCap = 'round'; g.lineWidth = l[4]; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.strokeStyle = '#000'; g.stroke(); g.globalAlpha = 1; });
      g.globalCompositeOperation = 'source-over'; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(oc, 0, 0); ctx.restore();
      lanes.forEach(function (l) { ctx.save(); ctx.strokeStyle = 'rgba(255,224,80,' + (0.35 + 0.3 * Math.sin(rt / 160)) + ')'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]); ctx.lineDashOffset = -rt / 25; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke(); ctx.restore(); });
      if (!T.tapHole || T.paused) holes.forEach(function (h) { ctx.save(); ctx.strokeStyle = 'rgba(255,224,80,' + (0.5 + 0.5 * Math.sin(rt / 160)) + ')'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -rt / 40; ctx.strokeRect(h[0], h[1], h[2], h[3]); ctx.restore(); });
      if ((st.act === 'tap' || st.act === 'mark') && !T.paused) reticle(bx(st.tgt[0]) + S / 2, by(st.tgt[1]) + S / 2, rt); }
    if (T.paused) { var cy = st.act === 'end' ? H * 0.42 : BY + S * 2.6; var chh = caption(st.after, cy, true, T.shownAt); var ky = Math.min(TY - S * 0.7, cy + chh / 2 + S * 0.95), kp = 0.5 + 0.5 * Math.sin(rt / 180), kw = Math.min(W - 24, S * 6.4), kh = S * 1.15;   // 크게 강조한 '화면을 눌러 계속'
      ctx.save(); ctx.translate(W / 2, ky); ctx.scale(1 + 0.04 * kp, 1 + 0.04 * kp); ctx.shadowColor = '#ffd451'; ctx.shadowBlur = 18 + 10 * kp; ctx.fillStyle = 'rgba(20,16,6,.92)'; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-kw / 2, -kh / 2, kw, kh, kh / 2) : ctx.rect(-kw / 2, -kh / 2, kw, kh); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      text('👆 화면을 눌러 계속 ▶', 0, 0, Math.round(S * 0.62), '#ffe066'); ctx.restore(); return; }
    if (T.acted || T.pauseAt || !st.text) return;
    caption(st.text, BY + S * 2.4, false, T.shownAt);
    if (st.act === 'drag' && G.drag && G.tray[G.drag.i]) {                 // 잡은 블록은 어둡게 덮이지 않게 맨 위에 또렷하게 (본게임과 같은 모습)
      var pd = G.tray[G.drag.i], zz = pcSize(pd), gx0 = G.drag.p.x - zz.w * S / 2, gy0 = G.drag.p.y - S * 1.7 - zz.h * S / 2, dc = dropCell(G.drag.p);
      if (dc.ok) pd.cells.forEach(function (c) { var X = dc.gx + c[0], Y = dc.gy + c[1]; ctx.fillStyle = 'rgba(155,227,122,.45)'; ctx.fillRect(bx(X) + 2, by(Y) + 2, S - 4, S - 4); });
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12; pd.cells.forEach(function (c) { block(gx0 + c[0] * S, gy0 + c[1] * S, S, pd.tint, 1); }); ctx.restore(); return; }
    if (st.act === 'drag') { var s0 = slotRect(1), q = (rt % 1800) / 1800, e2 = Math.min(1, q / 0.7), ee = e2 * e2 * (3 - 2 * e2), x0 = s0.x + s0.w / 2, y0 = s0.y + s0.h / 2, x1 = bx(st.tgt[0]) + S, y1 = by(st.tgt[1]) + S * 0.5 + S * 1.7;
      if (q < 0.85) { ctx.save(); ctx.globalAlpha = 0.55; st.piece.forEach(function (c) { block(x0 + (x1 - x0) * ee - S + c[0] * S, y0 + (y1 - y0) * ee - S * 1.7 - S * 0.5 + c[1] * S, S, '#fff0'); }); ctx.restore(); finger(x0 + (x1 - x0) * ee, y0 + (y1 - y0) * ee, rt, false); } }
    if (st.act === 'tap' || st.act === 'mark') { var fq = (rt % 1400) / 1400, fb = fq < 0.45 ? (1 - fq / 0.45) : 0; finger(bx(st.tgt[0]) + S / 2, by(st.tgt[1]) + S * 0.5 + fb * S * 0.4, rt, false); }   // 조준이 잠기는 순간 손가락이 콕
  }
  var LERR = null;
  function loop() { requestAnimationFrame(loop); var t = now();           // 한 프레임에서 오류가 나도 게임이 멈추지 않게
    try { update(t); } catch (er) { LERR = LERR || ('U ' + er.message); }
    try { draw(t); drawTut(t); } catch (er) { LERR = LERR || ('D ' + er.message); try { ctx.restore(); } catch (e2) { } }
    if (LERR) { ctx.save(); ctx.setTransform(cv.width / W, 0, 0, cv.width / W, 0, 0); ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, H - 22, W, 22); ctx.fillStyle = '#ff8a7a'; ctx.fillText('오류: ' + LERR.slice(0, 60), 6, H - 6); ctx.restore(); } }
  loop();

  // ---------- 시작/끝 화면 ----------
  var $ = function (id) { return document.getElementById(id); };
  function selFac(f) { fac = f; try { localStorage.setItem('tank_fac', f); } catch (e) { } document.querySelectorAll('.fac').forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); }); }
  document.querySelectorAll('.fac').forEach(function (b) { b.addEventListener('click', function () { selFac(b.dataset.f); sfx('click'); }); }); selFac(fac);
  $('go').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  if ($('tutBtn')) $('tutBtn').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); startTut(); });
  if ($('tutExit')) $('tutExit').addEventListener('click', tutExit);
  function showEnd(nb) {
    var e = $('end'); e.classList.toggle('lose', !nb);
    $('endT').textContent = nb ? 'NEW BEST!' : 'GAME OVER';
    $('endS').textContent = '적 탱크 ' + G.kills + '대 격파';
    $('endB').textContent = '최고 기록!';
    $('endScore').textContent = '점수 ' + G.score.toLocaleString();
    $('endBtn').textContent = '다시 하기';
    sfx('resultMusic', nb);   // 탱크대전과 같은 결과 음악(최고 기록 = 승리 음악, 아니면 패배 음악)
    e.classList.remove('hidden');
    try { if (window.TR_RANK) TR_RANK.onEnd(G.score, G.fac); } catch (er) { }
  }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  window.__next = { cell: function (x, y) { return { x: bx(x) + S / 2, y: by(y) + S / 2 }; }, slot: slotRect, get: function () { return G; }, start: start, place: place, canPlace: canPlace, advance: advance, lineCheck: lineCheck, lure: lureLines, pickup: pickup, useMark: useMark, callPlane: callPlane, over: over };
})();
