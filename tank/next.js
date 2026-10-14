/* TANK RUMBLE — 쉬운 탱크 시험판 v6 (2026-10-14)
   ① 블록 Drag & Drop → 줄을 깨면 내 탱크가 선 세로줄 위로 발사, 그 열 맨 앞 적을 부숨 (2줄↑ 옆 1열, 3줄↑ 옆 2열까지)
   ② 적(병사·탱크)은 블록을 놓을 때마다 한 칸씩 내려옴 — 시간 압박 없음
   ③ 판에 닿은 적은 그 열에 돌덩이 한 칸이 됨 (돌도 줄로 깨짐)
   ④ 탱크는 빈칸을 눌러 이동, 탱크 칸도 블록 한 칸으로 침
   ⑤ 전선·시계·스테이지 없음. 무한 점수. 블록 놓을 곳이 없으면 끝 */
(function () {
  'use strict';
  var COLS = 9, ROWS = 9, EROWS = 5;
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
  function sfx(k, a) { try { if (window.SFX && SFX[k]) SFX[k](a); } catch (e) { } }

  // ---------- 그림 ----------
  var IM = {}, LIST = ['bg_mine.jpg', 'bg_enemy.jpg', 'b_plain.png', 'm_up.png'];
  ['surge', 'gale', 'solar'].forEach(function (f) { LIST.push('t_' + f + '.png', 'f_' + f + '.png', 's_' + f + '_frun1.png', 's_' + f + '_frun2.png', 's_' + f + '_fdead.png'); });
  for (var i = 1; i <= 8; i++) LIST.push('x_b' + i + '.png');
  LIST.forEach(function (n) { var im = new Image(); im.onload = function () { IM[n.replace(/\.(png|jpg)$/, '')] = im; }; im.src = 'assets/v2/' + n + '?v=6'; });

  // ---------- 화면 ----------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 0, H = 0, S = 40, OX = 0, HUD = 54, BOT = 14, EY = 0, BY = 0, TY = 0, TH = 0, ER = 36;
  function layout() {
    var dpr = Math.min(3, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.floor(Math.min(W / COLS, (H - HUD - BOT - 8) / (ROWS + EROWS * 0.85 + 2.8)));
    OX = Math.floor((W - S * COLS) / 2); ER = S * 0.85; TH = S * 2.8;
    TY = H - BOT - TH; BY = TY - ROWS * S; EY = BY - EROWS * ER;
  }
  window.addEventListener('resize', layout); layout();
  function bx(x) { return OX + x * S; } function by(y) { return BY + y * S; }
  function ey(r) { return EY + r * ER; }                      // 적 r번째 줄(0 = 맨 위, EROWS-1 = 판 바로 위)의 위쪽 y

  // ---------- 상태 ----------
  var G = null, fac = 'solar', best = 0;
  try { fac = localStorage.getItem('tank_fac') || 'solar'; best = +localStorage.getItem('tank_easy_best') || 0; } catch (e) { }
  function newPiece() { var sh = SHAPES[rnd(SHAPES.length)]; return { cells: sh, tint: TINT[rnd(TINT.length)] }; }
  function start() {
    var efs = ['surge', 'gale', 'solar'].filter(function (f) { return f !== fac; });
    G = { score: 0, combo: 0, moves: 0, kills: 0, fac: fac, efac: efs[rnd(2)], board: [], tank: { x: 4, y: 8, fx: 4, fy: 8, path: [], at: 0 },
      tray: [newPiece(), newPiece(), newPiece()], en: [], dying: [], fx: [], shots: [], drag: null, over: false, banner: null, shake: 0 };
    for (var y = 0; y < ROWS; y++) { G.board.push([]); for (var x = 0; x < COLS; x++) G.board[y].push(0); }
    spawn(2, 1); spawn(1, 0);
    banner('줄을 깨면 탱크가 위로 발사!', '#ffe066');
  }
  function banner(t, col) { G.banner = { t: t, col: col || '#fff', at: now() }; }
  function pop(t, x, y, col, big) { G.fx.push({ k: 'pop', t: t, x: x, y: y, col: col || '#fff', big: big, at: now() }); }

  // ---------- 적 ----------
  function enemyAt(x, r) { for (var i = 0; i < G.en.length; i++) if (G.en[i].x === x && G.en[i].r === r) return G.en[i]; return null; }
  function spawn(n, r) {
    var free = []; for (var x = 0; x < COLS; x++) if (!enemyAt(x, r)) free.push(x);
    for (var k = 0; k < n && free.length; k++) {
      var x2 = free.splice(rnd(free.length), 1)[0], tank = Math.random() < Math.min(0.3, G.moves / 160);
      G.en.push({ x: x2, r: r, fr: r - 1, at: now(), kind: tank ? 'tank' : 'man', hp: tank ? 2 : 1, ph: Math.random() * 6 });
    }
  }
  function advance() {                                      // 블록을 하나 놓을 때마다 적이 한 칸씩
    var t = now(), landed = [];
    G.en.sort(function (a, b) { return b.r - a.r; });
    G.en.forEach(function (e) {
      if (e.r === EROWS - 1) { landed.push(e); return; }
      if (enemyAt(e.x, e.r + 1)) { e.fr = e.r; return; }    // 앞이 막히면 대기
      e.fr = e.r; e.r++; e.at = t;
    });
    landed.forEach(function (e) { G.en.splice(G.en.indexOf(e), 1); land(e); });
    // 새 적: 처음엔 2번에 1명꼴, 오래 버틸수록 조금씩 늘어남
    var rate = Math.min(1.2, 0.4 + G.moves / 150), n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    spawn(n, 0);
  }
  function land(e) {                                        // 판에 닿은 적 → 그 열에 돌덩이
    var x = e.x, y = -1;
    for (var yy = 0; yy < ROWS; yy++) { if (G.board[yy][x] || (G.tank.x === x && G.tank.y === yy)) break; y = yy; }
    G.fx.push({ k: 'boom', px: bx(x) + S / 2, py: BY, at: now(), small: true }); G.shake = Math.max(G.shake, 6);
    if (y < 0) { pop('막았다!', bx(x) + S / 2, BY - ER * 0.5, '#9be37a'); sfx('boom', false); return; }
    G.board[y][x] = ROCK; G.fx.push({ k: 'drop', x: x, y: y, at: now() });
    pop('돌덩이!', bx(x) + S / 2, by(y), '#ff9a8a'); sfx('bad');
  }

  // ---------- 판 규칙 ----------
  function tankAt(x, y) { var t = G.tank; return !t.path.length && t.x === x && t.y === y; }
  function filled(x, y) { return G.board[y][x] || tankAt(x, y); }
  function canPlace(p, gx, gy, noTank) { for (var i = 0; i < p.cells.length; i++) { var x = gx + p.cells[i][0], y = gy + p.cells[i][1]; if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false; if (G.board[y][x] || (!noTank && G.tank.x === x && G.tank.y === y)) return false; } return true; }
  function anyFit(p, noTank) { for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (canPlace(p, x, y, noTank)) return true; return false; }
  function place(i, gx, gy) {
    var p = G.tray[i]; p.cells.forEach(function (c) { G.board[gy + c[1]][gx + c[0]] = p.tint; });
    G.tray[i] = null; if (!G.tray.some(Boolean)) G.tray = [newPiece(), newPiece(), newPiece()];
    sfx('place'); G.score += p.cells.length * 5; G.moves++;
    if (!lineCheck()) G.combo = 0;
    advance();
    lineCheck();
    checkFit();
  }
  function lineCheck() {
    var rows = [], cols = [], x, y, full;
    for (y = 0; y < ROWS; y++) { full = true; for (x = 0; x < COLS; x++) if (!filled(x, y)) { full = false; break; } if (full) rows.push(y); }
    for (x = 0; x < COLS; x++) { full = true; for (y = 0; y < ROWS; y++) if (!filled(x, y)) { full = false; break; } if (full) cols.push(x); }
    var n = rows.length + cols.length; if (!n) return false;
    var t = now();
    function clr(x, y) { if (G.board[y][x]) { G.fx.push({ k: 'cell', x: x, y: y, at: t, rock: G.board[y][x] === ROCK }); G.board[y][x] = 0; } }
    rows.forEach(function (y) { for (var x = 0; x < COLS; x++) clr(x, y); });
    cols.forEach(function (x) { for (var y = 0; y < ROWS; y++) clr(x, y); });
    G.fx.push({ k: 'flash', rows: rows, cols: cols, at: t });
    G.combo++; var mult = Math.min(5, G.combo), pts = (n * 100 + (n - 1) * 100) * mult;
    G.score += pts; pop((mult > 1 ? 'COMBO ×' + mult + '  ' : '') + '+' + pts, OX + S * COLS / 2, BY + S * 4, '#ffe066', true);
    sfx('clear', n + mult - 1);
    fire(n); G.shake = 4 + n * 2; return true;
  }
  function fire(n) {                                       // 탱크 세로줄 위로 발사 (여러 줄이면 옆 열까지)
    var tx = G.tank.x, w = n >= 3 ? 2 : n >= 2 ? 1 : 0, t = now();
    sfx('launch');
    var k = 0;
    for (var d = -w; d <= w; d++) { var c = tx + d; if (c < 0 || c >= COLS) continue;
      var tgt = null; G.en.forEach(function (e) { if (e.x === c && (!tgt || e.r > tgt.r)) tgt = e; });   // 그 열 맨 앞 적
      var s = { x: c, at: t + k * 70, y0: by(G.tank.y) + S / 2, dur: 380, ty: tgt ? ey(tgt.r) + ER / 2 : EY - S, hit: !!tgt, kill: false, kind: tgt ? tgt.kind : null, r: tgt ? tgt.r : 0 };
      if (tgt) { tgt.hp--; if (tgt.hp <= 0) { s.kill = true; G.en.splice(G.en.indexOf(tgt), 1); G.dying.push({ e: tgt, until: s.at + s.dur }); var pts = tgt.kind === 'tank' ? 250 : 100; G.score += pts; G.kills++; s.pts = pts; } else tgt.flash = s.at + s.dur; }
      G.shots.push(s); k++; }
  }
  function shotLand(s) {
    var px = bx(s.x) + S / 2;
    G.fx.push({ k: 'boom', px: px, py: s.ty, at: now(), small: !s.kill, big: s.kill && s.kind === 'tank' });
    if (s.kill) { pop('+' + s.pts, px, s.ty - ER * 0.4, '#ffb13d'); if (s.kind === 'man') G.fx.push({ k: 'corpse', x: s.x, r: s.r, at: now() }); }
    else if (s.hit) pop('명중!', px, s.ty - ER * 0.4, '#fff');
    sfx('boom', s.kill && s.kind === 'tank');
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

  // ---------- 탱크 이동 (빈 길로만) ----------
  function pathTo(tx, ty) {
    var sx = G.tank.x, sy = G.tank.y, prev = {}, q = [[sx, sy]], k0 = sx + ',' + sy; prev[k0] = null;
    while (q.length) { var c = q.shift(); if (c[0] === tx && c[1] === ty) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], y = c[1] + d[1], k = x + ',' + y; if (x < 0 || x >= COLS || y < 0 || y >= ROWS || G.board[y][x] || k in prev) return; prev[k] = c; q.push([x, y]); }); }
    var key = tx + ',' + ty; if (!(key in prev)) return null;
    var path = [], cur = [tx, ty]; while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev[cur[0] + ',' + cur[1]]; }
    return path;
  }

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
  function update(t) {
    if (!G) return;
    var tk = G.tank;
    if (!G.over && tk.path.length && t - tk.at >= 85) { var c = tk.path.shift(); tk.x = c[0]; tk.y = c[1]; tk.at = t; if (!tk.path.length) { lineCheck(); checkFit(); } }
    if (tk.path.length) { var q = Math.min(1, (t - tk.at) / 85); tk.fx = tk.x + (tk.path[0][0] - tk.x) * q; tk.fy = tk.y + (tk.path[0][1] - tk.y) * q; } else { tk.fx = tk.x; tk.fy = tk.y; }
    G.shots = G.shots.filter(function (s) { if (t < s.at) return true; if (t - s.at >= s.dur) { shotLand(s); return false; } return true; });
    G.dying = G.dying.filter(function (d) { return t < d.until; });
  }

  // ---------- 그리기 ----------
  function cover(im, x, y, w, h) { if (!im) return; var r = Math.max(w / im.width, h / im.height), dw = im.width * r, dh = im.height * r; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore(); }
  function fit(im, cx, cy, w, h, a, rot) { if (!im) return; var r = Math.min(w / im.width, h / im.height); ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.drawImage(im, -im.width * r / 2, -im.height * r / 2, im.width * r, im.height * r); ctx.restore(); }
  function text(t, x, y, size, col, align, stroke) { ctx.save(); ctx.font = size + 'px "Black Han Sans", "Do Hyeon", sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = stroke == null ? Math.max(3, size * 0.22) : stroke; ctx.strokeStyle = '#000'; if (ctx.lineWidth) ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); ctx.restore(); }
  function block(x, y, s, tint, a) {
    ctx.save(); if (a != null) ctx.globalAlpha = a;
    if (tint === ROCK) {                                   // 돌덩이: 어두운 회색 + 금
      if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#555'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#2a2a2e'; ctx.globalAlpha = (a == null ? 1 : a) * 0.72; ctx.fillRect(x, y, s, s);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a == null ? 1 : a; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath(); ctx.moveTo(x + s * 0.25, y + s * 0.2); ctx.lineTo(x + s * 0.45, y + s * 0.5); ctx.lineTo(x + s * 0.35, y + s * 0.8); ctx.moveTo(x + s * 0.45, y + s * 0.5); ctx.lineTo(x + s * 0.75, y + s * 0.6); ctx.stroke();
      ctx.restore(); return;
    }
    if (IM.b_plain) ctx.drawImage(IM.b_plain, x, y, s, s); else { ctx.fillStyle = '#7a6a4a'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tint; ctx.globalAlpha = (a == null ? 1 : a) * 0.32; ctx.fillRect(x, y, s, s); ctx.restore();
  }
  function drawEnemy(e, t, cy) {
    var cx = bx(e.x) + S / 2, fl = e.flash && t < e.flash + 200 && t > e.flash;
    if (e.kind === 'tank') fit(IM['t_' + G.efac], cx, cy, S * 0.95, ER * 1.05, fl ? 0.5 : 1, Math.PI);
    else fit(IM['s_' + G.efac + '_frun' + (1 + (Math.floor(t / 220 + e.ph) % 2))], cx, cy, S * 0.8, ER * 0.95, 1);
    if (e.kind === 'tank' && e.hp > 0) for (var h = 0; h < 2; h++) { ctx.fillStyle = h < e.hp ? '#ff5a4a' : 'rgba(0,0,0,.5)'; ctx.fillRect(cx - S * 0.3 + h * S * 0.32, cy - ER * 0.55, S * 0.27, 5); }
  }
  function enemyY(e, t) { var q = Math.min(1, (t - e.at) / 260); var r = e.fr + (e.r - e.fr) * q; return ey(r) + ER / 2; }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var sh = G && G.shake > 0.3 ? (G.shake *= 0.9, G.shake) : 0; ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    cover(IM.bg_enemy, -10, -10, W + 20, BY + 12); cover(IM.bg_mine, -10, BY, W + 20, H - BY + 10);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-10, TY, W + 20, H - TY + 10);
    if (!G) { ctx.restore(); return; }
    // 적 지역 칸
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(OX, EY, S * COLS, EROWS * ER);
    ctx.fillStyle = 'rgba(255,60,40,.12)'; ctx.fillRect(OX, ey(EROWS - 1), S * COLS, ER);
    // 격자
    ctx.strokeStyle = 'rgba(255,230,170,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(bx(gx), BY); ctx.lineTo(bx(gx), TY); } for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(OX, by(gy)); ctx.lineTo(OX + S * COLS, by(gy)); } ctx.stroke();
    // 판 경계선
    ctx.strokeStyle = 'rgba(255,90,70,.7)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(OX, BY); ctx.lineTo(OX + S * COLS, BY); ctx.stroke(); ctx.setLineDash([]);
    // 블록
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (G.board[y][x]) block(bx(x), by(y), S, G.board[y][x]);
    // 놓을 자리 미리보기
    if (G.drag && G.tray[G.drag.i]) { var d = dropCell(G.drag.p), pc = G.tray[G.drag.i], ok = canPlace(pc, d.gx, d.gy);
      pc.cells.forEach(function (c) { var X = d.gx + c[0], Y = d.gy + c[1]; if (X < 0 || X >= COLS || Y < 0 || Y >= ROWS) return; ctx.fillStyle = ok ? 'rgba(155,227,122,.35)' : 'rgba(255,90,70,.3)'; ctx.fillRect(bx(X) + 2, by(Y) + 2, S - 4, S - 4); }); }
    var tk = G.tank;
    // 조준선 (탱크 세로줄 → 그 열 맨 앞 적)
    if (!G.over) { var aim = null; G.en.forEach(function (e) { if (e.x === tk.x && (!aim || e.r > aim.r)) aim = e; });
      var ax = bx(tk.fx) + S / 2; ctx.strokeStyle = aim ? 'rgba(255,90,60,.28)' : 'rgba(255,230,120,.16)'; ctx.lineWidth = S * 0.5; ctx.beginPath(); ctx.moveTo(ax, by(tk.fy)); ctx.lineTo(ax, aim ? enemyY(aim, t) : EY); ctx.stroke();
      if (aim && !tk.path.length) { var ay = enemyY(aim, t), rr = S * 0.5 + Math.sin(t / 120) * 2; ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(ax, ay, rr, 0, 7); ctx.moveTo(ax - rr - 5, ay); ctx.lineTo(ax - rr + 5, ay); ctx.moveTo(ax + rr - 5, ay); ctx.lineTo(ax + rr + 5, ay); ctx.stroke(); } }
    // 적
    G.en.forEach(function (e) { drawEnemy(e, t, enemyY(e, t)); });
    G.dying.forEach(function (dd) { drawEnemy(dd.e, t, enemyY(dd.e, t)); });
    // 탱크
    var timg = IM['t_' + G.fac], mv = tk.path.length ? 1 : 0; ctx.save(); ctx.translate(bx(tk.fx) + S / 2, by(tk.fy) + S / 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, S * 0.36, S * 0.4, S * 0.12, 0, 0, 7); ctx.fill();
    ctx.shadowColor = FAC[G.fac].col; ctx.shadowBlur = 10; fit(timg, 0, mv ? Math.sin(t / 40) * 1.5 : 0, S * 0.95, S * 1.05); ctx.restore();
    // 포탄
    G.shots.forEach(function (s) { if (t < s.at) return; var p = (t - s.at) / s.dur, yy = s.y0 + (s.ty - s.y0) * p; fit(IM.m_up, bx(s.x) + S / 2, yy, S * 0.5, S * 0.9);
      ctx.fillStyle = 'rgba(255,200,100,.5)'; ctx.beginPath(); ctx.arc(bx(s.x) + S / 2, yy + S * 0.45, S * 0.12 * (1 - p) + 2, 0, 7); ctx.fill(); });
    // 효과
    G.fx = G.fx.filter(function (f) { var a = t - f.at; if (a < 0) return true;
      if (f.k === 'cell') { if (a > 350) return false; block(bx(f.x) + S * a / 1400, by(f.y) + S * a / 1400, S * (1 - a / 700), f.rock ? ROCK : '#fff', 1 - a / 350); return true; }
      if (f.k === 'drop') { if (a > 260) return false; ctx.fillStyle = 'rgba(255,90,70,' + (0.5 * (1 - a / 260)) + ')'; ctx.fillRect(bx(f.x), BY, S, by(f.y) + S - BY); return true; }
      if (f.k === 'flash') { if (a > 300) return false; ctx.fillStyle = 'rgba(255,240,180,' + (0.5 * (1 - a / 300)) + ')'; f.rows.forEach(function (y) { ctx.fillRect(OX, by(y), S * COLS, S); }); f.cols.forEach(function (x) { ctx.fillRect(bx(x), BY, S, S * ROWS); }); return true; }
      if (f.k === 'boom') { var life = f.big ? 900 : 520; if (a > life) return false; var fr = Math.min(8, 1 + Math.floor(a / life * 8)), sz = S * (f.big ? 2.2 : f.small ? 0.9 : 1.4); fit(IM['x_b' + fr], f.px, f.py - sz * 0.15, sz, sz); return true; }
      if (f.k === 'corpse') { if (a > 700) return false; fit(IM['s_' + G.efac + '_fdead'], bx(f.x) + S / 2, ey(f.r) + ER / 2, S * 0.8, ER * 0.9, 1 - a / 700); return true; }
      if (f.k === 'pop') { if (a > 1100) return false; ctx.save(); ctx.globalAlpha = Math.min(1, (1100 - a) / 300); text(f.t, f.x, f.y - a * 0.03, Math.round(S * (f.big ? 0.62 : 0.46)), f.col); ctx.restore(); return true; }
      return false; });
    // 위 HUD
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-10, -10, W + 20, HUD + 10);
    text('최고 ' + Math.max(best, G.score).toLocaleString(), 12, HUD / 2, 20, '#ffd451', 'left');
    text(G.score.toLocaleString(), W / 2, HUD / 2, 30, '#fff');
    text('격파 ' + G.kills, W - 12, HUD / 2, 20, '#ff9a8a', 'right');
    // 트레이
    for (var i = 0; i < 3; i++) { var rc = slotRect(i); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(rc.x + 4, rc.y, rc.w - 8, rc.h); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.strokeRect(rc.x + 4, rc.y, rc.w - 8, rc.h);
      var pc2 = G.tray[i]; if (!pc2 || (G.drag && G.drag.i === i)) continue; var z = pcSize(pc2);
      var cs = Math.min(S * 0.62, (rc.w - 20) / z.w, (rc.h - 14) / z.h), ox = rc.x + (rc.w - z.w * cs) / 2, oy = rc.y + (rc.h - z.h * cs) / 2, fitAny = anyFit(pc2);
      pc2.cells.forEach(function (c) { block(ox + c[0] * cs, oy + c[1] * cs, cs, pc2.tint, fitAny ? 1 : 0.35); }); }
    if (G.drag && G.tray[G.drag.i]) { var pd = G.tray[G.drag.i], z2 = pcSize(pd);
      var gx0 = G.drag.p.x - z2.w * S / 2, gy0 = G.drag.p.y - S * 1.7 - z2.h * S / 2; pd.cells.forEach(function (c) { block(gx0 + c[0] * S, gy0 + c[1] * S, S, pd.tint, 0.9); }); }
    // 배너
    if (G.banner) { var ba = t - G.banner.at; if (ba > 1800) G.banner = null; else { ctx.save(); ctx.globalAlpha = Math.min(1, ba / 120) * Math.min(1, (1800 - ba) / 300); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-10, BY + S * 3.4, W + 20, S * 1.3); text(G.banner.t, W / 2, BY + S * 4.05, Math.round(S * 0.62), G.banner.col); ctx.restore(); } }
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
    $('endS').textContent = '적 ' + G.kills + '명 격파';
    $('endB').textContent = '최고 기록!';
    $('endScore').textContent = '점수 ' + G.score.toLocaleString();
    $('endBtn').textContent = '다시 하기';
    if (nb) sfx('win');
    e.classList.remove('hidden');
  }
  $('endBtn').addEventListener('click', function () { $('end').classList.add('hidden'); sfx('bgmStart'); sfx('go'); start(); });
  window.__next = { cell: function (x, y) { return { x: bx(x) + S / 2, y: by(y) + S / 2 }; }, slot: slotRect, get: function () { return G; }, start: start, place: place, canPlace: canPlace, advance: advance, lineCheck: lineCheck };
})();
