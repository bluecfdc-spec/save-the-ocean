/* TANK RUMBLE — 새 규칙 시험판 (2026-10-12)
   ① 블록 Drag & Drop → 줄을 깨면 탱크가 자기 세로줄 위로 발사(2줄↑ 3칸, 3줄↑ 5칸)
   ② 맨 앞 적 벙커 줄을 다 부수면 전선이 올라감 → 적 줄이 다 없어지면 VICTORY
   ③ 시간이 지나면 적이 한 칸 내려옴(내 맨 윗줄 사라짐, 거기 탱크가 있으면 패배)
   ④ 탱크는 빈칸을 눌러 이동(기름 없음, 빈 길로만), 탱크 칸도 블록 한 칸으로 침
   ⑤ 줄을 깨면 필살기 게이지 — 서지: 적 진격 10초 멈춤 / 게일: 벙커 3개 낙뢰 / 솔라: 진격 한 번 막기 */
(function () {
  'use strict';
  var COLS = 9, ROWS = 9, ULT_MAX = 6;
  var FAC = { surge: { name: '서지', skill: '폭풍우 — 적 진격 멈춤', col: '#4fd8ff' }, gale: { name: '게일', skill: '낙뢰 — 벙커 3개 파괴', col: '#c58bff' }, solar: { name: '솔라', skill: '태양 방패 — 진격 1번 막기', col: '#ffd451' } };
  var SHAPES = [
    [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]]
  ];
  var TINT = ['#ffcf4a', '#4fd8ff', '#9be37a', '#ff8a5a', '#c58bff'];
  function now() { return performance.now(); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'bg_enemy.jpg', 'b_plain.png', 'd_wire1.png', 'm_up.png', 'ui_score.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 't_' + f + '_hit.png', 'k_' + f + '_e2.png', 'k_' + f + '_e4.png', 'f_' + f + '.png'); });
  for (var i = 1; i <= 8; i++) LIST.push('x_b' + i + '.png');
  LIST.forEach(function (n) { var im = new Image(); im.onload = function () { IM[n.replace(/\.(png|jpg)$/, '')] = im; }; im.src = 'assets/v2/' + n + '?v=6'; });

  // ---------- 화면 ----------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 0, H = 0, S = 40, OX = 0, HUD = 50, BOT = 70, EY = 0, BY = 0, TY = 0, TH = 0, ER = 36;
  function layout() {
    var dpr = Math.min(3, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.floor(Math.min(W / COLS, (H - HUD - BOT - 8) / (ROWS + 2.6 + 2.7)));
    OX = Math.floor((W - S * COLS) / 2); ER = S * 0.92; TH = S * 2.7;
    BY = H - BOT - TH - ROWS * S; EY = HUD; TY = BY + ROWS * S;
  }
  window.addEventListener('resize', layout); layout();
  function bx(x) { return OX + x * S; } function by(y) { return BY + y * S; }

  // ---------- 상태 ----------
  var G = null, fac = 'solar';
  try { fac = localStorage.getItem('tank_fac') || 'solar'; } catch (e) { }
  function stageCfg(st) { return { rows: Math.min(9, 3 + st), per: Math.min(8, 2 + Math.floor(st * 0.8)), adv: Math.max(4500, 11000 * Math.pow(0.9, st - 1)) }; }
  function newPiece() { var sh = SHAPES[rnd(SHAPES.length)]; return { cells: sh, tint: TINT[rnd(TINT.length)] }; }
  function start(stage, score) {
    var cfg = stageCfg(stage), efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; });
    G = { stage: stage, score: score || 0, combo: 0, fac: fac, efac: efs[rnd(2)], board: [], top: 0, tank: { x: 4, y: 7, fx: 4, fy: 7, path: [], at: 0 },
      tray: [newPiece(), newPiece(), newPiece()], eRows: [], cfg: cfg, advAt: now() + cfg.adv + 2000, freezeUntil: 0, shield: 0, ult: 0,
      fx: [], shots: [], drag: null, over: false, banner: null, shake: 0 };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    for (var r = 0; r < cfg.rows; r++) { var row = [0, 0, 0, 0, 0, 0, 0, 0, 0], n = Math.min(COLS, cfg.per + (r === cfg.rows - 1 ? 1 : 0)); while (row.reduce(function (a, b) { return a + b; }, 0) < n) row[rnd(COLS)] = 1; G.eRows.push(row); }
    banner('스테이지 ' + stage, '#ffd451');
  }
  function banner(t, col) { G.banner = { t: t, col: col || '#fff', at: now() }; }
  function pop(t, x, y, col, big) { G.fx.push({ k: 'pop', t: t, x: x, y: y, col: col || '#fff', big: big, at: now() }); }

  // ---------- 판 규칙 ----------
  function tankAt(x, y) { var t = G.tank; return !t.path.length && t.x === x && t.y === y; }
  function filled(x, y) { return G.board[y][x] || tankAt(x, y); }
  function canPlace(p, gx, gy) { for (var i = 0; i < p.cells.length; i++) { var x = gx + p.cells[i][0], y = gy + p.cells[i][1]; if (x < 0 || x >= COLS || y < G.top || y >= ROWS) return false; if (G.board[y][x] || (G.tank.x === x && G.tank.y === y)) return false; } return true; }
  function anyFit(p) { for (var y = G.top; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (canPlace(p, x, y)) return true; return false; }
  function place(i, gx, gy) {
    var p = G.tray[i]; p.cells.forEach(function (c) { G.board[gy + c[1]][gx + c[0]] = p.tint; });
    G.tray[i] = null; if (!G.tray.some(Boolean)) G.tray = [newPiece(), newPiece(), newPiece()];
    sfx('place'); G.score += p.cells.length * 5;
    if (!lineCheck()) G.combo = 0;
    checkFit();
  }
  function lineCheck() {
    var rows = [], cols = [], x, y, full;
    for (y = G.top; y < ROWS; y++) { full = true; for (x = 0; x < COLS; x++) if (!filled(x, y)) { full = false; break; } if (full) rows.push(y); }
    for (x = 0; x < COLS; x++) { full = true; for (y = G.top; y < ROWS; y++) if (!filled(x, y)) { full = false; break; } if (full) cols.push(x); }
    var n = rows.length + cols.length; if (!n) return false;
    var t = now();
    rows.forEach(function (y) { for (var x = 0; x < COLS; x++) if (G.board[y][x]) { G.board[y][x] = 0; G.fx.push({ k: 'cell', x: x, y: y, at: t }); } });
    cols.forEach(function (x) { for (var y = G.top; y < ROWS; y++) if (G.board[y][x]) { G.board[y][x] = 0; G.fx.push({ k: 'cell', x: x, y: y, at: t }); } });
    G.fx.push({ k: 'flash', rows: rows, cols: cols, at: t });
    G.combo++; var mult = Math.min(5, G.combo), pts = (n * 100 + (n - 1) * 100) * mult;
    G.score += pts; pop((mult > 1 ? 'COMBO ×' + mult + '  ' : '') + '+' + pts, OX + S * COLS / 2, BY + S * 4, '#ffe066', true);
    sfx('clear', n + mult - 1);
    var before = G.ult; G.ult = Math.min(ULT_MAX, G.ult + n); if (before < ULT_MAX && G.ult >= ULT_MAX) { sfx('ultReady'); pop(FAC[G.fac].name + ' 필살기 준비!', OX + S * COLS / 2, BY + S * 2, FAC[G.fac].col, true); }
    fire(n); G.shake = 4 + n * 2; return true;
  }
  function fire(n) {                                       // 줄을 깨면 탱크가 자기 세로줄 위로 발사 (여러 줄이면 넓게)
    var tx = G.tank.x, w = n >= 3 ? 2 : n >= 2 ? 1 : 0, cols = [];
    for (var d = -w; d <= w; d++) if (tx + d >= 0 && tx + d < COLS) cols.push(tx + d);
    sfx('launch');
    cols.forEach(function (c, i) { G.shots.push({ x: c, at: now() + i * 70, y0: by(G.tank.y) + S / 2, dur: 420 }); });
  }
  function frontY() { return by(G.top); }                    // 전선(내 판의 맨 윗줄 위)
  function eRowY(i) { return frontY() - (i + 1) * ER; }       // 적 i번째 줄(0 = 맨 앞)의 위쪽 y
  function shotLand(s) {
    var hit = false;
    for (var r = 0; r < G.eRows.length; r++) if (G.eRows[r][s.x]) { G.eRows[r][s.x] = 0; hit = true; G.fx.push({ k: 'boom', px: bx(s.x) + S / 2, py: eRowY(r) + ER / 2, at: now() }); G.fx.push({ k: 'ruin', x: s.x, r: r, at: now() }); G.score += 150; pop('+150', bx(s.x) + S / 2, eRowY(r), '#ffb13d'); break; }
    sfx('boom', hit); if (!hit) G.fx.push({ k: 'boom', px: bx(s.x) + S / 2, py: Math.max(EY + 20, eRowY(Math.max(0, G.eRows.length - 1))), at: now(), small: true });
    pushFront();
  }
  function pushFront() {                                    // 맨 앞 적 줄이 비면 전선이 올라감
    var pushed = 0;
    while (G.eRows.length && G.eRows[0].every(function (v) { return !v; })) { G.eRows.shift(); if (G.top > 0) G.top--; pushed++; }
    if (pushed) { G.score += 300 * pushed; banner('전선 돌파!', '#9be37a'); sfx('retreat'); G.advAt = Math.max(G.advAt, now() + 2500); }
    if (!G.eRows.length && !G.over) win();
  }
  function enemyAdvance() {                                 // 적이 한 칸 내려옴
    var t = now();
    if (G.shield > 0) { G.shield--; banner('태양 방패가 진격을 막았다!', '#ffd451'); sfx('shieldHit'); return; }
    G.top++; var y = G.top - 1; G.shake = 10;
    if (y < ROWS) for (var x = 0; x < COLS; x++) { if (G.board[y][x]) G.fx.push({ k: 'cell', x: x, y: y, at: t }); G.board[y][x] = 0; }
    banner('⚠ 적 진격!', '#ff6a5a'); sfx('advance');
    if (G.stage >= 2 && G.eRows.length) { var row = G.eRows[0], emp = []; row.forEach(function (v, i) { if (!v) emp.push(i); }); if (emp.length > 1) row[emp[rnd(emp.length)]] = 1; }   /* 스테이지 2부터: 적이 내려오며 맨 앞 벙커 하나 보강 */
    if (G.tank.y < G.top || G.top >= ROWS) { lose('적에게 밟혔다'); return; }
    checkFit();
  }
  function checkFit() {
    var live = G.tray.filter(Boolean); if (live.some(anyFit)) return;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) { G.fx.push({ k: 'cell', x: x, y: y, at: now() }); G.fx.push({ k: 'boom', px: bx(x) + S / 2, py: by(y) + S / 2, at: now() + y * 40, small: true }); G.board[y][x] = 0; }
    G.tray = [newPiece(), newPiece(), newPiece()]; G.combo = 0; banner('놓을 곳이 없다 — 판 붕괴!', '#ff6a5a'); sfx('boom', true);
    setTimeout(function () { if (G && !G.over) enemyAdvance(); }, 700);
  }
  function useUlt() {
    if (!G || G.over || G.ult < ULT_MAX) { sfx('bad'); return; }
    G.ult = 0; sfx('ult', G.fac); banner(FAC[G.fac].name + ' — ' + FAC[G.fac].skill, FAC[G.fac].col);
    if (G.fac === 'surge') G.freezeUntil = now() + 10000;
    else if (G.fac === 'solar') G.shield = 1;
    else { var c = []; for (var r = 0; r < Math.min(2, G.eRows.length); r++) G.eRows[r].forEach(function (v, x) { if (v) c.push([r, x]); });
      c.sort(function () { return Math.random() - 0.5; }).slice(0, 3).forEach(function (q, i) { setTimeout(function () { if (!G || G.over) return; G.eRows[q[0]] && (G.eRows[q[0]][q[1]] = 0); G.fx.push({ k: 'bolt', x: q[1], r: q[0], at: now() }); G.fx.push({ k: 'boom', px: bx(q[1]) + S / 2, py: eRowY(q[0]) + ER / 2, at: now() }); sfx('boom', true); pushFront(); }, i * 220); }); }
  }
  function win() {
    G.over = true; var bonus = 1000 * (G.stage + 1); G.score += bonus; sfx('win');
    setTimeout(function () { showEnd(true, bonus); }, 900);
  }
  function lose(msg) { G.over = true; G.fx.push({ k: 'boom', px: bx(G.tank.x) + S / 2, py: by(G.tank.y) + S / 2, at: now(), big: true }); sfx('boom', true); sfx('over'); setTimeout(function () { showEnd(false, 0, msg); }, 1100); }

  // ---------- 탱크 이동 (빈 길로만, 기름 없음) ----------
  function pathTo(tx, ty) {
    var sx = G.tank.x, sy = G.tank.y, prev = {}, q = [[sx, sy]], k0 = sx + ',' + sy; prev[k0] = null;
    while (q.length) { var c = q.shift(); if (c[0] === tx && c[1] === ty) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], y = c[1] + d[1], k = x + ',' + y; if (x < 0 || x >= COLS || y < G.top || y >= ROWS || G.board[y][x] || k in prev) return; prev[k] = c; q.push([x, y]); }); }
    var key = tx + ',' + ty; if (!(key in prev)) return null;
    var path = [], cur = [tx, ty]; while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev[cur[0] + ',' + cur[1]]; }
    return path;
  }

  // ---------- 입력 ----------
  function slotRect(i) { var w = S * COLS / 3; return { x: OX + i * w, y: TY + 6, w: w, h: TH - 12 }; }
  function ultRect() { return { x: OX, y: H - BOT + 6, w: S * 2.6, h: BOT - 12 }; }
  function inR(r, p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function dropCell(p) { var pc = G.tray[G.drag.i], w = 0, h = 0; pc.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); });
    var cx = p.x - w * S / 2, cy = p.y - S * 1.7 - h * S / 2; return { gx: Math.round((cx - OX) / S), gy: Math.round((cy - BY) / S) }; }
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
    if (down && !G.over) { var gx = Math.floor((p.x - OX) / S), gy = Math.floor((p.y - BY) / S); down = null;
      if (gx >= 0 && gx < COLS && gy >= G.top && gy < ROWS && !G.board[gy][gx] && !G.tank.path.length) { var path = pathTo(gx, gy); if (path && path.length) { G.tank.path = path; G.tank.at = now(); sfx('step'); } else if (!path) { sfx('bad'); pop('길이 막혔다', bx(gx) + S / 2, by(gy), '#ff8a7a'); } } }
  });

  // ---------- 진행 ----------
  function update(t) {
    if (!G || G.over) return;
    var tk = G.tank;
    if (tk.path.length && t - tk.at >= 85) { var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.at = t; if (!tk.path.length) { if (lineCheck()) checkFit(); } }
    if (tk.path.length) { var q = Math.min(1, (t - tk.at) / 85); tk.fx = tk.x + (tk.path[0][0] - tk.x) * q; tk.fy = tk.y + (tk.path[0][1] - tk.y) * q; } else { tk.fx = tk.x; tk.fy = tk.y; }
    G.shots = G.shots.filter(function (s) { if (t < s.at) return true; if (t - s.at >= s.dur) { shotLand(s); return false; } return true; });
    if (G.over) return;
    if (t < G.freezeUntil) G.advAt += 16.7;
    if (t >= G.advAt) { G.advAt = t + G.cfg.adv; enemyAdvance(); }
  }

  // ---------- 그리기 ----------
  function cover(im, x, y, w, h) { if (!im) return; var r = Math.max(w / im.width, h / im.height), dw = im.width * r, dh = im.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore(); }
  function fit(im, cx, cy, w, h, a) { if (!im) return; var r = Math.min(w / im.width, h / im.height); ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.drawImage(im, cx - im.width * r / 2, cy - im.height * r / 2, im.width * r, im.height * r); ctx.restore(); }
  function text(t, x, y, size, col, align, stroke) { ctx.save(); ctx.font = size + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = stroke == null ? Math.max(3, size * 0.22) : stroke; ctx.strokeStyle = '#000'; if (ctx.lineWidth) ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); ctx.restore(); }
  function block(x, y, s, tint, a) {
    ctx.save(); if (a != null) ctx.globalAlpha = a;
    if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#7a6a4a'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tint; ctx.globalAlpha = (a == null ? 1 : a) * 0.32; ctx.fillRect(x, y, s, s); ctx.restore();
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var sh = G && G.shake > 0.3 ? (G.shake *= 0.9, G.shake) : 0; ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    cover(IM.bg_enemy, 0, 0, W, BY + 2); cover(IM.bg_mine, 0, BY, W, H - BY);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, TY, W, H - TY);
    if (!G) { ctx.restore(); return; }
    var fy = frontY();
    // 빼앗긴 내 줄(적이 내려온 곳)
    if (G.top > 0) { ctx.fillStyle = 'rgba(120,20,10,.35)'; ctx.fillRect(OX, BY, S * COLS, G.top * S); }
    // 격자
    ctx.strokeStyle = 'rgba(255,230,170,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(bx(gx), fy); ctx.lineTo(bx(gx), TY); } for (var gy = G.top; gy <= ROWS; gy++) { ctx.moveTo(OX, by(gy)); ctx.lineTo(OX + S * COLS, by(gy)); } ctx.stroke();
    // 블록
    for (var y = G.top; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) block(bx(x), by(y), S, G.board[y][x]);
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = canPlace(pc, d.gx, d.gy);
      if (d.gy >= G.top - 2 && d.gy < ROWS + 1) pc.cells.forEach(function (c) { var X = d.gx + c[0], Y = d.gy + c[1]; if (X < 0 || X >= COLS || Y < 0 || Y >= ROWS) return; ctx.fillStyle = ok ? 'rgba(155,227,122,.35)' : 'rgba(255,90,70,.3)'; ctx.fillRect(bx(X) + 2, by(Y) + 2, S - 4, S - 4); }); }
    // 적 벙커 줄
    var eim = IM['k_' + G.efac + '_e2'];
    for (var r = G.eRows.length - 1; r >= 0; r--) { var ry = eRowY(r); if (ry + ER < 0) continue;
      if (r === 0) { ctx.fillStyle = 'rgba(255,60,40,.10)'; ctx.fillRect(OX, ry, S * COLS, ER); }
      for (var ex = 0; ex < COLS; ex++) if (G.eRows[r][ex]) fit(eim, bx(ex) + S / 2, ry + ER * 0.55, S * 0.95, ER * 1.05, r === 0 ? 1 : 0.75); }
    // 전선
    var warn = !G.over && G.advAt - t < 3000 && t >= G.freezeUntil;
    if (IM.d_wire1) { var wh = S * 0.7, ww = wh * IM.d_wire1.width / IM.d_wire1.height; for (var wx = OX - ww * 0.2; wx < OX + S * COLS; wx += ww * 0.9) ctx.drawImage(IM.d_wire1, wx, fy - wh * 0.8, ww, wh); }
    ctx.strokeStyle = warn ? 'rgba(255,60,40,' + (0.6 + 0.4 * Math.sin(t / 80)) + ')' : G.shield ? '#ffd451' : '#ff3b3b'; ctx.lineWidth = G.shield ? 5 : 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(OX, fy); ctx.lineTo(OX + S * COLS, fy); ctx.stroke(); ctx.setLineDash([]);
    if (warn) { ctx.fillStyle = 'rgba(255,40,30,' + (0.18 + 0.12 * Math.sin(t / 90)) + ')'; ctx.fillRect(OX, fy, S * COLS, S); }
    if (t < G.freezeUntil) { ctx.fillStyle = 'rgba(79,216,255,.16)'; ctx.fillRect(0, 0, W, fy); text('폭풍우 — 적 진격 멈춤 ' + Math.ceil((G.freezeUntil - t) / 1000) + 's', W / 2, fy - S * 0.4, Math.round(S * 0.42), '#bfe9ff'); }
    // 탱크
    var tk = G.tank, timg = IM['t_' + G.fac];
    var mv = tk.path.length ? 1 : 0; ctx.save(); ctx.translate(bx(tk.fx) + S / 2, by(tk.fy) + S / 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, S * 0.36, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill();
    ctx.shadowColor = FAC[G.fac].col; ctx.shadowBlur = 10; fit(timg, 0, mv ? Math.sin(t / 40) * 1.5 : 0, S * 0.95, S * 1.05); ctx.restore();
    // 발사 조준선 (탱크 세로줄)
    if (!G.over) { ctx.strokeStyle = 'rgba(255,230,120,.18)'; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.moveTo(bx(tk.fx) + S / 2, by(tk.fy)); ctx.lineTo(bx(tk.fx) + S / 2, Math.max(EY, eRowY(G.eRows.length - 1))); ctx.stroke(); }
    // 포탄
    G.shots.forEach(function (s) { if (t < s.at) return; var p = (t - s.at) / s.dur, tgtY = eRowY(0) + ER / 2; for (var r = 0; r < G.eRows.length; r++) if (G.eRows[r][s.x]) { tgtY = eRowY(r) + ER / 2; break; }
      var yy = s.y0 + (tgtY - s.y0) * p; fit(IM.m_up, bx(s.x) + S / 2, yy, S * 0.5, S * 0.9);
      ctx.fillStyle = 'rgba(255,200,100,.5)'; ctx.beginPath(); ctx.arc(bx(s.x) + S / 2, yy + S * 0.45, S * 0.12 * (1 - p) + 2, 0, 7); ctx.fill(); });
    // 효과
    G.fx = G.fx.filter(function (f) { var a = t - f.at; if (a < 0) return true;
      if (f.k === 'cell') { if (a > 350) return false; block(bx(f.x) + S * a / 1400, by(f.y) + S * a / 1400, S * (1 - a / 700), '#fff', 1 - a / 350); return true; }
      if (f.k === 'flash') { if (a > 300) return false; ctx.fillStyle = 'rgba(255,240,180,' + (0.5 * (1 - a / 300)) + ')'; f.rows.forEach(function (y) { ctx.fillRect(OX, by(y), S * COLS, S); }); f.cols.forEach(function (x) { ctx.fillRect(bx(x), by(G.top), S, S * (ROWS - G.top)); }); return true; }
      if (f.k === 'boom') { var life = f.big ? 900 : 520; if (a > life) return false; var fr = Math.min(8, 1 + Math.floor(a / life * 8)), sz = S * (f.big ? 2.2 : f.small ? 0.9 : 1.4); fit(IM['x_b' + fr], f.px, f.py - sz * 0.15, sz, sz); return true; }
      if (f.k === 'ruin') { if (a > 900) return false; var ri = IM['k_' + G.efac + '_e4']; if (G.eRows.length > f.r) fit(ri, bx(f.x) + S / 2, eRowY(f.r) + ER * 0.55, S * 0.95, ER, 1 - a / 900); return true; }
      if (f.k === 'bolt') { if (a > 400) return false; ctx.strokeStyle = 'rgba(220,190,255,' + (1 - a / 400) + ')'; ctx.lineWidth = 4; ctx.beginPath(); var X = bx(f.x) + S / 2, Y2 = eRowY(f.r) + ER / 2; ctx.moveTo(X, 0); for (var k = 1; k <= 6; k++) ctx.lineTo(X + (Math.random() - 0.5) * S * 0.6, Y2 * k / 6); ctx.stroke(); return true; }
      if (f.k === 'pop') { if (a > 1100) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1100 - a) / 300); text(f.t, f.x, f.y - a * 0.03, Math.round(S * (f.big ? 0.62 : 0.42)), f.col); ctx.restore(); return true; }
      return false; });
    // 위 HUD
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, HUD);
    text('스테이지 ' + G.stage, 10, HUD / 2, 18, '#ffd451', 'left');
    text(G.score.toLocaleString(), W / 2, HUD / 2, 26, '#fff');
    text('적 ' + G.eRows.length + '줄 남음', W - 10, HUD / 2, 18, '#ff9a8a', 'right');
    // 트레이
    for (var i = 0; i < 3; i++) { var rc = slotRect(i); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(rc.x + 4, rc.y, rc.w - 8, rc.h); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.strokeRect(rc.x + 4, rc.y, rc.w - 8, rc.h);
      var pc2 = G.tray[i]; if (!pc2 || (G.drag && G.drag.i === i)) continue; var w = 0, h = 0; pc2.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); });
      var cs = Math.min(S * 0.62, (rc.w - 20) / w, (rc.h - 14) / h), ox = rc.x + (rc.w - w * cs) / 2, oy = rc.y + (rc.h - h * cs) / 2, fitAny = anyFit(pc2);
      pc2.cells.forEach(function (c) { block(ox + c[0] * cs, oy + c[1] * cs, cs, pc2.tint, fitAny ? 1 : 0.35); }); }
    if (G.drag && G.tray[G.drag.i]) { var pd = G.tray[G.drag.i], w2 = 0, h2 = 0; pd.cells.forEach(function (c) { w2 = Math.max(w2, c[0] + 1); h2 = Math.max(h2, c[1] + 1); });
      var gx0 = G.drag.p.x - w2 * S / 2, gy0 = G.drag.p.y - S * 1.7 - h2 * S / 2; pd.cells.forEach(function (c) { block(gx0 + c[0] * S, gy0 + c[1] * S, S, pd.tint, 0.9); }); }
    // 아래 막대: 필살기 + 적 진격 시계
    var ur = ultRect(), ready = G.ult >= ULT_MAX; ctx.save(); if (ready) { ctx.shadowColor = FAC[G.fac].col; ctx.shadowBlur = 16 + 8 * Math.sin(t / 150); }
    fit(IM['f_' + G.fac], ur.x + ur.h / 2, ur.y + ur.h / 2, ur.h, ur.h, ready ? 1 : 0.45); ctx.restore();
    ctx.strokeStyle = FAC[G.fac].col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ur.x + ur.h / 2, ur.y + ur.h / 2, ur.h / 2 + 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * G.ult / ULT_MAX); ctx.stroke();
    text(ready ? '필살기!' : '필살기 ' + G.ult + '/' + ULT_MAX, ur.x + ur.h + 8, ur.y + ur.h / 2, 18, ready ? FAC[G.fac].col : '#cfd6bf', 'left');
    var left = Math.max(0, G.advAt - t), frac = Math.min(1, left / G.cfg.adv), bw = S * COLS * 0.42, bxx = OX + S * COLS - bw, byy = ur.y + ur.h / 2 + 6;
    text(t < G.freezeUntil ? '진격 멈춤' : '적 진격 ' + Math.ceil(left / 1000) + '초', OX + S * COLS, ur.y + ur.h / 2 - 12, 18, warn ? '#ff6a5a' : '#fff', 'right');
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bxx, byy, bw, 10); ctx.fillStyle = warn ? '#ff5a4a' : '#ffb13d'; ctx.fillRect(bxx, byy, bw * frac, 10);
    if (G.shield) text('🛡 방패 1', bxx - 8, byy + 5, 16, '#ffd451', 'right');
    // 배너
    if (G.banner) { var ba = t - G.banner.at; if (ba > 1500) G.banner = null; else { ctx.save(); ctx.globalAlpha = Math.min(1, ba / 120) * Math.min(1, (1500 - ba) / 300); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, BY - S * 1.2, W, S * 1.1); text(G.banner.t, W / 2, BY - S * 0.65, Math.round(S * 0.6), G.banner.col); ctx.restore(); } }
    ctx.restore();
  }
  function loop() { var t = now(); update(t); draw(t); requestAnimationFrame(loop); }
  loop();

  // ---------- 시작/끝 화면 ----------
  var $ = function (id) { return document.getElementById(id); };
  function selFac(f) { fac = f; try { localStorage.setItem('tank_fac', f); } catch (e) { } document.querySelectorAll('.fac').forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); }); }
  document.querySelectorAll('.fac').forEach(function (b) { b.addEventListener('click', function () { selFac(b.dataset.f); sfx('click'); }); }); selFac(fac);
  $('go').addEventListener('click', function () { $('title').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(1, 0); });
  var endWin = false;
  function showEnd(isWin, bonus, msg) {
    endWin = isWin; var e = $('end'); e.classList.toggle('lose', !isWin);
    $('endT').textContent = isWin ? 'VICTORY' : 'DEFEAT';
    $('endS').textContent = isWin ? '스테이지 ' + G.stage + ' 클리어!' : (msg || '전선이 무너졌다');
    $('endB').textContent = '+' + bonus.toLocaleString();
    $('endScore').textContent = '점수 ' + G.score.toLocaleString();
    $('endBtn').textContent = isWin ? '다음 스테이지 ▶' : '다시 하기';
    e.classList.remove('hidden');
  }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); if (endWin) start(G.stage + 1, G.score); else start(1, 0); });
  window.__next = { cell: function (x, y) { return { x: bx(x) + S / 2, y: by(y) + S / 2 }; }, slot: slotRect, get: function () { return G; }, start: start, useUlt: useUlt, place: place, canPlace: canPlace, advance: enemyAdvance };
})();
