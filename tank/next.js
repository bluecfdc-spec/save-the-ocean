/* TANK RUMBLE — 새 규칙 시험판 v2 (2026-10-14, 홍균 설계)
   - 전장 12줄. 절점(진영 경계선) 위 = 적 땅, 아래 = 내 땅(블록 판). 시작 내 8줄 / 적 4줄.
   - 절점 끝에 양쪽 포탑이 행의 절반(4개)씩 랜덤 배치. 내 포탑은 내 맨 윗줄 칸에 서고 블록 한 칸 역할.
   - 30초마다(절점이 시한폭탄처럼 빨갛게 차오름) 포탑이 많은 쪽이 절점을 1칸 밀고 감, 같으면 그대로. 그 뒤 양쪽 다 다시 절반씩.
   - 줄을 깨면 탱크가 자기 세로줄 위로 발사 → 적 포탑 제거.
   - 포탑 아이템 블록: 그 줄을 깨면 아이템이 떠 있고 탱크가 먹으면 내 포탑 +1 (줄이 꽉 차 있으면 +500).
   - 적은 일정 시간마다 포탑 1개 보충(점점 빨라짐). 적은 포탑 1줄은 항상 유지 — 더 밀 곳이 없으면 +1000.
   - 무제한 점수. 블록을 놓을 수 없으면 게임 오버(탱크 파괴 조건은 나중에). */
(function () {
  'use strict';
  var COLS = 9, TOTAL = 12, START_L = 4, HALF = 4, ROUND = 30000, ULT_MAX = 6;
  var FAC = { surge: { name: '서지', skill: '폭풍우 — 적 보충 10초 멈춤', col: '#4fd8ff' }, gale: { name: '게일', skill: '낙뢰 — 적 포탑 3개 파괴', col: '#c58bff' }, solar: { name: '솔라', skill: '태양 — 내 포탑 +2', col: '#ffd451' } };
  var SHAPES = [
    [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]]
  ];
  var TINT = ['#ffcf4a', '#4fd8ff', '#9be37a', '#ff8a5a', '#c58bff'];
  function now() { return performance.now(); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'bg_enemy.jpg', 'b_plain.png', 'd_wire1.png', 'm_up.png', 'ui_bunker.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 'k_' + f + '_e2.png', 'k_' + f + '_m2.png', 'k_' + f + '_e4.png', 'k_' + f + '_m4.png', 'f_' + f + '.png'); });
  for (var i = 1; i <= 8; i++) LIST.push('x_b' + i + '.png');
  LIST.forEach(function (n) { var im = new Image(); im.onload = function () { IM[n.replace(/\.(png|jpg)$/, '')] = im; }; im.src = 'assets/v2/' + n + '?v=6'; });

  // ---------- 화면 ----------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 0, H = 0, S = 40, OX = 0, HUD = 50, BOT = 70, FY = 0, TY = 0, TH = 0;
  function layout() {
    var dpr = Math.min(3, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.floor(Math.min(W / COLS, (H - HUD - BOT - 6) / (TOTAL + 2.6)));
    OX = Math.floor((W - S * COLS) / 2); TH = S * 2.6;
    TY = H - BOT - TH; FY = TY - TOTAL * S;                      // 전장 맨 위 y
  }
  window.addEventListener('resize', layout); layout();
  function bx(x) { return OX + x * S; } function by(y) { return FY + y * S; }

  // ---------- 상태 ----------
  var G = null, fac = 'solar', best = 0;
  try { fac = localStorage.getItem('tank_fac') || 'solar'; best = +localStorage.getItem('tank_next_best') || 0; } catch (e) { }
  function newPiece() { var sh = SHAPES[rnd(SHAPES.length)], item = Math.random() < 0.28 ? rnd(sh.length) : -1; return { cells: sh, tint: TINT[rnd(TINT.length)], item: item }; }
  function start() {
    var efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; }), t = now();
    G = { score: 0, combo: 0, fac: fac, efac: efs[rnd(2)], L: START_L, board: [], items: [], loot: {}, myT: [], enT: [],
      tank: { x: 4, y: TOTAL - 2, fx: 4, fy: TOTAL - 2, path: [], at: 0 }, tray: [newPiece(), newPiece(), newPiece()],
      roundAt: t + ROUND, rounds: 0, reinAt: t + 10000, freezeUntil: 0, ult: 0, fx: [], shots: [], drag: null, over: false, banner: null, shake: 0 };
    for (var y = 0; y < TOTAL; y++) { G.board.push([]); G.items.push([]); for (var x = 0; x < COLS; x++) { G.board[y].push(0); G.items[y].push(0); } }
    resetTurrets(); banner('절점을 지켜라!', '#ffd451');
  }
  function reinMs() { return Math.max(4000, 10000 - G.rounds * 600); }   // 적 포탑 보충 간격 (라운드마다 빨라짐)
  function resetTurrets() {                                  // 양쪽 다 행의 절반씩 랜덤
    G.enT = [0, 0, 0, 0, 0, 0, 0, 0, 0]; shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, HALF).forEach(function (x) { G.enT[x] = 1; });
    G.myT = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var free = [], y = G.L; for (var x = 0; x < COLS; x++) if (!G.board[y][x] && !(G.tank.x === x && G.tank.y === y)) free.push(x);
    shuffle(free); var all = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).filter(function (x) { return !(G.tank.x === x && G.tank.y === y); });
    var pick = free.slice(0, HALF); for (var k = 0; pick.length < HALF && k < all.length; k++) if (pick.indexOf(all[k]) < 0) pick.push(all[k]);
    pick.forEach(function (x) { if (G.board[y][x]) { G.board[y][x] = 0; G.items[y][x] = 0; } delete G.loot[x + ',' + y]; G.myT[x] = 1; });
  }
  function cnt(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function banner(t, col) { G.banner = { t: t, col: col || '#fff', at: now() }; }
  function pop(t, x, y, col, big) { G.fx.push({ k: 'pop', t: t, x: x, y: y, col: col || '#fff', big: big, at: now() }); }

  // ---------- 판 규칙 ----------
  function isMyT(x, y) { return y === G.L && G.myT[x]; }
  function tankAt(x, y) { var t = G.tank; return !t.path.length && t.x === x && t.y === y; }
  function filled(x, y) { return G.board[y][x] || tankAt(x, y) || isMyT(x, y); }
  function blocked(x, y) { return G.board[y][x] || isMyT(x, y); }
  function canPlace(p, gx, gy) { for (var i = 0; i < p.cells.length; i++) { var x = gx + p.cells[i][0], y = gy + p.cells[i][1]; if (x < 0 || x >= COLS || y < G.L || y >= TOTAL) return false; if (blocked(x, y) || (G.tank.x === x && G.tank.y === y)) return false; } return true; }
  function anyFit(p) { for (var y = G.L; y < TOTAL; y++) for (var x = 0; x < COLS; x++) if (canPlace(p, x, y)) return true; return false; }
  function place(i, gx, gy) {
    var p = G.tray[i]; p.cells.forEach(function (c, k) { var x = gx + c[0], y = gy + c[1]; G.board[y][x] = p.tint; G.items[y][x] = k === p.item ? 1 : 0; delete G.loot[x + ',' + y]; });
    G.tray[i] = null; if (!G.tray.some(Boolean)) G.tray = [newPiece(), newPiece(), newPiece()];
    sfx('place'); G.score += p.cells.length * 5;
    if (!lineCheck()) G.combo = 0;
    checkFit();
  }
  function lineCheck() {
    var rows = [], cols = [], x, y, full;
    for (y = G.L; y < TOTAL; y++) { full = true; for (x = 0; x < COLS; x++) if (!filled(x, y)) { full = false; break; } if (full) rows.push(y); }
    for (x = 0; x < COLS; x++) { full = true; for (y = G.L; y < TOTAL; y++) if (!filled(x, y)) { full = false; break; } if (full) cols.push(x); }
    var n = rows.length + cols.length; if (!n) return false;
    var t = now();
    function clr(x, y) { if (!G.board[y][x]) return; if (G.items[y][x]) { G.loot[x + ',' + y] = 1; G.items[y][x] = 0; } G.board[y][x] = 0; G.fx.push({ k: 'cell', x: x, y: y, at: t }); }
    rows.forEach(function (y) { for (var x = 0; x < COLS; x++) clr(x, y); });
    cols.forEach(function (x) { for (var y = G.L; y < TOTAL; y++) clr(x, y); });
    G.fx.push({ k: 'flash', rows: rows, cols: cols, at: t });
    G.combo++; var mult = Math.min(5, G.combo), pts = (n * 100 + (n - 1) * 100) * mult;
    G.score += pts; pop((mult > 1 ? 'COMBO ×' + mult + '  ' : '') + '+' + pts, OX + S * COLS / 2, by(G.L + 3), '#ffe066', true);
    sfx('clear', n + mult - 1);
    var before = G.ult; G.ult = Math.min(ULT_MAX, G.ult + n); if (before < ULT_MAX && G.ult >= ULT_MAX) { sfx('ultReady'); pop(FAC[G.fac].name + ' 필살기 준비!', OX + S * COLS / 2, by(G.L + 1), FAC[G.fac].col, true); }
    fire(n); G.shake = 4 + n * 2;
    if (G.loot[G.tank.x + ',' + G.tank.y]) pickLoot();
    return true;
  }
  function fire(n) {                                       // 줄을 깨면 탱크가 자기 세로줄 위로 발사 (여러 줄이면 넓게)
    var tx = G.tank.x, w = n >= 3 ? 2 : n >= 2 ? 1 : 0;
    sfx('launch');
    for (var d = -w, i = 0; d <= w; d++) if (tx + d >= 0 && tx + d < COLS) G.shots.push({ x: tx + d, at: now() + (i++) * 70, y0: by(G.tank.y) + S / 2, dur: 380 });
  }
  function shotLand(s) {
    var py = by(G.L - 1) + S / 2;
    if (G.enT[s.x]) { G.enT[s.x] = 0; G.fx.push({ k: 'boom', px: bx(s.x) + S / 2, py: py, at: now() }); G.fx.push({ k: 'ruin', x: s.x, at: now() }); G.score += 150; pop('적 포탑 격파 +150', bx(s.x) + S / 2, py - S * 0.4, '#ffb13d'); sfx('boom', true); }
    else { G.fx.push({ k: 'boom', px: bx(s.x) + S / 2, py: py - S * 0.2, at: now(), small: true }); sfx('boom', false); }
  }
  function addMyTurret(n) {
    for (var k = 0; k < n; k++) { var free = []; for (var x = 0; x < COLS; x++) if (!G.myT[x] && !G.board[G.L][x] && !(G.tank.x === x && G.tank.y === G.L)) free.push(x);
      if (!free.length) { G.score += 500; pop('포탑 줄 가득! +500', OX + S * COLS / 2, by(G.L) + S * 1.5, '#9be37a', true); sfx('gain', 5); continue; }
      var px = free[rnd(free.length)]; G.myT[px] = 1; G.fx.push({ k: 'build', x: px, at: now() }); pop('포탑 +1', bx(px) + S / 2, by(G.L), '#9be37a'); sfx('send'); }
  }
  function pickLoot() { var k = G.tank.x + ',' + G.tank.y; if (!G.loot[k]) return; delete G.loot[k]; addMyTurret(1); }
  function round() {                                        // 30초: 포탑이 많은 쪽이 절점을 1칸 밀고 감
    var m = cnt(G.myT), e = cnt(G.enT), t = now(); G.rounds++;
    if (m > e) {
      if (G.L <= 1) { G.score += 1000; banner('더 밀 곳이 없다! +1000', '#9be37a'); sfx('retreat'); }
      else { G.L--; G.score += 300; banner('절점 돌파! 내 땅 +1줄', '#9be37a'); sfx('retreat'); G.fx.push({ k: 'march', at: t, dir: -1 }); }
    } else if (e > m) {
      var y = G.L; G.L = Math.min(TOTAL - 1, G.L + 1); G.shake = 12;
      for (var x = 0; x < COLS; x++) { if (G.board[y][x]) G.fx.push({ k: 'cell', x: x, y: y, at: t }); G.board[y][x] = 0; G.items[y][x] = 0; delete G.loot[x + ',' + y]; }
      banner('절점이 밀렸다! 내 땅 -1줄', '#ff6a5a'); sfx('advance'); G.fx.push({ k: 'march', at: t, dir: 1 });
      if (G.tank.y < G.L) pushTank();
    } else { banner('팽팽하다 — 절점 그대로', '#ffe9a8'); sfx('clash'); }
    resetTurrets(); G.roundAt = t + ROUND; G.reinAt = t + reinMs();
    checkFit();
  }
  function pushTank() {                                     // 밀린 줄에 탱크가 있으면 한 칸 아래로 밀려남 (막혔으면 그 블록을 깨고)
    var tk = G.tank; tk.path = []; tk.y = G.L; tk.fy = tk.y; tk.fx = tk.x;
    if (G.board[tk.y][tk.x]) { G.board[tk.y][tk.x] = 0; G.items[tk.y][tk.x] = 0; G.fx.push({ k: 'boom', px: bx(tk.x) + S / 2, py: by(tk.y) + S / 2, at: now(), small: true }); }
    if (G.myT[tk.x]) G.myT[tk.x] = 0;
  }
  function reinforce() {                                    // 적 포탑 보충
    var free = []; G.enT.forEach(function (v, x) { if (!v) free.push(x); }); if (!free.length) return;
    var x = free[rnd(free.length)]; G.enT[x] = 1; G.fx.push({ k: 'ebuild', x: x, at: now() }); pop('적 포탑 +1', bx(x) + S / 2, by(G.L - 1), '#ff8a7a');
  }
  function checkFit() { if (G.over) return; if (G.tray.filter(Boolean).some(anyFit)) return; gameOver('블록을 놓을 곳이 없다'); }
  function useUlt() {
    if (!G || G.over || G.ult < ULT_MAX) { sfx('bad'); return; }
    G.ult = 0; sfx('ult', G.fac); banner(FAC[G.fac].name + ' — ' + FAC[G.fac].skill, FAC[G.fac].col);
    if (G.fac === 'surge') G.freezeUntil = now() + 10000;
    else if (G.fac === 'solar') addMyTurret(2);
    else { var c = []; G.enT.forEach(function (v, x) { if (v) c.push(x); }); shuffle(c).slice(0, 3).forEach(function (x, i) { setTimeout(function () { if (!G || G.over) return; G.enT[x] = 0; G.fx.push({ k: 'bolt', x: x, at: now() }); G.fx.push({ k: 'boom', px: bx(x) + S / 2, py: by(G.L - 1) + S / 2, at: now() }); sfx('boom', true); }, i * 220); }); }
  }
  function gameOver(msg) {
    G.over = true; sfx('over'); var nb = G.score > best; if (nb) { best = G.score; try { localStorage.setItem('tank_next_best', best); } catch (e) { } }
    setTimeout(function () { showEnd(msg, nb); }, 900);
  }

  // ---------- 탱크 이동 (빈 길로만) ----------
  function pathTo(tx, ty) {
    var sx = G.tank.x, sy = G.tank.y, prev = {}, q = [[sx, sy]]; prev[sx + ',' + sy] = null;
    while (q.length) { var c = q.shift(); if (c[0] === tx && c[1] === ty) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], y = c[1] + d[1], k = x + ',' + y; if (x < 0 || x >= COLS || y < G.L || y >= TOTAL || blocked(x, y) || k in prev) return; prev[k] = c; q.push([x, y]); }); }
    if (!((tx + ',' + ty) in prev)) return null;
    var path = [], cur = [tx, ty]; while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev[cur[0] + ',' + cur[1]]; }
    return path;
  }

  // ---------- 입력 ----------
  function slotRect(i) { var w = S * COLS / 3; return { x: OX + i * w, y: TY + 6, w: w, h: TH - 12 }; }
  function ultRect() { return { x: OX, y: H - BOT + 6, w: S * 2.6, h: BOT - 12 }; }
  function inR(r, p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function pieceWH(pc) { var w = 0, h = 0; pc.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); }); return [w, h]; }
  function dropCell(p) { var wh = pieceWH(G.tray[G.drag.i]), cx = p.x - wh[0] * S / 2, cy = p.y - S * 1.7 - wh[1] * S / 2; return { gx: Math.round((cx - OX) / S), gy: Math.round((cy - FY) / S) }; }
  var down = null;
  cv.addEventListener('pointerdown', function (e) {
    if (!G || G.over) return; var p = { x: e.clientX, y: e.clientY };
    if (inR(ultRect(), p)) { useUlt(); return; }
    for (var i = 0; i < 3; i++) if (G.tray[i] && inR(slotRect(i), p)) { G.drag = { i: i, p: p }; sfx('pick'); return; }
    down = p;
  });
  cv.addEventListener('pointermove', function (e) { if (G && G.drag) G.drag.p = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', function (e) {
    if (!G) return; var p = { x: e.clientX, y: e.clientY };
    if (G.drag) { var d = dropCell(p), i = G.drag.i; G.drag = null; if (!G.over && canPlace(G.tray[i], d.gx, d.gy)) place(i, d.gx, d.gy); else if (p.y < TY) sfx('bad'); return; }
    if (down && !G.over) { var gx = Math.floor((p.x - OX) / S), gy = Math.floor((p.y - FY) / S); down = null;
      if (gx >= 0 && gx < COLS && gy >= G.L && gy < TOTAL && !blocked(gx, gy) && !G.tank.path.length) { var path = pathTo(gx, gy); if (path && path.length) { G.tank.path = path; G.tank.at = now(); sfx('step'); } else if (!path) { sfx('bad'); pop('길이 막혔다', bx(gx) + S / 2, by(gy), '#ff8a7a'); } } }
  });

  // ---------- 진행 ----------
  function update(t) {
    if (!G || G.over) return;
    var tk = G.tank;
    if (tk.path.length && t - tk.at >= 85) { var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.at = t; if (G.loot[tk.x + ',' + tk.y]) pickLoot(); if (!tk.path.length) lineCheck(); }
    if (tk.path.length) { var q = Math.min(1, (t - tk.at) / 85); tk.fx = tk.x + (tk.path[0][0] - tk.x) * q; tk.fy = tk.y + (tk.path[0][1] - tk.y) * q; } else { tk.fx = tk.x; tk.fy = tk.y; }
    G.shots = G.shots.filter(function (s) { if (t < s.at) return true; if (t - s.at >= s.dur) { shotLand(s); return false; } return true; });
    if (t < G.freezeUntil) G.reinAt += 16.7; else if (t >= G.reinAt) { G.reinAt = t + reinMs(); reinforce(); }
    var left = G.roundAt - t; if (left < 5000 && Math.ceil(left / 1000) !== G.tick) { G.tick = Math.ceil(left / 1000); if (G.tick > 0) sfx('count'); }
    if (t >= G.roundAt) round();
  }

  // ---------- 그리기 ----------
  function cover(im, x, y, w, h) { if (!im) return; var r = Math.max(w / im.width, h / im.height), dw = im.width * r, dh = im.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore(); }
  function fit(im, cx, cy, w, h, a) { if (!im) return; var r = Math.min(w / im.width, h / im.height); ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.drawImage(im, cx - im.width * r / 2, cy - im.height * r / 2, im.width * r, im.height * r); ctx.restore(); }
  function text(t, x, y, size, col, align) { ctx.save(); ctx.font = size + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); ctx.restore(); }
  function block(x, y, s, tint, a, item) {
    ctx.save(); if (a != null) ctx.globalAlpha = a;
    if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#7a6a4a'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tint; ctx.globalAlpha = (a == null ? 1 : a) * 0.32; ctx.fillRect(x, y, s, s); ctx.restore();
    if (item && IM.ui_bunker) fit(IM.ui_bunker, x + s / 2, y + s / 2, s * 0.72, s * 0.72, a);   /* 포탑 아이템 블록 */
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var sh = G && G.shake > 0.3 ? (G.shake *= 0.9, G.shake) : 0; ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    var lineY = G ? by(G.L) : FY + START_L * S;
    cover(IM.bg_enemy, 0, 0, W, lineY); cover(IM.bg_mine, 0, lineY, W, H - lineY);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, TY, W, H - TY);
    if (!G) { ctx.restore(); return; }
    ctx.fillStyle = 'rgba(110,20,10,.30)'; ctx.fillRect(OX, FY, S * COLS, lineY - FY);   // 적 땅
    // 격자 (내 땅)
    ctx.strokeStyle = 'rgba(255,230,170,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(bx(gx), lineY); ctx.lineTo(bx(gx), TY); } for (var gy = G.L; gy <= TOTAL; gy++) { ctx.moveTo(OX, by(gy)); ctx.lineTo(OX + S * COLS, by(gy)); } ctx.stroke();
    // 블록
    for (var y = G.L; y < TOTAL; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) block(bx(x), by(y), S, G.board[y][x], null, G.items[y][x]);
    // 떠 있는 포탑 아이템
    for (var k in G.loot) { var lp = k.split(','), lx = +lp[0], ly = +lp[1]; if (ly < G.L) continue; var bob = Math.sin(t / 240 + lx) * S * 0.07, cx = bx(lx) + S / 2, cy = by(ly) + S * 0.42 + bob;
      var gr = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 0.75); gr.addColorStop(0, 'rgba(155,227,122,.8)'); gr.addColorStop(1, 'rgba(155,227,122,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, S * 0.75, 0, 7); ctx.fill(); ctx.restore();
      fit(IM.ui_bunker, cx, cy, S * 0.8, S * 0.8); }
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = canPlace(pc, d.gx, d.gy);
      pc.cells.forEach(function (c) { var X = d.gx + c[0], Y = d.gy + c[1]; if (X < 0 || X >= COLS || Y < G.L || Y >= TOTAL) return; ctx.fillStyle = ok ? 'rgba(155,227,122,.35)' : 'rgba(255,90,70,.3)'; ctx.fillRect(bx(X) + 2, by(Y) + 2, S - 4, S - 4); }); }
    // 포탑: 적(절점 위 줄) · 나(절점 아래 줄)
    // 절점: 30초 시한폭탄 게이지
    var left = Math.max(0, G.roundAt - t), prog = 1 - left / ROUND, m = cnt(G.myT), e = cnt(G.enT);
    if (IM.d_wire1) { var wh = S * 0.62, ww = wh * IM.d_wire1.width / IM.d_wire1.height; ctx.save(); ctx.globalAlpha = 0.85; for (var wx = OX - ww * 0.2; wx < OX + S * COLS; wx += ww * 0.9) ctx.drawImage(IM.d_wire1, wx, lineY - wh * 0.55, ww, wh); ctx.restore(); }
    var barH = Math.max(8, S * 0.2), urgent = left < 5000;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(OX, lineY - barH / 2, S * COLS, barH);
    var hot = urgent ? 'rgba(255,' + Math.round(60 + 40 * Math.sin(t / 70)) + ',40,1)' : '#e8392a';
    ctx.fillStyle = hot; ctx.fillRect(OX, lineY - barH / 2, S * COLS * prog, barH);
    if (urgent) { ctx.save(); ctx.shadowColor = '#ff3020'; ctx.shadowBlur = 18; ctx.fillRect(OX, lineY - barH / 2, S * COLS * prog, barH); ctx.restore(); }
    // 절점 가운데: 누가 우위인지
    var badge = m > e ? '#3fbf3a' : e > m ? '#d8342a' : '#6b6f60', bw = S * 2.5, bh = S * 0.6, bxx = OX + S * COLS / 2 - bw / 2, byy = lineY - bh / 2;
    ctx.save(); ctx.fillStyle = badge; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bxx, byy, bw, bh, bh / 2); else ctx.rect(bxx, byy, bw, bh); ctx.fill(); ctx.stroke(); ctx.restore();
    text('나 ' + m + ' : ' + e + ' 적', OX + S * COLS / 2, lineY, Math.round(S * 0.36), '#fff');
    text(Math.ceil(left / 1000) + '', OX + S * COLS / 2 + bw / 2 + S * 0.45, lineY, Math.round(S * (urgent ? 0.62 : 0.46)), urgent ? '#ff6a5a' : '#ffe9a8');
    var eim = IM['k_' + G.efac + '_e2'], mim = IM['k_' + G.fac + '_m2'];   /* 포탑은 배지 위에 그려서 가리지 않게 */
    for (var ex = 0; ex < COLS; ex++) { if (G.enT[ex]) fit(eim, bx(ex) + S / 2, by(G.L - 1) + S * 0.5, S * 1.05, S * 1.1); if (G.myT[ex]) fit(mim, bx(ex) + S / 2, by(G.L) + S * 0.55, S * 1.05, S * 1.1); }
    if (t < G.freezeUntil) text('폭풍우 — 적 보충 멈춤 ' + Math.ceil((G.freezeUntil - t) / 1000) + 's', W / 2, by(G.L - 2) + S / 2, Math.round(S * 0.4), '#bfe9ff');
    // 탱크
    var tk = G.tank, mv = tk.path.length ? 1 : 0; ctx.save(); ctx.translate(bx(tk.fx) + S / 2, by(tk.fy) + S / 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, S * 0.36, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill();
    ctx.shadowColor = FAC[G.fac].col; ctx.shadowBlur = 10; fit(IM['t_' + G.fac], 0, mv ? Math.sin(t / 40) * 1.5 : 0, S * 0.95, S * 1.05); ctx.restore();
    if (!G.over) { ctx.strokeStyle = 'rgba(255,230,120,.16)'; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.moveTo(bx(tk.fx) + S / 2, by(tk.fy)); ctx.lineTo(bx(tk.fx) + S / 2, by(G.L - 1)); ctx.stroke(); }
    // 포탄
    G.shots.forEach(function (s) { if (t < s.at) return; var p = (t - s.at) / s.dur, tgt = by(G.L - 1) + S / 2, yy = s.y0 + (tgt - s.y0) * p; fit(IM.m_up, bx(s.x) + S / 2, yy, S * 0.5, S * 0.9); });
    // 효과
    G.fx = G.fx.filter(function (f) { var a = t - f.at; if (a < 0) return true;
      if (f.k === 'cell') { if (a > 350) return false; block(bx(f.x) + S * a / 1400, by(f.y) + S * a / 1400, S * (1 - a / 700), '#fff', 1 - a / 350); return true; }
      if (f.k === 'flash') { if (a > 300) return false; ctx.fillStyle = 'rgba(255,240,180,' + (0.5 * (1 - a / 300)) + ')'; f.rows.forEach(function (y) { ctx.fillRect(OX, by(y), S * COLS, S); }); f.cols.forEach(function (x) { ctx.fillRect(bx(x), by(G.L), S, S * (TOTAL - G.L)); }); return true; }
      if (f.k === 'boom') { if (a > 520) return false; var fr = Math.min(8, 1 + Math.floor(a / 520 * 8)), sz = S * (f.small ? 0.9 : 1.5); fit(IM['x_b' + fr], f.px, f.py - sz * 0.15, sz, sz); return true; }
      if (f.k === 'ruin') { if (a > 800) return false; fit(IM['k_' + G.efac + '_e4'], bx(f.x) + S / 2, by(G.L - 1) + S * 0.55, S * 0.98, S, 1 - a / 800); return true; }
      if (f.k === 'build' || f.k === 'ebuild') { if (a > 500) return false; var yy2 = f.k === 'build' ? by(G.L) : by(G.L - 1); ctx.save(); ctx.globalAlpha = 1 - a / 500; ctx.strokeStyle = f.k === 'build' ? '#9be37a' : '#ff6a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx(f.x) + S / 2, yy2 + S / 2, S * (0.3 + a / 900), 0, 7); ctx.stroke(); ctx.restore(); return true; }
      if (f.k === 'bolt') { if (a > 400) return false; ctx.strokeStyle = 'rgba(220,190,255,' + (1 - a / 400) + ')'; ctx.lineWidth = 4; ctx.beginPath(); var X = bx(f.x) + S / 2, Y2 = by(G.L - 1) + S / 2; ctx.moveTo(X, 0); for (var q = 1; q <= 6; q++) ctx.lineTo(X + (Math.random() - 0.5) * S * 0.6, Y2 * q / 6); ctx.stroke(); return true; }
      if (f.k === 'march') { if (a > 700) return false; ctx.fillStyle = f.dir < 0 ? 'rgba(120,255,120,' + (0.25 * (1 - a / 700)) + ')' : 'rgba(255,60,40,' + (0.3 * (1 - a / 700)) + ')'; ctx.fillRect(OX, by(G.L) - S, S * COLS, S * 2); return true; }
      if (f.k === 'pop') { if (a > 1100) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1100 - a) / 300); text(f.t, f.x, f.y - a * 0.03, Math.round(S * (f.big ? 0.58 : 0.4)), f.col); ctx.restore(); return true; }
      return false; });
    // 위 HUD
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, HUD);
    text('내 땅 ' + (TOTAL - G.L) + '줄', 10, HUD / 2, 18, '#9be37a', 'left');
    text(G.score.toLocaleString(), W / 2, HUD / 2, 26, '#fff');
    text('최고 ' + Math.max(best, G.score).toLocaleString(), W - 10, HUD / 2, 16, '#ffd451', 'right');
    // 트레이
    for (var i = 0; i < 3; i++) { var rc = slotRect(i); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(rc.x + 4, rc.y, rc.w - 8, rc.h); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.strokeRect(rc.x + 4, rc.y, rc.w - 8, rc.h);
      var pc2 = G.tray[i]; if (!pc2 || (G.drag && G.drag.i === i)) continue; var wh2 = pieceWH(pc2), cs = Math.min(S * 0.62, (rc.w - 20) / wh2[0], (rc.h - 14) / wh2[1]), ox = rc.x + (rc.w - wh2[0] * cs) / 2, oy = rc.y + (rc.h - wh2[1] * cs) / 2, okFit = anyFit(pc2);
      pc2.cells.forEach(function (c, k2) { block(ox + c[0] * cs, oy + c[1] * cs, cs, pc2.tint, okFit ? 1 : 0.35, k2 === pc2.item); }); }
    if (G.drag && G.tray[G.drag.i]) { var pd = G.tray[G.drag.i], wh3 = pieceWH(pd), gx0 = G.drag.p.x - wh3[0] * S / 2, gy0 = G.drag.p.y - S * 1.7 - wh3[1] * S / 2; pd.cells.forEach(function (c, k3) { block(gx0 + c[0] * S, gy0 + c[1] * S, S, pd.tint, 0.9, k3 === pd.item); }); }
    // 아래: 필살기 + 적 보충 시계
    var ur = ultRect(), ready = G.ult >= ULT_MAX; ctx.save(); if (ready) { ctx.shadowColor = FAC[G.fac].col; ctx.shadowBlur = 16 + 8 * Math.sin(t / 150); }
    fit(IM['f_' + G.fac], ur.x + ur.h / 2, ur.y + ur.h / 2, ur.h, ur.h, ready ? 1 : 0.45); ctx.restore();
    ctx.strokeStyle = FAC[G.fac].col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ur.x + ur.h / 2, ur.y + ur.h / 2, ur.h / 2 + 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * G.ult / ULT_MAX); ctx.stroke();
    text(ready ? '필살기!' : '필살기 ' + G.ult + '/' + ULT_MAX, ur.x + ur.h + 8, ur.y + ur.h / 2, 18, ready ? FAC[G.fac].col : '#cfd6bf', 'left');
    var rl = Math.max(0, G.reinAt - t); text(t < G.freezeUntil ? '적 보충 멈춤' : '적 포탑 보충 ' + Math.ceil(rl / 1000) + '초', OX + S * COLS, ur.y + ur.h / 2, 18, '#ff9a8a', 'right');
    // 배너
    if (G.banner) { var ba = t - G.banner.at; if (ba > 1600) G.banner = null; else { ctx.save(); ctx.globalAlpha = Math.min(1, ba / 120) * Math.min(1, (1600 - ba) / 300); var bny = by(Math.max(1, G.L - 2)); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, bny - S * 0.55, W, S * 1.1); text(G.banner.t, W / 2, bny, Math.round(S * 0.58), G.banner.col); ctx.restore(); } }
    ctx.restore();
  }
  function loop() { var t = now(); update(t); draw(t); requestAnimationFrame(loop); }
  loop();

  // ---------- 시작/끝 화면 ----------
  var $ = function (id) { return document.getElementById(id); };
  function selFac(f) { fac = f; try { localStorage.setItem('tank_fac', f); } catch (e) { } document.querySelectorAll('.fac').forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); }); }
  document.querySelectorAll('.fac').forEach(function (b) { b.addEventListener('click', function () { selFac(b.dataset.f); sfx('click'); }); }); selFac(fac);
  $('go').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  function showEnd(msg, nb) {
    var e = $('end'); e.classList.add('lose');
    $('endT').textContent = 'GAME OVER'; $('endS').textContent = msg;
    $('endB').textContent = nb ? '최고 기록!' : ''; $('endB').style.display = nb ? 'block' : 'none';
    $('endScore').textContent = '점수 ' + G.score.toLocaleString() + '  ·  최고 ' + best.toLocaleString();
    $('endBtn').textContent = '다시 하기'; e.classList.remove('hidden');
  }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  window.__next = { cell: function (x, y) { return { x: bx(x) + S / 2, y: by(y) + S / 2 }; }, slot: slotRect, get: function () { return G; }, start: start, round: round, useUlt: useUlt, place: place, canPlace: canPlace, reinforce: reinforce };
})();
